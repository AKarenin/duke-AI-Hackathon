import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ConversationPage from './pages/ConversationPage';
import FeedbackPage from './pages/FeedbackPage';
import LineByLinePage from './pages/LineByLinePage';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/conversation/:scenario" element={<ConversationPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/line-by-line" element={<LineByLinePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
