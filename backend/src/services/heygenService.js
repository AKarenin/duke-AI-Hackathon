const axios = require('axios');
const WebSocket = require('ws');

class HeyGenService {
  constructor() {
    this.apiKey = process.env.HEYGEN_API_KEY;
    this.baseUrl = 'https://api.heygen.com/v1';  // Streaming API is on v1, not v2
    this.streamingSessions = new Map(); // Store active streaming sessions
    this.audioToVideoSessions = new Map(); // Store audio-to-video sessions
  }

  // Get avatar configuration for a specific scenario
  getScenarioAvatarConfig(scenario) {
    console.log('Getting avatar config for scenario:', scenario);
    
    // Map scenarios to specific avatar IDs and configurations
    const scenarioConfigs = {
      introduction: {
        avatarId: 'Alessandra_ProfessionalLook2_public', // Professional female avatar
        voice: {
          voiceId: '2d5b0e6cf36f460aa7fc47e3eee4ba54', // Friendly female voice
          rate: 1.0,
          emotion: 'Friendly'
        },
        quality: 'high',
        background: 'office'
      },
      'coffee-spill': {
        avatarId: 'Pedro_CasualLook_public', // Casual male avatar
        voice: {
          voiceId: '1bd001e7e50f421d891986aad5158bc8', // Natural male voice
          rate: 1.05,
          emotion: 'Annoyed'
        },
        quality: 'high',
        background: 'cafe'
      }
    };

    const config = scenarioConfigs[scenario] || scenarioConfigs.introduction;
    console.log('Returning avatar config:', config);
    return config;
  }

  // Get fallback avatar config (for display before streaming starts)
  getAvatarConfig(scenario) {
    const config = this.getScenarioAvatarConfig(scenario);
    return {
      avatarId: config.avatarId,
      idleVideo: null, // Will use streaming instead
      talkingVideo: null,
      streamingEnabled: true
    };
  }

