// แทนที่ไฟล์ qc-functions/services/simple-pdf-generator.js
// ปรับปรุงให้ 1 หน้า = 2 รูป เท่านั้น พร้อม logo นอกกรอบ

const puppeteer = require('puppeteer');
const { getDriveClient } = require('./google-auth');
const { Readable } = require('stream');

// สร้าง PDF ด้วย HTML to PDF (รองรับภาษาไทย 100%)
async function generateSimplePDF(reportData) {
  let browser = null;
  
  try {
    const { building, foundation, category, photos, projectName } = reportData;
    
    console.log('Starting HTML to PDF generation with Thai support...');
    console.log(`Total photos: ${photos.length}`);
    
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

// สร้าง HTML Template ภาษาไทยที่สวยงาม - 2 รูปต่อหน้าเท่านั้น
function generateThaiHTMLTemplate({ building, foundation, category, photos, projectName }) {
  
  // แบ่งรูปเป็นหน้าๆ ละ 2 รูป
  const photosPerPage = 2;
  const totalPages = Math.ceil(photos.length / photosPerPage);
  
  console.log(`Creating ${totalPages} pages for ${photos.length} photos`);
  
  // สร้างหน้าต่างๆ
  const pages = [];
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const startIndex = pageIndex * photosPerPage;
    const endIndex = Math.min(startIndex + photosPerPage, photos.length);
    const pagePhotos = photos.slice(startIndex, endIndex);
    
    console.log(`Page ${pageIndex + 1}: photos ${startIndex + 1}-${endIndex} (${pagePhotos.length} photos)`);
    
    // สร้าง HTML สำหรับรูปในหน้านี้
    let photosHTML = '';
    pagePhotos.forEach((photo, index) => {
      const photoNumber = startIndex + index + 1;
      photosHTML += `
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
    
    // ถ้าหน้านี้มีแค่ 1 รูป ให้เพิ่ม spacer เพื่อให้เต็ม 2 รูป
    if (pagePhotos.length === 1) {
      photosHTML += `
        <div class="photo-container spacer">
          <div class="photo-header">
            <span class="photo-number">2. </span>
          </div>
          <div class="photo-content">
            <div class="no-image">-</div>
          </div>
        </div>
      `;
    }
    
    pages.push({
      pageNumber: pageIndex + 1,
      totalPages: totalPages,
      photosHTML: photosHTML
    });
  }
  
  // สร้าง HTML สำหรับทุกหน้า
  const pagesHTML = pages.map(page => `
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
              <span class="value">${page.pageNumber}/${page.totalPages}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Photos (2 รูปต่อหน้า) -->
      <div class="photos-container">
        ${page.photosHTML}
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
          width: 210mm;
          height: 297mm;
          page-break-after: always;
          position: relative;
          padding: 8mm; /* ลด margin จาก 15mm เป็น 8mm */
          padding-top: 15mm; /* เผื่อที่สำหรับ logo */
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }
        
        .page:last-child {
          page-break-after: avoid;
        }
        
        /* Logo นอกกรอบ - ด้านบนขวา */
        .external-logo {
          position: absolute;
          top: 5mm;
          right: 8mm;
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
          border: 2px solid #000; /* ลดจาก 3px เป็น 2px */
          margin-bottom: 8mm; /* ลดจาก 15mm เป็น 8mm */
          flex-shrink: 0;
        }
        
        .header-title {
          border-bottom: 2px solid #000;
          text-align: center;
          padding: 6mm; /* ลดจาก 10mm เป็น 6mm */
          font-size: 18px; /* ลดจาก 20px เป็น 18px */
          font-weight: 600;
          background: white;
          color: black;
        }
        
        .header-content {
          display: flex;
          padding: 5mm 8mm; /* ลดจาก 8mm 10mm เป็น 5mm 8mm */
          gap: 15mm; /* ลดจาก 20mm เป็น 15mm */
          background: white;
          line-height: 1.3; /* เพิ่ม line-height ให้กระชับ */
        }
        
        .left-column, .right-column {
          flex: 1;
        }
        
        .info-row {
          margin-bottom: 3mm; /* ลดจาก 6mm เป็น 3mm */
          display: flex;
          align-items: baseline;
        }
        
        .label {
          font-weight: 500;
          min-width: 22mm; /* ลดจาก 25mm เป็น 22mm */
          margin-right: 4mm; /* ลดจาก 5mm เป็น 4mm */
          font-size: 13px;
        }
        
        .value {
          font-weight: 400;
          font-size: 13px;
        }
        
        /* Photos Container - 2 รูปต่อหน้า */
        .photos-container {
          display: flex;
          flex-direction: column;
          gap: 6mm; /* ลดจาก 8mm เป็น 6mm */
          flex: 1;
          height: calc(297mm - 15mm - 8mm - 60mm); /* ปรับให้เหมาะกับ padding และ header ใหม่ */
        }
        
        .photo-container {
          border: 2px solid #000;
          height: calc(50% - 3mm); /* แบ่งครึ่งหน้า ลบ gap */
          display: flex;
          flex-direction: column;
          page-break-inside: avoid;
        }
        
        .photo-container.spacer {
          opacity: 0.3; /* จางๆ สำหรับช่องว่าง */
        }
        
        .photo-header {
          border-bottom: 2px solid #000;
          padding: 3mm 5mm; /* ลดจาก 4mm 6mm เป็น 3mm 5mm */
          font-size: 14px; /* ลดจาก 16px เป็น 14px */
          font-weight: 500;
          text-align: center;
          background: white;
          color: black;
          flex-shrink: 0;
        }
        
        .photo-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: #f9f9f9;
          min-height: 0;
          /* กำหนดขนาดรูปให้เป็น 12.5×8.4 cm */
          width: 100%;
          height: 84mm; /* 8.4 cm */
        }
        
        .photo-content img {
          width: 125mm; /* 12.5 cm */
          height: 84mm; /* 8.4 cm */
          object-fit: contain; /* รักษาสัดส่วน ไม่บิดเบือน */
          object-position: center;
          display: block;
          border: 1px solid #ddd;
          background: white;
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
            margin: 0;
            padding: 8mm;
            padding-top: 15mm;
          }
          
          .page:last-child {
            page-break-after: avoid;
          }
          
          /* กำหนดขนาดรูปแน่นอนใน print */
          .photo-content img {
            width: 125mm !important; /* 12.5 cm */
            height: 84mm !important; /* 8.4 cm */
            object-fit: contain !important;
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
        description: 'QC Report PDF - 2 Photos Per Page Format'
      },
      media: {
        mimeType: 'application/pdf',
        body: stream
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink, webContentLink'
    });
    
    console.log(`2-Photos-Per-Page PDF uploaded: ${response.data.id}`);
    
    return {
      fileId: response.data.id,
      filename: response.data.name,
      viewLink: response.data.webViewLink,
      downloadLink: response.data.webContentLink,
      driveUrl: `https://drive.google.com/file/d/${response.data.id}/view`
    };
    
  } catch (error) {
    console.error('Error uploading 2-Photos-Per-Page PDF:', error);
    throw error;
  }
}

module.exports = {
  generateSimplePDF,
  uploadPDFToDrive
};