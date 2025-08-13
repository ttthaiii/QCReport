// แทนที่ไฟล์ qc-functions/services/simple-pdf-generator.js
// PDF Generator พร้อม Thai Font

const PDFDocument = require('pdfkit');
const { getDriveClient } = require('./google-auth');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

// ตรวจสอบและโหลด Thai Font (ปิดชั่วคราว)
function setupThaiFont(doc) {
  try {
    // ปิดการใช้ Thai Font ชั่วคราวเพื่อให้ PDF สร้างได้
    console.log('⚠️ Thai font disabled temporarily - using Helvetica fallback');
    return false;
    
    // โค้ดเดิม (comment ไว้)
    /*
    const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
    
    if (fs.existsSync(fontPath)) {
      console.log('✅ Loading THSarabunNew font...');
      doc.registerFont('ThaiFont', fontPath);
      doc.registerFont('ThaiFontBold', fontPath);
      return true;
    } else {
      console.log('❌ Thai font not found at:', fontPath);
      return false;
    }
    */
  } catch (error) {
    console.error('Error loading Thai font:', error.message);
    return false;
  }
}

// เลือก font ที่เหมาะสม
function selectFont(doc, style = 'normal', hasThaiFont = false) {
  if (hasThaiFont) {
    return style === 'bold' ? 'ThaiFontBold' : 'ThaiFont';
  } else {
    return style === 'bold' ? 'Helvetica-Bold' : 'Helvetica';
  }
}

// สร้าง PDF ด้วย Thai Font Support
async function generateSimplePDF(reportData) {
  try {
    const { building, foundation, category, photos, projectName } = reportData;
    
    console.log('Starting PDF generation with Thai Font support...');
    console.log(`Total photos: ${photos.length}`);
    
    // ประมวลผลรูป
    let processedPhotos = photos;
    if (category === 'ฐานราก') {
      if (photos.length > 12) {
        processedPhotos = photos.slice(0, 12);
      } else if (photos.length < 12) {
        const emptyPhotos = Array(12 - photos.length).fill(null).map((_, index) => ({
          id: `empty-${index}`,
          topic: `หัวข้อที่ ${photos.length + index + 1}`,
          imageBase64: null
        }));
        processedPhotos = [...photos, ...emptyPhotos];
      }
    }
    
    // สร้าง PDF Document
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 20, bottom: 20, left: 20, right: 20 },
      bufferPages: true
    });
    
    // ลอง setup Thai Font
    const hasThaiFont = setupThaiFont(doc);
    if (hasThaiFont) {
      console.log('✅ Thai font loaded successfully!');
    } else {
      console.log('⚠️ Using Helvetica fallback');
    }
    
    const photosPerPage = 6;
    const totalPages = category === 'ฐานราก' ? 2 : Math.ceil(processedPhotos.length / photosPerPage);
    
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) {
        doc.addPage();
      }
      
      const pagePhotos = processedPhotos.slice(pageIndex * photosPerPage, (pageIndex + 1) * photosPerPage);
      
      while (pagePhotos.length < photosPerPage) {
        pagePhotos.push({
          id: `empty-${pagePhotos.length}`,
          topic: `หัวข้อที่ ${(pageIndex * photosPerPage) + pagePhotos.length + 1}`,
          imageBase64: null
        });
      }
      
      await drawThaiPDFPage(doc, {
        building,
        foundation,
        category,
        projectName: projectName || 'Escent Nakhon si',
        pageNumber: pageIndex + 1,
        totalPages,
        photos: pagePhotos,
        hasThaiFont
      });
    }
    
    doc.end();
    
    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        console.log(`✅ Thai PDF created! Size: ${pdfBuffer.length} bytes`);
        resolve(pdfBuffer);
      });
      
      doc.on('error', (error) => {
        console.error('❌ Thai PDF error:', error);
        reject(error);
      });
    });
    
  } catch (error) {
    console.error('Error generating Thai PDF:', error);
    throw error;
  }
}

// วาดหน้า PDF พร้อม Thai Font
async function drawThaiPDFPage(doc, pageData) {
  const { building, foundation, category, projectName, pageNumber, totalPages, photos, hasThaiFont } = pageData;
  
  await drawThaiHeader(doc, {
    building,
    foundation,
    category,
    projectName,
    pageNumber,
    totalPages,
    hasThaiFont
  });
  
  await drawThaiPhotosGrid(doc, {
    photos,
    pageNumber,
    hasThaiFont
  });
}

