// ไฟล์สมบูรณ์ที่แก้ไขแล้ว - optimized-puppeteer-generator.js

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { getDriveClient } = require('./google-auth');
const { getSheetsClient } = require('./google-auth'); // ✅ เก็บแค่นี้
const { Readable } = require('stream');

// 🔥 Import เฉพาะ isFullMatch จาก sheets.js
const { isFullMatch } = require('../api/sheets');

const SHEETS_ID = '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';

// Cache browser instance เพื่อลด cold start
let browserInstance = null;

// เตรียม Chromium สำหรับ Firebase Functions
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    console.log('♻️ Reusing existing browser instance');
    return browserInstance;
  }

  console.log('🚀 Launching new browser instance...');
  
  try {
    // ปิด browser เก่าถ้ามี
    if (browserInstance) {
      await browserInstance.close().catch(() => {});
      browserInstance = null;
    }

    browserInstance = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
      timeout: 60000
    });

    console.log('✅ Browser launched successfully');
    return browserInstance;
  } catch (error) {
    console.error('❌ Browser launch failed:', error);
    throw error;
  }
}

// 🔥 NEW: ฟังก์ชันดึงลำดับหัวข้อ QC จาก Google Sheets
async function getQCTopicsOrder(category) {
  try {
    console.log(`🔍 Getting QC topics order for category: ${category}`);
    
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'หัวข้อการตรวจ QC!A:B',
    });
    
    const rows = response.data.values || [];
    const orderedTopics = [];
    
    // กรองเฉพาะหัวข้อของหมวดงานที่ต้องการ และเรียงตามลำดับในชีท
    rows.slice(1).forEach(row => { // skip header
      if (row[0] && row[1]) {
        const rowCategory = row[0].trim();
        const topic = row[1].trim();
        
        if (rowCategory === category) {
          orderedTopics.push(topic);
        }
      }
    });
    
    console.log(`📋 Found ${orderedTopics.length} ordered topics for ${category}:`, orderedTopics);
    return orderedTopics;
    
  } catch (error) {
    console.error('❌ Error getting QC topics order:', error);
    return []; // fallback เป็น array ว่าง
  }
}

// 🔥 NEW: ฟังก์ชันสร้าง Full Layout รูปตามหัวข้อที่กำหนด (รวม placeholder)
async function createFullLayoutPhotos(photos, category) {
  try {
    console.log(`🔄 Creating full layout for ${photos.length} photos in category: ${category}`);
    
    // ดึงลำดับหัวข้อที่ถูกต้องจาก Google Sheets
    const orderedTopics = await getQCTopicsOrder(category);
    
    if (orderedTopics.length === 0) {
      console.log('⚠️ No ordered topics found, using original photo order');
      return photos;
    }
    
    // สร้าง Map เพื่อจัดกลุ่มรูปตามหัวข้อ
    const photosByTopic = new Map();
    photos.forEach(photo => {
      if (!photosByTopic.has(photo.topic)) {
        photosByTopic.set(photo.topic, []);
      }
      photosByTopic.get(photo.topic).push(photo);
    });
    
    console.log(`📸 Photos grouped by topics:`, Array.from(photosByTopic.keys()));
    
    // สร้าง Full Layout โดยเพิ่ม placeholder สำหรับหัวข้อที่ยังไม่ได้ถ่าย
    const fullLayoutPhotos = [];
    orderedTopics.forEach((topic, index) => {
      const topicPhotos = photosByTopic.get(topic) || [];
      
      if (topicPhotos.length > 0) {
        // มีรูปสำหรับหัวข้อนี้
        console.log(`📌 Topic ${index + 1}: "${topic}" has ${topicPhotos.length} photo(s)`);
        
        topicPhotos.forEach(photo => {
          photo.topicOrder = index + 1;
          photo.originalTopic = photo.topic;
          fullLayoutPhotos.push(photo);
        });
      } else {
        // ไม่มีรูป - สร้าง placeholder
        console.log(`🔳 Topic ${index + 1}: "${topic}" - creating placeholder`);
        
        const placeholder = {
          topic: topic, // ใช้ชื่อหัวข้อจริงจาก Google Sheets
          topicOrder: index + 1,
          imageBase64: null, // ไม่มีรูป
          isPlaceholder: true, // flag เพื่อระบุว่าเป็น placeholder
          originalTopic: topic
        };
        
        fullLayoutPhotos.push(placeholder);
      }
    });
    
    console.log(`✅ Created full layout: ${fullLayoutPhotos.length} items (photos + placeholders)`);
    console.log(`📝 Full layout: ${fullLayoutPhotos.map(p => `${p.topicOrder}.${p.topic}${p.isPlaceholder ? ' (placeholder)' : ''}`).join(', ')}`);
    
    return fullLayoutPhotos;
    
  } catch (error) {
    console.error('❌ Error creating full layout:', error);
    console.log('🔄 Fallback: using original photo order');
    return photos; // fallback ใช้ลำดับเดิม
  }
}

