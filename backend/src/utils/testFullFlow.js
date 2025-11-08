/**
 * Test the full conversation flow
 * Run with: node src/utils/testFullFlow.js
 */

require('dotenv').config();

async function testFlow() {
  console.log('=== Testing Full Conversation Flow ===\n');

  // Test 1: Deepgram
  console.log('1️⃣ Testing Deepgram...');
  const sttService = require('../services/sttService');
  const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
  console.log(hasDeepgram ? '✅ Deepgram API key configured' : '❌ Deepgram API key missing');

  // Test 2: GPT
  console.log('\n2️⃣ Testing GPT...');
  const llmService = require('../services/llmService');
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  console.log(hasOpenAI ? '✅ OpenAI API key configured' : '❌ OpenAI API key missing');
  
  if (hasOpenAI) {
    console.log('Generating test response...');
    const response = await llmService.generateResponse(
      'test-session',
      'Hello, my name is Test User',
      'introduction'
    );
    console.log('✅ GPT Response:', response.substring(0, 50) + '...');
  }

  // Test 3: ElevenLabs
  console.log('\n3️⃣ Testing ElevenLabs...');
  const ttsService = require('../services/ttsService');
  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
  console.log(hasElevenLabs ? '✅ ElevenLabs API key configured' : '❌ ElevenLabs API key missing');
  
  if (hasElevenLabs) {
    console.log('Generating test audio...');
    const audio = await ttsService.textToSpeech("Hello!");
    console.log(audio ? `✅ Audio generated: ${audio.length} bytes` : '❌ Audio generation failed');
  }

  // Test 4: HeyGen
  console.log('\n4️⃣ Testing HeyGen...');
  const heygenService = require('../services/heygenService');
  const hasHeyGen = !!process.env.HEYGEN_API_KEY;
  console.log(hasHeyGen ? '✅ HeyGen API key configured' : '❌ HeyGen API key missing');

  console.log('\n=== Test Summary ===');
  console.log('Deepgram:', hasDeepgram ? '✅' : '❌');
  console.log('OpenAI:', hasOpenAI ? '✅' : '❌');
  console.log('ElevenLabs:', hasElevenLabs ? '✅' : '❌');
  console.log('HeyGen:', hasHeyGen ? '✅' : '❌');
  
  const allWorking = hasDeepgram && hasOpenAI && hasElevenLabs;
  console.log('\nConversation Flow:', allWorking ? '✅ READY' : '❌ INCOMPLETE');
}

testFlow().catch(console.error);

