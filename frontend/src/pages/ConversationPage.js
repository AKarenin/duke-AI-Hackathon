import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import io from 'socket.io-client';
import './ConversationPage.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
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
  const [streamingReady, setStreamingReady] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
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
      // Don't set streamingReady yet if HeyGen is available - let ICE connection state control it
      if (!ready) {
        setStreamingReady(false);  // No HeyGen, use placeholder
        setStatus('Session started - listening...');
      } else {
        // HeyGen available, but keep placeholder visible until ICE connects
        setStreamingReady(false);  // Will be set to true when ICE state becomes 'connected'
        setStatus('🎬 Connecting to video avatar...');
      }
      console.log('✅ Session started:', newSessionId, 'HeyGen available:', ready);
    });

    socketRef.current.on('heygen-ready', async ({ sessionId: heygenSessionId, sdp, iceServers }) => {
      console.log('🎬 HeyGen ready, setting up WebRTC...');
      console.log('   Using sessionId from backend:', heygenSessionId);
      console.log('   Received ICE servers:', iceServers ? iceServers.length : 0);
      console.log('   ICE servers:', JSON.stringify(iceServers).substring(0, 200));
      await setupHeyGenWebRTC(sdp, iceServers, heygenSessionId);
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

  const setupHeyGenWebRTC = async (sdp, iceServers, heygenSessionId) => {
    try {
      console.log('🎬 Setting up HeyGen WebRTC connection...');
      console.log('   SessionId:', heygenSessionId);
      
      // Use HeyGen ICE servers + add Google's public STUN/TURN as fallback
      const fallbackICEServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ];
      
      const allICEServers = iceServers && iceServers.length > 0 
        ? [...iceServers, ...fallbackICEServers]
        : fallbackICEServers;
      
      console.log('   Using ICE servers:', allICEServers.length, 'servers');
      
      const peerConnection = new RTCPeerConnection({
        iceServers: allICEServers,
        iceTransportPolicy: 'all'  // Try all methods
      });

      peerConnectionRef.current = peerConnection;

      peerConnection.ontrack = (event) => {
        console.log('✅ Received video track from HeyGen!');
        if (event.streams && event.streams[0] && videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(err => console.error('Error playing video:', err));
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 ICE candidate:', event.candidate.type, event.candidate.candidate.substring(0, 50));
          
          // Send ICE candidates to backend to relay to HeyGen
          socketRef.current.emit('heygen-ice-candidate', {
            sessionId: heygenSessionId,
            candidate: event.candidate
          });
        } else {
          console.log('🧊 ICE gathering complete');
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        console.log('ICE gathering state:', peerConnection.iceGatheringState);
        
        // Only show video when ACTUALLY connected or completed
        if (peerConnection.iceConnectionState === 'connected' || 
            peerConnection.iceConnectionState === 'completed') {
          console.log('✅ HeyGen fully connected - showing video!');
          setStreamingReady(true);  // NOW show video, hide loading
        } else if (peerConnection.iceConnectionState === 'disconnected' || 
                   peerConnection.iceConnectionState === 'failed') {
          console.error('❌ HeyGen connection failed!');
          console.log('   Signaling state:', peerConnection.signalingState);
          setStreamingReady(false);  // Show loading state
        } else if (peerConnection.iceConnectionState === 'checking') {
          console.log('⏳ HeyGen connecting... (loading visible)');
          setStreamingReady(false);  // Keep loading until connected
        }
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
      console.log('   Sending answer with sessionId:', heygenSessionId);
      
      // Send answer back to backend with correct sessionId
      socketRef.current.emit('heygen-answer', {
        sessionId: heygenSessionId,  // Use the sessionId from backend
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

  // Debug logging
  console.log('🎨 Render state:', { 
    isActive, 
    streamingReady, 
    avatarState, 
    scenario,
    isEnding,
    scenarioExists: !!scenarioDetails[scenario],
    shouldShowPlaceholder: !streamingReady || !isActive || isEnding,
    avatarColor: scenarioDetails[scenario]?.avatarColor
  });

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
        
        {/* Loading state while HeyGen connects - NO PLACEHOLDER */}
        {!streamingReady && isActive && !isEnding && (
          <div className="avatar-loading">
            <div className="loading-spinner"></div>
            <div className="loading-text">Connecting to {scenarioDetails[scenario]?.avatarName}...</div>
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
        
        {/* Avatar state indicator */}
        {isActive && streamingReady && (
          <div className={`avatar-indicator ${avatarState}`}>
            🎬 {avatarState === 'talking' ? 'AI Speaking...' : 'Listening...'}
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
