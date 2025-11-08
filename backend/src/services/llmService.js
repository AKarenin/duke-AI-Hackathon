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
      introduction: `You are a friendly stranger at a networking event. Someone is approaching you to introduce themselves.
      Be warm and engaging, ask follow-up questions, and have a natural conversation.
      Keep responses concise and conversational (2-3 sentences max).
      After a natural exchange of introductions and some small talk, gracefully end the conversation when it feels complete.`,

      'coffee-spill': `You are a stranger at a cafe who just had coffee spilled on you by someone.
      React naturally - you're surprised and a bit upset, but you're a reasonable person.
      Respond to how the other person handles the situation.
      Keep responses brief and realistic (2-3 sentences max).
      End the conversation naturally once the situation is resolved.`
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

  async detectConversationEnd(sessionId, transcript) {
    if (!this.apiKey || transcript.length < 4) {
      return false;
    }

    try {
      const recentMessages = transcript.slice(-4).map(t =>
        `${t.speaker}: ${t.text}`
      ).join('\n');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'Analyze if this conversation has reached a natural conclusion (goodbyes, thank yous, clear ending). Respond with only "yes" or "no".'
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
      return answer === 'yes';
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
