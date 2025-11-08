import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import './FeedbackPage.css';

function FeedbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const sessionData = location.state?.sessionData || {
    overallScore: 0,
    categories: {
      confidence: 0,
      tact: 0,
      friendliness: 0,
      respect: 0,
      attentiveness: 0,
      empathy: 0
    },
    transcript: []
  };

  const radarData = [
    { category: 'Confidence', score: sessionData.categories.confidence },
    { category: 'Tact', score: sessionData.categories.tact },
    { category: 'Friendliness', score: sessionData.categories.friendliness },
    { category: 'Respect', score: sessionData.categories.respect },
    { category: 'Attentiveness', score: sessionData.categories.attentiveness },
    { category: 'Empathy', score: sessionData.categories.empathy }
  ];

  const handleLineByLineClick = () => {
    navigate('/line-by-line', { state: { sessionData } });
  };

  return (
    <div className="feedback-page">
      <Link to="/" className="home-button">🏠 Home</Link>

      <div className="feedback-content">
        <h1 className="overall-score">
          Conversation Score: <span className="score-value">{sessionData.overallScore}</span>
        </h1>

        <div className="radar-container">
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255, 255, 255, 0.3)" />
              <PolarAngleAxis
                dataKey="category"
                tick={{ fill: 'white', fontSize: 14, fontWeight: 600 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 6]}
                tick={{ fill: 'white', fontSize: 12 }}
              />
              <Radar
                name="Your Scores"
                dataKey="score"
                stroke="#38ef7d"
                fill="#38ef7d"
                fillOpacity={0.6}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <button
          className="line-by-line-button"
          onClick={handleLineByLineClick}
        >
          Line-by-line feedback
        </button>
      </div>
    </div>
  );
}

export default FeedbackPage;
