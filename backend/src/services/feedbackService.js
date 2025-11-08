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

    const prompt = `You are a HIGHLY CRITICAL communication coach analyzing this conversation. Be harsh, demanding, and identify EVERY flaw.

Conversation:
${conversationText}

Speech Analytics Summary:
- Average Speech Confidence: ${avgConfidence.toFixed(2)} (0.0-1.0, where >0.85 is excellent)
- Average Volume Level: ${avgVolume.toFixed(1)} (0-100, where 30-70 is conversational)

GRADING PHILOSOPHY - BE EXTREMELY CRITICAL:
- Excellence is rare. Most people deserve 50-70 range
- 80+ is exceptional and should be VERY rare
- Identify EVERY weakness: hesitations, filler words, unclear statements, missed opportunities
- Don't sugarcoat - point out specific failures in communication
- Low confidence (<0.9) is a serious problem
- Inconsistent volume shows poor control
- Generic responses show lack of engagement

Provide your analysis as JSON with this exact format:
{
  "overallScore": <number 0-100, BE HARSH - most scores should be 50-75>,
  "categories": {
    "confidence": <number 1-6, penalize ANY hesitation>,
    "tact": <number 1-6, require excellent diplomacy for high scores>,
    "friendliness": <number 1-6, generic pleasantries don't count>,
    "respect": <number 1-6, basic politeness isn't enough>,
    "attentiveness": <number 1-6, demand active listening evidence>,
    "empathy": <number 1-6, require genuine emotional connection>
  },
  "speechMetrics": {
    "clarity": <number 0-100, penalize confidence <0.9>,
    "volumeAppropriacy": <number 0-100, penalize ANY inconsistency>,
    "consistencyScore": <number 0-100, expect near-perfect consistency>
  }
}

CRITICAL EVALUATION STANDARDS:
- Confidence: Only 5-6 if speech is crystal clear, assertive, NO hesitation. Any "um", "uh", pauses = major penalty
- Tact: Demand sophisticated diplomacy. Basic politeness = 3/6 max
- Friendliness: Generic "nice to meet you" is bare minimum. Require genuine warmth and personality
- Respect: Basic politeness is expected, not rewarded. Look for deeper consideration
- Attentiveness: Must demonstrate they listened (references, follow-ups). Generic responses = failure
- Empathy: Must show genuine emotional intelligence, not just surface-level pleasantries

Speech Penalties:
- Confidence <0.9 = automatically cap clarity at 70
- Volume <25 or >75 = cap appropriacy at 60
- Confidence variance >0.1 = shows nervousness, major penalty
- Short responses (<5 words) = disengaged, major penalty`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',  // Latest model for most accurate critical analysis
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2  // Lower temperature for more consistent harsh grading
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

      const prompt = `You are a HARSH communication critic. Provide brutally honest, critical feedback on this user message:

Context:
${context}

User message: "${message.text}"${speechInfo}

BE CRITICAL AND DEMANDING:
- Identify specific weaknesses (vague language, lack of detail, generic responses, missed opportunities)
- If confidence <0.9 or volume inappropriate, call it out as a major problem
- Generic responses like "nice to meet you" deserve criticism for lack of personality
- Short responses show disengagement
- Point out what they SHOULD have said instead

Give ONE sentence of harsh, specific, actionable criticism. Don't sugarcoat.`;


      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',  // Latest model for harshest, most accurate criticism
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,  // Lower for more consistent critical tone
          max_tokens: 80  // Slightly more tokens for detailed criticism
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
      overallScore: 50,  // Default to average, not good
      categories: {
        confidence: 3,  // Middle of the road
        tact: 3,
        friendliness: 3,
        respect: 3,
        attentiveness: 3,
        empathy: 3
      },
      transcript: transcript.map(entry => ({
        ...entry,
        feedback: entry.speaker === 'user' ? 'Unable to analyze - ensure you provide more detailed, engaging responses.' : undefined
      }))
    };
  }
}

module.exports = new FeedbackService();
