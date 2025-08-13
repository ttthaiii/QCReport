// แทนที่ไฟล์ qc-functions/services/simple-pdf-generator.js
// สร้าง PDF แบบมืออาชีพสำหรับ Firebase Functions

// ⚠️ FIREBASE FUNCTIONS COMPATIBLE VERSION
// ใช้ pdf2pic + jsPDF แทน Canvas เพราะ Firebase Functions ไม่รองรับ Canvas

const { jsPDF } = require('jspdf');

// เพิ่ม Thai font support
require('jspdf/dist/jspdf.plugin.standard_fonts_metrics.js');
require('jspdf/dist/jspdf.plugin.split_text_to_size.js');
const { getDriveClient } = require('./google-auth');
const { Readable } = require('stream');

// สร้าง PDF ด้วย jsPDF (Firebase Functions Compatible)
async function generateSimplePDF(reportData) {
  try {
    const { building, foundation, category, photos, projectName } = reportData;
    
    console.log('Starting FIREBASE-COMPATIBLE PDF generation...');
    console.log(`Total photos: ${photos.length}`);
    
    // 🔥 ตรวจสอบและจำกัดจำนวนรูป - เฉพาะฐานรากต้อง 12 รูป (2 หน้า x 6 รูป)
    let processedPhotos = photos;
    if (category === 'ฐานราก') {
      if (photos.length > 12) {
        console.log(`Warning: ฐานราก has ${photos.length} photos, limiting to first 12`);
        processedPhotos = photos.slice(0, 12);
      } else if (photos.length < 12) {
        console.log(`Warning: ฐานราก has only ${photos.length}/12 photos`);
        // เพิ่มรูปว่างเพื่อให้ครบ 12 รูป
        const emptyPhotos = Array(12 - photos.length).fill(null).map((_, index) => ({
          id: `empty-${index}`,
          topic: `หัวข้อที่ ${photos.length + index + 1}`,
          imageBase64: null
        }));
        processedPhotos = [...photos, ...emptyPhotos];
      }
    }
    
    console.log('Creating FIREBASE-COMPATIBLE PDF...');
    
    // สร้าง PDF ด้วย jsPDF (A4 size)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const photosPerPage = 6;
    const totalPages = category === 'ฐานราก' ? 2 : Math.ceil(processedPhotos.length / photosPerPage);
    
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) {
        doc.addPage();
      }
      
      const pagePhotos = processedPhotos.slice(pageIndex * photosPerPage, (pageIndex + 1) * photosPerPage);
      
      // เพิ่มรูปว่างถ้าไม่ครบ 6 รูป
      while (pagePhotos.length < photosPerPage) {
        pagePhotos.push({
          id: `empty-${pagePhotos.length}`,
          topic: `หัวข้อที่ ${(pageIndex * photosPerPage) + pagePhotos.length + 1}`,
          imageBase64: null
        });
      }
      
      await drawFirebasePage(doc, {
        building,
        foundation,
        category,
        projectName: projectName || 'Escent Nakhon si',
        pageNumber: pageIndex + 1,
        totalPages,
        photos: pagePhotos
      });
    }
    
    // สร้าง PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    
    console.log('FIREBASE-COMPATIBLE PDF created successfully! 🎉');
    return pdfBuffer;
    
  } catch (error) {
    console.error('Error generating FIREBASE-COMPATIBLE PDF:', error);
    throw error;
  }
}

// วาดหน้า PDF สำหรับ Firebase Functions
async function drawFirebasePage(doc, pageData) {
  const { building, foundation, category, projectName, pageNumber, totalPages, photos } = pageData;
  
  // 🎨 FIREBASE-COMPATIBLE HEADER
  drawFirebaseHeader(doc, {
    building,
    foundation,
    category,
    projectName,
    pageNumber,
    totalPages
  });
  
  // 🖼️ FIREBASE-COMPATIBLE PHOTOS GRID
  await drawFirebasePhotosGrid(doc, {
    photos,
    pageNumber
  });
}

// 🎨 วาด Header แบบ Firebase Compatible
function drawFirebaseHeader(doc, data) {
  const { building, foundation, category, projectName, pageNumber, totalPages } = data;
  
  // === LOGO SECTION ===
  // CENTRAL PATTANA (ปรับให้ไม่ซ้อนกัน)
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  
  // วัดความกว้างและจัดตำแหน่ง
  const pattanaText = 'PATTANA';
  const pattanaWidth = doc.getTextWidth(pattanaText);
  const pageWidth = 210; // A4 width in mm
  
  // PATTANA (สีส้ม/ทอง - ใช้สีเทาแทนใน jsPDF)
  doc.setTextColor(169, 169, 169); // สีเทา
  doc.text(pattanaText, pageWidth - 20, 15, { align: 'right' });
  
  // CENTRAL (สีเข้ม)
  doc.setTextColor(0, 0, 0); // สีดำ
  doc.text('CENTRAL', pageWidth - 20 - pattanaWidth - 5, 15, { align: 'right' });
  
  // === MAIN HEADER BOX ===
  const headerY = 25;
  const headerHeight = 50;
  const margin = 15;
  
  // กรอบใหญ่
  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 0, 0);
  doc.rect(margin, headerY, pageWidth - (margin * 2), headerHeight);
  
  // === TITLE SECTION ===
  const titleHeight = 15;
  
  // กรอบ title
  doc.rect(margin, headerY, pageWidth - (margin * 2), titleHeight);
  
  // ข้อความ title - ใช้ Helvetica สำหรับภาษาไทย
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('รูปถ่ายประกอบการตรวจสอบ', pageWidth / 2, headerY + 10, { align: 'center' });
  
  // === INFO SECTION ===
  const infoY = headerY + titleHeight;
  const infoHeight = headerHeight - titleHeight;
  
  // เส้นแบ่งกลาง
  doc.line(pageWidth / 2, infoY, pageWidth / 2, infoY + infoHeight);
  
  // === TEXT CONTENT ===
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const leftX = margin + 5;
  const rightX = pageWidth / 2 + 5;
  const lineHeight = 8;
  const startY = infoY + 8;
  
  // Left column
  doc.text(`โครงการ: ${projectName}`, leftX, startY);
  doc.text(`อาคาร: ${building}`, leftX, startY + lineHeight);
  doc.text(`หมวดงาน: ${category}`, leftX, startY + lineHeight * 2);
  
  // Right column
  doc.text(`วันที่: ${getCurrentThaiDate()}`, rightX, startY);
  doc.text(`ฐานรากเบอร์: ${foundation}`, rightX, startY + lineHeight);
  doc.text(`แผ่นที่: ${pageNumber}/${totalPages}`, rightX, startY + lineHeight * 2);
}