// 🔥 UPDATED: สร้าง HTML Template สำหรับรายงาน QC (รองรับ dynamic fields)
function createOptimizedHTML(reportData) {
  const { photos, projectName, category, dynamicFields, building, foundation } = reportData;
  
  // แบ่งหน้าปกติ (6 รูปต่อหน้า) แต่ไม่เติมช่องว่าง
  const photosPerPage = 6;
  const pages = [];
  
  for (let i = 0; i < photos.length; i += photosPerPage) {
    const pagePhotos = photos.slice(i, i + photosPerPage);
    // ลบการเติมช่องว่าง - แสดงเฉพาะรูปที่มี
    pages.push(pagePhotos);
  }

  const pageHTML = pages.map((pagePhotos, pageIndex) => `
    <div class="page" ${pageIndex < pages.length - 1 ? 'style="page-break-after: always;"' : ''}>
      ${createDynamicHeader(reportData, pageIndex + 1, pages.length)}
      ${createPhotosGrid(pagePhotos, pageIndex)}
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>รายงานการตรวจสอบ QC</title>
      ${getInlineCSS()}
    </head>
    <body>
      ${pageHTML}
    </body>
    </html>
  `;
}

// 🔥 NEW: Dynamic Header component (รองรับ 2-4 fields)
function createDynamicHeader(reportData, pageNumber, totalPages) {
  const { category, dynamicFields, building, foundation, projectName } = reportData;
  const currentDate = getCurrentThaiDate();
  
  // 🔥 ใช้ dynamic fields ถ้ามี, ไม่งั้นใช้ building+foundation (backward compatibility)
  const fieldsToDisplay = dynamicFields && Object.keys(dynamicFields).length > 0 
    ? dynamicFields 
    : { 'อาคาร': building || '', 'ฐานรากเบอร์': foundation || '' };
  
  const fieldCount = Object.keys(fieldsToDisplay).length;
  
  console.log(`📋 Creating header with ${fieldCount} fields:`, fieldsToDisplay);
  
  // เลือก layout ตามจำนวน fields
  if (fieldCount <= 2) {
    return create2FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages);
  } else if (fieldCount === 3) {
    return create3FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages);
  } else {
    return create4FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages);
  }
}

// 🔥 NEW: Header layout สำหรับ 2 fields (เดิม - ฐานราก)
function create2FieldHeader(fields, category, projectName, currentDate, pageNumber, totalPages) {
  const fieldEntries = Object.entries(fields).filter(([key, value]) => value && value.trim());
  
  return `
    <header class="header">
      <div class="logo-section">
        <div class="logo-central-pattana">
          <span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span>
        </div>
      </div>
      
      <div class="header-box">
        <div class="title-section">
          <h1>รูปถ่ายประกอบการตรวจสอบ</h1>
        </div>
        
        <div class="info-section">
          <div class="info-column info-left">
            <div class="info-item">
              <span class="label">โครงการ:</span>
              <span class="value">${projectName}</span>
            </div>
            ${fieldEntries[0] ? `
            <div class="info-item">
              <span class="label">${fieldEntries[0][0]}:</span>
              <span class="value">${fieldEntries[0][1]}</span>
            </div>
            ` : ''}
            <div class="info-item">
              <span class="label">หมวดงาน:</span>
              <span class="value">${category}</span>
            </div>
          </div>
          
          <div class="info-column info-right">
            <div class="info-item">
              <span class="label">วันที่:</span>
              <span class="value">${currentDate}</span>
            </div>
            ${fieldEntries[1] ? `
            <div class="info-item">
              <span class="label">${fieldEntries[1][0]}:</span>
              <span class="value">${fieldEntries[1][1]}</span>
            </div>
            ` : ''}
            <div class="info-item">
              <span class="label">แผ่นที่:</span>
              <span class="value">${pageNumber}/${totalPages}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
}

// 🔥 NEW: Header layout สำหรับ 3 fields
function create3FieldHeader(fields, category, projectName, currentDate, pageNumber, totalPages) {
  const fieldEntries = Object.entries(fields).filter(([key, value]) => value && value.trim());
  
  return `
    <header class="header">
      <div class="logo-section">
        <div class="logo-central-pattana">
          <span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span>
        </div>
      </div>
      
      <div class="header-box">
        <div class="title-section">
          <h1>รูปถ่ายประกอบการตรวจสอบ</h1>
        </div>
        
        <div class="info-section">
          <div class="info-grid-3">
            <div class="info-item">
              <span class="label">โครงการ:</span>
              <span class="value">${projectName}</span>
            </div>
            <div class="info-item">
              <span class="label">วันที่:</span>
              <span class="value">${currentDate}</span>
            </div>
            <div class="info-item">
              <span class="label">หมวดงาน:</span>
              <span class="value">${category}</span>
            </div>
            ${fieldEntries.map(([key, value]) => `
              <div class="info-item">
                <span class="label">${key}:</span>
                <span class="value">${value}</span>
              </div>
            `).join('')}
            <div class="info-item">
              <span class="label">แผ่นที่:</span>
              <span class="value">${pageNumber}/${totalPages}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
}

