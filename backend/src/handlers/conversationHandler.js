const sessionManager = require('../services/sessionManager');
const sttService = require('../services/sttService');
const llmService = require('../services/llmService');
const ttsService = require('../services/ttsService');
const heygenService = require('../services/heygenService');
const feedbackService = require('../services/feedbackService');

let activeTranscriptions = new Map();

module.exports = function(socket, io) {
  // Start a new conversation session
  socket.on('start-session', async ({ scenario }) => {
    console.log('Starting session for scenario:', scenario);

    const session = sessionManager.createSession(socket.id, scenario);

    // Setup live transcription
    const liveTranscription = sttService.createLiveTranscription(
      (data) => handleTranscription(socket, session.id, data),
      (error) => console.error('Transcription error:', error)
    );

    if (liveTranscription) {
      activeTranscriptions.set(session.id, liveTranscription);
    }

    // Get avatar configuration
    const avatarConfig = heygenService.getAvatarConfig(scenario);

    socket.emit('session-started', {
      sessionId: session.id,
      avatarConfig
    });

    // Send initial AI greeting
    const greeting = await generateInitialGreeting(scenario);
    await handleAIResponse(socket, session.id, greeting, scenario);
  });

  // Handle incoming audio chunks
  socket.on('audio-chunk', async (audioData) => {
    const session = sessionManager.getSessionBySocket(socket.id);

    if (!session || !session.isActive) {
      return;
    }

    const transcription = activeTranscriptions.get(session.id);
    if (transcription && transcription.send) {
      // Send audio to Deepgram for live transcription
      transcription.send(audioData);
    }
  });

  // Handle manual session end
  socket.on('end-session', async ({ sessionId }) => {
    await endSession(socket, sessionId);
  });
};

async function handleTranscription(socket, sessionId, data) {
  const { transcript, isFinal } = data;

  if (!transcript) return;

  const session = sessionManager.getSession(sessionId);
  if (!session || !session.isActive) return;

  if (isFinal) {
    // Add user message to transcript
    const timestamp = new Date().toLocaleTimeString();
    sessionManager.addToTranscript(sessionId, {
      speaker: 'user',
      text: transcript,
      timestamp
    });

    // Generate AI response
    const aiResponse = await llmService.generateResponse(
      sessionId,
      transcript,
      session.scenario
    );

    await handleAIResponse(socket, sessionId, aiResponse, session.scenario);

    // Check if conversation should end
    const shouldEnd = await llmService.detectConversationEnd(
      sessionId,
      session.transcript
    );

    if (shouldEnd) {
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

  // Add AI message to transcript
  const timestamp = new Date().toLocaleTimeString();
  sessionManager.addToTranscript(sessionId, {
    speaker: 'ai',
    text,
    timestamp
  });

  // Emit AI response to client
  socket.emit('ai-speaking', { text });

  // Generate audio with TTS
  const audioBuffer = await ttsService.textToSpeech(text);
  if (audioBuffer) {
    socket.emit('ai-audio', { audio: audioBuffer });
  }

  // Update avatar state (switch to talking)
  const avatarConfig = heygenService.getAvatarConfig(scenario);
  socket.emit('avatar-state', {
    state: 'talking',
    videoUrl: avatarConfig.talkingVideo
  });

  // Simulate speaking duration, then return to idle
  const speakingDuration = text.length * 50; // Rough estimate
  setTimeout(() => {
    socket.emit('avatar-state', {
      state: 'idle',
      videoUrl: avatarConfig.idleVideo
    });
  }, speakingDuration);
}

async function endSession(socket, sessionId) {
  const session = sessionManager.getSession(sessionId);
  if (!session) return;

  console.log('Ending session:', sessionId);

  // Stop live transcription
  const transcription = activeTranscriptions.get(sessionId);
  if (transcription && transcription.finish) {
    transcription.finish();
  }
  activeTranscriptions.delete(sessionId);

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
