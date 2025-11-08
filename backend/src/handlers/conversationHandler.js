const sessionManager = require('../services/sessionManager');
const sttService = require('../services/sttService');
const llmService = require('../services/llmService');
const ttsService = require('../services/ttsService');
const avatarImageManager = require('../services/avatarImageManager');
const feedbackService = require('../services/feedbackService');

let activeTranscriptions = new Map();
let aiSpeakingLock = new Map(); // Track which sessions have AI currently speaking
let silenceTimers = new Map(); // Track silence timers for each session
let pendingTranscripts = new Map(); // Store pending transcripts during silence period

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

    // Initialize avatar image state
    console.log('🖼️ Initializing avatar image state...');
    const imageState = avatarImageManager.initializeSession(session.id, scenario);
    console.log('✅ Avatar image initialized:', imageState);
    
    // Send session-started with avatar image info
    socket.emit('session-started', {
      sessionId: session.id,
      scenario,
      avatarImage: imageState.imagePath,
      avatarState: imageState.currentState
    });

    // Send initial AI greeting
    console.log('🤖 Sending initial greeting...');
    const greeting = await generateInitialGreeting(scenario);
    await handleAIResponse(socket, session.id, greeting, scenario, false);
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
  socket.emit('interim-transcript', { 
    text: transcript,
    confidence,
    volume,
    isFinal
  });

  // Process ALL transcripts (both interim and final) for accumulation
  console.log(`${isFinal ? '✅' : '⏳'} ${isFinal ? 'Final' : 'Interim'} transcript:`, transcript);
  if (confidence !== undefined) {
    console.log('   📊 Confidence:', confidence?.toFixed(3), 'Avg Word:', avgWordConfidence?.toFixed(3));
  }
  if (volume !== undefined) {
    console.log('   🔊 Volume:', volume?.toFixed(2));
  }
  
  // CHECK 1: Don't process if AI is currently speaking
  if (aiSpeakingLock.get(sessionId)) {
    console.log('🔒 AI is speaking - ignoring user input to prevent interruption');
    return;
  }
  
  // CHECK 2: Ignore very short inputs that are likely transcription artifacts
  if (transcript.trim().length < 2) {
    console.log('⚠️ Ignoring very short transcript (likely artifact):', transcript);
    return;
  }
  
  // EDGE COMPUTING APPROACH: Wait for Deepgram to stop sending transcripts for 2 seconds
  // Clear any existing inactivity timer - Deepgram is still sending data
  if (silenceTimers.has(sessionId)) {
    console.log('⏱️ Deepgram still active - resetting inactivity timer');
    clearTimeout(silenceTimers.get(sessionId));
  }
  
  // ALWAYS ACCUMULATE transcripts - append all fragments before sending to GPT
  // This handles cases where user's sentence comes in multiple parts
  const existing = pendingTranscripts.get(sessionId);
  
  if (existing) {
    // Check if this is truly a new part or a duplicate/refinement
    // Only consider it a duplicate if the new transcript is completely contained in existing
    const existingLower = existing.transcript.toLowerCase().trim();
    const newLower = transcript.toLowerCase().trim();
    
    // If new transcript is completely contained in existing, it's a refinement - skip it
    const isCompletelyContained = existingLower.includes(newLower);
    // If existing is contained in new, it's a better version - replace
    const isReplacement = newLower.includes(existingLower);
    
    if (isCompletelyContained && !isReplacement) {
      console.log('🔄 Skipping duplicate fragment (already contained in existing)');
      console.log('   Existing:', existing.transcript);
      console.log('   Duplicate:', transcript);
    } else if (isReplacement) {
      console.log('🔄 Replacing with refined transcript (better version)');
      console.log('   Old:', existing.transcript);
      console.log('   New:', transcript);
      existing.transcript = transcript;
    } else {
      // Truly new content - ALWAYS APPEND
      console.log('➕ Appending new transcript fragment...');
      console.log('   Previous:', existing.transcript);
      console.log('   New part:', transcript);
      existing.transcript = existing.transcript + ' ' + transcript;
      console.log('   Combined:', existing.transcript);
    }
    
    // Update metrics (always average regardless of append/replace)
    existing.confidence = (existing.confidence + confidence) / 2;
    existing.avgWordConfidence = (existing.avgWordConfidence + avgWordConfidence) / 2;
    existing.volume = (existing.volume + volume) / 2;
    if (words && existing.words) {
      existing.words = [...existing.words, ...words];
    }
  } else {
    // First transcript in this silence window
    console.log('🆕 Starting new transcript accumulation');
    pendingTranscripts.set(sessionId, {
      transcript,
      confidence,
      avgWordConfidence,
      volume,
      words: words || [],
      timestamp: new Date().toLocaleTimeString()
    });
  }
  
  console.log('⏳ Waiting for Deepgram inactivity (2 seconds of no transcripts)...');
  
  // Set new timer: wait 2 seconds of Deepgram inactivity
  const timer = setTimeout(async () => {
    console.log('✅ 2 seconds of Deepgram inactivity detected - processing transcript now');
    
    const pending = pendingTranscripts.get(sessionId);
    if (!pending) {
      console.log('⚠️ No pending transcript found');
      return;
    }
    
    // Clear the pending transcript
    pendingTranscripts.delete(sessionId);
    silenceTimers.delete(sessionId);
    
    // Add user message to transcript with metadata
    sessionManager.addToTranscript(sessionId, {
      speaker: 'user',
      text: pending.transcript,
      timestamp: pending.timestamp,
      confidence: pending.confidence,
      avgWordConfidence: pending.avgWordConfidence,
      volume: pending.volume,
      wordDetails: pending.words
    });

    // Notify client with full metadata
    socket.emit('user-spoke', { 
      text: pending.transcript,
      confidence: pending.confidence,
      avgWordConfidence: pending.avgWordConfidence,
      volume: pending.volume
    });

    // Generate AI response (GPT brain)
    console.log('🤖 Generating AI response...');
    const aiResponse = await llmService.generateResponse(
      sessionId,
      pending.transcript,
      session.scenario
    );

    // Check if conversation goal is achieved and should end
    const shouldEnd = await llmService.detectConversationEnd(
      sessionId,
      session.transcript,
      session.scenario
    );

    // Handle AI response with image state management (pass shouldEnd flag)
    await handleAIResponse(socket, sessionId, aiResponse, session.scenario, shouldEnd);

    if (shouldEnd) {
      console.log('🎯 Ending conversation - goals achieved');
      // Wait for AI to finish speaking before ending
      // Estimate based on last AI response length (50ms per character + 2 second buffer)
      const lastAIMessage = session.transcript.filter(t => t.speaker === 'ai').slice(-1)[0];
      const estimatedSpeakingTime = lastAIMessage 
        ? (lastAIMessage.text.length * 50) + 2000 
        : 5000;
      
      console.log(`⏳ Waiting ${estimatedSpeakingTime}ms for AI to finish speaking before ending session`);
      
      setTimeout(() => {
        endSession(socket, sessionId);
      }, estimatedSpeakingTime);
    }
  }, 2000); // Wait 2 seconds of Deepgram inactivity
  
  silenceTimers.set(sessionId, timer);
}

