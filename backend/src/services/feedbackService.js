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
    // Calculate comprehensive speech analytics
    const userMessages = transcript.filter(t => t.speaker === 'user');
    
    // Speech quality metrics
    const avgConfidence = userMessages.length > 0
      ? userMessages.reduce((sum, msg) => sum + (msg.confidence || 0.7), 0) / userMessages.length
      : 0.7;
    
    const avgVolume = userMessages.length > 0
      ? userMessages.reduce((sum, msg) => sum + (msg.volume || 45), 0) / userMessages.length
      : 45;
    
    const avgWordConfidence = userMessages.length > 0
      ? userMessages.reduce((sum, msg) => sum + (msg.avgWordConfidence || msg.confidence || 0.7), 0) / userMessages.length
      : 0.7;
    
    // Detect speech issues
    const speechAnalysis = this.analyzeSpeechPatterns(userMessages);
    
    const conversationText = transcript
      .map(t => {
        let line = `${t.speaker === 'user' ? 'User' : 'AI'}: ${t.text}`;
        
        // Add speech analytics for user messages
        if (t.speaker === 'user' && (t.confidence || t.volume)) {
          const metadata = [];
          if (t.confidence !== undefined) {
            metadata.push(`confidence: ${t.confidence.toFixed(2)}`);
          }
          if (t.avgWordConfidence !== undefined && t.avgWordConfidence !== t.confidence) {
            metadata.push(`word confidence: ${t.avgWordConfidence.toFixed(2)}`);
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

    const prompt = `You are an encouraging communication coach evaluating conversation quality. Balance between WHAT they say (content) and HOW they say it (tone, friendliness, delivery).

Conversation:
${conversationText}

Speech Analytics Summary:
- Average Speech Confidence: ${avgConfidence.toFixed(2)} (0.0-1.0, where >0.75 is good, >0.85 is excellent)
- Average Word Confidence: ${avgWordConfidence.toFixed(2)} (measures clarity of individual words)
- Average Volume Level: ${avgVolume.toFixed(1)} (0-100, where 30-70 is ideal conversational range)
- Filler Words Detected: ${speechAnalysis.fillerWordCount} occurrences
- Hesitation Patterns: ${speechAnalysis.hesitationCount} instances
- Response Length: Average ${speechAnalysis.avgResponseLength} words per message
- Volume Consistency: ${speechAnalysis.volumeVariance.toFixed(1)} (lower is better, <15 is good)

BALANCED EVALUATION (50% CONTENT + 50% TONE/DELIVERY):

Content Evaluation (50% weight):
- Did they attempt to stay on topic?
- Did they try to engage and show interest?
- Did they make an effort to elaborate or ask questions?
- Note: Be generous - transcription may not be perfect, focus on intent

Tone & Friendliness Evaluation (50% weight) - PRIORITY:
- Was the tone warm, friendly, and approachable?
- Did they sound engaged and present in the conversation?
- Was their energy level appropriate and inviting?
- Did they demonstrate politeness and respect?
- Was there an attempt at building rapport?

REWARD these behaviors generously:
- Any attempt at friendliness and warmth (even if brief)
- Engaged tone and positive energy
- Making an effort to connect
- Polite and respectful communication
- Good speech confidence and volume
- Clear and fluent delivery

Be understanding about:
- Brief responses (they might be listening actively)
- Transcription errors (focus on overall intent)
- Imperfect content if tone is friendly
- Natural conversation flow variations

GRADING PHILOSOPHY:
- Be GENEROUS - most people should score 3-5 range
- Use the FULL 1-6 scale: 1-2 = very poor/rude, 3-4 = good effort, 5-6 = excellent
- Friendly tone with okay content = GOOD scores (4-5 range)
- Good content with friendly delivery = HIGH scores (5-6 range)
- Default to 4 (good) unless clear issues

Provide your analysis as JSON with this exact format:
{
  "categories": {
    "confidence": <number 1-6, based on speech confidence metrics and content>,
    "tact": <number 1-6, diplomatic and appropriate responses>,
    "friendliness": <number 1-6, warmth and engagement level>,
    "respect": <number 1-6, politeness and consideration>,
    "attentiveness": <number 1-6, listening and relevant responses>,
    "empathy": <number 1-6, emotional awareness and connection>
  },
  "speechMetrics": {
    "clarity": <number 0-100, based on confidence scores and filler words>,
    "fluency": <number 0-100, based on hesitations and stuttering>,
    "volumeControl": <number 0-100, based on volume consistency>,
    "pacing": <number 0-100, based on response lengths and timing>
  }
}

Note: The overall score will be calculated automatically from the category scores.

CATEGORY SCORING GUIDELINES (Generous, balanced focus):
- Confidence (1-6): Balance speech metrics + content. 5-6 = clear speech with good engagement, 4 = decent attempt, 3 = okay but hesitant, 1-2 = very poor. Default to 4.
- Tact (1-6): 5-6 = appropriate and thoughtful, 4 = polite and considerate, 3 = adequate, 1-2 = inappropriate only. Default to 4.
- Friendliness (1-6): PRIORITY - 5-6 = warm and engaging tone, 4 = friendly attempt, 3 = neutral/polite, 1-2 = cold or rude only. Default to 4-5.
- Respect (1-6): 5-6 = very respectful, 4 = respectful, 3 = neutral, 1-2 = disrespectful only. Default to 4-5.
- Attentiveness (1-6): 5-6 = engaged and responsive, 4 = trying to engage, 3 = adequate presence, 1-2 = clearly not listening. Default to 4.
- Empathy (1-6): 5-6 = emotionally connected, 4 = shows care, 3 = neutral but present, 1-2 = cold only. Default to 4.

SPEECH METRICS (50% weight, generous scoring):
- Clarity: Start at 85, subtract 3 points per filler word, 2 points per 0.05 below 0.80 confidence
- Fluency: Start at 85, subtract 5 points per hesitation pattern detected
- Volume Control: 90+ if variance <12, 85+ if <18, 75+ if <25, lower if worse
- Pacing: Based on response lengths and natural flow - be generous

NOTE: Overall Score is automatically calculated as average of the 6 hexagon categories, converted to 0-100 scale`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',  // Latest model for encouraging, balanced analysis
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4  // Slightly higher for encouraging, generous grading
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    // Calculate overallScore from hexagon categories to ensure correlation
    // Each category is 1-6, so average them and convert to 0-100 scale
    const categoryScores = Object.values(result.categories);
    const avgCategory = categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length;
    
    // Convert from 1-6 scale to 0-100 scale: ((avg - 1) / 5) * 100
    // This ensures perfect correlation: 1 -> 0, 3.5 -> 50, 6 -> 100
    result.overallScore = Math.round(((avgCategory - 1) / 5) * 100);
    
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

      const prompt = `You are an encouraging communication coach evaluating this response. Balance between TONE/FRIENDLINESS (50%) and CONTENT (50%).

Context:
${context}

User message: "${message.text}"${speechInfo}

EVALUATE BALANCED (50% TONE + 50% CONTENT):

Tone & Friendliness (50% - PRIORITY):
- Was the tone warm and friendly?
- Did they seem engaged and present?
- Was there an attempt to connect?
- Was the delivery polite and respectful?

Content Quality (50%):
- Did they try to stay on topic?
- Did they make an effort to engage?
- Note: Be generous - transcription may be imperfect

PROVIDE ENCOURAGING FEEDBACK:
- Praise friendly tone and engagement attempts
- Be understanding of brief responses
- Focus on what they did well
- Gently suggest improvements if needed
- Account for possible transcription errors

Examples of encouraging feedback:
- "Friendly and engaged - nice job showing interest!"
- "Good attempt at connecting - consider adding more detail to keep the conversation flowing"
- "Warm and polite response - you're doing great!"
- "Nice elaboration with a friendly tone - keep it up!"
- "Good energy and presence - maybe ask a follow-up question next time"

Give ONE concise sentence of encouraging, actionable feedback focused on tone first, content second.`;


      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',  // Latest model for encouraging, balanced feedback
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,  // Slightly higher for encouraging tone
          max_tokens: 100  // Concise, encouraging feedback
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
          feedback: 'Consider elaborating more with specific details and asking follow-up questions.',
          confidence: message.confidence,
          volume: message.volume
        };
      }
    });

    return await Promise.all(feedbackPromises);
  }

  analyzeSpeechPatterns(userMessages) {
    // Filler words and hesitation markers
    const fillerWords = ['um', 'uh', 'er', 'ah', 'like', 'you know', 'i mean', 'basically', 'actually', 'literally', 'so'];
    const hesitationMarkers = ['...', '..', 'umm', 'uhh', 'hmm', 'errm'];
    
    let fillerWordCount = 0;
    let hesitationCount = 0;
    let totalWords = 0;
    let totalResponseLength = 0;
    
    // Analyze each message
    userMessages.forEach(msg => {
      const text = msg.text.toLowerCase();
      const words = text.split(/\s+/);
      totalWords += words.length;
      totalResponseLength += words.length;
      
      // Count filler words
      fillerWords.forEach(filler => {
        const regex = new RegExp(`\\b${filler}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) {
          fillerWordCount += matches.length;
        }
      });
      
      // Count hesitation markers
      hesitationMarkers.forEach(marker => {
        if (text.includes(marker)) {
          hesitationCount++;
        }
      });
      
      // Detect stuttering (repeated words at start)
      if (words.length >= 2 && words[0] === words[1]) {
        hesitationCount++;
      }
    });
    
    // Calculate volume variance
    const volumes = userMessages
      .map(msg => msg.volume)
      .filter(v => v !== undefined && v !== null);
    
    let volumeVariance = 0;
    if (volumes.length > 1) {
      const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
      const squaredDiffs = volumes.map(v => Math.pow(v - avgVolume, 2));
      volumeVariance = Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / volumes.length);
    }
    
    // Calculate confidence variance
    const confidences = userMessages
      .map(msg => msg.confidence)
      .filter(c => c !== undefined && c !== null);
    
    let confidenceVariance = 0;
    if (confidences.length > 1) {
      const avgConf = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
      const squaredDiffs = confidences.map(c => Math.pow(c - avgConf, 2));
      confidenceVariance = Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / confidences.length);
    }
    
    return {
      fillerWordCount,
      hesitationCount,
      avgResponseLength: userMessages.length > 0 ? totalResponseLength / userMessages.length : 0,
      totalWords,
      volumeVariance,
      confidenceVariance,
      messageCount: userMessages.length
    };
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
    // Calculate basic speech metrics even without AI analysis
    const userMessages = transcript.filter(t => t.speaker === 'user');
    const speechAnalysis = this.analyzeSpeechPatterns(userMessages);
    
    // Simple heuristic scoring based on speech metrics
    const avgConfidence = userMessages.length > 0
      ? userMessages.reduce((sum, msg) => sum + (msg.confidence || 0.7), 0) / userMessages.length
      : 0.7;
    
    // Create category scores first (generous defaults)
    const categories = {
      confidence: avgConfidence > 0.85 ? 5 : avgConfidence > 0.75 ? 4 : 3,  // More generous baseline
      tact: 4,  // Assume good without AI analysis
      friendliness: 4,  // Assume friendly without AI analysis
      respect: 4,  // Assume respectful without AI analysis
      attentiveness: 4,  // Assume engaged without AI analysis
      empathy: 4  // Assume present without AI analysis
    };
    
    // Calculate overall score from hexagon categories
    const categoryScores = Object.values(categories);
    const avgCategory = categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length;
    const overallScore = Math.round(((avgCategory - 1) / 5) * 100);
    
    return {
      overallScore,
      categories,
      speechMetrics: {
        clarity: Math.max(70, 90 - speechAnalysis.fillerWordCount * 3),  // More generous
        fluency: Math.max(70, 90 - speechAnalysis.hesitationCount * 5),  // More generous
        volumeControl: speechAnalysis.volumeVariance < 15 ? 90 : 80,  // Higher baseline
        pacing: speechAnalysis.avgResponseLength > 3 ? 85 : 75  // Higher baseline
      },
      transcript: transcript.map(entry => ({
        ...entry,
        feedback: entry.speaker === 'user' 
          ? 'Good attempt! Try to add a bit more detail and warmth to keep the conversation flowing naturally.' 
          : undefined
      }))
    };
  }
}

module.exports = new FeedbackService();
