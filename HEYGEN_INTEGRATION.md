# HeyGen Avatar Integration Guide

## Overview

This application now features **dynamic HeyGen avatar generation** that creates scenario-specific avatars with custom voices and appearances for each conversation type.

## Features

### 🎭 Streaming Avatars
- **Real-time video streaming** via WebRTC
- **Scenario-specific avatars** - Different avatar for each conversation type
- **Custom voices** - Each avatar has a unique voice personality
- **Automatic lip-sync** - Avatar speaks naturally with generated text
- **Fallback support** - Gracefully degrades to ElevenLabs TTS if HeyGen is unavailable

### 🔄 Dual-Mode System
1. **HeyGen Streaming Mode** (Primary)
   - Live avatar video streaming
   - Natural lip-synced speech
   - Lower latency for conversations

2. **ElevenLabs Fallback Mode**
   - High-quality TTS audio
   - Animated emoji avatar placeholder
   - Works when HeyGen streaming is unavailable

## Architecture

### Backend Components

#### HeyGenService (`backend/src/services/heygenService.js`)

**Key Methods:**

```javascript
// Create a streaming session for a scenario
createStreamingSession(sessionId, scenario)

// Start the streaming session
startStreamingSession(sessionId)

// Make the avatar speak
speakWithAvatar(sessionId, text)

// Stop and cleanup the session
stopStreamingSession(sessionId)

// Get scenario-specific avatar configuration
getScenarioAvatarConfig(scenario)
```

**Scenario Configurations:**

```javascript
{
  introduction: {
    avatarId: 'Angela-inblackskirt-20220820',    // Professional avatar
    voice: {
      voiceId: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
      rate: 1.0,
      emotion: 'Friendly'
    }
  },
  'coffee-spill': {
    avatarId: 'Tyler-incasualsuit-20220721',     // Casual avatar
    voice: {
      voiceId: '1bd001e7e50f421d891986aad5158bc8',
      rate: 1.05,
      emotion: 'Friendly'
    }
  }
}
```

### Frontend Components

#### ConversationPage (`frontend/src/pages/ConversationPage.js`)

**WebRTC Integration:**
- Sets up peer connection with HeyGen servers
- Receives and displays avatar video stream
- Handles ICE candidates and SDP negotiation
- Manages connection lifecycle

**Key Features:**
- `setupHeygenWebRTC()` - Establishes WebRTC connection
- `peerConnectionRef` - Maintains active peer connection
- Automatic video playback when stream is received
- Graceful fallback to animated avatar on errors

## Configuration

### Avatar Selection

To customize avatars for different scenarios, edit `heygenService.js`:

```javascript
const scenarioConfigs = {
  'your-scenario-name': {
    avatarId: 'avatar-id-from-heygen',
    voice: {
      voiceId: 'voice-id-from-heygen',
      rate: 1.0,
      emotion: 'Friendly'
    },
    quality: 'high',
    background: 'office'
  }
};
```

### Getting Available Avatars

Run the test utility to see available avatars:

```bash
cd backend
node src/utils/testHeyGen.js
```

This will:
1. List all available HeyGen avatars
2. Show current scenario configurations
3. Verify your API key is working

### API Endpoints Used

- `POST /v2/streaming.new` - Create streaming session
- `POST /v2/streaming.start` - Start the stream
- `POST /v2/streaming.task` - Make avatar speak
- `POST /v2/streaming.stop` - Stop streaming
- `POST /v2/streaming.ice` - Submit ICE candidates
- `GET /v2/avatars` - List available avatars

## Flow Diagram

```
User clicks "Start" 
    ↓
Backend creates HeyGen session
    ↓
Backend starts streaming
    ↓
Frontend receives WebRTC offer (SDP)
    ↓
Frontend creates peer connection
    ↓
Frontend sends WebRTC answer
    ↓
Backend forwards answer to HeyGen
    ↓
WebRTC connection established
    ↓
Video stream displayed
    ↓
User speaks → AI responds
    ↓
Backend calls speakWithAvatar()
    ↓
Avatar lip-syncs and speaks
```

