const sessionManager = require('../services/sessionManager');
const sttService = require('../services/sttService');
const llmService = require('../services/llmService');
const ttsService = require('../services/ttsService');
const heygenService = require('../services/heygenService');
const feedbackService = require('../services/feedbackService');

let activeTranscriptions = new Map();
let activeTTSStreams = new Map();
let activeHeyGenSessions = new Map();
let aiSpeakingLock = new Map(); // Track which sessions have AI currently speaking

module.exports = function(socket, io) {
  // Start a new conversation session
  socket.on('start-session', async ({ scenario }) => {
    console.log('🎬 Starting session for scenario:', scenario);

    const session = sessionManager.createSession(socket.id, scenario);
    console.log('✅ Session created:', session.id);

    // Setup live transcription (Deepgram -> GPT)
    console.log('🎙️ Setting up Deepgram live transcription...');
    const liveTranscription = sttService.createLiveTranscription(
      (data) => {
        console.log('🔔 Transcription callback triggered!');
        handleTranscription(socket, session.id, data);
      },
      (error) => console.error('❌ Transcription error:', error)
    );

    if (liveTranscription) {
      activeTranscriptions.set(session.id, liveTranscription);
      console.log('✅ Deepgram transcription ready');
    } else {
      console.error('❌ Failed to create Deepgram transcription');
    }

    // Try to create HeyGen streaming session
    let streamingReady = false;
    console.log('🎬 Attempting to create HeyGen streaming session...');
    const heygenSession = await heygenService.createStreamingSession(session.id, scenario);
    
    if (heygenSession) {
      console.log('✅ HeyGen session created successfully');
      activeHeyGenSessions.set(session.id, heygenSession);
      
      // Start the HeyGen session
      const startResult = await heygenService.startStreamingSession(session.id);
      if (startResult) {
        streamingReady = true;
        console.log('✅ HeyGen streaming started');
        
        // Send WebRTC connection info to frontend
        socket.emit('heygen-ready', {
          sdp: heygenSession.sdp,
          iceServers: heygenSession.ice_servers
        });
      } else {
        console.warn('⚠️ Failed to start HeyGen session, falling back to simple mode');
      }
    } else {
      console.warn('⚠️ HeyGen not available, using simple mode');
    }

    // Ensure streamingReady is always a boolean
    const isStreamingReady = Boolean(streamingReady);
    console.log('📤 Emitting session-started with streamingReady:', isStreamingReady, '(original value:', streamingReady, ')');
    
    socket.emit('session-started', {
      sessionId: session.id,
      scenario,
      streamingReady: isStreamingReady
    });

    // Send initial AI greeting
    console.log('🤖 Sending initial greeting...');
    const greeting = await generateInitialGreeting(scenario);
    
    // Use streaming if available, otherwise fallback to regular
    if (isStreamingReady) {
      await handleAIResponseWithHeyGen(socket, session.id, greeting, scenario);
    } else {
      await handleAIResponse(socket, session.id, greeting, scenario);
    }
  });

  // Handle incoming audio chunks
  socket.on('audio-chunk', async (audioData) => {
    const session = sessionManager.getSessionBySocket(socket.id);

    if (!session || !session.isActive) {
      console.log('⚠️ No active session for audio chunk');
      return;
    }

    const transcription = activeTranscriptions.get(session.id);
    if (transcription && transcription.send) {
      try {
        // Convert array back to Buffer for Deepgram
        const buffer = Buffer.from(audioData);
        
        // Calculate audio volume and store for later use
        const volume = sttService.calculateAudioVolume(buffer);
        if (transcription._addAudioLevel) {
          transcription._addAudioLevel(volume);
        }
        
        // Only log every 10th chunk to avoid spam
        if (!socket.audioChunkCount) socket.audioChunkCount = 0;
        socket.audioChunkCount++;
        
        if (socket.audioChunkCount % 10 === 0) {
          console.log(`📤 Sent ${socket.audioChunkCount} audio chunks to Deepgram (${buffer.length} bytes, volume: ${volume.toFixed(2)})`);
        }
        
        // Send audio to Deepgram for live transcription
        try {
          transcription.send(buffer);
        } catch (sendError) {
          console.error('❌ Error in transcription.send():', sendError.message);
        }
      } catch (error) {
        console.error('❌ Error sending audio to Deepgram:', error);
      }
    } else {
      console.warn('⚠️ No active transcription for session:', session.id);
    }
  });

  // Handle WebRTC answer from client for HeyGen
  socket.on('heygen-answer', async ({ sessionId, sdp }) => {
    console.log('📥 Received WebRTC answer from client');
    const heygenSession = activeHeyGenSessions.get(sessionId);
    if (heygenSession && heygenSession.session_id) {
      await heygenService.submitWebRTCAnswer(heygenSession.session_id, sdp);
      console.log('✅ WebRTC answer submitted to HeyGen');
    }
  });

  // Handle manual session end
  socket.on('end-session', async ({ sessionId }) => {
    await endSession(socket, sessionId);
  });
};

