# Avatar Images Setup Guide

## Overview

The application now uses static images instead of HeyGen video streaming. The images change dynamically based on conversation state.

## Image Requirements

### Alessandra (Introduction Scenario)
- **Normal Image**: `alessandra-normal.jpg`
  - Used during the conversation
  - Should show Alessandra in a friendly, professional state
  
- **Goodbye Image**: `alessandra-goodbye.jpg`
  - Used when Alessandra says goodbye phrases
  - Triggered by phrases like "nice meeting you", "take care", "see you around", etc.
  - Should show Alessandra waving or in a farewell gesture

### Pedro (Coffee Spill Scenario)
- **Angry Image**: `pedro-angry.jpg`
  - Used at the start of the conversation when Pedro is upset
  - Should show Pedro looking annoyed or frustrated
  
- **Happy Image**: `pedro-happy.jpg`
  - Used when Pedro's emotion softens
  - Triggered by phrases like "it's okay", "no problem", "these things happen", etc.
  - Should show Pedro calm or smiling

## Where to Place Images

Place all images in:
```
frontend/public/assets/
```

The images will be accessible at:
- `/assets/alessandra-normal.jpg`
- `/assets/alessandra-goodbye.jpg`
- `/assets/pedro-angry.jpg`
- `/assets/pedro-happy.jpg`

## Image Format Recommendations

- **Format**: JPG, PNG, or WebP
- **Aspect Ratio**: 16:9 or 4:3 recommended (will scale to fit container)
- **Resolution**: 1920x1080 or higher for best quality
- **File Size**: Optimize to < 500KB for faster loading

## How It Works

### Alessandra (Introduction)
1. Conversation starts with `alessandra-normal.jpg`
2. When GPT generates goodbye phrases, automatically switches to `alessandra-goodbye.jpg`
3. Image transition is smooth with fade animation

### Pedro (Coffee Spill)
1. Conversation starts with `pedro-angry.jpg` (Pedro is upset)
2. As the conversation progresses and Pedro calms down (detects softening phrases), switches to `pedro-happy.jpg`
3. Once switched to happy, stays in that state

## Customization

To customize image paths or add more states, edit:
- **Backend**: `backend/src/services/avatarImageManager.js`
  - Method `getImagePath()` - Update image paths
  - Method `shouldShowGoodbye()` - Add/remove goodbye trigger phrases
  - Method `hasPedroSoftened()` - Add/remove softening trigger phrases

## Testing

After placing your images:
1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm start`
3. Navigate to a scenario and start a conversation
4. The image should appear and change based on conversation state

## Troubleshooting

**Image doesn't appear:**
- Check that image files are in `frontend/public/assets/`
- Check that filenames match exactly (case-sensitive)
- Check browser console for 404 errors

**Image doesn't switch:**
- Check backend logs for messages like "👋 Detected goodbye phrase" or "😊 Pedro emotion softened"
- Verify the AI is saying the trigger phrases
- Check `avatarImageManager.js` for the list of trigger phrases

## Visual Styling

The images are styled with:
- Smooth fade transitions when changing
- Subtle scale animation when AI is talking
- Rounded corners and shadow effects
- Responsive sizing to fit the container

To customize styling, edit:
- `frontend/src/pages/ConversationPage.css` - Look for `.avatar-image` classes

