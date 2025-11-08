/**
 * Test utility for ElevenLabs TTS
 * Run with: node src/utils/testElevenLabs.js
 */

require('dotenv').config();
const ttsService = require('../services/ttsService');
const fs = require('fs');

async function testElevenLabs() {
  console.log('=== Testing ElevenLabs TTS ===\n');

  const testText = "Hi there! I don't think we've met before. I'm Alex.";
  console.log('Test text:', testText);
  console.log('Generating audio...\n');

  try {
    const audioBuffer = await ttsService.textToSpeech(testText);
    
    if (audioBuffer) {
      console.log('✅ Audio generated successfully!');
      console.log('Audio size:', audioBuffer.byteLength || audioBuffer.length, 'bytes');
      
      // Save to file for testing
      const outputPath = '/tmp/test-elevenlabs-audio.mp3';
      fs.writeFileSync(outputPath, audioBuffer);
      console.log('\n✅ Audio saved to:', outputPath);
      console.log('You can play it with: afplay', outputPath);
      
      return true;
    } else {
      console.error('❌ No audio buffer returned');
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run the test
testElevenLabs().then(success => {
  process.exit(success ? 0 : 1);
});

