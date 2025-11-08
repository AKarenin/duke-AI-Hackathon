const axios = require('axios');
const WebSocket = require('ws');

class TTSService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.activeStreams = new Map(); // Track active streaming sessions
    
    // Voice configuration per scenario
    this.scenarioVoices = {
      introduction: {
        voiceId: 'EXAVITQu4vr4xnSDxMaL',  // Sarah - Professional female voice
        name: 'Sarah (Female)',
        gender: 'female'
      },
      'coffee-spill': {
        voiceId: 'pNInz6obpgDQGcFmaJgB',  // Adam - Casual male voice
        name: 'Adam (Male)',
        gender: 'male'
      }
    };
  }

  // Get voice ID for a specific scenario
  getVoiceForScenario(scenario) {
    const voiceConfig = this.scenarioVoices[scenario] || this.scenarioVoices.introduction;
    console.log(`🎙️ Using ${voiceConfig.name} for scenario: ${scenario}`);
    return voiceConfig.voiceId;
  }

  async textToSpeech(text, scenario = 'introduction') {
    if (!this.apiKey) {
      console.warn('ElevenLabs API key not configured');
      return null;
    }

    const voiceId = this.getVoiceForScenario(scenario);

    try {
      console.log('Generating TTS for text:', text.substring(0, 50) + '...');
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: 'eleven_turbo_v2',  // Updated to newer model available on free tier
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      console.log('TTS response received, size:', response.data.byteLength);
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      
      // Check for rate limit error
      if (status === 429) {
        console.error('🚨 ELEVENLABS RATE LIMIT HIT! 🚨');
        console.error('You have exceeded your ElevenLabs API quota.');
        console.error('Either wait for quota reset or upgrade your plan.');
      } else if (status === 401) {
        console.error('🚨 ELEVENLABS AUTHENTICATION ERROR! 🚨');
        console.error('Check your ELEVENLABS_API_KEY in .env file');
      } else {
        console.error('TTS error details:', {
          message: error.message,
          status,
          statusText,
          data: error.response?.data ? error.response.data.toString() : 'No data'
        });
      }
      return null;
    }
  }

  // Get available voices
  async getVoices() {
    if (!this.apiKey) {
      console.warn('ElevenLabs API key not configured');
      return [];
    }

    try {
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      return response.data.voices;
    } catch (error) {
      console.error('Error fetching voices:', error);
      return [];
    }
  }

  setVoice(voiceId) {
    this.voiceId = voiceId;
  }

  // Create streaming TTS connection (real-time audio chunks)
  createStreamingTTS(sessionId, onAudioChunk, onComplete, onError, scenario = 'introduction') {
    if (!this.apiKey) {
      console.warn('⚠️ ElevenLabs API key not configured');
      return null;
    }

    const voiceId = this.getVoiceForScenario(scenario);

    try {
      console.log('🎙️ Creating ElevenLabs streaming TTS connection...');
      
      const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=eleven_turbo_v2`;
      
      const ws = new WebSocket(wsUrl, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      ws.on('open', () => {
        console.log('✅ ElevenLabs streaming connected');
        
        // Send initial configuration
        const config = {
          text: ' ',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          },
          xi_api_key: this.apiKey
        };
        
        ws.send(JSON.stringify(config));
      });

      ws.on('message', (data) => {
        try {
          const response = JSON.parse(data);
          
          if (response.audio) {
            // Audio chunk received (base64 encoded)
            const audioBuffer = Buffer.from(response.audio, 'base64');
            console.log('🔊 ElevenLabs audio chunk:', audioBuffer.length, 'bytes');
            
            if (onAudioChunk) {
              onAudioChunk(audioBuffer);
            }
          }
          
          if (response.isFinal) {
            console.log('✅ ElevenLabs stream complete');
            if (onComplete) {
              onComplete();
            }
          }
          
          if (response.normalizedAlignment) {
            // Alignment data for lip-sync timing
            console.log('📊 Alignment data received');
          }
        } catch (err) {
          console.error('❌ Error parsing ElevenLabs message:', err);
        }
      });

      ws.on('error', (error) => {
        console.error('❌ ElevenLabs WebSocket error:', error);
        if (onError) {
          onError(error);
        }
      });

      ws.on('close', () => {
        console.log('🔌 ElevenLabs stream closed');
        this.activeStreams.delete(sessionId);
      });

      this.activeStreams.set(sessionId, ws);
      
      return {
        send: (text) => {
          if (ws.readyState === WebSocket.OPEN) {
            console.log('📤 Sending text to ElevenLabs:', text.substring(0, 50) + '...');
            ws.send(JSON.stringify({ text, try_trigger_generation: true }));
          }
        },
        end: () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ text: '' })); // End signal
            setTimeout(() => ws.close(), 1000);
          }
        },
        close: () => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        }
      };

    } catch (error) {
      console.error('❌ Failed to create streaming TTS:', error);
      if (onError) {
        onError(error);
      }
      return null;
    }
  }

  closeStream(sessionId) {
    const stream = this.activeStreams.get(sessionId);
    if (stream && stream.close) {
      stream.close();
      this.activeStreams.delete(sessionId);
    }
  }
}

module.exports = new TTSService();
