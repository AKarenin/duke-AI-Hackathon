import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

const scenarios = [
  {
    id: 'introduction',
    title: 'Introducing yourself to a new person',
    description: 'Practice making a great first impression',
    icon: '👋'
  },
  {
    id: 'coffee-spill',
    title: 'Spilling coffee on a stranger in a cafe',
    description: 'Navigate an awkward social situation with grace',
    icon: '☕'
  }
];

function LandingPage() {
  const navigate = useNavigate();

  const handleScenarioClick = (scenarioId) => {
    navigate(`/conversation/${scenarioId}`);
  };

  return (
    <div className="landing-page">
      <div className="landing-content">
        <h1 className="landing-title">BanterBox</h1>
        <p className="landing-subtitle">Train Your Conversation Skills</p>

        <div className="scenarios-grid">
          {scenarios.map((scenario) => (
            <div
              key={scenario.id}
              className="scenario-card"
              onClick={() => handleScenarioClick(scenario.id)}
            >
              <div className="scenario-icon">{scenario.icon}</div>
              <h3 className="scenario-title">{scenario.title}</h3>
              <p className="scenario-description">{scenario.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