// 🔥 NEW: Header layout สำหรับ 4 fields
function create4FieldHeader(fields, category, projectName, currentDate, pageNumber, totalPages) {
  const fieldEntries = Object.entries(fields).filter(([key, value]) => value && value.trim());
  
  return `
    <header class="header">
      <div class="logo-section">
        <div class="logo-central-pattana">
          <span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span>
        </div>
      </div>
      
      <div class="header-box">
        <div class="title-section">
          <h1>รูปถ่ายประกอบการตรวจสอบ</h1>
        </div>
        
        <div class="info-section">
          <div class="info-grid-4">
            <div class="info-item">
              <span class="label">โครงการ:</span>
              <span class="value">${projectName}</span>
            </div>
            <div class="info-item">
              <span class="label">วันที่:</span>
              <span class="value">${currentDate}</span>
            </div>
            ${fieldEntries.map(([key, value]) => `
              <div class="info-item">
                <span class="label">${key}:</span>
                <span class="value">${value}</span>
              </div>
            `).join('')}
            <div class="info-item">
              <span class="label">หมวดงาน:</span>
              <span class="value">${category}</span>
            </div>
            <div class="info-item">
              <span class="label">แผ่นที่:</span>
              <span class="value">${pageNumber}/${totalPages}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
}

// 🔥 UPDATED: Photos Grid - แสดงชื่อหัวข้อจริงจาก Google Sheets
function createPhotosGrid(photos, pageIndex) {
  // คำนวณจำนวนแถวที่ต้องการ (2 รูปต่อแถว)
  const rowCount = Math.ceil(photos.length / 2);
  
  const rows = [];
  for (let i = 0; i < photos.length; i += 2) {
    rows.push(photos.slice(i, i + 2));
  }
  
  const rowsHTML = rows.map((rowPhotos, rowIndex) => {
    const photosHTML = rowPhotos.map((photo, photoIndex) => {
      const displayNumber = photo.topicOrder || 
        ((pageIndex * 6) + (rowIndex * 2) + photoIndex + 1);
      
      const topicName = photo.topic || `หัวข้อที่ ${displayNumber}`;
      
      return `
        <div class="photo-frame">
          <div class="photo-container">
            ${photo.imageBase64 ? 
              `<img src="data:image/jpeg;base64,${photo.imageBase64}" 
                   alt="${topicName}" 
                   class="photo-image">` :
              `<div class="photo-placeholder">
               </div>`
            }
          </div>
          <div class="photo-caption">
            <span class="photo-number">${displayNumber}.</span>
            <span class="photo-title">${topicName}</span>
          </div>
        </div>
      `;
    }).join('');
    
    return `<div class="photo-row">${photosHTML}</div>`;
  }).join('');

  return `
    <main class="photos-grid">
      ${rowsHTML}
    </main>
  `;
}

// 🔥 UPDATED: Inline CSS สำหรับ multi-field layouts
function getInlineCSS() {
  return `
    <style>
      @page {
        size: A4;
        margin: 10mm;
      }
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      html, body {
        width: 100%;
        height: 100%;
        font-family: 'Times New Roman', Times, serif;
        font-size: 12px;
        line-height: 1.4;
        color: #333;
        background: white;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      
      .page {
        width: 100%;
        height: 100vh;
        background: white;
        padding: 12px;
        position: relative;
        display: flex;
        flex-direction: column;
      }
      
      /* Header Styles - ไม่เปลี่ยน */
      .header {
        margin-bottom: 10px;
        flex-shrink: 0;
      }
      
      .logo-section {
        text-align: right;
        margin-bottom: 8px;
      }
      
      .logo-central-pattana {
        font-family: Arial, sans-serif;
        font-size: 16px;
        font-weight: bold;
        letter-spacing: 1px;
      }
      
      .logo-central {
        color: #000;
      }
      
      .logo-pattana {
        color: #C5A572;
      }
      
      .header-box {
        border: 2px solid #000;
        border-radius: 0;
        background: white;
        width: 100%;
      }
      
      .title-section {
        background: #fff;
        padding: 10px;
        text-align: center;
        border-bottom: 1px solid #000;
      }
      
      .title-section h1 {
        font-size: 18px;
        font-weight: bold;
        color: #000;
        margin: 0;
        font-family: 'Times New Roman', Times, serif;
      }
      
      .info-section {
        display: table;
        width: 100%;
        padding: 8px;
        background: #fff;
        min-height: 60px;
      }
      
      /* 2-column layout */
      .info-column {
        display: table-cell;
        width: 50%;
        vertical-align: top;
        padding: 0 8px;
      }
      
      .info-right {
        border-left: 1px solid #ddd;
      }
      
      /* 3-field grid layout */
      .info-grid-3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: 4px;
        padding: 8px;
        min-height: 60px;
      }
      
      /* 4-field grid layout */
      .info-grid-4 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr;
        gap: 3px;
        padding: 6px;
        min-height: 70px;
      }
      
      .info-item {
        margin-bottom: 4px;
        font-size: 10px;
        line-height: 1.2;
        font-family: 'Times New Roman', Times, serif;
        display: flex;
        align-items: center;
      }
      
      .info-grid-3 .info-item,
      .info-grid-4 .info-item {
        font-size: 9px;
        margin-bottom: 2px;
      }
      
      .label {
        font-weight: bold;
        color: #000;
        display: inline-block;
        min-width: 50px;
        flex-shrink: 0;
      }
      
      .info-grid-3 .label,
      .info-grid-4 .label {
        min-width: 40px;
        font-size: 9px;
      }
      
      .value {
        color: #333;
        margin-left: 4px;
        word-wrap: break-word;
        flex: 1;
      }
      
      /* Photos Grid - คืนขนาดเดิม ไม่ลดรูป */
      .photos-grid {
        width: 100%;
        overflow: hidden;
        flex: 1;
        display: flex;
        flex-direction: column;
        margin-top: 5px;
      }
      
      .photo-row {
        display: flex;
        height: 250px;  
        margin-bottom: 5px;
        /* 🔥 เพิ่มบรรทัดนี้เพื่อให้รูปชิดซ้ายเสมอ */
        justify-content: flex-start; 
      }
            
      .photo-row:last-child {
        margin-bottom: 0;
      }

      .photo-frame {
        flex: 1;
        display: flex;
        flex-direction: column;
        margin: 0 3px;
        /* 🔥 เพิ่มขนาดสูงสุดเพื่อป้องกันการขยายเกินไป */
        max-width: 50%;
      }
      
      .photo-frame:first-child {
        margin-left: 0;
      }

      .photo-frame:last-child {
        margin-right: 0;
      }

      /* 🔥 เพิ่ม CSS สำหรับแถวที่มีรูปเดียว */
      .photo-row .photo-frame:only-child {
        flex: 0 0 50%; /* ให้กว้าง 50% แทนที่จะขยายเต็มแถว */
        max-width: 50%;
      }
      
      /* คืนขนาดรูปเดิม */
      .photo-container {
        flex: 1;  /* คืนค่าเดิม - ให้รูปขยายเต็มพื้นที่ */
        background: white;
        text-align: center;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
      }
      
      .photo-image {
        max-width: 95%;
        max-height: 95%;
        width: auto;
        height: auto;
        object-fit: contain;
      }
      
      .photo-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f0f0f0;
        color: #999;
        font-style: italic;
        font-family: 'Times New Roman', Times, serif;
      }
      
      .placeholder-text {
        font-size: 10px;
      }
      
      .photo-caption {
        background: white;
        text-align: center;
        font-size: 9px;
        line-height: 1.2;
        font-family: 'Times New Roman', Times, serif;
        padding: 3px 2px;
        min-height: 35px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      
      .photo-number {
        font-weight: bold;
        color: #000;
        margin-right: 3px;
      }
      
      .photo-title {
        color: #333;
        word-wrap: break-word;
        text-align: center;
      }
      
      /* Print Optimization */
      @media print {
        .page {
          page-break-after: always;
          margin: 0;
          padding: 12px;
          height: 100vh;
        }
        
        .page:last-child {
          page-break-after: avoid;
        }
        
        .photo-image {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
      }
    </style>
  `;
}

async function getLatestPhotosForReport(reportCriteria) {
  try {
    console.log('🔍 Getting latest photos for report with criteria:', reportCriteria);
    
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:J'
    });
    
    const rows = response.data.values || [];
    const photosByTopic = new Map();
    
    // ประมวลผลแต่ละ row
    rows.slice(1).forEach((row, rowIndex) => {
      if (row.length >= 6) {
        const [id, timestamp, building, foundation, category, topic, filename, driveUrl, location, dynamicFieldsJSON] = row;
        
        // สร้าง rowData สำหรับ Full Match check
        const rowData = {
          building: building,
          foundation: foundation,
          category: category,
          dynamicFieldsJSON: dynamicFieldsJSON
        };
        
        // ✅ ใช้ Full Match เพื่อความแม่นยำ
        if (isFullMatch(reportCriteria, rowData)) {
          
          const photoData = {
            topic: topic,
            timestamp: timestamp,
            filename: filename,
            driveUrl: driveUrl,
            location: location || '',
            imageBase64: null,
            id: id,
            rowIndex: rowIndex + 2 // เก็บ row index สำหรับ debug
          };
          
          // 🔥 ปรับปรุงการจัดการรูปซ้ำ
          if (!photosByTopic.has(topic)) {
            console.log(`➕ First photo for topic "${topic}": ${timestamp}`);
            photosByTopic.set(topic, photoData);
          } else {
            const existing = photosByTopic.get(topic);
            const shouldReplace = isNewerPhoto(photoData, existing);
            
            if (shouldReplace) {
              console.log(`🔄 Replacing photo for topic "${topic}":`, {
                old: `${existing.timestamp} (row ${existing.rowIndex})`,
                new: `${timestamp} (row ${photoData.rowIndex})`
              });
              photosByTopic.set(topic, photoData);
            } else {
              console.log(`⏩ Keeping existing photo for topic "${topic}":`, {
                keeping: `${existing.timestamp} (row ${existing.rowIndex})`,
                skipping: `${timestamp} (row ${photoData.rowIndex})`
              });
            }
          }
        }
      }
    });
    
    const latestPhotos = Array.from(photosByTopic.values());
    console.log(`✅ Found ${latestPhotos.length} latest photos for report`);
    
    // 📊 แสดงสรุปรูปที่เลือก
    latestPhotos.forEach((photo, index) => {
      console.log(`📷 ${index + 1}. "${photo.topic}" - ${photo.timestamp} (row ${photo.rowIndex})`);
    });
    
    // โหลดรูปจาก Google Drive
    const photosWithImages = await loadImagesFromDrive(latestPhotos);
    
    return photosWithImages;
    
  } catch (error) {
    console.error('❌ Error getting latest photos for report:', error);
    return [];
  }
}

function isNewerPhoto(newPhoto, existingPhoto) {
  try {
    // 1. เปรียบเทียบ timestamp
    const newTime = parseTimestamp(newPhoto.timestamp);
    const existingTime = parseTimestamp(existingPhoto.timestamp);
    
    // ถ้าทั้งคู่ parse ได้
    if (newTime.isValid && existingTime.isValid) {
      if (newTime.date.getTime() !== existingTime.date.getTime()) {
        return newTime.date > existingTime.date;
      }
      console.log(`⚠️ Same timestamp detected for "${newPhoto.topic}": ${newPhoto.timestamp}`);
    }
    
    // 2. Fallback: เปรียบเทียบ row index (รูปที่อยู่ล่างกว่าใน sheet น่าจะใหม่กว่า)
    if (newPhoto.rowIndex && existingPhoto.rowIndex) {
      console.log(`🔢 Using row index fallback: new=${newPhoto.rowIndex} vs existing=${existingPhoto.rowIndex}`);
      return newPhoto.rowIndex > existingPhoto.rowIndex;
    }
    
    // 3. Fallback: เปรียบเทียบ ID (ถ้า ID เป็นตัวเลข)
    const newId = parseInt(newPhoto.id);
    const existingId = parseInt(existingPhoto.id);
    if (!isNaN(newId) && !isNaN(existingId)) {
      console.log(`🆔 Using ID fallback: new=${newId} vs existing=${existingId}`);
      return newId > existingId;
    }
    
    // 4. Fallback สุดท้าย: เปรียบเทียบ filename
    console.log(`📁 Using filename fallback: comparing "${newPhoto.filename}" vs "${existingPhoto.filename}"`);
    return newPhoto.filename > existingPhoto.filename;
    
  } catch (error) {
    console.error('❌ Error comparing photos:', error);
    // ถ้า error ให้เก็บรูปเก่าไว้
    return false;
  }
}

function parseTimestamp(timestamp) {
  if (!timestamp) {
    return { isValid: false, date: null, error: 'Empty timestamp' };
  }
  
  try {
    // ลองหลายรูปแบบ timestamp ที่เป็นไปได้
    const formats = [
      // ISO format
      () => new Date(timestamp),
      // Thai format: DD/MM/YYYY HH:MM:SS
      () => {
        const match = timestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (match) {
          const [, day, month, year, hour, minute, second] = match;
          return new Date(year, month - 1, day, hour, minute, second);
        }
        return null;
      },
      // Google Sheets timestamp format
      () => {
        if (typeof timestamp === 'number') {
          // Excel/Google Sheets serial date
          return new Date((timestamp - 25569) * 86400 * 1000);
        }
        return null;
      }
    ];
    
    for (const formatFn of formats) {
      const date = formatFn();
      if (date && !isNaN(date.getTime())) {
        return { 
          isValid: true, 
          date: date, 
          format: formatFn.name || 'unknown' 
        };
      }
    }
    
    return { 
      isValid: false, 
      date: null, 
      error: `Cannot parse timestamp: ${timestamp}` 
    };
    
  } catch (error) {
    return { 
      isValid: false, 
      date: null, 
      error: `Parse error: ${error.message}` 
    };
  }
}

async function debugPhotoSelection(reportCriteria) {
  try {
    console.log('🐛 === DEBUG: Photo Selection Process ===');
    console.log('Search criteria:', reportCriteria);
    
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:J'
    });
    
    const rows = response.data.values || [];
    const matchingRows = [];
    
    // หาทุก row ที่ match
    rows.slice(1).forEach((row, rowIndex) => {
      if (row.length >= 6) {
        const [id, timestamp, building, foundation, category, topic, filename, driveUrl, location, dynamicFieldsJSON] = row;
        
        const rowData = {
          building: building,
          foundation: foundation,
          category: category,
          dynamicFieldsJSON: dynamicFieldsJSON
        };
        
        if (isFullMatch(reportCriteria, rowData)) {
          matchingRows.push({
            rowIndex: rowIndex + 2,
            id, timestamp, building, foundation, category, topic, filename,
            parsedTime: parseTimestamp(timestamp)
          });
        }
      }
    });
    
    console.log(`🔍 Found ${matchingRows.length} matching rows:`);
    
    // จัดกลุ่มตาม topic
    const byTopic = {};
    matchingRows.forEach(row => {
      if (!byTopic[row.topic]) {
        byTopic[row.topic] = [];
      }
      byTopic[row.topic].push(row);
    });
    
    // แสดงผลการจัดกลุ่ม
    Object.entries(byTopic).forEach(([topic, photos]) => {
      console.log(`\n📸 Topic: "${topic}" (${photos.length} photos)`);
      photos.forEach((photo, index) => {
        console.log(`  ${index + 1}. Row ${photo.rowIndex}: ${photo.timestamp} (${photo.parsedTime.isValid ? 'valid' : 'invalid'}) - ${photo.filename}`);
      });
      
      if (photos.length > 1) {
        // แสดงการเลือกรูปล่าสุด
        let selected = photos[0];
        for (let i = 1; i < photos.length; i++) {
          if (isNewerPhoto(photos[i], selected)) {
            selected = photos[i];
          }
        }
        console.log(`  ✅ Selected: Row ${selected.rowIndex} - ${selected.timestamp}`);
      }
    });
    
    return byTopic;
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    return {};
  }
}

async function loadImagesFromDrive(photos) {
  if (!photos || photos.length === 0) {
    console.log('⚠️ No photos to load');
    return photos;
  }
  
  console.log(`📥 Loading ${photos.length} images from Google Drive...`);
  const drive = getDriveClient();
  
  const photosWithImages = [];
  
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    console.log(`📷 Loading image ${i + 1}/${photos.length}: ${photo.topic}`);
    
    try {
      // Extract file ID from Drive URL
      let fileId = null;
      
      if (photo.driveUrl) {
        // Handle different Google Drive URL formats
        const urlMatch = photo.driveUrl.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
        if (urlMatch) {
          fileId = urlMatch[1];
        } else {
          // Try alternative format
          const idMatch = photo.driveUrl.match(/id=([a-zA-Z0-9-_]+)/);
          if (idMatch) {
            fileId = idMatch[1];
          }
        }
      }
      
      if (!fileId) {
        console.log(`⚠️ Cannot extract file ID from URL: ${photo.driveUrl}`);
        photosWithImages.push({
          ...photo,
          imageBase64: null,
          loadError: 'Invalid Drive URL'
        });
        continue;
      }
      
      console.log(`📁 Downloading file ID: ${fileId}`);
      
      // Download file from Google Drive
      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media',
        supportsAllDrives: true
      }, { responseType: 'arraybuffer' });
      
      // Convert to base64
      const buffer = Buffer.from(response.data);
      const base64 = buffer.toString('base64');
      
      console.log(`✅ Image loaded for "${photo.topic}": ${base64.length} chars`);
      
      photosWithImages.push({
        ...photo,
        imageBase64: base64,
        loadError: null
      });
      
    } catch (error) {
      console.error(`❌ Error loading image for "${photo.topic}":`, error.message);
      
      photosWithImages.push({
        ...photo,
        imageBase64: null,
        loadError: error.message
      });
    }
  }
  
  const successCount = photosWithImages.filter(p => p.imageBase64).length;
  const failCount = photosWithImages.filter(p => !p.imageBase64).length;
  
  console.log(`📊 Image loading results: ${successCount} success, ${failCount} failed`);
  
  return photosWithImages;
}

// 🔥 NEW: ฟังก์ชันทดสอบการเข้าถึง Google Drive
async function testDriveAccess() {
  try {
    console.log('🔍 Testing Google Drive access...');
    
    const drive = getDriveClient();
    
    // Test basic access
    const aboutResponse = await drive.about.get({
      fields: 'user,storageQuota',
      supportsAllDrives: true
    });
    
    console.log('✅ Drive access successful:');
    console.log('- User:', aboutResponse.data.user?.emailAddress);
    console.log('- Storage:', aboutResponse.data.storageQuota);
    
    // Test listing files in target folder
    const FOLDER_ID = '1abU3Kp24IjOyu6wMxQ-TFcoPirhoum2o';
    
    const filesResponse = await drive.files.list({
      q: `'${FOLDER_ID}' in parents`,
      fields: 'files(id, name, mimeType, size)',
      pageSize: 5,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    
    console.log('📁 Sample files in folder:');
    filesResponse.data.files?.forEach((file, index) => {
      console.log(`${index + 1}. ${file.name} (${file.mimeType}) - ${file.size} bytes`);
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ Drive access test failed:', error);
    return false;
  }
}

// 🔥 UPDATED: generateOptimizedPDF with better error handling
async function generateOptimizedPDF(reportData) {
  let browser = null;
  let page = null;
  
  try {
    console.log('🎯 Starting Optimized PDF generation with LATEST PHOTOS only...');
    
    // 🔥 Test Drive access first
    const driveAccessOk = await testDriveAccess();
    if (!driveAccessOk) {
      console.log('⚠️ Drive access issues detected, continuing anyway...');
    }
    
    console.log(`📊 Report data:`, {
      category: reportData.category,
      dynamicFields: reportData.dynamicFields,
      useFullMatch: reportData.useFullMatch
    });
    
    // 🔥 ใช้ getLatestPhotosForReport แทน getPhotosForReport
    const latestPhotos = await getLatestPhotosForReport({
      building: reportData.building,
      foundation: reportData.foundation,
      category: reportData.category,
      dynamicFields: reportData.dynamicFields
    });
    
    console.log(`✅ Using LATEST photos only: ${latestPhotos.length} photos`);
    
    // Log photo details
    latestPhotos.forEach((photo, index) => {
      console.log(`📷 Photo ${index + 1}: "${photo.topic}" - ${photo.imageBase64 ? 'Image loaded' : 'No image'}`);
    });
    
    // 🔥 สร้าง Full Layout รวมทั้งรูปที่ถ่ายและ placeholder
    const fullLayoutPhotos = await createFullLayoutPhotos(latestPhotos, reportData.category);
    
    // ใช้ fullLayoutPhotos แทน reportData.photos
    const updatedReportData = {
      ...reportData,
      photos: fullLayoutPhotos
    };
    
    console.log(`✅ Using full layout: ${fullLayoutPhotos.length} items (latest photos + placeholders)`);
    
    const html = createOptimizedHTML(updatedReportData);
    console.log('📄 HTML template created with latest photos only');
    
    browser = await getBrowser();
    page = await browser.newPage();
    
    // ตั้งค่า viewport และ performance
    await page.setViewport({ 
      width: 1200, 
      height: 800, 
      deviceScaleFactor: 2  // สำหรับ high-DPI
    });
    
    // ปิด JavaScript และ animations เพื่อประสิทธิภาพ
    await page.setJavaScriptEnabled(false);
    
    // โหลด HTML พร้อม timeout ที่เหมาะสม
    await page.setContent(html, { 
      waitUntil: ['domcontentloaded'],
      timeout: 45000
    });
    
    console.log('🌐 HTML content loaded');
    
    // รอให้รูปโหลดเสร็จ (ถ้ามี)
    await page.waitForTimeout(2000);
    
    // สร้าง PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '12mm',
        right: '12mm',
        bottom: '12mm',
        left: '12mm'
      },
      timeout: 60000
    });
    
    console.log(`✅ Optimized PDF generated with LATEST PHOTOS only! Size: ${pdfBuffer.length} bytes`);
    
    // ปิด page แต่เก็บ browser ไว้ reuse
    await page.close();
    
    return pdfBuffer;
    
  } catch (error) {
    console.error('❌ Error in Optimized PDF generation:', error);
    
    // Cleanup
    if (page) {
      try { await page.close(); } catch (e) {}
    }
    
    throw error;
  }
}


// อัปโหลด PDF ไป Google Drive
async function uploadPDFToDrive(pdfBuffer, filename) {
  try {
    const stream = new Readable();
    stream.push(pdfBuffer);
    stream.push(null);
    
    const drive = getDriveClient();
    const FOLDER_ID = '1abU3Kp24IjOyu6wMxQ-TFcoPirhoum2o';
    
    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [FOLDER_ID],
        description: 'QC Report PDF - Generated with Dynamic Fields Support'
      },
      media: {
        mimeType: 'application/pdf',
        body: stream
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink, webContentLink'
    });
    
    console.log(`🚀 Dynamic PDF uploaded: ${response.data.id}`);
    
    return {
      fileId: response.data.id,
      filename: response.data.name,
      viewLink: response.data.webViewLink,
      downloadLink: response.data.webContentLink,
      driveUrl: `https://drive.google.com/file/d/${response.data.id}/view`
    };
    
  } catch (error) {
    console.error('❌ Error uploading PDF:', error);
    throw error;
  }
}

// Cleanup function สำหรับเมื่อ function shutdown
async function cleanup() {
  if (browserInstance) {
    try {
      await browserInstance.close();
      browserInstance = null;
      console.log('🧹 Browser cleaned up');
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  }
}

// วันที่ไทย
function getCurrentThaiDate() {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear() + 543;
  
  return `${day}/${month}/${year}`;
}

// Handle process termination
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

module.exports = {
  generateOptimizedPDF,
  uploadPDFToDrive,
  cleanup,
  getLatestPhotosForReport,
  createFullLayoutPhotos,
  getQCTopicsOrder,
  createDynamicHeader,
  create2FieldHeader,  
  create3FieldHeader,  
  create4FieldHeader,
  
  // 🔥 ฟังก์ชันใหม่
  isNewerPhoto,
  parseTimestamp,
  debugPhotoSelection
};