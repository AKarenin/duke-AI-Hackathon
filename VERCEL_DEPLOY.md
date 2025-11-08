# Quick Vercel Deployment Guide

## 🚀 Fast Deploy (5 minutes)

### Option 1: Deploy via Vercel Dashboard (Easiest)

1. **Push to GitHub** (if not already)
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push
   ```

2. **Import to Vercel**
   - Go to https://vercel.com/new
   - Click "Import Project"
   - Select your GitHub repository
   - Vercel will auto-detect the configuration

3. **Add Environment Variables**
   
   In Vercel Dashboard → Settings → Environment Variables, add:
   
   ```
   OPENAI_API_KEY=your_openai_key_here
   DEEPGRAM_API_KEY=your_deepgram_key_here
   ELEVENLABS_API_KEY=your_elevenlabs_key_here
   ```

4. **Deploy!**
   - Click "Deploy"
   - Wait for build to complete
   - Your app is live! 🎉

5. **Update Frontend URLs**
   
   After deployment, go back to Environment Variables and add:
   ```
   REACT_APP_BACKEND_URL=https://your-app-name.vercel.app/api
   REACT_APP_WS_URL=wss://your-app-name.vercel.app
   ```
   
   Then trigger a redeploy.

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   
   Follow the prompts, then:
   
   ```bash
   vercel --prod
   ```

4. **Add Environment Variables**
   ```bash
   vercel env add OPENAI_API_KEY
   vercel env add DEEPGRAM_API_KEY
   vercel env add ELEVENLABS_API_KEY
   vercel env add REACT_APP_BACKEND_URL
   vercel env add REACT_APP_WS_URL
   ```

## ⚠️ Important Notes

### WebSocket Limitations on Vercel

Vercel Serverless Functions have limitations with persistent WebSocket connections. For production, consider:

1. **Deploy Backend Separately** (Recommended)
   
   Backend on Render.com or Railway.app:
   - Better WebSocket support
   - Always-on server
   - Free tier available
   
   Steps:
   - Deploy backend to Render/Railway
   - Update `REACT_APP_BACKEND_URL` and `REACT_APP_WS_URL` to point to your backend
   - Deploy frontend to Vercel

2. **Or use Vercel with Polling Fallback**
   - Implement long-polling as fallback
   - Less ideal for real-time communication

## 🔧 Configuration Files

The following files are configured for Vercel deployment:

- ✅ `vercel.json` - Vercel configuration
- ✅ `.vercelignore` - Files to ignore
- ✅ `frontend/.env.production.example` - Production environment template
- ✅ Logo component - Appears on all pages

## 📝 Checklist Before Deploy

- [ ] API keys ready (OpenAI, Deepgram, ElevenLabs)
- [ ] Code pushed to GitHub
- [ ] Logo.png in `frontend/public/assets/`
- [ ] Environment variables configured
- [ ] Tested locally with `npm run build`

## 🐛 Troubleshooting

**Build fails:**
- Check that all dependencies are in package.json
- Ensure logo.png exists in correct path
- Check Node.js version compatibility

**WebSocket not connecting:**
- Verify `REACT_APP_WS_URL` is correct
- Check backend logs
- Consider deploying backend separately

**Logo not showing:**
- Verify path: `/assets/logo.png`
- Check browser console for 404 errors
- Ensure logo is in `frontend/public/assets/`

## 🎯 Production Checklist

After deployment:
- [ ] Test all pages (Landing, Conversation, Feedback, Line-by-line)
- [ ] Verify logo appears on all pages (top right)
- [ ] Test microphone permissions
- [ ] Test AI conversation flow
- [ ] Check feedback generation
- [ ] Verify all API keys are working

