import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import io from 'socket.io-client';
import './ConversationPage.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';

const scenarioDetails = {
  introduction: {
    title: 'Introducing yourself to a new person',
    avatarName: 'Alex',
    avatarEmoji: '👤',
    avatarColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    description: 'Professional networking scenario'
  },
  'coffee-spill': {
    title: 'Spilling coffee on a stranger in a cafe',
    avatarName: 'Alex',
    avatarEmoji: '☕',
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
  const [streamingReady, setStreamingReady] = useState(false);
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);

  useEffect(() => {
    // Initialize WebSocket connection
    socketRef.current = io(WS_URL);

    socketRef.current.on('connect', () => {
      console.log('Connected to server');
    });

    socketRef.current.on('session-started', ({ sessionId: newSessionId, scenario: scenarioName, streamingReady: ready }) => {
      setSessionId(newSessionId);
      setStreamingReady(ready);
      console.log('✅ Session started:', newSessionId, 'Streaming ready:', ready);
      setStatus(ready ? '🎬 Live streaming ready!' : 'Session started - listening...');
    });

    socketRef.current.on('heygen-ready', async ({ sdp, iceServers }) => {
      console.log('🎬 HeyGen ready, setting up WebRTC...');
      await setupHeyGenWebRTC(sdp, iceServers);
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

    // Handle streaming audio chunks (real-time)
    socketRef.current.on('ai-audio-chunk', ({ audio }) => {
      if (audio && audio.length > 0) {
        console.log('🔊 Received audio chunk:', audio.length, 'bytes');
        playAudioChunk(audio);
      }
    });

    // Handle complete audio (fallback)
    socketRef.current.on('ai-audio', ({ audio }) => {
      // Play ElevenLabs audio
      console.log('🔊 Received complete audio from backend');
      console.log('Audio data type:', typeof audio);
      console.log('Audio data length:', audio ? audio.length : 0);
      
      if (audio && audio.length > 0 && audioRef.current) {
        try {
          // Convert array back to buffer
          const audioBuffer = new Uint8Array(audio);
          console.log('Audio buffer created, size:', audioBuffer.length);
          
          const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
          console.log('Audio blob created, size:', blob.size);
          
          const audioUrl = URL.createObjectURL(blob);
          console.log('Audio URL created:', audioUrl);
          
          audioRef.current.src = audioUrl;
          audioRef.current.volume = 1.0; // Ensure volume is at max
          
          audioRef.current.play().then(() => {
            console.log('✅ Audio playback started successfully!');
          }).catch(err => {
            console.error('❌ Error playing audio:', err);
            console.error('Audio element state:', {
              readyState: audioRef.current.readyState,
              networkState: audioRef.current.networkState,
              error: audioRef.current.error
            });
          });
        } catch (err) {
          console.error('❌ Error creating audio blob:', err);
        }
      } else {
        console.warn('⚠️ No audio data received or audio element not ready');
        console.log('audioRef.current:', audioRef.current);
        console.log('audio exists:', !!audio);
        console.log('audio length:', audio ? audio.length : 0);
      }
    });

    socketRef.current.on('conversation-ended', ({ sessionData }) => {
      console.log('Conversation ended:', sessionData);
      // Navigate to feedback page with session data
      navigate('/feedback', { state: { sessionData } });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
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

  const setupHeyGenWebRTC = async (sdp, iceServers) => {
    try {
      console.log('🎬 Setting up HeyGen WebRTC connection...');
      
      const peerConnection = new RTCPeerConnection({
        iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      peerConnectionRef.current = peerConnection;

      peerConnection.ontrack = (event) => {
        console.log('✅ Received video track from HeyGen!');
        if (event.streams && event.streams[0] && videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(err => console.error('Error playing video:', err));
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
      };

      // Set remote description
      await peerConnection.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp: sdp
      }));

      // Create answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      console.log('✅ HeyGen WebRTC connection established');
      
      // Send answer back to backend
      socketRef.current.emit('heygen-answer', {
        sessionId,
        sdp: answer.sdp
      });

    } catch (error) {
      console.error('❌ Error setting up HeyGen WebRTC:', error);
    }
  };

  const playAudioChunk = async (audioArray) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const audioBuffer = new Uint8Array(audioArray);
      const audioData = await audioContextRef.current.decodeAudioData(audioBuffer.buffer);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioData;
      source.connect(audioContextRef.current.destination);
      source.start();

      audioSourceRef.current = source;
    } catch (error) {
      console.error('❌ Error playing audio chunk:', error);
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

  return (
    <div className="conversation-page">
      <Link to="/" className="home-button">🏠 Home</Link>

      <div className="video-container">
        {/* HeyGen Video Stream (WebRTC) */}
        <video
          ref={videoRef}
          className="heygen-video"
          autoPlay
          playsInline
          style={{ display: streamingReady && isActive ? 'block' : 'none' }}
        />
        
        {/* Fallback Avatar (shown when not streaming) */}
        {(!streamingReady || !isActive) && (
          <div 
            className={`avatar-placeholder ${avatarState}`}
            style={{ background: scenarioDetails[scenario]?.avatarColor }}
          >
            <div className="avatar-circle">
              <div className="avatar-emoji">
                {isActive 
                  ? (avatarState === 'talking' ? '🗣️' : scenarioDetails[scenario]?.avatarEmoji || '🙂')
                  : scenarioDetails[scenario]?.avatarEmoji || '🙂'
                }
              </div>
            </div>
            {isActive && (
              <div className="avatar-name">
                {scenarioDetails[scenario]?.avatarName || 'Alex'}
              </div>
            )}
          </div>
        )}
        
        {/* Avatar state indicator */}
        {isActive && (
          <div className={`avatar-indicator ${avatarState}`}>
            {streamingReady && '🎬 '}{avatarState === 'talking' ? '🗣️ AI Speaking...' : '👂 Listening...'}
          </div>
        )}
        
        {!isActive && (
          <div className="video-overlay">
            <h2>{scenarioDetails[scenario]?.title}</h2>
            <p className="scenario-subtitle">Talk to {scenarioDetails[scenario]?.avatarName}</p>
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
