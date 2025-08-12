const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { getQCTopics, logPhoto, logReport, getSheetsClient } = require('./api/sheets');
const { uploadPhoto } = require('./api/photos');
const { getDriveClient } = require('./services/google-auth'); // แก้ไข import path

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

// Generate PDF Report
app.post("/generate-report", async (req, res) => {
  try {
    console.log('Report generation request received');
    
    const { building, foundation, category } = req.body;
    
    if (!building || !foundation || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation, category'
      });
    }
    
    console.log(`Generating report for: ${building}-${foundation}-${category}`);
    
    // ดึงรูปภาพจาก Google Sheets ที่ตรงกับเงื่อนไข
    const photos = await getPhotosForReport(building, foundation, category);
    
    if (!photos || photos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No photos found for the specified criteria'
      });
    }
    
    console.log(`Found ${photos.length} photos for report`);
    
    // สร้าง PDF จริง
    const { generateSimplePDF, uploadPDFToDrive } = require('./services/simple-pdf-generator');
    
    const pdfBuffer = await generateSimplePDF({
      building,
      foundation,
      category,
      photos,
      projectName: 'Escent Nakhon si'
    });
    
    // สร้างชื่อไฟล์
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `รูปประกอบการตรวจสอบ-${building}-${foundation}-${timestamp}.pdf`;
    
    // อัปโหลดไป Google Drive
    const driveResult = await uploadPDFToDrive(pdfBuffer, filename);
    
    console.log('PDF generated and uploaded:', driveResult.fileId);
    
    // บันทึกลง Google Sheets
    const reportData = {
      building,
      foundation,
      category,
      filename: driveResult.filename,
      driveUrl: driveResult.driveUrl,
      photoCount: photos.length
    };
    
    const sheetResult = await logReport(reportData);
    
    console.log('Report logged successfully:', sheetResult.uniqueId);
    
    res.json({
      success: true,
      data: {
        ...driveResult,
        photoCount: photos.length,
        sheetTimestamp: sheetResult
      }
    });
    
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ดึงรูปภาพจาก Google Sheets สำหรับสร้าง Report
async function getPhotosForReport(building, foundation, category) {
  try {
    const sheets = getSheetsClient();
    const SHEETS_ID = '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';
    
    // ดึงข้อมูลจาก Master_Photos_Log
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:I'
    });
    
    const rows = response.data.values || [];
    const photos = [];
    
    console.log(`Checking ${rows.length} rows for matching photos...`);
    
    // กรองข้อมูลตามเงื่อนไข (skip header row)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 8) {
        const [id, timestamp, rowBuilding, rowFoundation, rowCategory, topic, filename, driveUrl, location] = row;
        
        if (rowBuilding === building && rowFoundation === foundation && rowCategory === category) {
          console.log(`✓ Match found: ${topic}`);
          
          // ดาวน์โหลดรูปจาก Google Drive และแปลงเป็น base64
          const imageBase64 = await downloadImageAsBase64(driveUrl || '');
          
          if (imageBase64) {
            photos.push({
              id,
              timestamp,
              building: rowBuilding,
              foundation: rowFoundation,
              category: rowCategory,
              topic,
              filename,
              driveUrl,
              location,
              imageBase64
            });
          } else {
            console.log(`⚠️ Could not download image for: ${topic}`);
            // เพิ่มรูปแม้ไม่มี base64 เพื่อให้เห็นใน report
            photos.push({
              id,
              timestamp,
              building: rowBuilding,
              foundation: rowFoundation,
              category: rowCategory,
              topic,
              filename,
              driveUrl,
              location,
              imageBase64: null
            });
          }
        }
      }
    }
    
    console.log(`Found ${photos.length} matching photos`);
    return photos;
    
  } catch (error) {
    console.error('Error fetching photos for report:', error);
    throw error;
  }
}

// ดาวน์โหลดรูปจาก Google Drive และแปลงเป็น Base64
async function downloadImageAsBase64(driveUrl) {
  try {
    if (!driveUrl) return null;
    
    console.log('Attempting to download from URL:', driveUrl);
    
    // แปลง Google Drive URL เป็น direct download URL
    const fileId = extractFileIdFromUrl(driveUrl);
    if (!fileId) {
      console.log('Could not extract file ID from URL:', driveUrl);
      return null;
    }
    
    console.log('Extracted file ID:', fileId);
    
    // ใช้ Google Drive API
    const drive = getDriveClient();
    
    try {
      // วิธีที่ 1: ใช้ export endpoint สำหรับ images
      const response = await drive.files.export({
        fileId: fileId,
        mimeType: 'image/jpeg',
        supportsAllDrives: true
      });
      
      if (response.data) {
        console.log(`Image exported successfully, size: ${response.data.length} bytes`);
        return Buffer.from(response.data, 'binary').toString('base64');
      }
    } catch (exportError) {
      console.log('Export failed, trying get with alt=media:', exportError.message);
      
      // วิธีที่ 2: ใช้ get with alt=media
      try {
        const response = await drive.files.get({
          fileId: fileId,
          alt: 'media',
          supportsAllDrives: true
        });
        
        if (response.data) {
          console.log(`Image downloaded successfully, size: ${response.data.length} bytes`);
          return Buffer.from(response.data, 'binary').toString('base64');
        }
      } catch (getError) {
        console.log('Get with alt=media failed:', getError.message);
        
        // วิธีที่ 3: ใช้ direct HTTP request
        try {
          const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
          console.log('Trying direct download from:', downloadUrl);
          
          const fetch = require('node-fetch'); // ต้องติดตั้ง: npm install node-fetch@2
          const httpResponse = await fetch(downloadUrl);
          
          if (httpResponse.ok) {
            const buffer = await httpResponse.buffer();
            console.log(`Direct download successful, size: ${buffer.length} bytes`);
            return buffer.toString('base64');
          } else {
            console.log('Direct download failed:', httpResponse.statusText);
          }
        } catch (fetchError) {
          console.log('Direct download error:', fetchError.message);
        }
      }
    }
    
    console.log('All download methods failed for file ID:', fileId);
    return null;
    
  } catch (error) {
    console.error('Error downloading image:', error.message);
    return null;
  }
}

// แยก File ID จาก Google Drive URL
function extractFileIdFromUrl(url) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9-_]+)/,
    /id=([a-zA-Z0-9-_]+)/,
    /\/([a-zA-Z0-9-_]+)\/view/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

// Upload photo with base64
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