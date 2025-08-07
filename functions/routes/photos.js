// functions/routes/photos.js (Base64 approach)
const express = require('express');
const router = express.Router();
const sheetsService = require('../services/sheets');
const driveService = require('../services/drive');
const geocodingService = require('../services/geocoding');
const { formatThaiDateTime } = require('../utils/datetime');

// POST /api/photos/upload - Base64 Upload
router.post('/upload', async (req, res) => {
  try {
    console.log('📸 Photo upload request received');
    
    const { 
      photoBase64, 
      filename, 
      building, 
      foundation, 
      category, 
      topic, 
      lat, 
      lng, 
      userEmail 
    } = req.body;
    
    console.log('📝 Request data:', {
      hasPhoto: !!photoBase64,
      filename,
      building,
      foundation,
      category,
      topic,
      coordinates: `${lat},${lng}`
    });
    
    // Validate required fields
    if (!photoBase64) {
      return res.status(400).json({
        success: false,
        error: 'No photo data provided',
        message: 'photoBase64 field is required'
      });
    }
    
    if (!building || !foundation || !category || !topic || !lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missing: {
          building: !building,
          foundation: !foundation,
          category: !category,
          topic: !topic,
          lat: !lat,
          lng: !lng
        }
      });
    }
    
    // Convert base64 to buffer
    console.log('🔄 Converting base64 to buffer...');
    const base64Data = photoBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    console.log('📏 Buffer created:', buffer.length, 'bytes');
    
    // 1. Reverse Geocoding
    console.log(`📍 Getting location for ${lat}, ${lng}`);
    const location = await geocodingService.reverseGeocode(
      parseFloat(lat), 
      parseFloat(lng)
    );
    
    // 2. Create safe filename
    const safeTopic = topic.replace(/[/\\?%*:|"<>]/g, '').substring(0, 50);
    const finalFilename = `${building}-${foundation}-${safeTopic}.jpg`;
    
    console.log(`📤 Uploading ${finalFilename} to Google Drive`);
    
    // 3. Upload to Drive
    const driveResult = await driveService.uploadPhoto({
      buffer: buffer,
      filename: finalFilename,
      building,
      foundation,
      category,
      location: location.formatted_address,
      timestamp: formatThaiDateTime()
    });
    
    console.log('✅ Photo upload completed successfully');
    
    // 4. Return success response
    res.json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        filename: finalFilename,
        location: location.formatted_address,
        driveFileId: driveResult.fileId,
        viewUrl: driveResult.viewUrl,
        timestamp: formatThaiDateTime(),
        coordinates: { lat: parseFloat(lat), lng: parseFloat(lng) },
        fileSize: buffer.length
      }
    });
    
  } catch (error) {
    console.error('❌ Photo upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload photo',
      message: error.message
    });
  }
});

// Simple test endpoint
router.post('/test', (req, res) => {
  console.log('🧪 Test endpoint hit');
  res.json({
    success: true,
    message: 'Photos endpoint working'
  });
});

module.exports = router;