async function handleAIResponse(socket, sessionId, text, scenario, isConversationEnding = false) {
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

  // Check if avatar image should change based on conversation state
  let imageChanged = false;
  
  if (scenario === 'introduction') {
    // ONLY show goodbye image if conversation is actually ending
    if (isConversationEnding && avatarImageManager.shouldShowGoodbye(text)) {
      console.log('👋 Conversation ending with goodbye phrase - switching to goodbye image');
      const newState = avatarImageManager.updateImageState(sessionId, 'goodbye');
      if (newState) {
        socket.emit('avatar-image-changed', {
          imagePath: newState.imagePath,
          state: newState.currentState
        });
        imageChanged = true;
      }
    }
  } else if (scenario === 'coffee-spill') {
    // Check if Pedro's emotion has softened
    if (avatarImageManager.hasPedroSoftened(session.transcript)) {
      const currentState = avatarImageManager.getSessionState(sessionId);
      if (currentState && currentState.currentState === 'angry') {
        console.log('😊 Pedro emotion softened - switching to happy image');
        const newState = avatarImageManager.updateImageState(sessionId, 'happy');
        if (newState) {
          socket.emit('avatar-image-changed', {
            imagePath: newState.imagePath,
            state: newState.currentState
          });
          imageChanged = true;
        }
      }
    }
  }

  // Emit AI response to client
  socket.emit('ai-speaking', { text });

  // Update avatar state (switch to talking)
  socket.emit('avatar-state', {
    state: 'talking'
  });

  // ALWAYS use ElevenLabs for audio
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

// Helper function to play ElevenLabs audio
async function playElevenLabsAudio(socket, text, scenario = 'introduction') {
  console.log('🔊 Requesting TTS for:', text.substring(0, 50) + '...');
  const audioBuffer = await ttsService.textToSpeech(text, scenario);
  if (audioBuffer) {
    console.log('✅ TTS generated successfully, size:', audioBuffer.length, 'bytes');
    const audioArray = Array.from(new Uint8Array(audioBuffer));
    console.log('📤 Sending audio to client, array length:', audioArray.length);
    socket.emit('ai-audio', { audio: audioArray });
    console.log('✅ Audio emitted to client');
  } else {
    console.error('❌ No audio buffer generated from TTS service - TTS may have failed!');
  }
}

async function endSession(socket, sessionId, retryCount = 0) {
  const session = sessionManager.getSession(sessionId);
  if (!session) return;

  // Check if AI is still speaking - if so, wait a bit longer (max 3 retries = 6 seconds)
  if (aiSpeakingLock.get(sessionId) && retryCount < 3) {
    console.log(`⏳ AI still speaking - delaying session end by 2 seconds (attempt ${retryCount + 1}/3)`);
    setTimeout(() => {
      endSession(socket, sessionId, retryCount + 1);
    }, 2000);
    return;
  }

  console.log('🛑 Ending session:', sessionId);

  // Clear speaking lock
  aiSpeakingLock.delete(sessionId);
  
  // Clear any pending silence timers
  if (silenceTimers.has(sessionId)) {
    clearTimeout(silenceTimers.get(sessionId));
    silenceTimers.delete(sessionId);
  }
  pendingTranscripts.delete(sessionId);
  
  // Stop live transcription
  const transcription = activeTranscriptions.get(sessionId);
  if (transcription && transcription.finish) {
    transcription.finish();
  }
  activeTranscriptions.delete(sessionId);

  // Clear avatar image state
  avatarImageManager.clearSession(sessionId);

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