// 🖼️ วาด Photos Grid แบบ Firebase Compatible
async function drawFirebasePhotosGrid(doc, data) {
  const { photos, pageNumber } = data;
  
  // === GRID CALCULATIONS ===
  const gridStartY = 85;
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  
  const availableWidth = pageWidth - (margin * 2);
  const availableHeight = pageHeight - gridStartY - 20;
  
  // 2 columns x 3 rows
  const photoWidth = (availableWidth - 10) / 2;  // 10mm gap between columns
  const photoHeight = (availableHeight - 20) / 3; // 20mm total gaps for 3 rows
  const captionHeight = 15;
  const actualPhotoHeight = photoHeight - captionHeight;
  
  console.log(`Grid dimensions: ${photoWidth}x${actualPhotoHeight}mm per photo`);
  
  // === DRAW PHOTOS ===
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const photoIndex = row * 2 + col;
      const globalPhotoNumber = (pageNumber - 1) * 6 + photoIndex + 1;
      
      if (photoIndex < photos.length) {
        const photo = photos[photoIndex];
        
        const x = margin + col * (photoWidth + 5);
        const y = gridStartY + row * (photoHeight + 5);
        
        await drawFirebasePhotoFrame(doc, {
          x,
          y,
          width: photoWidth,
          height: actualPhotoHeight,
          captionHeight,
          photo,
          photoNumber: globalPhotoNumber
        });
      }
    }
  }
}

// 🎨 วาดกรอบรูป Firebase Compatible
async function drawFirebasePhotoFrame(doc, frameData) {
  const { x, y, width, height, captionHeight, photo, photoNumber } = frameData;
  
  // === PHOTO BORDER ===
  doc.setLineWidth(0.3);
  doc.setDrawColor(200, 200, 200);
  doc.rect(x, y, width, height);
  
  // === PHOTO CONTENT ===
  if (photo.imageBase64) {
    try {
      // ใน jsPDF เราใส่รูปได้โดยตรงจาก base64
      const imageData = `data:image/jpeg;base64,${photo.imageBase64}`;
      
      // คำนวณขนาดรูปให้พอดีกับกรอบ
      const padding = 2;
      const imgX = x + padding;
      const imgY = y + padding;
      const imgWidth = width - (padding * 2);
      const imgHeight = height - (padding * 2);
      
      doc.addImage(imageData, 'JPEG', imgX, imgY, imgWidth, imgHeight);
      
    } catch (imageError) {
      console.error('Error adding image:', imageError);
      // แสดงข้อความแทนรูป
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text('ไม่พบรูปภาพ', x + width/2, y + height/2, { align: 'center' });
    }
  } else {
    // ไม่มีรูป - แสดงข้อความ
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text('ไม่พบรูปภาพ', x + width/2, y + height/2, { align: 'center' });
  }
  
  // === CAPTION ===
  const captionY = y + height;
  
  // Caption border
  doc.setLineWidth(0.2);
  doc.setDrawColor(230, 230, 230);
  doc.line(x, captionY, x + width, captionY);
  
  // Caption text
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  
  const captionText = `${photoNumber}. ${photo.topic}`;
  
  // แบ่งข้อความถ้ายาวเกินไป
  const maxWidth = width - 4;
  const textWidth = doc.getTextWidth(captionText);
  
  if (textWidth > maxWidth) {
    // ตัดข้อความให้พอดี
    const words = captionText.split(' ');
    let line1 = '';
    let line2 = '';
    
    for (let word of words) {
      const testLine = line1 + word + ' ';
      if (doc.getTextWidth(testLine) > maxWidth && line1 !== '') {
        line2 = words.slice(words.indexOf(word)).join(' ');
        break;
      } else {
        line1 = testLine;
      }
    }
    
    doc.text(line1.trim(), x + width/2, captionY + 5, { align: 'center' });
    if (line2) {
      doc.text(line2, x + width/2, captionY + 10, { align: 'center' });
    }
  } else {
    doc.text(captionText, x + width/2, captionY + 7, { align: 'center' });
  }
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
        description: 'QC Report PDF - Firebase Functions Compatible (jsPDF)'
      },
      media: {
        mimeType: 'application/pdf',
        body: stream
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink, webContentLink'
    });
    
    console.log(`FIREBASE PDF uploaded: ${response.data.id}`);
    
    return {
      fileId: response.data.id,
      filename: response.data.name,
      viewLink: response.data.webViewLink,
      downloadLink: response.data.webContentLink,
      driveUrl: `https://drive.google.com/file/d/${response.data.id}/view`
    };
    
  } catch (error) {
    console.error('Error uploading FIREBASE PDF:', error);
    throw error;
  }
}

module.exports = {
  generateSimplePDF,
  uploadPDFToDrive
};