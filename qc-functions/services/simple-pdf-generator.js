// แทนที่ไฟล์ qc-functions/services/simple-pdf-generator.js
// ใช้ HTML to PDF ที่รองรับภาษาไทยบน Firebase Functions

const puppeteer = require('puppeteer');
const { getDriveClient } = require('./google-auth');
const { Readable } = require('stream');

// สร้าง PDF ด้วย HTML to PDF (รองรับภาษาไทย 100%)
async function generateSimplePDF(reportData) {
  let browser = null;
  
  try {
    const { building, foundation, category, photos, projectName } = reportData;
    
    console.log('Starting HTML to PDF generation with Thai support...');
    
    // สร้าง HTML template
    const htmlContent = generateThaiHTMLTemplate({
      building,
      foundation,
      category,
      photos,
      projectName: projectName || 'Escent Nakhon si'
    });
    
    console.log('HTML template created, launching Puppeteer...');
    
    // Launch browser สำหรับ Firebase Functions
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=TranslateUI',
        '--disable-extensions',
        '--disable-plugins'
      ],
      timeout: 30000
    });
    
    console.log('Browser launched, creating PDF...');
    
    const page = await browser.newPage();
    
    // ตั้งค่าหน้า
    await page.setContent(htmlContent, { 
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // สร้าง PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '15mm',
        right: '15mm',
        bottom: '15mm',
        left: '15mm'
      },
      printBackground: true,
      timeout: 30000
    });
    
    await browser.close();
    browser = null;
    
    console.log('PDF generated successfully with Thai support');
    return pdfBuffer;
    
  } catch (error) {
    console.error('Error generating HTML to PDF:', error);
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
    throw error;
  }
}

