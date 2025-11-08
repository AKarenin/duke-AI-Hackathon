import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import io from 'socket.io-client';
import './ConversationPage.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';

const scenarioDetails = {
  introduction: {
    title: 'Introducing yourself to a new person',
    avatarUrl: 'introduction-avatar'
  },
  'coffee-spill': {
    title: 'Spilling coffee on a stranger in a cafe',
    avatarUrl: 'coffee-spill-avatar'
  }
};

function ConversationPage() {
  const { scenario } = useParams();
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const videoRef = useRef(null);

  useEffect(() => {
    // Initialize WebSocket connection
    socketRef.current = io(WS_URL);

    socketRef.current.on('connect', () => {
      console.log('Connected to server');
    });

    socketRef.current.on('session-started', ({ sessionId: newSessionId }) => {
      setSessionId(newSessionId);
      console.log('Session started:', newSessionId);
    });

    socketRef.current.on('avatar-video', ({ videoUrl }) => {
      // Handle HeyGen avatar video
      if (videoRef.current) {
        videoRef.current.src = videoUrl;
      }
    });

    socketRef.current.on('ai-speaking', ({ text }) => {
      setStatus(`AI: ${text}`);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          // Send audio chunk to server for STT processing
          socketRef.current.emit('audio-chunk', event.data);
        }
      };

      mediaRecorderRef.current.start(100); // Send chunks every 100ms for streaming
      setStatus('Listening...');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setStatus('Microphone access denied');
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
    // Emit session start event
    socketRef.current.emit('start-session', { scenario });
    startRecording();
  };

  const handleStopConversation = () => {
    setIsActive(false);
    stopRecording();
    // Emit session end event
    socketRef.current.emit('end-session', { sessionId });
  };

  return (
    <div className="conversation-page">
      <Link to="/" className="home-button">🏠 Home</Link>

      <div className="video-container">
        <video
          ref={videoRef}
          className="avatar-video"
          autoPlay
          loop
          muted
          playsInline
        >
          <source src="/assets/avatar-idle.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {!isActive && (
          <div className="video-overlay">
            <h2>{scenarioDetails[scenario]?.title}</h2>
          </div>
        )}
      </div>

      <div className="controls-container">
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
