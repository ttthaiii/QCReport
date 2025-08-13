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
  
  const photosPerPage = 6;
  const totalPages = Math.ceil(photos.length / photosPerPage);
  
  console.log(`Creating ${totalPages} pages for ${photos.length} photos (6 photos per page - 2×3 grid)`);
  
  const pages = [];
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const startIndex = pageIndex * photosPerPage;
    const endIndex = Math.min(startIndex + photosPerPage, photos.length);
    const pagePhotos = photos.slice(startIndex, endIndex);
    
    console.log(`Page ${pageIndex + 1}: photos ${startIndex + 1}-${endIndex} (${pagePhotos.length} photos)`);
    
    // สร้าง HTML สำหรับรูปในหน้านี้ - 2×3 grid (2 columns, 3 rows)
    let photosHTML = '';
    
    // สร้าง 3 แถว
    for (let row = 0; row < 3; row++) {
      photosHTML += '<div class="photo-row">';
      
      // สร้าง 2 คอลัมน์ในแต่ละแถว
      for (let col = 0; col < 2; col++) {
        const photoIndex = row * 2 + col;
        const globalPhotoNumber = startIndex + photoIndex + 1;
        
        if (photoIndex < pagePhotos.length) {
          const photo = pagePhotos[photoIndex];
          photosHTML += `
            <div class="photo-container">
              <div class="photo-content">
                ${photo.imageBase64 ? `
                  <img src="data:image/jpeg;base64,${photo.imageBase64}" alt="${photo.topic}" />
                ` : `
                  <div class="no-image">ไม่พบรูปภาพ</div>
                `}
              </div>
              <div class="photo-header">
                ${globalPhotoNumber}. ${photo.topic}
              </div>
            </div>
          `;
        } else {
          // ช่องว่างสำหรับรูปที่ไม่มี
          photosHTML += `
            <div class="photo-container spacer">
              <div class="photo-content">
                <div class="no-image">-</div>
              </div>
              <div class="photo-header">
                ${globalPhotoNumber}. 
              </div>
            </div>
          `;
        }
      }
      
      photosHTML += '</div>'; // ปิด photo-row
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
      
      <!-- Photos Grid (6 รูปต่อหน้า - 2×3) -->
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
          line-height: 1.2;
          color: #000;
          background: white;
        }
        
        .page {
          width: 210mm;
          height: 297mm;
          page-break-after: always;
          position: relative;
          padding: 8mm;
          padding-top: 12mm;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }
        
        .page:last-child {
          page-break-after: avoid;
        }
        
        /* Logo นอกกรอบ */
        .external-logo {
          position: absolute;
          top: 4mm;
          right: 8mm;
          font-family: 'Sarabun', sans-serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.5px;
          z-index: 10;
        }
        
        .external-logo .central {
          color: #2C3E50;
        }
        
        .external-logo .pattana {
          color: #D4AF37;
        }
        
        .header {
          border: 2px solid #000;
          margin-bottom: 5mm;
          flex-shrink: 0;
        }
        
        .header-title {
          border-bottom: 2px solid #000;
          text-align: center;
          padding: 3mm;
          font-size: 16px;
          font-weight: 600;
          background: white;
          color: black;
        }
        
        .header-content {
          display: flex;
          padding: 3mm 5mm;
          gap: 10mm;
          background: white;
          line-height: 1.2;
        }
        
        .left-column, .right-column {
          flex: 1;
        }
        
        .info-row {
          margin-bottom: 1.5mm;
          display: flex;
          align-items: baseline;
        }
        
        .label {
          font-weight: 500;
          min-width: 18mm;
          margin-right: 3mm;
          font-size: 12px;
        }
        
        .value {
          font-weight: 400;
          font-size: 12px;
        }
        
        /* Photos Container - 2×3 Grid Layout */
        .photos-container {
          display: flex;
          flex-direction: column;
          gap: 4mm;
          flex: 1;
          height: calc(297mm - 12mm - 8mm - 30mm);
        }
        
        /* Photo Row - แถวละ 2 รูป */
        .photo-row {
          display: flex;
          gap: 4mm;
          height: calc(33.333% - 2.67mm);
          min-height: 0;
        }
        
        /* 🔥 Photo Container - หัวข้ออยู่ด้านล่าง */
        .photo-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          page-break-inside: avoid;
          min-width: 0;
          border: none;
        }
        
        .photo-container.spacer {
          opacity: 0.3;
        }
        
        /* 🔥 Photo Content - รูปอยู่ด้านบน */
        .photo-content {
          flex: 1; /* ให้รูปใช้พื้นที่หลัก */
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: white;
          min-height: 0;
          padding: 2mm;
        }
        
        .photo-content img {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          object-position: center;
          display: block;
          border: none;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          border-radius: 2px;
        }
        
        /* 🔥 Photo Header - หัวข้ออยู่ด้านล่าง */
        .photo-header {
          padding: 2mm 0;
          font-size: 11px;
          font-weight: 500;
          text-align: center;
          background: white;
          color: black;
          flex-shrink: 0; /* ไม่ให้ยุบตัว */
          height: 10mm;
          display: flex;
          align-items: center;
          justify-content: center;
          word-wrap: break-word;
          overflow: hidden;
          border: none;
          /* เพิ่ม border-top เพื่อแยกจากรูป */
          border-top: 1px solid #e0e0e0;
          margin-top: 1mm;
        }
        
        .no-image {
          color: #999;
          font-size: 12px;
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
            padding-top: 12mm;
          }
          
          .page:last-child {
            page-break-after: avoid;
          }
          
          .photo-content img {
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: contain !important;
            border: none !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.1) !important;
          }
          
          .header-title {
            font-size: 14px !important;
            padding: 2.5mm !important;
          }
          
          .label, .value {
            font-size: 11px !important;
          }
          
          .photo-header {
            font-size: 10px !important;
            padding: 1.5mm 0 !important;
            height: 8mm !important;
          }
          
          .header-content {
            padding: 2.5mm 4mm !important;
          }
          
          .info-row {
            margin-bottom: 1mm !important;
          }
          
          .photos-container {
            gap: 3mm !important;
          }
          
          .photo-row {
            gap: 3mm !important;
          }
          
          .photo-content {
            padding: 1.5mm !important;
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