## Troubleshooting

### No Video Stream

**Check backend logs for:**
```
Creating HeyGen streaming session for scenario: ...
HeyGen streaming session created: ...
Starting HeyGen stream: ...
```

**Check frontend console for:**
```
Setting up HeyGen WebRTC streaming...
Creating peer connection for HeyGen...
Received video track from HeyGen
```

### Avatar Not Speaking

**Verify:**
1. Backend logs show: `Making HeyGen avatar speak: ...`
2. HeyGen session is active (not timed out)
3. API key is valid and has quota
4. Text is not empty or too long

### WebRTC Connection Issues

**Common causes:**
- Firewall blocking WebRTC ports
- TURN server needed for restrictive networks
- Browser WebRTC permissions denied
- ICE candidate gathering failed

**Solution:** Check `ice_servers` configuration in HeyGen response

### Fallback to ElevenLabs

If you see `"HeyGen avatar failed, falling back to ElevenLabs"`:
1. Check HeyGen API quota/limits
2. Verify avatar ID is valid
3. Check network connectivity
4. Review HeyGen API status

## Cost Optimization

### Streaming vs. Video Generation

- **Streaming** (Current): Real-time, lower cost per minute
- **Video Generation**: Higher quality, but slower and more expensive

### Session Management

The system automatically:
- Closes sessions when conversation ends
- Cleans up on disconnection
- Prevents orphaned sessions

### Tips to Reduce Costs

1. Set conversation time limits
2. Use streaming instead of video generation
3. Implement session timeout (currently 30 minutes)
4. Monitor active sessions
5. Use lower quality settings for testing

## Customization

### Adding New Scenarios

1. Add scenario to `scenarioConfigs` in `heygenService.js`
2. Choose appropriate avatar from HeyGen library
3. Select matching voice
4. Update frontend scenario details
5. Test with `testHeyGen.js`

### Custom Avatars

To use your own custom avatars:
1. Upload to HeyGen dashboard
2. Get avatar ID from HeyGen
3. Update configuration with your avatar ID
4. Test streaming functionality

### Voice Customization

Available voice parameters:
- `voiceId` - HeyGen voice identifier
- `rate` - Speech speed (0.5-2.0)
- `emotion` - Voice emotion/tone

## Testing

### Manual Testing

1. Start the application
2. Open browser console (F12)
3. Select a scenario
4. Click "Start Conversation"
5. Monitor console logs for:
   - WebRTC connection status
   - Video track received
   - Avatar state changes

### Automated Testing

```bash
# Test HeyGen API connection
cd backend
node src/utils/testHeyGen.js

# Check if services are running
curl http://localhost:3001/health
```

### Debug Mode

Enable detailed logging:
```javascript
// In heygenService.js
console.log('Detailed logs:', response.data);
```

## Performance Metrics

### Typical Latency
- Session creation: 2-3 seconds
- WebRTC connection: 1-2 seconds
- First frame: 3-5 seconds total
- Speech response: < 1 second after text generation

### Bandwidth Usage
- Video stream: ~500-800 kbps
- Audio fallback: ~128 kbps
- STT upload: ~50-100 kbps

## Security Notes

- API keys stored in `.env` file (never commit!)
- WebRTC uses encrypted connections
- Session IDs are UUIDs (hard to guess)
- Sessions timeout after inactivity
- CORS properly configured

## Future Enhancements

Potential improvements:
- [ ] Avatar emotion control based on conversation tone
- [ ] Multiple camera angles
- [ ] Custom backgrounds for scenarios
- [ ] Avatar gesture control
- [ ] Multi-avatar conversations
- [ ] Recording and playback
- [ ] Analytics dashboard

## Support

### HeyGen Documentation
- [HeyGen API Docs](https://docs.heygen.com/)
- [Streaming Avatar Guide](https://docs.heygen.com/docs/streaming-avatar)
- [WebRTC Integration](https://docs.heygen.com/docs/webrtc)

### Common Issues
- Check HeyGen API status page
- Verify API key permissions
- Review rate limits and quotas
- Check WebRTC browser compatibility