async function handleTranscription(socket, sessionId, data) {
  const { transcript, isFinal, confidence, avgWordConfidence, volume, words } = data;

  console.log('📝 Transcription received:', { 
    transcript, 
    isFinal, 
    confidence: confidence?.toFixed(3), 
    volume: volume?.toFixed(2) 
  });

  if (!transcript) {
    console.log('⚠️ Empty transcript, skipping');
    return;
  }

  const session = sessionManager.getSession(sessionId);
  if (!session || !session.isActive) {
    console.log('⚠️ No active session for transcription');
    return;
  }

  // Send interim results to client for feedback with confidence/volume
  if (!isFinal) {
    socket.emit('interim-transcript', { 
      text: transcript,
      confidence,
      volume
    });
  }

  if (isFinal) {
    console.log('✅ Final transcript:', transcript);
    console.log('   📊 Confidence:', confidence?.toFixed(3), 'Avg Word:', avgWordConfidence?.toFixed(3));
    console.log('   🔊 Volume:', volume?.toFixed(2));
    
    // CHECK 1: Don't process if AI is currently speaking
    if (aiSpeakingLock.get(sessionId)) {
      console.log('🔒 AI is speaking - ignoring user input to prevent interruption');
      return;
    }
    
    // CHECK 2: Ignore very short inputs that are likely transcription artifacts
    if (transcript.trim().length < 3) {
      console.log('⚠️ Ignoring very short transcript (likely artifact):', transcript);
      return;
    }
    
    // CHECK 3: Prevent duplicate processing - check if we already processed this exact text
    const recentTranscripts = session.transcript.filter(t => t.speaker === 'user').slice(-3);
    const isDuplicate = recentTranscripts.some(t => t.text === transcript);
    
    if (isDuplicate) {
      console.log('⚠️ Skipping duplicate transcript');
      return;
    }
    
    // Add user message to transcript with metadata
    const timestamp = new Date().toLocaleTimeString();
    sessionManager.addToTranscript(sessionId, {
      speaker: 'user',
      text: transcript,
      timestamp,
      confidence,
      avgWordConfidence,
      volume,
      wordDetails: words
    });

    // Notify client with full metadata
    socket.emit('user-spoke', { 
      text: transcript,
      confidence,
      avgWordConfidence,
      volume
    });

    // Generate AI response (GPT brain)
    console.log('🤖 Generating AI response...');
    const aiResponse = await llmService.generateResponse(
      sessionId,
      transcript,
      session.scenario
    );

    // Check if we have HeyGen streaming active
    const heygenSession = activeHeyGenSessions.get(sessionId);
    if (heygenSession) {
      await handleAIResponseWithHeyGen(socket, sessionId, aiResponse, session.scenario);
    } else {
      await handleAIResponse(socket, sessionId, aiResponse, session.scenario);
    }

    // Check if conversation goal is achieved and should end
    const shouldEnd = await llmService.detectConversationEnd(
      sessionId,
      session.transcript,
      session.scenario
    );

    if (shouldEnd) {
      console.log('🎯 Ending conversation - goals achieved');
      // Wait a moment before ending
      setTimeout(() => {
        endSession(socket, sessionId);
      }, 3000);
    }
  }
}

async function handleAIResponse(socket, sessionId, text, scenario) {
  const session = sessionManager.getSession(sessionId);
  if (!session) return;

  // Set speaking lock to prevent interruptions
  aiSpeakingLock.set(sessionId, true);
  console.log('🔒 AI speaking lock SET');

  // Add AI message to transcript
  const timestamp = new Date().toLocaleTimeString();
  sessionManager.addToTranscript(sessionId, {
    speaker: 'ai',
    text,
    timestamp
  });

  console.log('AI Response:', text);

  // Emit AI response to client
  socket.emit('ai-speaking', { text });

  // Update avatar state (switch to talking)
  socket.emit('avatar-state', {
    state: 'talking'
  });

  // ALWAYS use ElevenLabs for audio (as requested)
  await playElevenLabsAudio(socket, text);

  // Estimate speaking duration and return to idle
  const speakingDuration = text.length * 50; // Rough estimate: 50ms per character
  setTimeout(() => {
    socket.emit('avatar-state', {
      state: 'idle'
    });
    
    // Clear speaking lock after AI finishes + 1 second buffer
    setTimeout(() => {
      aiSpeakingLock.set(sessionId, false);
      console.log('🔓 AI speaking lock RELEASED');
    }, 1000);
  }, speakingDuration);
}

