const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { getQCTopics, logPhoto, logReport, getSheetsClient, getMasterData, addMasterData, getCompletedTopics, getMasterDataByCategory, addDynamicMasterData, getMasterDataEnhanced, createDynamicMasterDataSheet } = require('./api/sheets');
const { uploadPhoto } = require('./api/photos');
const { getDriveClient } = require('./services/google-auth');

// 🔥 NEW: Import dynamic category functions
const { 
  getCategoryConfig, 
  getAllCategories, 
  isDynamicCategory,
  convertDynamicFieldsToLegacy,
  convertLegacyToDynamicFields,
  createCombinationDescription
} = require('./api/category-config');

// 🔥 ใช้ optimized-puppeteer-generator (puppeteer-core + @sparticuz/chromium)
const { generateOptimizedPDF, uploadPDFToDrive } = require('./services/optimized-puppeteer-generator');

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
    message: "QC Report API is running with Dynamic Categories and HTML-PDF generator" 
  });
});

// 🔥 NEW: Dynamic Category Configuration Routes
app.get("/categories", async (req, res) => {
  try {
    console.log('Getting all available categories');
    const categories = await getAllCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get("/category-config/:category", async (req, res) => {
  try {
    const { category } = req.params;
    console.log(`Getting category config for: ${category}`);
    
    const config = await getCategoryConfig(category);
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching category config:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 NEW: Enhanced master data endpoints - SPECIFIC ROUTES FIRST
app.get("/master-data/:category", async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category);
    console.log(`🔍 DEBUG: Getting master data for category: ${category}`);
    
    const masterData = await getMasterDataByCategory(category);
    console.log(`🔍 DEBUG: Master data result for ${category}:`, masterData);
    
    res.json({ success: true, data: masterData });
  } catch (error) {
    console.error(`🔍 DEBUG: Error fetching master data for ${req.params.category}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 NEW: Add dynamic master data
app.post("/master-data-dynamic", async (req, res) => {
  try {
    const { category, dynamicFields } = req.body;
    
    console.log(`🔍 DEBUG: Adding dynamic master data request:`, { category, dynamicFields });
    
    if (!category || !dynamicFields || typeof dynamicFields !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: category, dynamicFields'
      });
    }
    
    // Validate that all field values are non-empty
    const fieldNames = Object.keys(dynamicFields);
    const hasEmptyFields = fieldNames.some(field => !dynamicFields[field] || !dynamicFields[field].trim());
    
    if (hasEmptyFields) {
      return res.status(400).json({
        success: false,
        error: 'All dynamic fields must have non-empty values'
      });
    }
    
    console.log(`🔍 DEBUG: Adding dynamic master data for ${category}:`, dynamicFields);
    
    const result = await addDynamicMasterData(category, dynamicFields);
    console.log(`🔍 DEBUG: Dynamic master data result:`, result);
    
    res.json({ success: true, data: result });
    
  } catch (error) {
    console.error('🔍 DEBUG: Error adding dynamic master data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Legacy master data endpoint (GENERAL ROUTES LAST)
app.get("/master-data", async (req, res) => {
  try {
    const { category } = req.query;
    
    console.log(`🔍 DEBUG: Legacy master-data endpoint called with query category: ${category}`);
    
    if (category) {
      // Get category-specific data
      const masterData = await getMasterDataByCategory(category);
      res.json({ success: true, data: masterData });
    } else {
      // Get legacy master data (backward compatibility)
      console.log(`🔍 DEBUG: Getting legacy master data`);
      const masterData = await getMasterData();
      console.log(`🔍 DEBUG: Legacy master data result:`, masterData);
      res.json({ success: true, data: masterData });
    }
  } catch (error) {
    console.error('🔍 DEBUG: Error fetching legacy master data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add Master Data (Building + Foundation) - Enhanced with debugging
app.post("/master-data", async (req, res) => {
  try {
    const { building, foundation, category } = req.body;
    
    console.log(`🔍 DEBUG: POST /master-data called with:`, { building, foundation, category });
    
    // 🔥 HYBRID APPROACH: Route to appropriate function
    if (category && category !== 'ฐานราก') {
      console.log(`🔍 DEBUG: Redirecting to dynamic endpoint for category: ${category}`);
      
      // This is a dynamic category, redirect to dynamic endpoint
      if (!req.body.dynamicFields) {
        // Convert building/foundation to dynamic fields for compatibility
        req.body.dynamicFields = {
          [Object.keys(req.body)[0]]: building, // First field
          [Object.keys(req.body)[1] || 'field2']: foundation // Second field
        };
      }
      
      return res.redirect(307, '/master-data-dynamic'); // 307 preserves POST method
    }
    
    // Legacy approach for ฐานราก
    if (!building || !foundation) {
      console.log(`🔍 DEBUG: Missing building or foundation for legacy category`);
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation'
      });
    }
    
    const buildingTrimmed = building.trim();
    const foundationTrimmed = foundation.trim();
    
    if (!buildingTrimmed || !foundationTrimmed) {
      console.log(`🔍 DEBUG: Empty building or foundation after trimming`);
      return res.status(400).json({
        success: false,
        error: 'Building and foundation cannot be empty'
      });
    }
    
    console.log(`🔍 DEBUG: Adding legacy master data: ${buildingTrimmed}-${foundationTrimmed}`);
    
    const result = await addMasterData(buildingTrimmed, foundationTrimmed);
    console.log(`🔍 DEBUG: Legacy master data add result:`, result);
    
    res.json({ success: true, data: result });
    
  } catch (error) {
    console.error('🔍 DEBUG: Error adding legacy master data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
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

// 🔥 NEW: Enhanced master data endpoints with category support (ต้องอยู่ก่อน GET /master-data)
app.get("/master-data/:category", async (req, res) => {
  try {
    const { category } = req.params;
    console.log(`Getting master data for category: ${category}`);
    
    const masterData = await getMasterDataByCategory(category);
    res.json({ success: true, data: masterData });
  } catch (error) {
    console.error(`Error fetching master data for ${category}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 NEW: Add dynamic master data
app.post("/master-data-dynamic", async (req, res) => {
  try {
    const { category, dynamicFields } = req.body;
    
    if (!category || !dynamicFields || typeof dynamicFields !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: category, dynamicFields'
      });
    }
    
    // Validate that all field values are non-empty
    const fieldNames = Object.keys(dynamicFields);
    const hasEmptyFields = fieldNames.some(field => !dynamicFields[field] || !dynamicFields[field].trim());
    
    if (hasEmptyFields) {
      return res.status(400).json({
        success: false,
        error: 'All dynamic fields must have non-empty values'
      });
    }
    
    console.log(`Adding dynamic master data for ${category}:`, dynamicFields);
    
    const result = await addDynamicMasterData(category, dynamicFields);
    
    res.json({ success: true, data: result });
    
  } catch (error) {
    console.error('Error adding dynamic master data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Legacy master data endpoint (ต้องอยู่หลัง specific routes)
app.get("/master-data", async (req, res) => {
  try {
    const { category } = req.query;
    
    if (category) {
      // Get category-specific data
      const masterData = await getMasterDataByCategory(category);
      res.json({ success: true, data: masterData });
    } else {
      // Get legacy master data (backward compatibility)
      const masterData = await getMasterData();
      res.json({ success: true, data: masterData });
    }
  } catch (error) {
    console.error('Error fetching master data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add Master Data (Building + Foundation) - Keep existing for legacy
app.post("/master-data", async (req, res) => {
  try {
    const { building, foundation, category } = req.body;
    
    // 🔥 HYBRID APPROACH: Route to appropriate function
    if (category && category !== 'ฐานราก') {
      // This is a dynamic category, redirect to dynamic endpoint
      if (!req.body.dynamicFields) {
        // Convert building/foundation to dynamic fields for compatibility
        req.body.dynamicFields = {
          [Object.keys(req.body)[0]]: building, // First field
          [Object.keys(req.body)[1] || 'field2']: foundation // Second field
        };
      }
      
      return res.redirect(307, '/master-data-dynamic'); // 307 preserves POST method
    }
    
    // Legacy approach for ฐานราก
    if (!building || !foundation) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation'
      });
    }
    
    const buildingTrimmed = building.trim();
    const foundationTrimmed = foundation.trim();
    
    if (!buildingTrimmed || !foundationTrimmed) {
      return res.status(400).json({
        success: false,
        error: 'Building and foundation cannot be empty'
      });
    }
    
    console.log(`Adding legacy master data: ${buildingTrimmed}-${foundationTrimmed}`);
    
    const result = await addMasterData(buildingTrimmed, foundationTrimmed);
    
    res.json({ success: true, data: result });
    
  } catch (error) {
    console.error('Error adding master data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get Completed Topics (for progress tracking)
app.post("/completed-topics", async (req, res) => {
  try {
    const { building, foundation, category } = req.body;
    
    if (!building || !foundation || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation, category'
      });
    }
    
    console.log(`Getting completed topics for: ${building}-${foundation}-${category}`);
    
    const result = await getCompletedTopics({ building, foundation, category });
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting completed topics:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 NEW: Upload photo with dynamic fields support
app.post("/upload-photo-dynamic", async (req, res) => {
  try {
    console.log('Dynamic photo upload request received');
    
    const { photo, category, dynamicFields, topic, location } = req.body;
    
    if (!photo || !category || !dynamicFields || !topic) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: photo, category, dynamicFields, topic'
      });
    }
    
    console.log(`Processing dynamic upload for category: ${category}`);
    console.log('Dynamic fields:', dynamicFields);
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(photo, 'base64');
    console.log('Image buffer size:', imageBuffer.length);
    
    // Convert dynamic fields to legacy format for compatibility
    const { building, foundation } = convertDynamicFieldsToLegacy(category, dynamicFields);
    
    // Generate filename with combination description
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const combination = createCombinationDescription(category, dynamicFields);
    const filename = `${combination}-${topic}-${timestamp}.jpg`;
    
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
    
    // 🔥 Enhanced photo logging with dynamic fields
    const photoData = {
      building,
      foundation,
      category,
      topic,
      filename: driveResult.filename,
      driveUrl: driveResult.driveUrl,
      location: location || '',
      // 🔥 NEW: Store dynamic fields for future use
      dynamicFields: JSON.stringify(dynamicFields),
      combination: combination
    };
    
    const sheetResult = await logPhoto(photoData);
    
    console.log('Sheet logging successful:', sheetResult.uniqueId);
    
    res.json({ 
      success: true, 
      data: {
        ...driveResult,
        sheetTimestamp: sheetResult,
        dynamicFields,
        combination
      }
    });
    
  } catch (error) {
    console.error('Error uploading dynamic photo:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 Generate PDF Report - ใช้ Optimized Puppeteer (puppeteer-core + @sparticuz/chromium)
app.post("/generate-report", async (req, res) => {
  try {
    console.log('🎯 Optimized Puppeteer PDF generation request received');
    
    const { building, foundation, category, dynamicFields } = req.body;
    
    // 🔥 NEW: Support both legacy and dynamic formats
    let finalBuilding, finalFoundation;
    
    if (dynamicFields) {
      // Dynamic category - convert fields to legacy format for compatibility
      const legacy = convertDynamicFieldsToLegacy(category, dynamicFields);
      finalBuilding = legacy.building;
      finalFoundation = legacy.foundation;
      console.log(`Dynamic category detected: ${category}`);
      console.log('Dynamic fields:', dynamicFields);
      console.log('Converted to legacy:', legacy);
    } else {
      // Legacy format (ฐานราก or fallback)
      finalBuilding = building;
      finalFoundation = foundation;
      console.log(`Legacy format for category: ${category}`);
    }
    
    if (!finalBuilding || !finalFoundation || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation, category'
      });
    }
    
    console.log(`🚀 Generating Optimized PDF for: ${finalBuilding}-${finalFoundation}-${category}`);
    
    // ดึงรูปภาพจาก Google Sheets ที่ตรงกับเงื่อนไข
    const photos = await getPhotosForReport(finalBuilding, finalFoundation, category);
    
    if (!photos || photos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No photos found for the specified criteria'
      });
    }
    
    console.log(`📸 Found ${photos.length} photos for Optimized PDF`);
    
    // 🔥 สร้าง PDF ด้วย Optimized Puppeteer with dynamic data
    const pdfBuffer = await generateOptimizedPDF({
      building: finalBuilding,
      foundation: finalFoundation,
      category,
      photos,
      projectName: 'Escent Nakhon si',
      // 🔥 NEW: Pass dynamic fields for enhanced PDF headers
      dynamicFields: dynamicFields || null,
      isDynamic: !!dynamicFields
    });
    
    // สร้างชื่อไฟล์
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const combination = dynamicFields ? 
      createCombinationDescription(category, dynamicFields) : 
      `${finalBuilding}-${finalFoundation}`;
    const filename = `รูปประกอบการตรวจสอบ-${combination}-${timestamp}.pdf`;
    
    // อัปโหลดไป Google Drive
    const driveResult = await uploadPDFToDrive(pdfBuffer, filename);
    
    console.log('✅ Optimized PDF generated and uploaded:', driveResult.fileId);
    
    // บันทึกลง Google Sheets
    const reportData = {
      building: finalBuilding,
      foundation: finalFoundation,
      category,
      filename: driveResult.filename,
      driveUrl: driveResult.driveUrl,
      photoCount: photos.length,
      // 🔥 NEW: Store dynamic fields info
      dynamicFields: dynamicFields ? JSON.stringify(dynamicFields) : null,
      combination: combination
    };
    
    const sheetResult = await logReport(reportData);
    
    console.log('📋 Optimized PDF logged successfully:', sheetResult.uniqueId);
    
    res.json({
      success: true,
      data: {
        ...driveResult,
        photoCount: photos.length,
        sheetTimestamp: sheetResult,
        generatedWith: 'Optimized-Puppeteer',
        dynamicFields,
        combination
      }
    });
    
  } catch (error) {
    console.error('❌ Error generating Optimized PDF:', error);
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
    
    console.log(`Found ${photos.length} matching photos for HTML-PDF`);
    return photos;
    
  } catch (error) {
    console.error('❌ Error fetching photos for Optimized PDF:', error);
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
      // ใช้ get with alt=media
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
      
      // วิธีที่ 2: ใช้ direct HTTP request
      try {
        const fetch = require('node-fetch');
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        console.log('Trying direct download from:', downloadUrl);
        
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

// Export as Firebase Function with optimized settings for Puppeteer (ฟรี)
exports.api = onRequest({
  region: "asia-southeast1",
  memory: "2GiB",           // เพิ่ม memory สำหรับ Chromium
  timeoutSeconds: 540,      // เพิ่ม timeout เป็น 9 นาที
  cpu: 1,                   // ใช้ 1 CPU core
  // minInstances: 1,       // ❌ ลบบรรทัดนี้เพื่อประหยัด (จะมี cold start)
  maxInstances: 3,          // จำกัด instance สูงสุด
  concurrency: 1            // จำกัด concurrent requests เป็น 1
}, app);