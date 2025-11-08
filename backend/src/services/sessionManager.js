const { v4: uuidv4 } = require('uuid');

// In-memory session storage
const sessions = new Map();

class SessionManager {
  createSession(socketId, scenario) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      socketId,
      scenario,
      startTime: new Date(),
      transcript: [],
      currentUserMessage: '',
      isActive: true,
      audioBuffer: []
    };

    sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return sessions.get(sessionId);
  }

  getSessionBySocket(socketId) {
    for (const session of sessions.values()) {
      if (session.socketId === socketId && session.isActive) {
        return session;
      }
    }
    return null;
  }

  updateSession(sessionId, updates) {
    const session = sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      sessions.set(sessionId, session);
    }
    return session;
  }

  addToTranscript(sessionId, entry) {
    const session = sessions.get(sessionId);
    if (session) {
      session.transcript.push(entry);
      sessions.set(sessionId, session);
    }
  }

  endSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.endTime = new Date();
      sessions.set(sessionId, session);
    }
    return session;
  }

  cleanupSocket(socketId) {
    for (const [sessionId, session] of sessions.entries()) {
      if (session.socketId === socketId) {
        session.isActive = false;
      }
    }
  }

  // Export session data as JSON
  exportSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      return JSON.stringify(session, null, 2);
    }
    return null;
  }
}

module.exports = new SessionManager();