  // Create a new streaming avatar session
  async createStreamingSession(sessionId, scenario) {
    if (!this.apiKey) {
      console.warn('HeyGen API key not configured');
      return null;
    }

    const avatarConfig = this.getScenarioAvatarConfig(scenario);

    try {
      console.log('Creating HeyGen streaming session for scenario:', scenario);
      const response = await axios.post(
        `${this.baseUrl}/streaming.new`,
        {
          quality: avatarConfig.quality || 'high',
          avatar_name: avatarConfig.avatarId,
          voice: {
            voice_id: avatarConfig.voice.voiceId,
            rate: avatarConfig.voice.rate || 1.0
          }
        },
        {
          headers: {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      const streamingData = response.data.data;
      this.streamingSessions.set(sessionId, {
        session_id: streamingData.session_id,
        sdp: streamingData.sdp,
        ice_servers: streamingData.ice_servers,
        avatarConfig,
        createdAt: Date.now()
      });

      console.log('HeyGen streaming session created:', streamingData.session_id);
      return {
        session_id: streamingData.session_id,
        sdp: streamingData.sdp,
        ice_servers: streamingData.ice_servers
      };
    } catch (error) {
      console.error('HeyGen streaming session error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return null;
    }
  }

  // Start the avatar stream
  async startStreamingSession(sessionId) {
    const session = this.streamingSessions.get(sessionId);
    if (!session) {
      console.error('No streaming session found for sessionId:', sessionId);
      return null;
    }

    try {
      console.log('Starting HeyGen stream:', session.session_id);
      const response = await axios.post(
        `${this.baseUrl}/streaming.start`,
        {
          session_id: session.session_id
        },
        {
          headers: {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error starting HeyGen stream:', error.response?.data || error.message);
      return null;
    }
  }

  // Send ICE candidate to HeyGen
  async sendICECandidate(heygenSessionId, candidate) {
    if (!this.apiKey) {
      return null;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/streaming.ice`,
        {
          session_id: heygenSessionId,
          candidate: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex
          }
        },
        {
          headers: {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      // ICE candidate errors are often not critical
      console.log('   ICE candidate error (non-critical):', error.response?.data?.message || error.message);
      return null;
    }
  }

  // Make the avatar speak specific text
  async speakWithAvatar(sessionId, text, taskType = 'talk') {
    const session = this.streamingSessions.get(sessionId);
    if (!session) {
      console.warn('No streaming session found for sessionId:', sessionId);
      return null;
    }

    try {
      console.log('Making HeyGen avatar speak:', text.substring(0, 50) + '...');
      const response = await axios.post(
        `${this.baseUrl}/streaming.task`,
        {
          session_id: session.session_id,
          text,
          task_type: taskType
        },
        {
          headers: {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error making avatar speak:', error.response?.data || error.message);
      return null;
    }
  }

  // Stop and close the streaming session
  async stopStreamingSession(sessionId) {
    const session = this.streamingSessions.get(sessionId);
    if (!session) {
      return null;
    }

    try {
      console.log('Stopping HeyGen streaming session:', session.session_id);
      const response = await axios.post(
        `${this.baseUrl}/streaming.stop`,
        {
          session_id: session.session_id
        },
        {
          headers: {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      this.streamingSessions.delete(sessionId);
      return response.data;
    } catch (error) {
      console.error('Error stopping HeyGen stream:', error.response?.data || error.message);
      this.streamingSessions.delete(sessionId);
      return null;
    }
  }

  // Generate a single avatar video (for pre-recorded scenarios)
  async generateAvatarVideo(text, scenario) {
    if (!this.apiKey) {
      console.warn('HeyGen API key not configured');
      return null;
    }

    const avatarConfig = this.getScenarioAvatarConfig(scenario);

    try {
      console.log('Generating HeyGen video for scenario:', scenario);
      const response = await axios.post(
        `${this.baseUrl}/video/generate`,
        {
          video_inputs: [{
            character: {
              type: 'avatar',
              avatar_id: avatarConfig.avatarId,
              avatar_style: 'normal'
            },
            voice: {
              type: 'text',
              input_text: text,
              voice_id: avatarConfig.voice.voiceId,
              speed: avatarConfig.voice.rate || 1.0
            }
          }],
          dimension: {
            width: 1280,
            height: 720
          },
          aspect_ratio: '16:9'
        },
        {
          headers: {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('HeyGen video generation started, video_id:', response.data.data?.video_id);
      return response.data.data;
    } catch (error) {
      console.error('HeyGen video generation error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return null;
    }
  }

  // Get the status of a generated video
  async getVideoStatus(videoId) {
    if (!this.apiKey) {
      console.warn('HeyGen API key not configured');
      return null;
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/video_status.get?video_id=${videoId}`,
        {
          headers: {
            'X-Api-Key': this.apiKey
          }
        }
      );

      return response.data.data;
    } catch (error) {
      console.error('Error checking video status:', error.response?.data || error.message);
      return null;
    }
  }

  // List available avatars
  async listAvatars() {
    if (!this.apiKey) {
      console.warn('HeyGen API key not configured');
      return [];
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/avatars`,
        {
          headers: {
            'X-Api-Key': this.apiKey
          }
        }
      );

      return response.data.data?.avatars || [];
    } catch (error) {
      console.error('Error listing avatars:', error.response?.data || error.message);
      return [];
    }
  }

  // Create Audio-to-Video session (bring your own audio)
  async createAudioToVideoSession(sessionId, scenario, onVideoChunk, onError) {
    if (!this.apiKey) {
      console.warn('⚠️ HeyGen API key not configured');
      return null;
    }

    try {
      console.log('🎬 Creating HeyGen Audio-to-Video session...');
      
      const avatarConfig = this.getScenarioAvatarConfig(scenario);
      
      // Create streaming session
      const response = await axios.post(
        `${this.baseUrl}/streaming.new`,
        {
          quality: 'high',
          avatar_name: avatarConfig.avatarId,
          voice: {
            voice_id: avatarConfig.voice.voiceId
          }
        },
        {
          headers: {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      const sessionData = response.data.data;
      console.log('✅ HeyGen session created:', sessionData.session_id);

      // Start the session
      await axios.post(
        `${this.baseUrl}/streaming.start`,
        {
          session_id: sessionData.session_id
        },
        {
          headers: {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ HeyGen session started');

      this.audioToVideoSessions.set(sessionId, {
        heygenSessionId: sessionData.session_id,
        avatarConfig,
        sdp: sessionData.sdp,
        ice_servers: sessionData.ice_servers
      });

      return {
        sessionId: sessionData.session_id,
        sdp: sessionData.sdp,
        ice_servers: sessionData.ice_servers,
        sendAudio: async (audioBuffer) => {
          // Send audio chunk to HeyGen for lip-sync
          try {
            await axios.post(
              `${this.baseUrl}/streaming.task`,
              {
                session_id: sessionData.session_id,
                task_type: 'repeat',
                audio: audioBuffer.toString('base64')
              },
              {
                headers: {
                  'X-Api-Key': this.apiKey,
                  'Content-Type': 'application/json'
                }
              }
            );
          } catch (error) {
            console.error('❌ Error sending audio to HeyGen:', error.message);
          }
        }
      };

    } catch (error) {
      console.error('❌ Failed to create audio-to-video session:', error.response?.data || error.message);
      if (onError) {
        onError(error);
      }
      return null;
    }
  }

  async closeAudioToVideoSession(sessionId) {
    const session = this.audioToVideoSessions.get(sessionId);
    if (session) {
      await this.stopStreamingSession(sessionId);
      this.audioToVideoSessions.delete(sessionId);
    }
  }
}

module.exports = new HeyGenService();
