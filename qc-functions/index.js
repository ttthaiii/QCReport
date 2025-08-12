const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { getQCTopics, logPhoto, logReport } = require('./api/sheets');
const { uploadPhoto } = require('./api/photos');

// Setup multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// สร้าง Express app
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    message: "QC Report API is running" 
  });
});

// Get QC Topics
app.get("/qc-topics", async (req, res) => {
  try {
    const topics = await getQCTopics();
    res.json({ success: true, data: topics });
  } catch (error) {
    console.error('Error fetching QC topics:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Upload photo with base64 (ใช้แทน multer)
app.post("/upload-photo-base64", async (req, res) => {
  try {
    console.log('Base64 upload request received');
    
    const { photo, building, foundation, category, topic, location } = req.body;
    
    if (!photo) {
      return res.status(400).json({
        success: false,
        error: 'No photo data provided'
      });
    }
    
    if (!building || !foundation || !category || !topic) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    console.log(`Processing base64 upload for: ${building}-${foundation}-${topic}`);
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(photo, 'base64');
    console.log('Image buffer size:', imageBuffer.length);
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${building}-${foundation}-${topic}-${timestamp}.jpg`;
    
    console.log(`Generated filename: ${filename}`);
    
    // Upload to Google Drive
    const driveResult = await uploadPhoto({
      imageBuffer,
      filename,
      building,
      foundation,
      category
    });
    
    console.log('Drive upload successful:', driveResult.fileId);
    
    // Log to Google Sheets
    const photoData = {
      building,
      foundation,
      category,
      topic,
      filename: driveResult.filename,
      driveUrl: driveResult.driveUrl,
      location: location || ''
    };
    
    const sheetResult = await logPhoto(photoData);
    
    console.log('Sheet logging successful:', sheetResult.uniqueId);
    
    res.json({ 
      success: true, 
      data: {
        ...driveResult,
        sheetTimestamp: sheetResult
      }
    });
    
  } catch (error) {
    console.error('Error uploading photo (base64):', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Upload photo with file - with proper error handling
app.post("/upload-photo", (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        error: 'File upload error: ' + err.message
      });
    }
    
    try {
      console.log('Upload request received');
      console.log('Request headers:', req.headers);
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No photo file provided'
        });
      }
      
      console.log('File received:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      
      const { building, foundation, category, topic, location } = req.body;
      
      if (!building || !foundation || !category || !topic) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }
      
      console.log(`Processing upload for: ${building}-${foundation}-${topic}`);
      
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${building}-${foundation}-${topic}-${timestamp}.jpg`;
      
      console.log(`Generated filename: ${filename}`);
      
      // Upload to Google Drive
      const driveResult = await uploadPhoto({
        imageBuffer: req.file.buffer,
        filename,
        building,
        foundation,
        category
      });
      
      console.log('Drive upload successful:', driveResult.fileId);
      
      // Log to Google Sheets
      const photoData = {
        building,
        foundation,
        category,
        topic,
        filename: driveResult.filename,
        driveUrl: driveResult.driveUrl,
        location: location || ''
      };
      
      const sheetResult = await logPhoto(photoData);
      
      console.log('Sheet logging successful:', sheetResult.uniqueId);
      
      res.json({ 
        success: true, 
        data: {
          ...driveResult,
          sheetTimestamp: sheetResult
        }
      });
      
    } catch (error) {
      console.error('Error uploading photo:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });
});

// Log photo (legacy endpoint)
app.post("/log-photo", async (req, res) => {
  try {
    const result = await logPhoto(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error logging photo:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Log report
app.post("/log-report", async (req, res) => {
  try {
    const result = await logReport(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error logging report:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Export as Firebase Function
exports.api = onRequest({
  region: "asia-southeast1",
  memory: "1GiB",
  timeoutSeconds: 120
}, app);