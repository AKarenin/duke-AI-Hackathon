const axios = require('axios');

class HeyGenService {
  constructor() {
    this.apiKey = process.env.HEYGEN_API_KEY;
    this.baseUrl = 'https://api.heygen.com/v1';
  }

  // Get avatar video URL for a specific scenario
  getAvatarConfig(scenario) {
    // Map scenarios to avatar configurations
    const avatarConfigs = {
      introduction: {
        avatarId: 'default-avatar-1',
        idleVideo: '/assets/introduction-idle.mp4',
        talkingVideo: '/assets/introduction-talking.mp4'
      },
      'coffee-spill': {
        avatarId: 'default-avatar-2',
        idleVideo: '/assets/coffee-spill-idle.mp4',
        talkingVideo: '/assets/coffee-spill-talking.mp4'
      }
    };

    return avatarConfigs[scenario] || avatarConfigs.introduction;
  }

  async generateAvatarVideo(text, avatarId) {
    if (!this.apiKey) {
      console.warn('HeyGen API key not configured');
      return null;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/video.generate`,
        {
          avatar_id: avatarId,
          text,
          voice_id: 'default',
          quality: 'high'
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
      console.error('HeyGen error:', error.response?.data || error.message);
      return null;
    }
  }

  async getVideoStatus(videoId) {
    if (!this.apiKey) {
      console.warn('HeyGen API key not configured');
      return null;
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/video.status/${videoId}`,
        {
          headers: {
            'X-Api-Key': this.apiKey
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error checking video status:', error);
      return null;
    }
  }
}

module.exports = new HeyGenService();