// Header พร้อม Thai Font
async function drawThaiHeader(doc, data) {
  const { building, foundation, category, projectName, pageNumber, totalPages, hasThaiFont } = data;
  
  const pageWidth = doc.page.width;
  const margin = 20;
  
  // === LOGO SECTION ===
  doc.fontSize(14).font(selectFont(doc, 'bold', false)); // Logo ใช้ English font
  
  // คำนวณตำแหน่ง CENTRAL PATTANA
  const pattanaText = 'PATTANA';
  const centralText = 'CENTRAL';
  
  const pattanaWidth = doc.widthOfString(pattanaText);
  const centralWidth = doc.widthOfString(centralText);
  const spacing = 5;
  
  const rightEdge = pageWidth - margin;
  const pattanaX = rightEdge - pattanaWidth;
  const centralX = pattanaX - centralWidth - spacing;
  
  // วาด CENTRAL (สีดำ)
  doc.fillColor('#000000').text(centralText, centralX, 15);
  
  // วาด PATTANA (สีเทา)
  doc.fillColor('#666666').text(pattanaText, pattanaX, 15);
  
  // === MAIN HEADER BOX ===
  const headerY = 40;
  const headerHeight = 120;
  const headerWidth = pageWidth - (margin * 2);
  
  // กรอบใหญ่
  doc.strokeColor('#000000')
     .lineWidth(2)
     .rect(margin, headerY, headerWidth, headerHeight)
     .stroke();
  
  // === TITLE SECTION ===
  const titleHeight = 40;
  
  // พื้นหลังขาว + กรอบ
  doc.fillColor('#FFFFFF')
     .rect(margin, headerY, headerWidth, titleHeight)
     .fillAndStroke('#FFFFFF', '#000000');
  
  // ข้อความ title (ใช้ Thai Font!)
  doc.fillColor('#000000')
     .fontSize(16)
     .font(selectFont(doc, 'bold', hasThaiFont));
  
  const titleText = 'รูปถ่ายประกอบการตรวจสอบ';
  const titleWidth = doc.widthOfString(titleText);
  const titleX = margin + (headerWidth - titleWidth) / 2;
  
  doc.text(titleText, titleX, headerY + 15);
  
  // === INFO SECTION ===
  const infoY = headerY + titleHeight;
  const infoHeight = headerHeight - titleHeight;
  
  // พื้นหลังข้อมูล
  doc.fillColor('#FFFFFF')
     .rect(margin, infoY, headerWidth, infoHeight)
     .fill();
  
  // เส้นแบ่งกลาง
  const centerX = margin + headerWidth / 2;
  doc.strokeColor('#000000')
     .lineWidth(1)
     .moveTo(centerX, infoY)
     .lineTo(centerX, infoY + infoHeight)
     .stroke();
  
  // === ข้อมูลซ้าย-ขวา (ใช้ Thai Font!) ===
  doc.fillColor('#000000')
     .fontSize(12)
     .font(selectFont(doc, 'normal', hasThaiFont));
  
  const leftX = margin + 10;
  const rightX = centerX + 10;
  const lineHeight = 20;
  const textStartY = infoY + 15;
  
  // คอลัมน์ซ้าย
  doc.text(`โครงการ: ${projectName}`, leftX, textStartY);
  doc.text(`อาคาร: ${building}`, leftX, textStartY + lineHeight);
  doc.text(`หมวดงาน: ${category}`, leftX, textStartY + lineHeight * 2);
  
  // คอลัมน์ขวา
  doc.text(`วันที่: ${getCurrentThaiDate()}`, rightX, textStartY);
  doc.text(`ฐานรากเบอร์: ${foundation}`, rightX, textStartY + lineHeight);
  doc.text(`แผ่นที่: ${pageNumber}/${totalPages}`, rightX, textStartY + lineHeight * 2);
}

