const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const sessionManager = require('./services/sessionManager');
const conversationHandler = require('./handlers/conversationHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'SocialGym backend is running' });
});

// Debug endpoint
app.get('/debug', (req, res) => {
  res.json({
    deepgramKey: !!process.env.DEEPGRAM_API_KEY,
    openaiKey: !!process.env.OPENAI_API_KEY,
    elevenlabsKey: !!process.env.ELEVENLABS_API_KEY,
    heygenKey: !!process.env.HEYGEN_API_KEY
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  conversationHandler(socket, io);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Clean up any sessions associated with this socket
    sessionManager.cleanupSocket(socket.id);
  });
});

const PORT = process.env.PORT || 3001;

// Cleanup any orphaned HeyGen sessions on startup
async function cleanupHeyGenSessions() {
  const heygenService = require('./services/heygenService');
  try {
    const axios = require('axios');
    const apiKey = process.env.HEYGEN_API_KEY;
    
    if (!apiKey) return;
    
    const response = await axios.get('https://api.heygen.com/v1/streaming.list', {
      headers: { 'X-Api-Key': apiKey }
    });
    
    const sessions = response.data.data?.sessions || [];
    console.log(`🧹 Found ${sessions.length} active HeyGen sessions on startup`);
    
    for (const session of sessions) {
      try {
        await axios.post('https://api.heygen.com/v1/streaming.stop', {
          session_id: session.session_id
        }, {
          headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' }
        });
        console.log(`   ✅ Closed orphaned session: ${session.session_id}`);
      } catch (e) {
        console.log(`   ⚠️ Failed to close ${session.session_id}`);
      }
    }
    
    console.log('🧹 HeyGen cleanup complete');
  } catch (error) {
    console.log('⚠️ HeyGen cleanup skipped:', error.message);
  }
}

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Clean up old HeyGen sessions
  await cleanupHeyGenSessions();
});
