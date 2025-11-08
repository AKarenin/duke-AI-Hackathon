import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import io from 'socket.io-client';
import './ConversationPage.css';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';

const scenarioDetails = {
  introduction: {
    title: 'Introducing yourself to a new person',
    avatarName: 'Alessandra',
    avatarEmoji: '👩‍💼',  // Professional woman
    avatarColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    description: 'Professional networking scenario'
  },
  'coffee-spill': {
    title: 'Spilling coffee on a stranger in a cafe',
    avatarName: 'Pedro',
    avatarEmoji: '👨',  // Casual man
    avatarColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    description: 'Handle an awkward social situation'
  }
};

function ConversationPage() {
  const { scenario } = useParams();
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [avatarState, setAvatarState] = useState('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isEnding, setIsEnding] = useState(false);
  const [avatarImage, setAvatarImage] = useState(null);
  const [avatarImageState, setAvatarImageState] = useState('normal');
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  useEffect(() => {
    // Initialize WebSocket connection
    socketRef.current = io(WS_URL);

    socketRef.current.on('connect', () => {
      console.log('Connected to server');
    });

    socketRef.current.on('session-started', ({ sessionId: newSessionId, avatarImage: imagePath, avatarState: imageState }) => {
      console.log('📥 Received session-started event:', { newSessionId, imagePath, imageState });
      setSessionId(newSessionId);
      setAvatarImage(imagePath);
      setAvatarImageState(imageState || 'normal');
      setStatus('Session started - listening...');
      console.log('✅ Session started:', newSessionId, 'Avatar image:', imagePath);
      console.log('🖼️ Avatar image state set to:', imagePath);
    });

    socketRef.current.on('avatar-image-changed', ({ imagePath, state }) => {
      console.log('🖼️ Avatar image changed:', state, '→', imagePath);
      setAvatarImage(imagePath);
      setAvatarImageState(state);
    });

    socketRef.current.on('avatar-state', ({ state }) => {
      // Handle avatar state changes (idle/talking)
      setAvatarState(state);
      console.log('Avatar state:', state);
    });

    socketRef.current.on('interim-transcript', ({ text }) => {
      // Show interim transcription (what user is saying as they speak)
      setInterimTranscript(text);
      console.log('💬 Interim:', text);
    });

    socketRef.current.on('user-spoke', ({ text }) => {
      // Final transcription
      setInterimTranscript('');
      setStatus(`You: ${text}`);
      console.log('✅ You said:', text);
    });

    socketRef.current.on('ai-speaking', ({ text }) => {
      setInterimTranscript('');
      setStatus(`AI: ${text}`);
      console.log('🤖 AI said:', text);
    });

    // Handle complete audio
    socketRef.current.on('ai-audio', ({ audio }) => {
      // Play ElevenLabs audio
      console.log('🔊 Received complete audio from backend');
      console.log('Audio data type:', typeof audio);
      console.log('Audio data length:', audio ? audio.length : 0);
      console.log('Audio ref exists:', !!audioRef.current);
      
      if (!audio || audio.length === 0) {
        console.error('❌ No audio data in payload!');
        return;
      }

      if (!audioRef.current) {
        console.error('❌ Audio element reference is null!');
        return;
      }
      
      try {
        // Convert array back to buffer
        const audioBuffer = new Uint8Array(audio);
        console.log('✅ Audio buffer created, size:', audioBuffer.length);
        
        const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        console.log('✅ Audio blob created, size:', blob.size);
        
        const audioUrl = URL.createObjectURL(blob);
        console.log('✅ Audio URL created:', audioUrl);
        
        // Reset audio element before loading new audio
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = audioUrl;
        audioRef.current.volume = 1.0;
        audioRef.current.load(); // Explicitly load the audio
        
        console.log('🎵 Attempting to play audio...');
        audioRef.current.play()
          .then(() => {
            console.log('✅✅✅ Audio playback started successfully!');
          })
          .catch(err => {
            console.error('❌❌❌ AUDIO PLAYBACK FAILED:', err);
            console.error('Error name:', err.name);
            console.error('Error message:', err.message);
            console.error('Audio element state:', {
              readyState: audioRef.current.readyState,
              networkState: audioRef.current.networkState,
              paused: audioRef.current.paused,
              src: audioRef.current.src.substring(0, 50),
              error: audioRef.current.error
            });
            
            // Try interaction-based fallback
            console.log('⚠️ Trying fallback playback method...');
            document.addEventListener('click', function playOnClick() {
              audioRef.current.play()
                .then(() => console.log('✅ Fallback playback succeeded!'))
                .catch(e => console.error('❌ Fallback also failed:', e));
              document.removeEventListener('click', playOnClick);
            }, { once: true });
          });
      } catch (err) {
        console.error('❌ Error in audio processing:', err);
        console.error('Stack trace:', err.stack);
      }
    });

    socketRef.current.on('conversation-ended', ({ sessionData }) => {
      console.log('Conversation ended:', sessionData);
      setIsEnding(true);
      setStatus('📊 Generating your feedback...');
      
      // Stop recording
      stopRecording();
      
      // Wait a moment before navigating to avoid black screen flash
      setTimeout(() => {
        console.log('Navigating to feedback page...');
        navigate('/feedback', { state: { sessionData } });
      }, 500);
    });

    return () => {
      // Cleanup socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      // Stop recording
      stopRecording();
    };
  }, [navigate]);

  const startRecording = async () => {
    try {
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ Microphone access granted');
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          // Convert Blob to ArrayBuffer for Socket.IO
          const arrayBuffer = await event.data.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          console.log('🎤 Sending audio chunk:', uint8Array.length, 'bytes');
          
          // Send audio chunk to server for STT processing
          socketRef.current.emit('audio-chunk', Array.from(uint8Array));
        }
      };

      mediaRecorderRef.current.onstart = () => {
        console.log('✅ Recording started');
      };

      mediaRecorderRef.current.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error);
      };

      mediaRecorderRef.current.start(250); // Send chunks every 250ms
      setStatus('🎤 Listening...');
      console.log('🎤 MediaRecorder started');
    } catch (error) {
      console.error('❌ Error accessing microphone:', error);
      setStatus('⚠️ Microphone access denied');
      alert('Please allow microphone access to use this feature!');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleStartConversation = () => {
    setIsActive(true);
    setStatus('Starting conversation...');
    // Emit session start event
    socketRef.current.emit('start-session', { scenario });
    startRecording();
  };

  const handleStopConversation = () => {
    setIsActive(false);
    stopRecording();
    setStatus('Ending conversation...');
    
    // Emit session end event
    socketRef.current.emit('end-session', { sessionId });
  };

  // Debug render state
  console.log('🎨 Render state:', { isActive, avatarImage, avatarImageState, avatarState });

  return (
    <div className="conversation-page">
      <Link to="/" className="home-button">🏠 Home</Link>

      <div className="video-container">
        {/* Avatar Image */}
        {isActive && avatarImage && (
          <div className="avatar-image-wrapper">
            <img
              src={avatarImage}
              alt={`${scenarioDetails[scenario]?.avatarName} - ${avatarImageState}`}
              className={`avatar-image ${avatarState} ${avatarImageState}`}
              onLoad={() => console.log('✅ Image loaded successfully:', avatarImage)}
              onError={(e) => console.error('❌ Image failed to load:', avatarImage, e)}
            />
            <div className={`avatar-indicator ${avatarState}`}>
              {avatarState === 'talking' ? '🗣️ AI Speaking...' : '👂 Listening...'}
            </div>
          </div>
        )}
        
        {/* Debug info */}
        {isActive && !avatarImage && (
          <div style={{ color: 'white', padding: '20px' }}>
            ⚠️ No avatar image received yet. Check console for logs.
          </div>
        )}
        
        {/* Pre-start overlay */}
        {!isActive && !isEnding && (
          <div className="avatar-placeholder" style={{ background: scenarioDetails[scenario]?.avatarColor || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <div className="video-overlay">
              <h2>{scenarioDetails[scenario]?.title}</h2>
              <p className="scenario-subtitle">Talk to {scenarioDetails[scenario]?.avatarName}</p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden audio element for ElevenLabs TTS */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      <div className="controls-container">
        {interimTranscript && (
          <div className="interim-transcript">
            💬 {interimTranscript}
          </div>
        )}
        <div className="status-text">{status}</div>

        {!isActive ? (
          <button
            className="control-button start-button"
            onClick={handleStartConversation}
          >
            Start Conversation
          </button>
        ) : (
          <button
            className="control-button stop-button"
            onClick={handleStopConversation}
          >
            Stop Conversation
          </button>
        )}
      </div>
    </div>
  );
}

export default ConversationPage;
