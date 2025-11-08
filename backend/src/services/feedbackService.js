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
    // Calculate speech analytics from transcript metadata
    const userMessages = transcript.filter(t => t.speaker === 'user');
    const avgConfidence = userMessages.length > 0
      ? userMessages.reduce((sum, msg) => sum + (msg.confidence || 0), 0) / userMessages.length
      : 0;
    const avgVolume = userMessages.length > 0
      ? userMessages.reduce((sum, msg) => sum + (msg.volume || 0), 0) / userMessages.length
      : 0;
    
    const conversationText = transcript
      .map(t => {
        let line = `${t.speaker === 'user' ? 'User' : 'AI'}: ${t.text}`;
        
        // Add speech analytics for user messages
        if (t.speaker === 'user' && (t.confidence || t.volume)) {
          const metadata = [];
          if (t.confidence !== undefined) {
            metadata.push(`confidence: ${t.confidence.toFixed(2)}`);
          }
          if (t.volume !== undefined) {
            metadata.push(`volume: ${t.volume.toFixed(1)}`);
          }
          if (metadata.length > 0) {
            line += ` [${metadata.join(', ')}]`;
          }
        }
        
        return line;
      })
      .join('\n');

    const prompt = `Analyze this conversation and provide scores:

Conversation:
${conversationText}

Speech Analytics Summary:
- Average Speech Confidence: ${avgConfidence.toFixed(2)} (0.0-1.0, where >0.85 is excellent)
- Average Volume Level: ${avgVolume.toFixed(1)} (0-100, where 30-70 is conversational)

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
  },
  "speechMetrics": {
    "clarity": <number 0-100 based on confidence scores>,
    "volumeAppropriacy": <number 0-100 based on volume levels>,
    "consistencyScore": <number 0-100 based on variation in metrics>
  }
}

Evaluate based on:
- Confidence: assertiveness, clarity, self-assurance (use speech confidence and volume as indicators)
- Tact: diplomacy, sensitivity in difficult situations
- Friendliness: warmth, approachability
- Respect: politeness, consideration
- Attentiveness: active listening, engagement
- Empathy: understanding, emotional awareness

Speech Analysis Guidelines:
- Low confidence scores (<0.7) suggest unclear speech or hesitation
- Very low volume (<20) suggests lack of assertiveness
- Very high volume (>80) may indicate aggression
- Consistent metrics suggest comfort and confidence`;

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
      
      // Add speech analytics to the prompt if available
      let speechInfo = '';
      if (message.confidence !== undefined || message.volume !== undefined) {
        const parts = [];
        if (message.confidence !== undefined) {
          parts.push(`Speech confidence: ${message.confidence.toFixed(2)}`);
        }
        if (message.volume !== undefined) {
          parts.push(`Volume level: ${message.volume.toFixed(1)}`);
        }
        speechInfo = `\nSpeech Analytics: ${parts.join(', ')}`;
      }

      const prompt = `Provide brief (one sentence) constructive feedback on this user message:

Context:
${context}

User message: "${message.text}"${speechInfo}

Give specific, actionable feedback focusing on communication skills. If speech metrics indicate low confidence or inappropriate volume, mention it. Keep it to ONE sentence.`;

      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 60
        });

        return {
          text: message.text,
          feedback: response.choices[0].message.content.trim(),
          confidence: message.confidence,
          volume: message.volume
        };
      } catch (error) {
        console.error('Error generating feedback for message:', error);
        return {
          text: message.text,
          feedback: 'Good communication.',
          confidence: message.confidence,
          volume: message.volume
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