// สร้าง HTML Template ภาษาไทยที่สวยงาม
function generateThaiHTMLTemplate({ building, foundation, category, photos, projectName }) {
  
  // สร้าง photo grids (2 รูปต่อหน้า)
  const photoPages = [];
  const photosPerPage = 2;
  
  for (let i = 0; i < photos.length; i += photosPerPage) {
    const pagePhotos = photos.slice(i, i + photosPerPage);
    const currentPage = Math.floor(i / photosPerPage) + 1;
    const totalPages = Math.ceil(photos.length / photosPerPage);
    
    let photoHTML = '';
    pagePhotos.forEach((photo, index) => {
      const photoNumber = i + index + 1;
      photoHTML += `
        <div class="photo-container">
          <div class="photo-header">
            <span class="photo-number">${photoNumber}. ${photo.topic}</span>
          </div>
          <div class="photo-content">
            ${photo.imageBase64 ? `
              <img src="data:image/jpeg;base64,${photo.imageBase64}" alt="${photo.topic}" />
            ` : `
              <div class="no-image">ไม่พบรูปภาพ</div>
            `}
          </div>
        </div>
      `;
    });
    
    photoPages.push({
      currentPage,
      totalPages,
      photoHTML
    });
  }
  
  // สร้าง HTML pages
  const pagesHTML = photoPages.map(page => `
    <div class="page">
      <!-- Logo นอกกรอบ -->
      <div class="external-logo">
        <span class="central">CENTRAL</span><span class="pattana">PATTANA</span>
      </div>
      
      <!-- Header -->
      <div class="header">
        <div class="header-title">รูปถ่ายประกอบการตรวจสอบ</div>
        <div class="header-content">
          <div class="left-column">
            <div class="info-row">
              <span class="label">โครงการ:</span>
              <span class="value">${projectName}</span>
            </div>
            <div class="info-row">
              <span class="label">อาคาร:</span>
              <span class="value">${building}</span>
            </div>
            <div class="info-row">
              <span class="label">หมวดงาน:</span>
              <span class="value">${category}</span>
            </div>
          </div>
          <div class="right-column">
            <div class="info-row">
              <span class="label">วันที่:</span>
              <span class="value">${getCurrentThaiDate()}</span>
            </div>
            <div class="info-row">
              <span class="label">ฐานรากเบอร์:</span>
              <span class="value">${foundation}</span>
            </div>
            <div class="info-row">
              <span class="label">แผ่นที่:</span>
              <span class="value">${page.currentPage}/${page.totalPages}</span>
            </div>
          </div>
        </div>
        <div class="note">หมายเหตุ: รูปที่ถ่ายทุกรูปให้ใช้แอป Time Stamp Camera</div>
      </div>
      
      <!-- Photos -->
      <div class="photos-container">
        ${page.photoHTML}
      </div>
    </div>
  `).join('');
  
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Sarabun', 'TH Sarabun New', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.4;
          color: #000;
          background: white;
        }
        
        .page {
          width: 100%;
          min-height: 297mm;
          page-break-after: always;
          position: relative;
          padding: 0;
          display: flex;
          flex-direction: column;
        }
        
        .page:last-child {
          page-break-after: avoid;
        }
        
        /* Logo นอกกรอบ */
        .external-logo {
          position: absolute;
          top: -25px;
          right: 0;
          font-family: 'Sarabun', sans-serif;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 1px;
          z-index: 10;
        }
        
        .external-logo .central {
          color: #2C3E50;
        }
        
        .external-logo .pattana {
          color: #D4AF37;
        }
        
        .header {
          border: 3px solid #000;
          margin-bottom: 20px;
          margin-top: 25px;
        }
        
        .header-title {
          border-bottom: 2px solid #000;
          text-align: center;
          padding: 15px;
          font-size: 20px;
          font-weight: 600;
          background: white;
          color: black;
        }
        
        .header-content {
          display: flex;
          padding: 15px 20px;
          gap: 30px;
          background: white;
        }
        
        .left-column, .right-column {
          flex: 1;
        }
        
        .info-row {
          margin-bottom: 8px;
          display: flex;
          align-items: baseline;
        }
        
        .label {
          font-weight: 500;
          min-width: 80px;
          margin-right: 10px;
        }
        
        .value {
          font-weight: 400;
        }
        
        .note {
          padding: 8px 20px;
          font-size: 12px;
          color: #666;
          font-style: italic;
          border-top: 1px solid #ddd;
          text-align: right;
        }
        
        .photos-container {
          display: flex;
          flex-direction: column;
          gap: 25px;
        }
        
        .photo-container {
          border: 2px solid #000;
          break-inside: avoid;
          margin-bottom: 15px;
        }
        
        .photo-header {
          border-bottom: 2px solid #000;
          padding: 10px 15px;
          font-size: 16px;
          font-weight: 500;
          text-align: center;
          background: white;
          color: black;
        }
        
        .photo-content {
          height: 320px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: #f9f9f9;
        }
        
        .photo-content img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
        }
        
        .no-image {
          color: #999;
          font-size: 18px;
          text-align: center;
        }
        
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .page {
            page-break-after: always;
          }
          
          .page:last-child {
            page-break-after: avoid;
          }
        }
      </style>
    </head>
    <body>
      ${pagesHTML}
    </body>
    </html>
  `;
}

// วันที่ปัจจุบันภาษาไทย
function getCurrentThaiDate() {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear() + 543;
  
  return `${day}/${month}/${year}`;
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
        description: 'QC Report PDF - Thai Language HTML'
      },
      media: {
        mimeType: 'application/pdf',
        body: stream
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink, webContentLink'
    });
    
    console.log(`Thai HTML PDF uploaded: ${response.data.id}`);
    
    return {
      fileId: response.data.id,
      filename: response.data.name,
      viewLink: response.data.webViewLink,
      downloadLink: response.data.webContentLink,
      driveUrl: `https://drive.google.com/file/d/${response.data.id}/view`
    };
    
  } catch (error) {
    console.error('Error uploading Thai HTML PDF:', error);
    throw error;
  }
}

module.exports = {
  generateSimplePDF,
  uploadPDFToDrive
};