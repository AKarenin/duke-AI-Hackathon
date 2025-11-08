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
    
    // Create a promise that resolves when Deepgram connection opens
    let deepgramReady;
    const deepgramReadyPromise = new Promise((resolve) => {
      deepgramReady = resolve;
    });
    
    const liveTranscription = sttService.createLiveTranscription(
      (data) => {
        console.log('🔔 Transcription callback triggered!');
        handleTranscription(socket, session.id, data);
      },
      (error) => console.error('❌ Transcription error:', error),
      () => {
        // Connection opened callback
        console.log('✅ Deepgram connection ACTUALLY opened - ready for audio');
        deepgramReady();
      }
    );

    if (liveTranscription) {
      activeTranscriptions.set(session.id, liveTranscription);
      console.log('⏳ Waiting for Deepgram connection to open...');
      
      // Wait for Deepgram to actually open before proceeding
      await Promise.race([
        deepgramReadyPromise,
        new Promise(resolve => setTimeout(() => {
          console.warn('⚠️ Deepgram open timeout - proceeding anyway');
          resolve();
        }, 2000))
      ]);
      
      console.log('✅ Deepgram transcription ready and connected');
    } else {
      console.error('❌ Failed to create Deepgram transcription');
    }

    // Try to create HeyGen streaming session
    let streamingReady = false;
    console.log('🎬 Attempting to create HeyGen streaming session...');
    const heygenSession = await heygenService.createStreamingSession(session.id, scenario);
    
    // Check if HeyGen is ready
    if (heygenSession && heygenSession.sdp) {
      console.log('✅ HeyGen session created successfully');
      activeHeyGenSessions.set(session.id, heygenSession);
      streamingReady = true;
    }
    
    // Ensure streamingReady is always a boolean
    const isStreamingReady = Boolean(streamingReady);
    console.log('📤 Emitting session-started with streamingReady:', isStreamingReady, '(original value:', streamingReady, ')');
    
    // Send session-started FIRST so frontend has sessionId
    socket.emit('session-started', {
      sessionId: session.id,
      scenario,
      streamingReady: isStreamingReady
    });

    // THEN send HeyGen WebRTC offer if available (after frontend has sessionId)
    if (heygenSession && heygenSession.sdp) {
      
      // Extract SDP string if it's an object with an 'sdp' property
      const sdpString = typeof heygenSession.sdp === 'object' 
        ? (heygenSession.sdp.sdp || JSON.stringify(heygenSession.sdp))
        : heygenSession.sdp;
      
      console.log('   Sending SDP (first 100 chars):', sdpString.substring(0, 100));
      
      // Provide fallback ICE servers if not included
      const iceServers = heygenSession.ice_servers || heygenSession.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' }
      ];
      
      console.log('   ICE Servers from HeyGen:', JSON.stringify(iceServers).substring(0, 200));
      
      // Send WebRTC offer to frontend WITH sessionId
      console.log('📤 Sending HeyGen WebRTC offer to frontend...');
      socket.emit('heygen-ready', {
        sessionId: session.id,  // Include sessionId so frontend can send it back
        sdp: sdpString,
        iceServers: iceServers
      });
      
      // Mark session as pending WebRTC handshake
      heygenSession.webrtcReady = false;
    } else if (streamingReady) {
      console.warn('⚠️ HeyGen session created but missing SDP');
    }

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
    console.log('   Session ID:', sessionId);
    
    const heygenSession = activeHeyGenSessions.get(sessionId);
    console.log('   HeyGen session found:', !!heygenSession);
    
    if (heygenSession && heygenSession.session_id) {
      // Mark as ready - will be fully ready once ICE candidates connect
      heygenSession.webrtcReady = true;
      console.log('✅ WebRTC answer received - waiting for ICE candidates...');
    } else {
      console.warn('⚠️ No HeyGen session found for ID:', sessionId);
    }
  });

  // Handle ICE candidates from client for HeyGen
  socket.on('heygen-ice-candidate', async ({ sessionId, candidate }) => {
    const heygenSession = activeHeyGenSessions.get(sessionId);
    
    if (heygenSession && heygenSession.session_id) {
      console.log('🧊 Sending ICE candidate to HeyGen:', candidate.type);
      const result = await heygenService.sendICECandidate(heygenSession.session_id, candidate);
      if (result) {
        console.log('   ✅ ICE candidate sent successfully');
      }
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
  await playElevenLabsAudio(socket, text, scenario);

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

  // Check if WebRTC handshake is complete
  const heygenSession = activeHeyGenSessions.get(sessionId);
  
  try {
    if (heygenSession && heygenSession.webrtcReady) {
      // WebRTC is ready - use HeyGen avatar
      console.log('🎬 Sending text to HeyGen avatar...');
      const result = await heygenService.speakWithAvatar(sessionId, text);
      
      if (result && !result.error) {
        console.log('✅ HeyGen avatar speaking');
      } else {
        console.warn('⚠️ HeyGen speaking failed, falling back to audio');
        await playElevenLabsAudio(socket, text, scenario);
      }
    } else {
      // WebRTC not ready yet - use regular audio
      console.log('⏳ HeyGen WebRTC not ready yet, using audio fallback');
      await playElevenLabsAudio(socket, text, scenario);
    }
  } catch (error) {
    console.error('❌ Error with HeyGen avatar:', error);
    // Fallback to regular audio
    await playElevenLabsAudio(socket, text, scenario);
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
    await playElevenLabsAudio(socket, text, scenario);
  }
}

// Helper function to play ElevenLabs audio
async function playElevenLabsAudio(socket, text, scenario = 'introduction') {
  const audioBuffer = await ttsService.textToSpeech(text, scenario);
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

  // Close HeyGen streaming session properly
  const heygenSession = activeHeyGenSessions.get(sessionId);
  if (heygenSession) {
    console.log('🔌 Closing HeyGen session:', heygenSession.session_id);
    await heygenService.stopStreamingSession(sessionId);
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
    introduction: "Hi there! I don't think we've met before. I'm Alessandra.",
    'coffee-spill': "Oh! Careful there!"  // Pedro doesn't introduce himself when upset
  };

  return greetings[scenario] || greetings.introduction;
}
