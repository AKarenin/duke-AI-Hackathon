# SocialGym: Train Conversation Skills

AI-powered conversation skills training platform with real-time voice interaction and feedback.

## Features

- Real-time voice conversations with AI agents
- Multiple conversation scenarios
- Comprehensive feedback with scoring (0-100)
- Detailed analysis across 6 categories: Confidence, Tact, Friendliness, Respect, Attentiveness, Empathy
- Message-by-message feedback
- HeyGen avatar integration
- Modern, sleek UI

## Tech Stack

- **Frontend**: React SPA
- **Backend**: Node.js/Express with WebSocket
- **STT**: Deepgram/Whisper
- **LLM**: OpenAI GPT (Realtime API)
- **TTS**: ElevenLabs
- **Avatar**: HeyGen

## Setup

1. Install dependencies:
```bash
npm run install:all
```

2. Create `.env` files in both `frontend` and `backend` directories with necessary API keys:

**backend/.env**:
```
PORT=3001
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key
HEYGEN_API_KEY=your_heygen_key
DEEPGRAM_API_KEY=your_deepgram_key
```

**frontend/.env**:
```
REACT_APP_BACKEND_URL=http://localhost:3001
REACT_APP_WS_URL=ws://localhost:3001
```

3. Run the application:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000` and the backend at `http://localhost:3001`.

## Usage

1. Select a conversation scenario from the landing page
2. Click "Start Conversation" to begin
3. Speak naturally with the AI agent
4. The conversation ends naturally or when you click "Stop Conversation"
5. Review your overall score and radar chart
6. View line-by-line feedback on your conversation

## Development

- Frontend development server: `npm run dev:frontend`
- Backend development server: `npm run dev:backend`
- Build for production: `npm run build`
