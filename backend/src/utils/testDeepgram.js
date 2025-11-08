/**
 * Test Deepgram connection
 * Run with: node src/utils/testDeepgram.js
 */

require('dotenv').config();
const sttService = require('../services/sttService');

async function testDeepgram() {
  console.log('=== Testing Deepgram Connection ===\n');

  let transcriptReceived = false;

  console.log('Creating live transcription...');
  const connection = sttService.createLiveTranscription(
    (data) => {
      console.log('✅ Transcript received:', data);
      transcriptReceived = true;
    },
    (error) => {
      console.error('❌ Error:', error);
    }
  );

  if (!connection) {
    console.error('❌ Failed to create connection');
    process.exit(1);
  }

  console.log('✅ Connection created');
  console.log('Waiting 2 seconds for connection to open...');

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Try sending some test data
  console.log('Sending test audio data...');
  const testData = Buffer.alloc(1024);
  connection.send(testData);

  await new Promise(resolve => setTimeout(resolve, 3000));

  if (transcriptReceived) {
    console.log('✅ Deepgram is working!');
  } else {
    console.log('⚠️ No transcript received (might need real audio)');
  }

  connection.finish();
  process.exit(0);
}

testDeepgram().catch(console.error);