// Handle AI response WITH HeyGen streaming avatar
async function handleAIResponseWithHeyGen(socket, sessionId, text, scenario) {
  const session = sessionManager.getSession(sessionId);
  if (!session) return;

  // Set speaking lock to prevent interruptions
  aiSpeakingLock.set(sessionId, true);
  console.log('🔒 AI speaking lock SET (HeyGen)');

  // Add AI message to transcript
  const timestamp = new Date().toLocaleTimeString();
  sessionManager.addToTranscript(sessionId, {
    speaker: 'ai',
    text,
    timestamp
  });

  console.log('🤖 AI Response (with HeyGen):', text);

  // Emit AI response to client
  socket.emit('ai-speaking', { text });

  // Update avatar state (switch to talking)
  socket.emit('avatar-state', {
    state: 'talking'
  });

  try {
    // Send text to HeyGen avatar to speak
    console.log('🎬 Sending text to HeyGen avatar...');
    const result = await heygenService.speakWithAvatar(sessionId, text);
    
    if (result) {
      console.log('✅ HeyGen avatar speaking');
    } else {
      console.warn('⚠️ HeyGen speaking failed, falling back to audio');
      await playElevenLabsAudio(socket, text);
    }
  } catch (error) {
    console.error('❌ Error with HeyGen avatar:', error);
    // Fallback to regular audio
    await playElevenLabsAudio(socket, text);
  }

  // Estimate speaking duration and return to idle
  const speakingDuration = text.length * 50; // Rough estimate: 50ms per character
  setTimeout(() => {
    socket.emit('avatar-state', {
      state: 'idle'
    });
    
    // Clear speaking lock after AI finishes + 1 second buffer
    setTimeout(() => {
      aiSpeakingLock.set(sessionId, false);
      console.log('🔓 AI speaking lock RELEASED (HeyGen)');
    }, 1000);
  }, speakingDuration);
}

// Streaming version: ElevenLabs → HeyGen → Frontend
async function handleAIResponseStreaming(socket, sessionId, text, scenario) {
  const session = sessionManager.getSession(sessionId);
  if (!session) return;

  // Add AI message to transcript
  const timestamp = new Date().toLocaleTimeString();
  sessionManager.addToTranscript(sessionId, {
    speaker: 'ai',
    text,
    timestamp
  });

  console.log('🤖 AI Response (streaming):', text);

  // Emit AI response to client
  socket.emit('ai-speaking', { text });

  // Update avatar state (switch to talking)
  socket.emit('avatar-state', {
    state: 'talking'
  });

  // Send text to ElevenLabs streaming TTS
  const ttsStream = activeTTSStreams.get(sessionId);
  if (ttsStream && ttsStream.send) {
    console.log('📤 Sending text to ElevenLabs stream...');
    ttsStream.send(text);
    
    // Estimate speaking duration and return to idle
    const speakingDuration = text.length * 50;
    setTimeout(() => {
      socket.emit('avatar-state', {
        state: 'idle'
      });
    }, speakingDuration);
  } else {
    console.warn('⚠️ No active TTS stream, falling back to regular audio');
    await playElevenLabsAudio(socket, text);
  }
}

// Helper function to play ElevenLabs audio
async function playElevenLabsAudio(socket, text) {
  const audioBuffer = await ttsService.textToSpeech(text);
  if (audioBuffer) {
    console.log('Sending ElevenLabs audio to client, size:', audioBuffer.length);
    socket.emit('ai-audio', { audio: Array.from(new Uint8Array(audioBuffer)) });
  } else {
    console.warn('No audio buffer generated from TTS service');
  }
}

async function endSession(socket, sessionId) {
  const session = sessionManager.getSession(sessionId);
  if (!session) return;

  console.log('🛑 Ending session:', sessionId);

  // Clear speaking lock
  aiSpeakingLock.delete(sessionId);
  
  // Stop live transcription
  const transcription = activeTranscriptions.get(sessionId);
  if (transcription && transcription.finish) {
    transcription.finish();
  }
  activeTranscriptions.delete(sessionId);

  // Close ElevenLabs TTS stream
  const ttsStream = activeTTSStreams.get(sessionId);
  if (ttsStream && ttsStream.close) {
    console.log('🔌 Closing ElevenLabs TTS stream...');
    ttsStream.close();
  }
  activeTTSStreams.delete(sessionId);

  // Close HeyGen audio-to-video session
  const heygenSession = activeHeyGenSessions.get(sessionId);
  if (heygenSession) {
    console.log('🔌 Closing HeyGen session...');
    await heygenService.closeAudioToVideoSession(sessionId);
  }
  activeHeyGenSessions.delete(sessionId);

  // Generate feedback
  const feedback = await feedbackService.generateFeedback(
    session.transcript,
    session.scenario
  );

  // End session
  sessionManager.endSession(sessionId);
  llmService.clearHistory(sessionId);

  // Send feedback to client
  socket.emit('conversation-ended', {
    sessionData: feedback
  });
}

async function generateInitialGreeting(scenario) {
  const greetings = {
    introduction: "Hi there! I don't think we've met before. I'm Alex.",
    'coffee-spill': "Oh! Careful there!"
  };

  return greetings[scenario] || greetings.introduction;
}
