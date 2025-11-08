// Manages avatar image states for different scenarios
class AvatarImageManager {
  constructor() {
    // Track current image state for each session
    this.sessionImageStates = new Map();
  }

  // Get the appropriate image for a scenario and state
  getImagePath(scenario, state) {
    const imagePaths = {
      introduction: {
        normal: '/assets/alessandra-normal.png',
        goodbye: '/assets/alessandra-goodbye.png'
      },
      'coffee-spill': {
        angry: '/assets/pedro-angry.png',
        happy: '/assets/pedro-happy.png'
      }
    };

    return imagePaths[scenario]?.[state] || imagePaths[scenario]?.normal || imagePaths[scenario]?.angry;
  }

  // Initialize session with default image state
  initializeSession(sessionId, scenario) {
    const initialState = scenario === 'introduction' ? 'normal' : 'angry';
    this.sessionImageStates.set(sessionId, {
      scenario,
      currentState: initialState,
      imagePath: this.getImagePath(scenario, initialState)
    });
    return this.getSessionState(sessionId);
  }

  // Get current image state for a session
  getSessionState(sessionId) {
    return this.sessionImageStates.get(sessionId);
  }

  // Update image state for a session
  updateImageState(sessionId, newState) {
    const sessionState = this.sessionImageStates.get(sessionId);
    if (!sessionState) {
      console.warn('⚠️ No session state found for:', sessionId);
      return null;
    }

    sessionState.currentState = newState;
    sessionState.imagePath = this.getImagePath(sessionState.scenario, newState);
    this.sessionImageStates.set(sessionId, sessionState);
    
    console.log(`🖼️ Avatar image updated for session ${sessionId}: ${newState} -> ${sessionState.imagePath}`);
    return sessionState;
  }

  // Check if Alessandra should switch to goodbye image
  shouldShowGoodbye(aiMessage) {
    const goodbyePhrases = [
      'nice talking to you',
      'nice meeting you',
      'great talking to you',
      'great meeting you',
      'pleasure talking',
      'pleasure meeting',
      'take care',
      'have a great',
      'see you around',
      'catch you later',
      'good luck',
      'best of luck',
      'it was nice',
      'it was great',
      'speak to you soon',
      'talk to you soon',
      'i should let you',
      'should let you mingle',
      'nice to meet you'
    ];

    const lowerMessage = aiMessage.toLowerCase();
    return goodbyePhrases.some(phrase => lowerMessage.includes(phrase));
  }

  // Check if Pedro's emotion has softened (simple heuristic)
  hasPedroSoftened(transcript) {
    // Look at Pedro's (AI) messages in the transcript
    const aiMessages = transcript.filter(t => t.speaker === 'ai');
    
    // Need at least 2 messages to detect softening
    if (aiMessages.length < 2) {
      return false;
    }

    // Check recent messages for softening phrases
    const recentMessages = aiMessages.slice(-3).map(m => m.text.toLowerCase()).join(' ');
    
    const softeningPhrases = [
      'it\'s okay',
      'its okay',
      'no problem',
      'don\'t worry',
      'these things happen',
      'it\'s fine',
      'its fine',
      'it\'s alright',
      'its alright',
      'i understand',
      'no worries',
      'that\'s okay',
      'thats okay',
      'appreciate',
      'thank you',
      'thanks'
    ];

    return softeningPhrases.some(phrase => recentMessages.includes(phrase));
  }

  // Clean up session data
  clearSession(sessionId) {
    this.sessionImageStates.delete(sessionId);
  }
}

module.exports = new AvatarImageManager();

