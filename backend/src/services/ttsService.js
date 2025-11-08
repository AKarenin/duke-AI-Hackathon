const axios = require('axios');

class TTSService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Default voice (Sarah)
  }

  async textToSpeech(text) {
    if (!this.apiKey) {
      console.warn('ElevenLabs API key not configured');
      return null;
    }

    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
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

      return response.data;
    } catch (error) {
      console.error('TTS error:', error.response?.data || error.message);
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
}

module.exports = new TTSService();
