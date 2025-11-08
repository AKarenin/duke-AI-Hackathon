# Deployment Guide for BanterBox

## Prerequisites
- Vercel account (https://vercel.com)
- API Keys for:
  - OpenAI API
  - Deepgram API
  - ElevenLabs API

## Vercel Deployment Steps

### 1. Install Vercel CLI (Optional but recommended)
```bash
npm install -g vercel
```

### 2. Deploy from CLI

From the root directory:

```bash
# Login to Vercel
vercel login

# Deploy (first time)
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Your username/team
# - Link to existing project? No
# - Project name? banterbox (or your choice)
# - Directory? ./
# - Override settings? No
```

### 3. Configure Environment Variables

After deployment, add your environment variables in the Vercel dashboard:

1. Go to your project in Vercel dashboard
2. Navigate to Settings → Environment Variables
3. Add the following variables:

**For Backend:**
- `OPENAI_API_KEY` - Your OpenAI API key
- `DEEPGRAM_API_KEY` - Your Deepgram API key
- `ELEVENLABS_API_KEY` - Your ElevenLabs API key

**For Frontend:**
- `REACT_APP_BACKEND_URL` - Your Vercel backend URL (e.g., https://your-app.vercel.app/api)
- `REACT_APP_WS_URL` - Your Vercel WebSocket URL (e.g., wss://your-app.vercel.app)

### 4. Update Frontend Environment

After getting your Vercel URL, update `frontend/.env.production`:

```
REACT_APP_BACKEND_URL=https://your-actual-app.vercel.app/api
REACT_APP_WS_URL=wss://your-actual-app.vercel.app
```

### 5. Redeploy

```bash
vercel --prod
```

## Alternative: Deploy via GitHub

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/banterbox.git
git push -u origin main
```

### 2. Import to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Vercel will auto-detect the configuration
4. Add environment variables (see step 3 above)
5. Click Deploy

## Post-Deployment

### Update Backend URL
After deployment, update the `REACT_APP_BACKEND_URL` and `REACT_APP_WS_URL` in Vercel's environment variables with your actual deployment URL.

### Test the Application
1. Visit your Vercel URL
2. Test the conversation scenarios
3. Check browser console for any errors
4. Verify WebSocket connections are working

## Troubleshooting

### WebSocket Issues
- Vercel has limitations with WebSockets
- Consider using Vercel Serverless Functions with polling as a fallback
- Or deploy backend separately to Render/Railway/Heroku

### Backend Deployment Alternative
For better WebSocket support, consider deploying backend separately:

**Render.com:**
1. Create new Web Service
2. Connect your GitHub repo
3. Set build command: `cd backend && npm install`
4. Set start command: `cd backend && npm start`
5. Add environment variables

**Railway.app:**
1. New Project → Deploy from GitHub
2. Select backend directory
3. Add environment variables
4. Deploy

Then update frontend env variables to point to your backend URL.

## Production Build Locally

To test production build locally:

```bash
# Build frontend
cd frontend
npm run build

# Serve it locally
npx serve -s build

# In another terminal, run backend
cd ../backend
npm start
```

## Environment Variables Summary

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `OPENAI_API_KEY` | Backend | Yes | OpenAI API key for GPT |
| `DEEPGRAM_API_KEY` | Backend | Yes | Deepgram API key for STT |
| `ELEVENLABS_API_KEY` | Backend | Yes | ElevenLabs API key for TTS |
| `REACT_APP_BACKEND_URL` | Frontend | Yes | Backend API URL |
| `REACT_APP_WS_URL` | Frontend | Yes | WebSocket URL |

## Notes

- The logo.png is automatically included in the build
- All pages will show the logo in the top right corner
- Make sure to update the frontend environment variables after getting your Vercel URL
- WebSocket connections may require additional configuration on Vercel

