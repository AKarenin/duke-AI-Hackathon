# SocialGym Setup Guide

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- API keys for:
  - OpenAI (for GPT-4 LLM)
  - ElevenLabs (for Text-to-Speech)
  - HeyGen (for Avatar videos)
  - Deepgram (for Speech-to-Text)

## Installation Steps

### 1. Clone the repository and install dependencies

```bash
# Install root dependencies
npm install

# Install all workspace dependencies
npm run install:all
```

### 2. Configure environment variables

#### Backend (.env)

Create a file at `backend/.env`:

```env
PORT=3001
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
HEYGEN_API_KEY=...
DEEPGRAM_API_KEY=...
```

#### Frontend (.env)

Create a file at `frontend/.env`:

```env
REACT_APP_BACKEND_URL=http://localhost:3001
REACT_APP_WS_URL=ws://localhost:3001
```

### 3. Add avatar video assets

Place your HeyGen avatar videos in `frontend/public/assets/`:

- `introduction-idle.mp4` - Idle state for introduction scenario
- `introduction-talking.mp4` - Talking state for introduction scenario
- `coffee-spill-idle.mp4` - Idle state for coffee spill scenario
- `coffee-spill-talking.mp4` - Talking state for coffee spill scenario

**Note:** For the hackathon, you can use placeholder videos or skip this step if HeyGen integration is not fully configured. The app will still work without the avatar videos.

### 4. Run the application

```bash
# Development mode (runs both frontend and backend)
npm run dev
```

Or run separately:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm start
```

### 5. Access the application

Open your browser and navigate to:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## API Configuration Notes

### OpenAI API
- Used for conversational AI and feedback generation
- Model: `gpt-4-turbo-preview` (you can change to `gpt-3.5-turbo` for cost savings)
- Required scopes: Chat completions

### Deepgram
- Used for real-time speech-to-text
- Model: `nova-2`
- Alternative: You can implement Whisper API if preferred

### ElevenLabs
- Used for text-to-speech
- Default voice: Sarah (`EXAVITQu4vr4xnSDxMaL`)
- You can change the voice ID in `backend/src/services/ttsService.js`

### HeyGen
- Used for avatar video generation
- For the hackathon: Pre-recorded videos can be used instead of real-time generation
- Avatar IDs can be configured in `backend/src/services/heygenService.js`

## Troubleshooting

### Port already in use
If port 3000 or 3001 is already in use, you can change them:
- Backend: Edit `PORT` in `backend/.env`
- Frontend: Set `PORT` environment variable before starting (e.g., `PORT=3002 npm start`)

### Microphone access denied
Make sure you're accessing the app via `localhost` (not `127.0.0.1`) and grant microphone permissions when prompted.

### WebSocket connection issues
- Ensure both frontend and backend are running
- Check that `REACT_APP_WS_URL` matches your backend WebSocket URL
- Check browser console for CORS errors

### API key errors
- Verify all API keys are correctly set in `backend/.env`
- Check that API keys have the necessary permissions
- Some APIs may have rate limits - check your usage

## Development Tips

### Testing without API keys
The application has fallback behavior for missing API keys:
- STT: Will log warnings but won't crash
- LLM: Will return default responses
- TTS: Will skip audio generation
- Feedback: Will return default scores

### Customizing scenarios
Edit the scenarios in:
- Frontend: `frontend/src/pages/LandingPage.js`
- Backend prompts: `backend/src/services/llmService.js`

### Adjusting feedback criteria
Modify the feedback analysis in:
- `backend/src/services/feedbackService.js`

## Production Deployment

For production deployment:

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Serve the frontend build from the backend or use a CDN

3. Set production environment variables

4. Use a process manager like PM2 for the backend:
```bash
npm install -g pm2
cd backend
pm2 start src/server.js --name socialgym
```

## License

MIT License - See LICENSE file for details
