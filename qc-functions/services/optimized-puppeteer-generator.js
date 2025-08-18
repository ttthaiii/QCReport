// ไฟล์สมบูรณ์ที่แก้ไขแล้ว - optimized-puppeteer-generator.js

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { getDriveClient } = require('./google-auth');
const { getSheetsClient } = require('./google-auth'); // แก้ไข path ให้ถูกต้อง
const { Readable } = require('stream');

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

// สร้าง HTML Template สำหรับรายงาน QC
function createOptimizedHTML(reportData) {
  const { building, foundation, category, photos, projectName } = reportData;
  
  // สำหรับทุกหมวดงาน - แบ่งหน้าปกติ (6 รูปต่อหน้า)
  const photosPerPage = 6;
  const pages = [];
  
  for (let i = 0; i < photos.length; i += photosPerPage) {
    const pagePhotos = photos.slice(i, i + photosPerPage);
    
    // 🔥 ไม่ต้องเติม placeholder เพิ่ม เพราะ createFullLayoutPhotos ทำให้แล้ว
    // แค่ตรวจสอบว่าถ้าหน้านี้ไม่ครบ 6 ให้เติมช่องว่างเปล่า
    while (pagePhotos.length < photosPerPage) {
      pagePhotos.push({
        topic: '', // ช่องว่างเปล่า
        imageBase64: null,
        isEmpty: true // flag สำหรับช่องว่างเปล่า
      });
    }
    
    pages.push(pagePhotos);
  }

  const pageHTML = pages.map((pagePhotos, pageIndex) => `
    <div class="page" ${pageIndex < pages.length - 1 ? 'style="page-break-after: always;"' : ''}>
      ${createHeader(building, foundation, category, projectName, pageIndex + 1, pages.length)}
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

// Header component
function createHeader(building, foundation, category, projectName, pageNumber, totalPages) {
  const currentDate = getCurrentThaiDate();
  
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
            <div class="info-item">
              <span class="label">อาคาร:</span>
              <span class="value">${building}</span>
            </div>
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
            <div class="info-item">
              <span class="label">ฐานรากเบอร์:</span>
              <span class="value">${foundation}</span>
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
  // แบ่งรูป 6 รูปเป็น 3 แถว แถวละ 2 รูป
  const rows = [];
  for (let i = 0; i < photos.length; i += 2) {
    rows.push(photos.slice(i, i + 2));
  }
  
  const rowsHTML = rows.map((rowPhotos, rowIndex) => {
    const photosHTML = rowPhotos.map((photo, photoIndex) => {
      // 🔥 ตรวจสอบประเภทของ item
      if (photo.isEmpty) {
        // ช่องว่างเปล่า - ไม่แสดงอะไร
        return `
          <div class="photo-frame">
            <div class="photo-container">
              <div class="photo-placeholder"></div>
            </div>
            <div class="photo-caption">
              <span class="photo-title"></span>
            </div>
          </div>
        `;
      }
      
      // 🔥 ใช้ topicOrder ถ้ามี ไม่งั้นใช้ global index
      const displayNumber = photo.topicOrder || 
        ((pageIndex * 6) + (rowIndex * 2) + photoIndex + 1);
      
      // 🔥 แสดงชื่อหัวข้อจริงจาก Google Sheets
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

// Inline CSS สำหรับป้องกัน network requests
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
        height: 100vh; /* ใช้ความสูงเต็มหน้า */
        background: white;
        padding: 12px;
        position: relative;
        display: flex;
        flex-direction: column; /* จัดเรียงแนวตั้ง */
      }
      
      /* Header Styles */
      .header {
        margin-bottom: 10px; /* ลดระยะห่าง */
        flex-shrink: 0; /* ไม่ให้หด */
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
        padding: 10px; /* ลด padding */
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
        padding: 8px; /* ลด padding */
        background: #fff;
        min-height: 60px; /* ลดความสูง */
      }
      
      .info-column {
        display: table-cell;
        width: 50%;
        vertical-align: top;
        padding: 0 8px; /* ลด padding */
      }
      
      .info-right {
        border-left: 1px solid #ddd;
      }
      
      .info-item {
        margin-bottom: 5px; /* ลดระยะห่าง */
        font-size: 11px; /* ลดขนาดฟอนต์ */
        line-height: 1.2;
        font-family: 'Times New Roman', Times, serif;
      }
      
      .label {
        font-weight: bold;
        color: #000;
        display: inline-block;
        min-width: 70px; /* ลดความกว้าง */
      }
      
      .value {
        color: #333;
        margin-left: 5px;
        word-wrap: break-word;
      }
      
      /* Photos Grid - ขยายให้เต็มพื้นที่ */
      .photos-grid {
        width: 100%;
        overflow: hidden;
        flex: 1; /* ใช้พื้นที่ที่เหลือทั้งหมด */
        display: flex;
        flex-direction: column;
        margin-top: 5px; /* ลดระยะห่าง */
      }
      
      .photo-row {
        display: flex;
        flex: 1; /* แต่ละแถวใช้พื้นที่เท่าๆ กัน */
        margin-bottom: 5px; /* ระยะห่างระหว่างแถว */
      }
      
      .photo-row:last-child {
        margin-bottom: 0;
      }
      
      .photo-frame {
        flex: 1; /* ใช้พื้นที่เท่าๆ กัน */
        display: flex;
        flex-direction: column;
        margin: 0 3px; /* ระยะห่างระหว่างคอลัมน์ */
      }
      
      .photo-frame:first-child {
        margin-left: 0;
      }
      
      .photo-frame:last-child {
        margin-right: 0;
      }
      
      .photo-container {
        flex: 1; /* ใช้พื้นที่ส่วนใหญ่ */
        background: white; /* เปลี่ยนจากสีเทาเป็นสีขาว */
        text-align: center;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0; /* สำคัญสำหรับ flex */
      }
      
      .photo-image {
        max-width: 95%;
        max-height: 95%;
        width: auto;
        height: auto;
        object-fit: contain; /* รักษา aspect ratio */
      }
      
      .photo-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f0f0f0; /* เฉพาะ placeholder เท่านั้น */
        color: #999;
        font-style: italic;
        font-family: 'Times New Roman', Times, serif;
      }
      
      .placeholder-text {
        font-size: 11px;
      }
      
      .photo-caption {
        background: white;
        text-align: center;
        font-size: 10px; /* ลดขนาดฟอนต์ */
        line-height: 1.2;
        font-family: 'Times New Roman', Times, serif;
        padding: 4px 2px; /* ลด padding */
        min-height: 40px; /* ลดความสูง */
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0; /* ไม่ให้หด */
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

// 🔥 UPDATED: สร้าง PDF ด้วย Optimized Puppeteer + Full Layout
async function generateOptimizedPDF(reportData) {
  let browser = null;
  let page = null;
  
  try {
    console.log('🎯 Starting Optimized PDF generation...');
    console.log(`📊 Original photos: ${reportData.photos.length} for category: ${reportData.category}`);
    
    // 🔥 สร้าง Full Layout รวมทั้งรูปที่ถ่ายและ placeholder
    const fullLayoutPhotos = await createFullLayoutPhotos(reportData.photos, reportData.category);
    
    // ใช้ fullLayoutPhotos แทน reportData.photos
    const updatedReportData = {
      ...reportData,
      photos: fullLayoutPhotos
    };
    
    console.log(`✅ Using full layout: ${fullLayoutPhotos.length} items (photos + placeholders)`);
    
    const html = createOptimizedHTML(updatedReportData);
    console.log('📄 HTML template created with full layout');
    
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
    
    console.log(`✅ Optimized PDF generated! Size: ${pdfBuffer.length} bytes`);
    
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
        description: 'QC Report PDF - Optimized Puppeteer Generated with Topic Sorting'
      },
      media: {
        mimeType: 'application/pdf',
        body: stream
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink, webContentLink'
    });
    
    console.log(`🚀 Optimized PDF uploaded: ${response.data.id}`);
    
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
  // 🔥 Export ฟังก์ชันใหม่เพื่อให้ส่วนอื่นใช้ได้
  createFullLayoutPhotos,
  getQCTopicsOrder
};