// Photos Grid พร้อม Thai Font
async function drawThaiPhotosGrid(doc, data) {
  const { photos, pageNumber, hasThaiFont } = data;
  
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 20;
  
  const gridStartY = 180;
  const availableWidth = pageWidth - (margin * 2);
  const availableHeight = pageHeight - gridStartY - margin - 20;
  
  // คำนวณขนาดรูป (2x3 grid)
  const cols = 2;
  const rows = 3;
  const gapX = 10;
  const gapY = 10;
  
  const photoWidth = (availableWidth - gapX * (cols - 1)) / cols;
  const photoHeight = (availableHeight - gapY * (rows - 1)) / rows;
  const captionHeight = 40;
  const actualPhotoHeight = photoHeight - captionHeight;
  
  console.log(`Photo dimensions: ${photoWidth}x${actualPhotoHeight}px`);
  
  // วาดรูปทั้งหมด
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const photoIndex = row * cols + col;
      const globalPhotoNumber = (pageNumber - 1) * 6 + photoIndex + 1;
      
      if (photoIndex < photos.length) {
        const photo = photos[photoIndex];
        
        const x = margin + col * (photoWidth + gapX);
        const y = gridStartY + row * (photoHeight + gapY);
        
        await drawThaiPhotoFrame(doc, {
          x,
          y,
          width: photoWidth,
          height: actualPhotoHeight,
          captionHeight,
          photo,
          photoNumber: globalPhotoNumber,
          hasThaiFont
        });
      }
    }
  }
}

// วาดกรอบรูปพร้อม Thai Caption
async function drawThaiPhotoFrame(doc, frameData) {
  const { x, y, width, height, captionHeight, photo, photoNumber, hasThaiFont } = frameData;
  
  // === กรอบรูป ===
  doc.strokeColor('#CCCCCC')
     .lineWidth(1)
     .rect(x, y, width, height)
     .stroke();
  
  // === เนื้อหารูป ===
  if (photo.imageBase64) {
    try {
      const imageBuffer = Buffer.from(photo.imageBase64, 'base64');
      
      const padding = 2;
      const imgX = x + padding;
      const imgY = y + padding;
      const imgWidth = width - (padding * 2);
      const imgHeight = height - (padding * 2);
      
      // ใส่รูปคุณภาพสูง
      doc.image(imageBuffer, imgX, imgY, {
        fit: [imgWidth, imgHeight],
        align: 'center',
        valign: 'center'
      });
      
    } catch (imageError) {
      console.error('Error adding image:', imageError);
      drawNoImagePlaceholder(doc, x, y, width, height, hasThaiFont);
    }
  } else {
    drawNoImagePlaceholder(doc, x, y, width, height, hasThaiFont);
  }
  
  // === CAPTION (ใช้ Thai Font!) ===
  const captionY = y + height;
  
  // เส้นบอร์เดอร์
  doc.strokeColor('#DDDDDD')
     .lineWidth(0.5)
     .moveTo(x, captionY)
     .lineTo(x + width, captionY)
     .stroke();
  
  // ข้อความ caption (Thai Font!)
  doc.fillColor('#000000')
     .fontSize(10)
     .font(selectFont(doc, 'bold', hasThaiFont));
  
  const captionText = `${photoNumber}. ${photo.topic}`;
  
  // วาดข้อความใน caption โดยจัดกึ่งกลาง
  doc.text(captionText, x + 5, captionY + 10, {
    width: width - 10,
    height: captionHeight - 20,
    align: 'center',
    ellipsis: true
  });
}

// วาด placeholder เมื่อไม่มีรูป (Thai Font!)
function drawNoImagePlaceholder(doc, x, y, width, height, hasThaiFont) {
  doc.fillColor('#F5F5F5')
     .rect(x + 2, y + 2, width - 4, height - 4)
     .fill();
  
  doc.fillColor('#999999')
     .fontSize(11)
     .font(selectFont(doc, 'normal', hasThaiFont))
     .text('ไม่พบรูปภาพ', x + width/2 - 30, y + height/2 - 5);
}

// วันที่ไทย
function getCurrentThaiDate() {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear() + 543;
  
  return `${day}/${month}/${year}`;
}

// อัปโหลด PDF
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
        description: 'QC Report PDF - Thai Font Support'
      },
      media: {
        mimeType: 'application/pdf',
        body: stream
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink, webContentLink'
    });
    
    console.log(`✅ Thai PDF uploaded: ${response.data.id}`);
    
    return {
      fileId: response.data.id,
      filename: response.data.name,
      viewLink: response.data.webViewLink,
      downloadLink: response.data.webContentLink,
      driveUrl: `https://drive.google.com/file/d/${response.data.id}/view`
    };
    
  } catch (error) {
    console.error('Error uploading Thai PDF:', error);
    throw error;
  }
}

module.exports = {
  generateSimplePDF,
  uploadPDFToDrive
};