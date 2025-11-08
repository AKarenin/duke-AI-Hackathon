const OpenAI = require('openai');

class LLMService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    if (this.apiKey) {
      this.openai = new OpenAI({ apiKey: this.apiKey });
    }
    this.conversationHistory = new Map();
  }

  getScenarioPrompt(scenario) {
    const prompts = {
      introduction: `You are Alex, a friendly stranger at a networking event. Someone is approaching you to introduce themselves.
      
      YOUR GOAL: Have a natural introduction conversation where you learn the person's name, what they do, and share a bit about yourself.
      
      Be warm, engaging, and ask follow-up questions. Keep responses concise (2-3 sentences max).
      
      CONVERSATION END CRITERIA: When BOTH of these are achieved:
      1. You've learned their name and what they do
      2. You've shared your name and what you do
      
      Once both goals are met, gracefully end with something like "It was nice meeting you!" or "I should let you mingle, but great talking to you!"`,

      'coffee-spill': `You are Alex, a stranger at a cafe who just had coffee spilled on you. You're initially annoyed and surprised.
      
      YOUR GOAL: The other person needs to successfully calm you down and handle the situation appropriately.
      
      START: Be upset and react naturally (but not overly aggressive).
      MIDDLE: Respond based on how they handle it - soften if they're apologetic and helpful.
      END CRITERIA: You're no longer annoyed - they've apologized well and offered to help/pay for cleaning.
      
      Keep responses brief and realistic (2-3 sentences max).
      
      When you're satisfied with how they handled it, end with something like "Alright, it's okay, these things happen" or "Thanks for being so understanding about it."`
    };

    return prompts[scenario] || prompts.introduction;
  }

  async generateResponse(sessionId, userMessage, scenario) {
    if (!this.apiKey) {
      console.warn('OpenAI API key not configured');
      return 'I apologize, but the AI service is not configured.';
    }

    try {
      // Get or create conversation history
      if (!this.conversationHistory.has(sessionId)) {
        this.conversationHistory.set(sessionId, [
          {
            role: 'system',
            content: this.getScenarioPrompt(scenario)
          }
        ]);
      }

      const history = this.conversationHistory.get(sessionId);

      // Add user message to history
      history.push({
        role: 'user',
        content: userMessage
      });

      // Generate response
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: history,
        temperature: 0.8,
        max_tokens: 150
      });

      const aiMessage = response.choices[0].message.content;

      // Add AI response to history
      history.push({
        role: 'assistant',
        content: aiMessage
      });

      this.conversationHistory.set(sessionId, history);

      return aiMessage;
    } catch (error) {
      console.error('LLM error:', error);
      return 'I apologize, I had trouble processing that.';
    }
  }

  async detectConversationEnd(sessionId, transcript, scenario) {
    // Need at least 4 messages (2 exchanges) before considering ending
    if (!this.apiKey || transcript.length < 4) {
      console.log(`⏸️ Not checking end yet (${transcript.length}/4 messages)`);
      return false;
    }

    try {
      // Get the last AI message to check for goodbye phrases
      const lastAIMessage = transcript.filter(t => t.speaker === 'ai').slice(-1)[0];
      
      if (lastAIMessage) {
        const aiText = lastAIMessage.text.toLowerCase();
        
        // Strong goodbye indicators from AI
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
          'thanks for chatting',
          'thanks for talking',
          'it was nice',
          'it was great',
          'speak to you soon',
          'talk to you soon'
        ];
        
        // Check if AI said a goodbye phrase
        const aiSaidGoodbye = goodbyePhrases.some(phrase => aiText.includes(phrase));
        
        if (aiSaidGoodbye) {
          console.log('👋 AI said goodbye phrase - ending conversation');
          return true;
        }
      }
      
      // If not an obvious goodbye, check if goals are met (after 8 messages)
      if (transcript.length < 8) {
        return false;
      }

      const recentMessages = transcript.slice(-6).map(t =>
        `${t.speaker}: ${t.text}`
      ).join('\n');

      const goalCriteria = {
        introduction: 'Both people have introduced themselves (names and what they do) and are wrapping up',
        'coffee-spill': 'The upset person is no longer annoyed and the situation is resolved'
      };

      const criteria = goalCriteria[scenario] || 'Conversation is naturally concluding';

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `Analyze if the conversation is naturally ending: "${criteria}". 
            
            Look for:
            1. Goal completion or natural wrap-up
            2. Ending signals (goodbye, thanks, closing phrases)
            3. Both parties seeming satisfied
            
            Respond with ONLY "yes" if the conversation is clearly concluding. Otherwise respond "no".`
          },
          {
            role: 'user',
            content: recentMessages
          }
        ],
        temperature: 0,
        max_tokens: 5
      });

      const answer = response.choices[0].message.content.toLowerCase().trim();
      const shouldEnd = answer === 'yes';
      
      if (shouldEnd) {
        console.log('🎯 Conversation goal achieved! Ending naturally.');
      }
      
      return shouldEnd;
    } catch (error) {
      console.error('Conversation end detection error:', error);
      return false;
    }
  }

  clearHistory(sessionId) {
    this.conversationHistory.delete(sessionId);
  }
}

module.exports = new LLMService();
