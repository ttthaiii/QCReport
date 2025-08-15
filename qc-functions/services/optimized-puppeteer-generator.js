// ไฟล์สมบูรณ์ที่แก้ไขแล้ว - optimized-puppeteer-generator.js

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { getDriveClient } = require('./google-auth');
const { Readable } = require('stream');

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

// สร้าง HTML Template สำหรับรายงาน QC
function createOptimizedHTML(reportData) {
  const { building, foundation, category, photos, projectName } = reportData;
  
  // สำหรับทุกหมวดงาน - แบ่งหน้าปกติ (6 รูปต่อหน้า)
  const photosPerPage = 6;
  const pages = [];
  
  for (let i = 0; i < photos.length; i += photosPerPage) {
    const pagePhotos = photos.slice(i, i + photosPerPage);
    
    // เติมช่องว่างให้ครบ 6 รูปต่อหน้า
    while (pagePhotos.length < photosPerPage) {
      pagePhotos.push({
        /*topic: `หัวข้อที่ ${i + pagePhotos.length + 1}`,*/
        imageBase64: null
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
function createHeader(building, foundation, category, projectName, pageNumber, totalPages, reportData = {}) {
  const currentDate = getCurrentThaiDate();
  const { dynamicFields, isDynamic } = reportData;
  
  // 🔥 Generate header content based on category type
  let leftColumnContent, rightColumnContent;
  
  if (isDynamic && dynamicFields) {
    // 🔥 DYNAMIC HEADER: For เสา, คาน, etc.
    const fieldEntries = Object.entries(dynamicFields);
    const totalFields = fieldEntries.length;
    const leftFields = fieldEntries.slice(0, Math.ceil(totalFields / 2));
    const rightFields = fieldEntries.slice(Math.ceil(totalFields / 2));
    
    leftColumnContent = `
      <div class="info-item">
        <span class="label">โครงการ:</span>
        <span class="value">${projectName}</span>
      </div>
      <div class="info-item">
        <span class="label">หมวดงาน:</span>
        <span class="value">${category}</span>
      </div>
      ${leftFields.map(([key, value]) => `
        <div class="info-item">
          <span class="label">${key}:</span>
          <span class="value">${value}</span>
        </div>
      `).join('')}
    `;
    
    rightColumnContent = `
      <div class="info-item">
        <span class="label">วันที่:</span>
        <span class="value">${currentDate}</span>
      </div>
      <div class="info-item">
        <span class="label">แผ่นที่:</span>
        <span class="value">${pageNumber}/${totalPages}</span>
      </div>
      ${rightFields.map(([key, value]) => `
        <div class="info-item">
          <span class="label">${key}:</span>
          <span class="value">${value}</span>
        </div>
      `).join('')}
    `;
  } else {
    // 🔥 LEGACY HEADER: For ฐานราก (NO CHANGES)
    leftColumnContent = `
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
    `;
    
    rightColumnContent = `
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
    `;
  }
  
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
            ${leftColumnContent}
          </div>
          
          <div class="info-column info-right">
            ${rightColumnContent}
          </div>
        </div>
      </div>
    </header>
  `;
}


// Photos Grid - แก้ไขให้หัวข้ออยู่ด้านล่างรูป
function createPhotosGrid(photos, pageIndex) {
  // แบ่งรูป 6 รูปเป็น 3 แถว แถวละ 2 รูป
  const rows = [];
  for (let i = 0; i < photos.length; i += 2) {
    rows.push(photos.slice(i, i + 2));
  }
  
  const rowsHTML = rows.map((rowPhotos, rowIndex) => {
    const photosHTML = rowPhotos.map((photo, photoIndex) => {
      const globalIndex = (pageIndex * 6) + (rowIndex * 2) + photoIndex + 1;
      
      return `
        <div class="photo-frame">
          <div class="photo-container">
            ${photo.imageBase64 ? 
              `<img src="data:image/jpeg;base64,${photo.imageBase64}" 
                   alt="${photo.topic}" 
                   class="photo-image">` :
              `<div class="photo-placeholder">
                 <span class="placeholder-text">ไม่พบรูปภาพ</span>
               </div>`
            }
          </div>
          <div class="photo-caption">
            <span class="photo-number">${globalIndex}.</span>
            <span class="photo-title">${photo.topic}</span>
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

// สร้าง PDF ด้วย Optimized Puppeteer
async function generateOptimizedPDF(reportData) {
  let browser = null;
  let page = null;
  
  try {
    console.log('🎯 Starting Optimized PDF generation...');
    
    const html = createOptimizedHTML(reportData);
    console.log('📄 HTML template created');
    
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
        description: 'QC Report PDF - Optimized Puppeteer Generated'
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
  cleanup
};