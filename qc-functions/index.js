const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { 
  getQCTopics, logPhoto, logReport, getSheetsClient, getMasterData, addMasterData, 
  getCompletedTopics, 
  // 🔥 NEW: Enhanced functions with MainCategory support
  getCompletedTopicsFullMatch, getFieldValues,
  getMainCategories, getSubCategories, getTopicsForCategory,
  runCompleteMigration
} = require('./api/sheets');
const { uploadPhoto } = require('./api/photos');
const { getDriveClient } = require('./services/google-auth');

// 🔥 NEW: Import dynamic fields functions
const { 
  getDynamicFields, 
  validateDynamicFields, 
  convertDynamicFieldsToMasterData,
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
    message: "QC Report API is running with MainCategory + SubCategory support" 
  });
});

// 🔥 NEW: System Migration endpoint
app.post("/migrate-system", async (req, res) => {
  try {
    console.log('🚀 Starting system migration...');
    
    const result = await runCompleteMigration();
    
    res.json({
      success: result.success,
      message: result.message,
      data: result.results,
      errors: result.errors
    });
    
  } catch (error) {
    console.error('Error running system migration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔥 UPDATED: Get QC Topics (now supports 3-level structure)
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

// 🔥 NEW: Get Main Categories
app.get("/main-categories", async (req, res) => {
  try {
    const mainCategories = await getMainCategories();
    res.json({ success: true, data: mainCategories });
  } catch (error) {
    console.error('Error fetching main categories:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 NEW: Get Sub Categories by Main Category
app.get("/sub-categories/:mainCategory", async (req, res) => {
  try {
    const { mainCategory } = req.params;
    const subCategories = await getSubCategories(decodeURIComponent(mainCategory));
    res.json({ success: true, data: subCategories });
  } catch (error) {
    console.error('Error fetching sub categories:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 NEW: Get Topics by Main Category and Sub Category
app.get("/topics/:mainCategory/:subCategory", async (req, res) => {
  try {
    const { mainCategory, subCategory } = req.params;
    const topics = await getTopicsForCategory(
      decodeURIComponent(mainCategory), 
      decodeURIComponent(subCategory)
    );
    res.json({ success: true, data: topics });
  } catch (error) {
    console.error('Error fetching topics for category:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 UPDATED: Dynamic Fields Handlers (now with subCategory)

// Get dynamic fields for a sub category
async function getDynamicFieldsHandler(req, res) {
  try {
    const { subCategory } = req.params; // 🔥 เปลี่ยนจาก category เป็น subCategory
    
    if (!subCategory) {
      return res.status(400).json({
        success: false,
        error: 'Sub category is required'
      });
    }
    
    console.log(`API: Getting dynamic fields for sub category: ${decodeURIComponent(subCategory)}`);
    
    const result = await getDynamicFields(decodeURIComponent(subCategory));
    
    res.json({ success: true, data: result });
    
  } catch (error) {
    console.error('Error getting dynamic fields:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// Validate dynamic fields
async function validateDynamicFieldsHandler(req, res) {
  try {
    const { subCategory, dynamicFields } = req.body; // 🔥 เปลี่ยนจาก category
    
    if (!subCategory || !dynamicFields) {
      return res.status(400).json({
        success: false,
        error: 'Sub category and dynamicFields are required'
      });
    }
    
    console.log(`API: Validating dynamic fields for ${subCategory}:`, dynamicFields);
    
    const validation = validateDynamicFields(subCategory, dynamicFields);
    
    if (validation.valid) {
      res.json({ success: true, message: 'Fields are valid' });
    } else {
      res.status(400).json({ 
        success: false, 
        error: validation.error 
      });
    }
    
  } catch (error) {
    console.error('Error validating dynamic fields:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// Add master data with dynamic fields
async function addMasterDataDynamicHandler(req, res) {
  try {
    const { subCategory, dynamicFields } = req.body; // 🔥 เปลี่ยนจาก category
    
    if (!subCategory || !dynamicFields) {
      return res.status(400).json({
        success: false,
        error: 'Sub category and dynamicFields are required'
      });
    }
    
    console.log(`API: Adding dynamic master data for ${subCategory}:`, dynamicFields);
    
    // Convert dynamic fields to building+foundation format
    const masterData = convertDynamicFieldsToMasterData(subCategory, dynamicFields);
    
    if (!masterData.building || !masterData.foundation) {
      return res.status(400).json({
        success: false,
        error: 'Invalid dynamic fields: missing building or foundation equivalent'
      });
    }
    
    // Use existing addMasterData function
    const result = await addMasterData(masterData.building, masterData.foundation);
    
    res.json({ 
      success: true, 
      data: {
        ...result,
        originalFields: dynamicFields,
        convertedFields: masterData
      }
    });
    
  } catch (error) {
    console.error('Error adding dynamic master data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// 🔥 UPDATED: Get completed topics with dynamic fields (now with mainCategory + subCategory)
async function getCompletedTopicsDynamicHandler(req, res) {
  try {
    const { mainCategory, subCategory, dynamicFields } = req.body; // 🔥 เพิ่ม mainCategory
    
    if (!mainCategory || !subCategory || !dynamicFields) {
      return res.status(400).json({
        success: false,
        error: 'Main category, sub category and dynamicFields are required'
      });
    }
    
    console.log(`API: Getting completed topics for ${mainCategory}/${subCategory}:`, dynamicFields);
    
    // Convert dynamic fields to building+foundation format
    const masterData = convertDynamicFieldsToMasterData(subCategory, dynamicFields);
    
    if (!masterData.building || !masterData.foundation) {
      return res.status(400).json({
        success: false,
        error: 'Invalid dynamic fields: missing building or foundation equivalent'
      });
    }
    
    // Use enhanced getCompletedTopics function with mainCategory
    const result = await getCompletedTopics({
      building: masterData.building,
      foundation: masterData.foundation,
      mainCategory: mainCategory,      // 🔥 NEW
      subCategory: subCategory         // 🔥 เปลี่ยนจาก category
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting completed topics with dynamic fields:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// 🔥 NEW: Register enhanced dynamic fields endpoints
app.get('/dynamic-fields/:subCategory', getDynamicFieldsHandler);
app.post('/validate-dynamic-fields', validateDynamicFieldsHandler);
app.post('/master-data-dynamic', addMasterDataDynamicHandler);
app.post('/completed-topics-dynamic', getCompletedTopicsDynamicHandler);

// Master Data endpoints
app.get("/master-data", async (req, res) => {
  try {
    const masterData = await getMasterData();
    res.json({ success: true, data: masterData });
  } catch (error) {
    console.error('Error fetching master data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add Master Data (Building + Foundation)
app.post("/master-data", async (req, res) => {
  try {
    const { building, foundation } = req.body;
    
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
    
    console.log(`Adding master data: ${buildingTrimmed}-${foundationTrimmed}`);
    
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

// 🔥 UPDATED: Get Completed Topics (now with mainCategory + subCategory)
app.post("/completed-topics", async (req, res) => {
  try {
    const { building, foundation, mainCategory, subCategory } = req.body; // 🔥 เพิ่ม mainCategory, เปลี่ยน category เป็น subCategory
    
    if (!building || !foundation || !mainCategory || !subCategory) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation, mainCategory, subCategory'
      });
    }
    
    console.log(`Getting completed topics for: ${building}-${foundation}-${mainCategory}/${subCategory}`);
    
    const result = await getCompletedTopics({ 
      building, 
      foundation, 
      mainCategory,    // 🔥 NEW
      subCategory      // 🔥 เปลี่ยนจาก category
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting completed topics:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 UPDATED: Generate PDF Report - รองรับ MainCategory + SubCategory + Dynamic Fields
app.post("/generate-report", async (req, res) => {
  try {
    console.log('🎯 Optimized Puppeteer PDF generation request received');
    
    const { building, foundation, mainCategory, subCategory, dynamicFields } = req.body; // 🔥 เพิ่ม mainCategory, เปลี่ยน category
    
    if (!building || !foundation || !mainCategory || !subCategory) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation, mainCategory, subCategory'
      });
    }
    
    console.log(`🚀 Generating PDF for: ${building}-${foundation}-${mainCategory}/${subCategory}`);
    if (dynamicFields) {
      console.log('📋 Dynamic fields:', dynamicFields);
    }
    
    // ดึงรูปภาพจาก Google Sheets ที่ตรงกับเงื่อนไข
    const photos = await getPhotosForReport(building, foundation, mainCategory, subCategory, dynamicFields);
    
    if (!photos || photos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No photos found for the specified criteria'
      });
    }
    
    console.log(`📸 Found ${photos.length} photos for PDF`);
    
    // 🔥 สร้าง PDF ด้วย Optimized Puppeteer + Dynamic Fields + MainCategory
    const reportData = {
      building,
      foundation,
      mainCategory,        // 🔥 NEW
      subCategory,         // 🔥 เปลี่ยนจาก category
      photos,
      projectName: 'Escent Nakhon si',
      dynamicFields: dynamicFields || null // 🔥 NEW: ส่ง dynamic fields ไป PDF
    };
    
    const pdfBuffer = await generateOptimizedPDF(reportData);
    
    // สร้างชื่อไฟล์
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    
    // 🔥 NEW: ใช้ dynamic fields ในชื่อไฟล์ถ้ามี
    let filenamePrefix = 'รูปประกอบการตรวจสอบ';
    if (dynamicFields && Object.keys(dynamicFields).length > 0) {
      const description = createCombinationDescription(subCategory, dynamicFields);
      filenamePrefix = `รูปประกอบการตรวจสอบ-${mainCategory}-${description}`;
    } else {
      filenamePrefix = `รูปประกอบการตรวจสอบ-${mainCategory}-${building}-${foundation}`;
    }
    
    const filename = `${filenamePrefix}-${timestamp}.pdf`;
    
    // อัปโหลดไป Google Drive
    const driveResult = await uploadPDFToDrive(pdfBuffer, filename);
    
    console.log('✅ PDF generated and uploaded:', driveResult.fileId);
    
    // บันทึกลง Google Sheets
    const reportData2 = {
      building,
      foundation,
      mainCategory,      // 🔥 NEW
      subCategory,       // 🔥 เปลี่ยนจาก category
      filename: driveResult.filename,
      driveUrl: driveResult.driveUrl,
      photoCount: photos.length
    };
    
    const sheetResult = await logReport(reportData2);
    
    console.log('📋 PDF logged successfully:', sheetResult.uniqueId);
    
    res.json({
      success: true,
      data: {
        ...driveResult,
        photoCount: photos.length,
        sheetTimestamp: sheetResult,
        generatedWith: 'Optimized-Puppeteer-MainCategory-SubCategory',
        mainCategory: mainCategory,        // 🔥 NEW
        subCategory: subCategory,          // 🔥 NEW
        dynamicFields: dynamicFields || null
      }
    });
    
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔥 UPDATED: ดึงรูปภาพจาก Google Sheets สำหรับสร้าง Report (รองรับ MainCategory + SubCategory)
async function getPhotosForReport(building, foundation, mainCategory, subCategory, dynamicFields = null) {
  try {
    const sheets = getSheetsClient();
    const SHEETS_ID = '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';
    
    console.log(`🔍 Full Match photo search:`, {
      mainCategory,
      subCategory,
      dynamicFields
    });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:K' // 🔥 เพิ่มถึง column K
    });
    
    const rows = response.data.values || [];
    const photos = [];
    
    console.log(`Checking ${rows.length} rows for Full Match photos...`);
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 8) {
        const [id, timestamp, rowBuilding, rowFoundation, rowSubCategory, topic, filename, driveUrl, location, dynamicFieldsJSON, rowMainCategory] = row;
        
        // ✅ เช็ค mainCategory และ subCategory
        const categoryMatch = rowMainCategory 
          ? (rowMainCategory === mainCategory && rowSubCategory === subCategory) // โครงสร้างใหม่
          : (rowSubCategory === subCategory); // backward compatibility
        
        if (!categoryMatch) continue;
        
        // ✅ ถ้ามี dynamicFields (Full Match mode)
        if (dynamicFields && Object.keys(dynamicFields).length > 0) {
          if (!dynamicFieldsJSON) continue; // skip ข้อมูลเก่าที่ไม่มี dynamic fields
          
          try {
            const rowDynamicFields = JSON.parse(dynamicFieldsJSON);
            
            // ✅ Full Match: ตรวจสอบทุก field ที่มีค่า
            let isFullMatch = true;
            for (const [fieldName, fieldValue] of Object.entries(dynamicFields)) {
              if (fieldValue && fieldValue.trim()) {
                const rowFieldValue = rowDynamicFields[fieldName];
                if (!rowFieldValue || rowFieldValue.trim() !== fieldValue.trim()) {
                  isFullMatch = false;
                  break;
                }
              }
            }
            
            if (!isFullMatch) continue;
            
          } catch (parseError) {
            console.log('⚠️ Cannot parse dynamic fields, skipping row');
            continue;
          }
        } else {
          // ✅ Basic match (backward compatibility)
          if (rowBuilding !== building || rowFoundation !== foundation) continue;
        }
        
        console.log(`✅ Full Match photo found: ${topic}`);
        
        // ดาวน์โหลดรูป
        const imageBase64 = await downloadImageAsBase64(driveUrl || '');
        
        if (imageBase64) {
          photos.push({
            id, timestamp,
            building: rowBuilding,
            foundation: rowFoundation,
            mainCategory: rowMainCategory || mainCategory,    // 🔥 NEW
            subCategory: rowSubCategory,                      // 🔥 NEW
            topic, filename, driveUrl, location,
            imageBase64,
            dynamicFields: dynamicFieldsJSON ? JSON.parse(dynamicFieldsJSON) : null
          });
        } else {
          console.log(`⚠️ Could not download image for: ${topic}`);
          photos.push({
            id, timestamp,
            building: rowBuilding,
            foundation: rowFoundation,  
            mainCategory: rowMainCategory || mainCategory,    // 🔥 NEW
            subCategory: rowSubCategory,                      // 🔥 NEW
            topic, filename, driveUrl, location,
            imageBase64: null,
            dynamicFields: dynamicFieldsJSON ? JSON.parse(dynamicFieldsJSON) : null
          });
        }
      }
    }
    
    console.log(`📸 Found ${photos.length} Full Match photos for PDF`);
    return photos;
    
  } catch (error) {
    console.error('❌ Error fetching Full Match photos for PDF:', error);
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

// 🔥 UPDATED: Upload photo with base64 (รองรับ MainCategory + SubCategory)
app.post("/upload-photo-base64", async (req, res) => {
  try {
    console.log('Base64 upload request received');
    
    const { photo, building, foundation, mainCategory, subCategory, topic, location, dynamicFields } = req.body; // 🔥 เพิ่ม mainCategory, เปลี่ยน category
    
    if (!photo) {
      return res.status(400).json({
        success: false,
        error: 'No photo data provided'
      });
    }
    
    if (!building || !foundation || !mainCategory || !subCategory || !topic) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation, mainCategory, subCategory, topic'
      });
    }
    
    console.log(`Processing base64 upload for: ${building}-${foundation}-${mainCategory}/${subCategory}-${topic}`);
    if (dynamicFields) {
      console.log('📋 Dynamic fields:', dynamicFields);
    }
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(photo, 'base64');
    console.log('Image buffer size:', imageBuffer.length);
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${mainCategory}-${building}-${foundation}-${topic}-${timestamp}.jpg`;
    
    console.log(`Generated filename: ${filename}`);
    
    // Upload to Google Drive
    const driveResult = await uploadPhoto({
      imageBuffer,
      filename,
      building,
      foundation,
      category: subCategory // 🔥 For backward compatibility with uploadPhoto function
    });
    
    console.log('Drive upload successful:', driveResult.fileId);
    
    // Log to Google Sheets
    const photoData = {
      building,
      foundation,
      mainCategory,        // 🔥 NEW
      subCategory,         // 🔥 เปลี่ยนจาก category
      topic,
      filename: driveResult.filename,
      driveUrl: driveResult.driveUrl,
      location: location || '',
      dynamicFields: dynamicFields || null  // 🔥 NEW: ส่ง dynamic fields
    };
    
    const sheetResult = await logPhoto(photoData);
    
    console.log('Sheet logging successful:', sheetResult.uniqueId);
    
    res.json({ 
      success: true, 
      data: {
        ...driveResult,
        sheetTimestamp: sheetResult,
        mainCategory: mainCategory,        // 🔥 NEW
        subCategory: subCategory,          // 🔥 NEW
        dynamicFields: dynamicFields || null
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

// 🔥 UPDATED: Upload photo with file - with proper error handling (รองรับ MainCategory + SubCategory)
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
      
      const { building, foundation, mainCategory, subCategory, topic, location, dynamicFields } = req.body; // 🔥 เพิ่ม mainCategory
      
      if (!building || !foundation || !mainCategory || !subCategory || !topic) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: building, foundation, mainCategory, subCategory, topic'
        });
      }
      
      console.log(`Processing upload for: ${building}-${foundation}-${mainCategory}/${subCategory}-${topic}`);
      
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${mainCategory}-${building}-${foundation}-${topic}-${timestamp}.jpg`;
      
      console.log(`Generated filename: ${filename}`);
      
      // Upload to Google Drive
      const driveResult = await uploadPhoto({
        imageBuffer: req.file.buffer,
        filename,
        building,
        foundation,
        category: subCategory // 🔥 For backward compatibility
      });
      
      console.log('Drive upload successful:', driveResult.fileId);
      
      // Log to Google Sheets
      const photoData = {
        building,
        foundation,
        mainCategory,        // 🔥 NEW
        subCategory,         // 🔥 เปลี่ยนจาก category
        topic,
        filename: driveResult.filename,
        driveUrl: driveResult.driveUrl,
        location: location || '',
        dynamicFields: dynamicFields || null  // 🔥 NEW: ส่ง dynamic fields
      };      
      
      const sheetResult = await logPhoto(photoData);
      
      console.log('Sheet logging successful:', sheetResult.uniqueId);
      
      res.json({ 
        success: true, 
        data: {
          ...driveResult,
          sheetTimestamp: sheetResult,
          mainCategory: mainCategory,        // 🔥 NEW
          subCategory: subCategory           // 🔥 NEW
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

// 🔥 UPDATED: Full Match completed topics (รองรับ MainCategory + SubCategory)
app.post("/completed-topics-full-match", async (req, res) => {
  try {
    const { building, foundation, mainCategory, subCategory, dynamicFields } = req.body; // 🔥 เพิ่ม mainCategory
    
    if (!building || !foundation || !mainCategory || !subCategory) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation, mainCategory, subCategory'
      });
    }
    
    console.log(`Getting completed topics with Full Match: ${building}-${foundation}-${mainCategory}/${subCategory}`);
    console.log('Dynamic fields:', dynamicFields);
    
    const result = await getCompletedTopicsFullMatch({ 
      building, 
      foundation, 
      mainCategory,    // 🔥 NEW
      subCategory,     // 🔥 เปลี่ยนจาก category
      dynamicFields 
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting completed topics with Full Match:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 UPDATED: Get field values for datalist (รองรับ subCategory)
app.get("/field-values/:fieldName/:subCategory", async (req, res) => {
  try {
    const { fieldName, subCategory } = req.params; // 🔥 เปลี่ยนจาก category เป็น subCategory
    
    console.log(`Getting field values: ${fieldName} for ${subCategory}`);
    
    const values = await getFieldValues(decodeURIComponent(fieldName), decodeURIComponent(subCategory));
    
    res.json({ success: true, data: values });
    
  } catch (error) {
    console.error('Error getting field values:', error);
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