// functions/routes/photos.js (Fixed Routes and Integration)
const express = require('express');
const router = express.Router();
const sheetsService = require('../services/sheets');
const driveService = require('../services/drive');
const geocodingService = require('../services/geocoding');
const { formatThaiDateTime } = require('../utils/datetime');

// POST /photos/upload - Base64 Upload with Full Integration
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
      coordinates: `${lat},${lng}`,
      userEmail
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
    
    // 1. Reverse Geocoding (with error handling)
    console.log(`📍 Getting location for ${lat}, ${lng}`);
    let location;
    try {
      location = await geocodingService.reverseGeocode(
        parseFloat(lat), 
        parseFloat(lng)
      );
    } catch (geocodingError) {
      console.warn('⚠️ Geocoding failed, using coordinates:', geocodingError.message);
      location = {
        formatted_address: `พิกัด: ${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}`,
        place_id: null,
        types: ['geocoding_fallback']
      };
    }
    
    // 2. Create safe filename with timestamp
    const safeTopic = topic.replace(/[/\\?%*:|"<>]/g, '').substring(0, 50);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalFilename = `${building}-${foundation}-${safeTopic}-${timestamp}.jpg`;
    
    console.log(`📤 Uploading ${finalFilename} to Google Drive`);
    
    // 3. Upload to Google Drive
    const driveResult = await driveService.uploadPhoto({
      buffer: buffer,
      filename: finalFilename,
      building,
      foundation,
      category,
      location: location.formatted_address,
      timestamp: formatThaiDateTime()
    });
    
    console.log('✅ Photo uploaded to Google Drive:', driveResult.fileId);
    
    // 4. Log to Google Sheets
    console.log('📊 Logging photo to Google Sheets...');
    try {
      await sheetsService.logPhoto({
        filename: finalFilename,
        building,
        foundation,
        category,
        topic,
        location: location,
        coordinates: { lat: parseFloat(lat), lng: parseFloat(lng) },
        driveFileId: driveResult.fileId,
        viewUrl: driveResult.viewUrl,
        userEmail: userEmail || 'anonymous',
        timestamp: formatThaiDateTime()
      });
      console.log('✅ Photo logged to Google Sheets successfully');
    } catch (sheetsError) {
      console.warn('⚠️ Failed to log to Google Sheets:', sheetsError.message);
      // Continue anyway since Drive upload succeeded
    }
    
    // 5. Return success response
    res.json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        filename: finalFilename,
        location: location.formatted_address,
        driveFileId: driveResult.fileId,
        viewUrl: driveResult.viewUrl,
        downloadUrl: driveResult.downloadUrl,
        timestamp: formatThaiDateTime(),
        coordinates: { lat: parseFloat(lat), lng: parseFloat(lng) },
        fileSize: buffer.length,
        building,
        foundation,
        category,
        topic
      }
    });
    
  } catch (error) {
    console.error('❌ Photo upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload photo',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /photos/list - ดึงรายการรูปตามเงื่อนไข
router.get('/list', async (req, res) => {
  try {
    const { building, foundation, category } = req.query;
    
    if (!building || !foundation) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: building, foundation'
      });
    }

    console.log(`📋 Getting photos for ${building}-${foundation}-${category || 'all'}`);

    const photos = await sheetsService.getExistingPhotos(building, foundation, category);

    res.json({
      success: true,
      data: photos,
      count: photos.length,
      filters: {
        building,
        foundation,
        category: category || 'all'
      }
    });

  } catch (error) {
    console.error('❌ Error listing photos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list photos',
      message: error.message
    });
  }
});

// Simple test endpoint
router.get('/test', (req, res) => {
  console.log('🧪 Photos test endpoint hit');
  res.json({
    success: true,
    message: 'Photos endpoint working',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'POST /photos/upload',
      'GET /photos/list',
      'GET /photos/test'
    ]
  });
});

// Health check for photos service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Photos API',
    status: 'operational',
    timestamp: new Date().toISOString(),
    dependencies: {
      googleDrive: !!require('../config/google').drive,
      googleSheets: !!require('../config/google').sheets,
      geocoding: !!require('../config/google').MAPS_API_KEY
    }
  });
});

module.exports = router;