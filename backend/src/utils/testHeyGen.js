/**
 * Test utility for HeyGen API
 * Run with: node src/utils/testHeyGen.js
 */

require('dotenv').config();
const heygenService = require('../services/heygenService');

async function testHeyGenIntegration() {
  console.log('=== Testing HeyGen Integration ===\n');

  // Test 1: List available avatars
  console.log('1. Listing available avatars...');
  try {
    const avatars = await heygenService.listAvatars();
    console.log(`Found ${avatars.length} avatars`);
    
    if (avatars.length > 0) {
      console.log('\nAvailable avatars:');
      avatars.slice(0, 10).forEach((avatar, index) => {
        console.log(`  ${index + 1}. ${avatar.avatar_id || avatar.avatar_name}`);
      });
      if (avatars.length > 10) {
        console.log(`  ... and ${avatars.length - 10} more`);
      }
    }
  } catch (error) {
    console.error('Error listing avatars:', error.message);
  }

  console.log('\n2. Testing scenario configs...');
  
  // Test 2: Check scenario configurations
  const scenarios = ['introduction', 'coffee-spill'];
  scenarios.forEach(scenario => {
    const config = heygenService.getScenarioAvatarConfig(scenario);
    console.log(`\n${scenario}:`);
    console.log(`  Avatar ID: ${config.avatarId}`);
    console.log(`  Voice ID: ${config.voice.voiceId}`);
    console.log(`  Quality: ${config.quality}`);
  });

  console.log('\n\n=== Test Complete ===');
}

// Run the tests
testHeyGenIntegration().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});

