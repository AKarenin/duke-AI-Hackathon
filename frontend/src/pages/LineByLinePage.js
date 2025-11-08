import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import './LineByLinePage.css';

function LineByLinePage() {
  const location = useLocation();
  const sessionData = location.state?.sessionData || {
    transcript: []
  };

  return (
    <div className="line-by-line-page">
      <Link to="/" className="home-button">🏠 Home</Link>

      <div className="line-by-line-content">
        <h1 className="page-title">Conversation Transcript & Feedback</h1>

        <div className="transcript-container">
          {sessionData.transcript.map((entry, index) => (
            <div key={index} className={`transcript-entry ${entry.speaker}`}>
              <div className="message-header">
                <span className="speaker-label">
                  {entry.speaker === 'user' ? 'You' : 'AI Agent'}
                </span>
                {entry.timestamp && (
                  <span className="timestamp">{entry.timestamp}</span>
                )}
              </div>
              <div className="message-text">{entry.text}</div>
              {entry.speaker === 'user' && entry.feedback && (
                <div className="feedback-annotation">
                  <span className="feedback-icon">💡</span>
                  <span className="feedback-text">{entry.feedback}</span>
                </div>
              )}
            </div>
          ))}

          {sessionData.transcript.length === 0 && (
            <div className="empty-transcript">
              <p>No conversation data available.</p>
            </div>
          )}
        </div>

        <div className="bottom-controls">
          <Link to="/" className="back-home-button">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default LineByLinePage;
