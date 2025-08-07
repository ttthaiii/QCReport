const express = require('express');
const multer = require('multer');
const router = express.Router();
const sheetsService = require('../../functions/services/sheets');
const driveService = require('../../functions/services/drive');
const geocodingService = require('../../functions/services/geocoding');
const { formatThaiDateTime } = require('../utils/datetime');

// Multer config for photo uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// POST /api/photos/upload - อัปโหลดรูป QC
router.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    const { building, foundation, category, topic, lat, lng, userEmail } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No photo file provided'
      });
    }

    if (!building || !foundation || !category || !topic || !lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // 1. ทำ Reverse Geocoding
    console.log(`📍 Getting location for ${lat}, ${lng}`);
    const location = await geocodingService.reverseGeocode(
      parseFloat(lat), 
      parseFloat(lng)
    );

    // 2. สร้างชื่อไฟล์: A-F01-<หัวข้อ>.jpg
    const filename = `${building}-${foundation}-${topic.replace(/\s+/g, '')}.jpg`;
    
    // 3. อัปโหลดรูปไป Google Drive (พร้อม timestamp + location overlay)
    console.log(`📤 Uploading ${filename} to Google Drive`);
    const driveResult = await driveService.uploadPhoto({
      buffer: req.file.buffer,
      filename,
      building,
      foundation,
      category,
      mimetype: req.file.mimetype,
      location: location.formatted_address,
      timestamp: formatThaiDateTime()
    });

    // 4. บันทึกข้อมูลลง Google Sheets
    console.log(`📝 Logging photo data to sheets`);
    await sheetsService.logPhoto({
      building,
      foundation,
      category,
      topic,
      topicId: null, // Can be added later if needed
      location: location.formatted_address,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      driveFileId: driveResult.fileId,
      driveViewUrl: driveResult.viewUrl,
      driveDownloadUrl: driveResult.downloadUrl,
      filename,
      userEmail: userEmail || 'anonymous'
    });

    res.json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        filename,
        location: location.formatted_address,
        driveFileId: driveResult.fileId,
        viewUrl: driveResult.viewUrl,
        timestamp: formatThaiDateTime()
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

// POST /api/photos/batch-upload - อัปโหลดรูปหลายใบ
router.post('/batch-upload', upload.array('photos', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No photo files provided'
      });
    }

    const results = [];
    const errors = [];

    // Process each photo
    for (const [index, file] of req.files.entries()) {
      try {
        const photoData = JSON.parse(req.body[`photoData_${index}`]);
        const { building, foundation, category, topic, lat, lng, userEmail } = photoData;

        // Same upload process as single photo
        const location = await geocodingService.reverseGeocode(
          parseFloat(lat), 
          parseFloat(lng)
        );

        const filename = `${building}-${foundation}-${topic.replace(/\s+/g, '')}.jpg`;
        
        // ✅ Fixed: Add missing parameters
        const driveResult = await driveService.uploadPhoto({
          buffer: file.buffer,
          filename,
          building,
          foundation,
          category,
          mimetype: file.mimetype,
          location: location.formatted_address,
          timestamp: formatThaiDateTime()
        });

        await sheetsService.logPhoto({
          building,
          foundation,
          category,  
          topic,
          topicId: null,
          location: location.formatted_address,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          driveFileId: driveResult.fileId,
          driveViewUrl: driveResult.viewUrl,
          driveDownloadUrl: driveResult.downloadUrl,
          filename,
          userEmail: userEmail || 'anonymous'
        });

        results.push({
          filename,
          topic,
          success: true
        });

      } catch (error) {
        errors.push({
          index,
          error: error.message,
          filename: file.originalname
        });
      }
    }

    res.json({
      success: errors.length === 0,
      message: `Uploaded ${results.length} photos, ${errors.length} errors`,
      data: {
        successful: results,
        errors: errors,
        total: req.files.length
      }
    });

  } catch (error) {
    console.error('❌ Batch upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to batch upload photos',
      message: error.message
    });
  }
});

module.exports = router;
