/**
 * Generate HeyGen avatar videos for each scenario
 * Run with: node src/utils/generateHeyGenVideos.js
 */

require('dotenv').config();
const heygenService = require('../services/heygenService');
const fs = require('fs');
const axios = require('axios');

const scenarios = {
  introduction: {
    text: "Hi there! I don't think we've met before. I'm Alex. I'm really glad to meet you today.",
    outputFile: '../../../frontend/public/assets/introduction-avatar.mp4'
  },
  'coffee-spill': {
    text: "Oh! Careful there! You just spilled coffee on me. This is my favorite shirt!",
    outputFile: '../../../frontend/public/assets/coffee-spill-avatar.mp4'
  }
};

async function generateVideos() {
  console.log('🎬 Generating HeyGen Avatar Videos\n');
  console.log('This will take 2-3 minutes per video...\n');

  for (const [scenario, config] of Object.entries(scenarios)) {
    console.log(`\n📹 Generating ${scenario} video...`);
    console.log(`Text: "${config.text}"`);
    
    try {
      // Generate video
      const videoData = await heygenService.generateAvatarVideo(config.text, scenario);
      
      if (!videoData || !videoData.video_id) {
        console.error(`❌ Failed to start video generation for ${scenario}`);
        continue;
      }

      console.log(`✅ Video generation started`);
      console.log(`Video ID: ${videoData.video_id}`);
      console.log('⏳ Waiting for video to be ready...');

      // Poll for completion
      let status = 'pending';
      let attempts = 0;
      let videoUrl = null;

      while (status !== 'completed' && attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        const statusData = await heygenService.getVideoStatus(videoData.video_id);
        
        if (statusData) {
          status = statusData.status;
          videoUrl = statusData.video_url;
          
          console.log(`📊 Status: ${status} (attempt ${attempts + 1}/60)`);
          
          if (status === 'completed') {
            console.log(`✅ Video ready: ${videoUrl}`);
            
            // Download video
            console.log('⬇️ Downloading video...');
            const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
            
            // Save to frontend public folder
            const outputPath = config.outputFile;
            const dir = require('path').dirname(outputPath);
            
            // Create directory if it doesn't exist
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(outputPath, response.data);
            console.log(`💾 Saved to: ${outputPath}`);
            console.log(`✅ ${scenario} video complete!\n`);
            break;
          } else if (status === 'failed') {
            console.error(`❌ Video generation failed for ${scenario}`);
            break;
          }
        }
        
        attempts++;
      }

      if (attempts >= 60) {
        console.error(`⏰ Timeout waiting for ${scenario} video`);
      }

    } catch (error) {
      console.error(`❌ Error generating ${scenario}:`, error.message);
    }
  }

  console.log('\n🎉 Done! Videos saved to frontend/public/assets/');
  console.log('Refresh your browser to see the new avatars!');
}

generateVideos().catch(console.error);

