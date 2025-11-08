const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

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

  // For streaming transcription with confidence and volume tracking
  createLiveTranscription(onTranscript, onError) {
    if (!this.deepgramApiKey) {
      console.warn('⚠️ Deepgram API key not configured');
      return null;
    }

    try {
      console.log('🎙️ Creating Deepgram live transcription connection...');
      
      // Track audio volume for speech analysis
      let audioLevelBuffer = [];
      
      const connection = this.deepgram.listen.live({
        model: 'nova-2',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        // Don't specify encoding - let Deepgram auto-detect from WebM container
        // The browser sends WebM which contains Opus, but Deepgram needs to unwrap it
        channels: 1,
        endpointing: 3000,  // Wait 3 seconds of silence before finalizing (prevents mid-speech cutoff)
        vad_events: true,  // Voice activity detection
      });

      // Log ALL events for debugging
      const originalOn = connection.on.bind(connection);
      const originalEmit = connection.emit ? connection.emit.bind(connection) : null;
      
      if (originalEmit) {
        connection.emit = function(event, ...args) {
          console.log(`📡 Deepgram emitted event: "${event}"`);
          return originalEmit(event, ...args);
        };
      }
      
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('✅ Deepgram connection opened successfully');
        console.log('   Waiting for audio data...');
        
        // Register Transcript handler INSIDE Open event (as per Deepgram docs)
        connection.on(LiveTranscriptionEvents.Transcript, (data) => {
          console.log('🎯 Deepgram Transcript event received!', JSON.stringify(data).substring(0, 200));
          handleResults(data);
        });
        
        // Keep the connection alive
        if (typeof connection.keepAlive === 'function') {
          console.log('   Starting keepAlive...');
          connection.keepAlive();
        }
      });

      // Handler function for processing transcripts
      const handleResults = (data) => {
        const alternative = data.channel?.alternatives?.[0];
        const transcript = alternative?.transcript || '';
        const isFinal = data.is_final;
        const speechFinal = data.speech_final; // True when speech segment is completely done
        const confidence = alternative?.confidence || 0;
        
        // Only process if there's actual transcript content
        if (!transcript || transcript.trim() === '') {
          return; // Skip empty transcripts
        }
        
        // Extract word-level confidence for more detailed analysis
        const words = alternative?.words || [];
        const avgWordConfidence = words.length > 0 
          ? words.reduce((sum, word) => sum + (word.confidence || 0), 0) / words.length 
          : confidence;

        // Calculate volume/loudness from recent audio levels
        const averageVolume = audioLevelBuffer.length > 0
          ? audioLevelBuffer.reduce((sum, level) => sum + level, 0) / audioLevelBuffer.length
          : 0;

        if (transcript) {
          console.log('📝 Deepgram transcript:', { 
            transcript, 
            isFinal, 
            confidence: confidence.toFixed(3),
            avgWordConfidence: avgWordConfidence.toFixed(3),
            volume: averageVolume.toFixed(2)
          });
          
          onTranscript({ 
            transcript, 
            isFinal,
            confidence,
            avgWordConfidence,
            volume: averageVolume,
            words // Pass through word-level data for detailed analysis
          });
        }

        // Reset volume buffer on final results
        if (isFinal) {
          audioLevelBuffer = [];
        }
      };

      // Error handler
      connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('❌ Deepgram connection error:', error);
        if (onError) onError(error);
      });

      connection.on(LiveTranscriptionEvents.Close, (event) => {
        console.log('🔌 Deepgram connection closed');
        console.log('   Close event data:', JSON.stringify(event));
      });

      connection.on(LiveTranscriptionEvents.Metadata, (data) => {
        console.log('📊 Deepgram metadata');
      });

      connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
        console.log('🎤 Speech detected by Deepgram');
        audioLevelBuffer = [];
      });

      connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        console.log('🔚 Utterance ended');
      });

      console.log('✅ Deepgram connection created');
      
      // Store audio level tracking method
      connection._audioLevelBuffer = audioLevelBuffer;
      connection._addAudioLevel = (level) => {
        audioLevelBuffer.push(level);
        // Keep only last 20 samples (~5 seconds at 250ms chunks)
        if (audioLevelBuffer.length > 20) {
          audioLevelBuffer.shift();
        }
      };
      
      return connection;
    } catch (error) {
      console.error('❌ Failed to create live transcription:', error);
      if (onError) onError(error);
      return null;
    }
  }

  // Calculate audio volume from buffer
  calculateAudioVolume(audioBuffer) {
    try {
      const dataView = new DataView(audioBuffer.buffer || audioBuffer);
      let sum = 0;
      let count = 0;

      // Sample every 100th byte for performance
      for (let i = 0; i < dataView.byteLength - 1; i += 100) {
        const sample = dataView.getInt16(i, true); // 16-bit PCM
        sum += Math.abs(sample);
        count++;
      }

      const average = count > 0 ? sum / count : 0;
      // Normalize to 0-100 range (assuming max 16-bit value)
      return Math.min(100, (average / 32768) * 100);
    } catch (error) {
      // If we can't calculate, return a default
      return 0;
    }
  }
}

module.exports = new STTService();
