const { createClient } = require('@deepgram/sdk');

class STTService {
  constructor() {
    this.deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (this.deepgramApiKey) {
      this.deepgram = createClient(this.deepgramApiKey);
    }
  }

  async transcribeAudio(audioBuffer) {
    if (!this.deepgramApiKey) {
      console.warn('Deepgram API key not configured');
      return { transcript: '', isFinal: false };
    }

    try {
      const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: 'nova-2',
          smart_format: true,
          punctuate: true,
        }
      );

      if (error) {
        console.error('Deepgram transcription error:', error);
        return { transcript: '', isFinal: false };
      }

      const transcript = result.results?.channels[0]?.alternatives[0]?.transcript || '';
      const confidence = result.results?.channels[0]?.alternatives[0]?.confidence || 0;

      return {
        transcript,
        confidence,
        isFinal: true
      };
    } catch (error) {
      console.error('STT error:', error);
      return { transcript: '', isFinal: false };
    }
  }

  // For streaming transcription
  createLiveTranscription(onTranscript, onError) {
    if (!this.deepgramApiKey) {
      console.warn('Deepgram API key not configured');
      return null;
    }

    try {
      const connection = this.deepgram.listen.live({
        model: 'nova-2',
        smart_format: true,
        punctuate: true,
        interim_results: true,
      });

      connection.on('open', () => {
        console.log('Deepgram connection opened');
      });

      connection.on('Results', (data) => {
        const transcript = data.channel?.alternatives[0]?.transcript || '';
        const isFinal = data.is_final;

        if (transcript) {
          onTranscript({ transcript, isFinal });
        }
      });

      connection.on('error', (error) => {
        console.error('Deepgram connection error:', error);
        if (onError) onError(error);
      });

      return connection;
    } catch (error) {
      console.error('Failed to create live transcription:', error);
      if (onError) onError(error);
      return null;
    }
  }
}

module.exports = new STTService();
