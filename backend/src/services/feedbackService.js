const OpenAI = require('openai');

class FeedbackService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    if (this.apiKey) {
      this.openai = new OpenAI({ apiKey: this.apiKey });
    }
  }

  async generateFeedback(transcript, scenario) {
    if (!this.apiKey) {
      console.warn('OpenAI API key not configured');
      return this.getDefaultFeedback(transcript);
    }

    try {
      // Generate overall feedback and scores
      const overallFeedback = await this.generateOverallFeedback(transcript, scenario);

      // Generate line-by-line feedback for user messages
      const detailedFeedback = await this.generateLineByLineFeedback(transcript);

      return {
        overallScore: overallFeedback.overallScore,
        categories: overallFeedback.categories,
        transcript: this.mergeTranscriptWithFeedback(transcript, detailedFeedback)
      };
    } catch (error) {
      console.error('Feedback generation error:', error);
      return this.getDefaultFeedback(transcript);
    }
  }

  async generateOverallFeedback(transcript, scenario) {
    const conversationText = transcript
      .map(t => `${t.speaker === 'user' ? 'User' : 'AI'}: ${t.text}`)
      .join('\n');

    const prompt = `Analyze this conversation and provide scores:

Conversation:
${conversationText}

Provide your analysis as JSON with this exact format:
{
  "overallScore": <number 0-100>,
  "categories": {
    "confidence": <number 1-6>,
    "tact": <number 1-6>,
    "friendliness": <number 1-6>,
    "respect": <number 1-6>,
    "attentiveness": <number 1-6>,
    "empathy": <number 1-6>
  }
}

Evaluate based on:
- Confidence: assertiveness, clarity, self-assurance
- Tact: diplomacy, sensitivity in difficult situations
- Friendliness: warmth, approachability
- Respect: politeness, consideration
- Attentiveness: active listening, engagement
- Empathy: understanding, emotional awareness`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result;
  }

  async generateLineByLineFeedback(transcript) {
    const userMessages = transcript.filter(t => t.speaker === 'user');

    if (userMessages.length === 0) {
      return [];
    }

    const feedbackPromises = userMessages.map(async (message, index) => {
      const context = this.getMessageContext(transcript, message);

      const prompt = `Provide brief (one sentence) constructive feedback on this user message:

Context:
${context}

User message: "${message.text}"

Give specific, actionable feedback focusing on communication skills. Keep it to ONE sentence.`;

      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 60
        });

        return {
          text: message.text,
          feedback: response.choices[0].message.content.trim()
        };
      } catch (error) {
        console.error('Error generating feedback for message:', error);
        return {
          text: message.text,
          feedback: 'Good communication.'
        };
      }
    });

    return await Promise.all(feedbackPromises);
  }

  getMessageContext(transcript, targetMessage) {
    const index = transcript.indexOf(targetMessage);
    const contextStart = Math.max(0, index - 2);
    const contextEnd = Math.min(transcript.length, index + 2);

    return transcript
      .slice(contextStart, contextEnd)
      .map(t => `${t.speaker === 'user' ? 'User' : 'AI'}: ${t.text}`)
      .join('\n');
  }

  mergeTranscriptWithFeedback(transcript, detailedFeedback) {
    return transcript.map(entry => {
      if (entry.speaker === 'user') {
        const feedbackItem = detailedFeedback.find(f => f.text === entry.text);
        return {
          ...entry,
          feedback: feedbackItem?.feedback || ''
        };
      }
      return entry;
    });
  }

  getDefaultFeedback(transcript) {
    return {
      overallScore: 75,
      categories: {
        confidence: 4,
        tact: 4,
        friendliness: 4,
        respect: 4,
        attentiveness: 4,
        empathy: 4
      },
      transcript: transcript.map(entry => ({
        ...entry,
        feedback: entry.speaker === 'user' ? 'Good communication skills demonstrated.' : undefined
      }))
    };
  }
}

module.exports = new FeedbackService();
