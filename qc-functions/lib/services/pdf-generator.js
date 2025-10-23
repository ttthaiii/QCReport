"use strict";
// pdf-generator.ts - Firebase Version v7 (Final - No Errors)
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyPhotosByDate = void 0;
exports.getUploadedTopicStatus = getUploadedTopicStatus;
exports.getLatestPhotos = getLatestPhotos;
exports.createFullLayout = createFullLayout;
exports.generatePDF = generatePDF;
exports.generateDailyPDFWrapper = generateDailyPDFWrapper;
exports.uploadPDFToStorage = uploadPDFToStorage;
exports.generateOptimizedPDF = generateOptimizedPDF;
exports.generateDailyPDFUsingPuppeteer = generateDailyPDFUsingPuppeteer;
const puppeteer = __importStar(require("puppeteer")); // <-- [FIX] Added import
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
// ========================================
// HELPER FUNCTIONS
// ========================================
/**
 * โหลดรูปทั้งหมดจาก URL
 */
async function loadImagesFromStorage(photos) {
    const bucket = admin.storage().bucket(); // <-- ✨ ย้ายมาไว้ที่นี่ครับ
    if (!photos || photos.length === 0) {
        console.log('⚠️ No photos to load');
        return photos;
    }
    console.log(`📥 Loading ${photos.length} images...`);
    const photosWithImages = [];
    let loadedCount = 0;
    let placeholderCount = 0;
    let failedCount = 0;
    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (photo.isPlaceholder) {
            console.log(`🔳 Skipping placeholder ${i + 1}/${photos.length}: "${photo.topic}"`);
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: null }));
            placeholderCount++;
            continue;
        }
        // เราจะใช้ storageUrl (filePath) เสมอ
        const storagePath = photo.storageUrl; // นี่คือ filePath ที่เราบันทึกไว้
        if (!storagePath) {
            console.log(`⚠️ No storageUrl for "${photo.topic}", skipping.`);
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: null }));
            failedCount++;
            continue;
        }
        console.log(`📷 Loading image ${i + 1}/${photos.length} from path: "${storagePath}"`);
        try {
            // 1. อ้างอิงไฟล์ใน Storage
            const file = bucket.file(storagePath);
            // 2. ดาวน์โหลดไฟล์เป็น Buffer
            const [buffer] = await file.download();
            // 3. (Optional) ดึง Mime Type ที่ถูกต้อง
            const [metadata] = await file.getMetadata();
            const mimeType = metadata.contentType || 'image/jpeg';
            // 4. แปลงเป็น Base64 Data URI ที่สมบูรณ์
            const base64 = buffer.toString('base64');
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: `data:${mimeType};base64,${base64}` // <-- สร้าง Data URI ที่สมบูรณ์ที่นี่
             }));
            loadedCount++;
        }
        catch (error) {
            console.error(`❌ Failed to load image for "${photo.topic}" from ${storagePath}:`, error);
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: null //  HTML (ข้อ 4) จะแสดง placeholder
             }));
            failedCount++;
        }
    }
    console.log(`📊 Image loading results: ${loadedCount} loaded, ${placeholderCount} placeholders, ${failedCount} failed`);
    return photosWithImages;
}
/**
 * วันที่ไทย
 */
function getCurrentThaiDate() {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear() + 543;
    return `${day}/${month}/${year}`;
}
// ========================================
// HTML GENERATION FUNCTIONS
// ========================================
/**
 * Header layout สำหรับ 2 fields
 */
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
/**
 * Header layout สำหรับ 3 fields
 */
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
/**
 * Header layout สำหรับ 4 fields
 */
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
/**
 * Dynamic Header
 */
function createDynamicHeader(reportData, pageNumber, totalPages) {
    const { category, dynamicFields, projectName } = reportData;
    const currentDate = getCurrentThaiDate();
    const building = reportData.building || '';
    const foundation = reportData.foundation || '';
    const fieldsToDisplay = dynamicFields && Object.keys(dynamicFields).length > 0
        ? dynamicFields
        : { 'อาคาร': building, 'ฐานรากเบอร์': foundation };
    const fieldCount = Object.keys(fieldsToDisplay).length;
    if (fieldCount <= 2) {
        return create2FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages);
    }
    else if (fieldCount === 3) {
        return create3FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages);
    }
    else {
        return create4FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages);
    }
}
/**
 * Photos Grid
 */
function createPhotosGrid(photos, pageIndex) {
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
                `<img src="${photo.imageBase64}" 
                  alt="${topicName}" 
                  class="photo-image">` :
                `<div class="photo-placeholder">
               </div>`}
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
/**
 * Inline CSS
 */
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
      
      .info-column {
        display: table-cell;
        width: 50%;
        vertical-align: top;
        padding: 0 8px;
      }
      
      .info-right {
        border-left: 1px solid #ddd;
      }
      
      .info-grid-3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: 4px;
        padding: 8px;
        min-height: 60px;
      }
      
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
        max-width: 50%;
      }
      
      .photo-frame:first-child {
        margin-left: 0;
      }

      .photo-frame:last-child {
        margin-right: 0;
      }

      .photo-row .photo-frame:only-child {
        flex: 0 0 50%;
        max-width: 50%;
      }
      
      .photo-container {
        flex: 1;
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
function createDailyHTML(data, photos) {
    const { projectName, date } = data;
    const reportDate = new Date(date);
    reportDate.setHours(reportDate.getHours() + 7); // Adjust timezone for Thai display
    const thaiDate = reportDate.toLocaleDateString('th-TH', { dateStyle: 'full' });
    return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Daily Report</title>
        <style>
            @page { size: A4; margin: 10mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              width: 100%; height: 100%; font-family: 'Sarabun', sans-serif;
              font-size: 11pt; line-height: 1.5; color: #333; background: white;
              -webkit-print-color-adjust: exact; print-color-adjust: exact;
            }
            .page {
              width: 100%; height: 100vh; background: white; padding: 12px;
              position: relative; display: flex; flex-direction: column;
            }
            .header { margin-bottom: 10px; flex-shrink: 0; font-size: 10pt; color: #555; }
            .content { flex: 1; margin-top: 5mm; }
            h1 { font-size: 16pt; color: #000; margin-bottom: 5px; font-weight: bold; }
            h2 { font-size: 12pt; color: #444; margin-bottom: 15px; font-weight: normal; }
            .photo-list { display: flex; flex-direction: column; gap: 8mm; }
            .photo-card { border: 1px solid #ddd; border-radius: 4px; overflow: hidden; break-inside: avoid; background: #fff; }
            .photo-img {
              width: 100%; height: auto; max-height: 100mm; object-fit: contain;
              background: #f0f0f0; display: block;
            }
            .photo-placeholder {
              height: 100mm; display: flex; align-items: center; justify-content: center;
              background: #f0f0f0; color: #999; font-style: italic;
             }
            .photo-caption { padding: 6px 10px; font-size: 10pt; background: #f9f9f9; }
            .photo-caption.description { border-bottom: 1px solid #eee; }
            .photo-caption.meta { font-size: 9pt; color: #666; }
            .footer {
               position: absolute; bottom: 0; left: 12px; right: 12px;
               width: calc(100% - 24px); text-align: right; font-size: 9pt;
               color: #777; padding-bottom: 5px;
            }
        </style>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
    </head>
    <body>
        ${(() => {
        let html = '';
        let pageCount = 1;
        const itemsPerPage = 2; // 2 photos per page
        for (let i = 0; i < photos.length; i += itemsPerPage) {
            const chunk = photos.slice(i, i + itemsPerPage);
            html += `
              <div class="page content-page" ${pageCount > 1 ? 'style="page-break-before: always;"' : ''}>
                  <div class="header">
                      <strong>${projectName}</strong> - รายงานประจำวัน
                  </div>
                  
                  ${i === 0 ? `
                  <div class="content">
                      <h1>รายงานประจำวัน (Daily Report)</h1>
                      <h2>${thaiDate}</h2>
                  ` : `
                  <div class="content" style="margin-top: 5mm;">
                  `}
                  
                      <div class="photo-list">
                          ${chunk.map(photo => `
                          <div class="photo-card">
                             ${photo.base64 ?
                `<img src="${photo.base64.startsWith('data:') ? photo.base64 : `data:image/jpeg;base64,${photo.base64}`}" class="photo-img" />` :
                `<div class="photo-placeholder"><span>ไม่มีรูปภาพ</span></div>`}
                              ${photo.description ? `
                              <div class="photo-caption description">
                                  ${photo.description}
                              </div>
                              ` : ''}
                              <div class="photo-caption meta">
                                  ${new Date(photo.timestamp).toLocaleString('th-TH', { timeStyle: 'medium', dateStyle: 'short', hour12: false })} | ${photo.location || 'N/A'}
                              </div>
                          </div>
                          `).join('')}
                      </div>
                  </div>

                  <div class="footer">
                      หน้า ${pageCount++}
                  </div>
              </div>
              `;
        }
        return html;
    })()}
    </body>
    </html>
    `;
}
function createOptimizedHTML(reportData) {
    const { photos } = reportData;
    const photosPerPage = 6;
    const pages = [];
    for (let i = 0; i < photos.length; i += photosPerPage) {
        pages.push(photos.slice(i, i + photosPerPage));
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
// ========================================
// MAIN EXPORTED FUNCTIONS
// ========================================
/**
 * ดึงสถานะหัวข้อที่อัปโหลดแล้ว (QC)
 */
async function getUploadedTopicStatus(projectId, category, dynamicFields) {
    const db = admin.firestore();
    let query = db.collection('qcPhotos')
        .where('projectId', '==', projectId)
        .where('category', '==', category);
    Object.entries(dynamicFields).forEach(([key, value]) => {
        if (key && value) {
            query = query.where(`dynamicFields.${key}`, '==', value);
        }
    });
    const snapshot = await query.get();
    const uploadedTopics = {};
    // Simple approach: if a photo exists for a topic, mark it as uploaded.
    snapshot.forEach(doc => {
        const topic = doc.data().topic;
        if (topic && !uploadedTopics[topic]) {
            uploadedTopics[topic] = true;
        }
    });
    console.log(`✅ Found ${Object.keys(uploadedTopics).length} unique uploaded topics status`);
    return uploadedTopics;
}
/**
 * ดึงรูป Daily Report ตามวันที่
 */
const getDailyPhotosByDate = async (projectId, date // YYYY-MM-DD
) => {
    const db = admin.firestore();
    const startDate = new Date(`${date}T00:00:00+07:00`);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    console.log(`Querying dailyPhotos from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const photosSnapshot = await db
        .collection("dailyPhotos")
        .where("projectId", "==", projectId)
        .where("createdAt", ">=", firestore_1.Timestamp.fromDate(startDate)) // 👈 [แก้ไข]
        .where("createdAt", "<", firestore_1.Timestamp.fromDate(endDate)) // 👈 [แก้ไข]
        .orderBy("createdAt", "asc")
        .get();
    if (photosSnapshot.empty) {
        return [];
    }
    // 1. Convert Firestore data to PhotoData structure for loading
    const photosToLoad = photosSnapshot.docs.map(doc => {
        const data = doc.data();
        // [FIX 1] อ่าน createdAt จาก data (FirestorePhotoData) มาเก็บในตัวแปรก่อน
        let isoTimestamp = new Date().toISOString(); // Default fallback
        // ตรวจสอบว่า createdAt มีอยู่จริง และเป็น Timestamp ก่อนเรียก toDate()
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            isoTimestamp = data.createdAt.toDate().toISOString();
        }
        // สร้าง Object ที่ตรงกับ Type PhotoData (ซึ่งมี location และ timestamp ที่เราเพิ่มไว้)
        return {
            topic: data.description || '', // Use 'topic' to store description temporarily
            storageUrl: data.filePath,
            isPlaceholder: false,
            location: data.location || '',
            timestamp: isoTimestamp // ใช้ตัวแปรที่อ่านค่ามาแล้ว
            // ไม่มี createdAt ใน object นี้แล้ว
        }; // Cast เป็น PhotoData
    });
    // 2. Load images (fetches base64)
    const photosWithBase64 = await loadImagesFromStorage(photosToLoad);
    // 3. Convert back to the correct DailyPhotoWithBase64 format
    return photosWithBase64.map(photo => ({
        description: photo.topic, // Convert back from 'topic'
        base64: photo.imageBase64 || null,
        location: photo.location || '', // Retrieve stored extra info
        timestamp: photo.timestamp || '' // Retrieve stored extra info
    }));
};
exports.getDailyPhotosByDate = getDailyPhotosByDate;
/**
 * ดึงรูปล่าสุดจาก Firestore (QC)
 */
async function getLatestPhotos(projectId, mainCategory, subCategory, allTopics, // Topics defined in config for this subCategory
dynamicFields) {
    try {
        console.log(`🔍 Getting latest photos for QC: ${mainCategory} > ${subCategory}`);
        const category = `${mainCategory} > ${subCategory}`;
        const db = admin.firestore();
        let query = db.collection('qcPhotos')
            .where('projectId', '==', projectId)
            .where('category', '==', category)
            // Query all photos matching the criteria first
            .orderBy('createdAt', 'desc');
        // Apply dynamic field filters
        Object.entries(dynamicFields).forEach(([key, value]) => {
            if (key && value) {
                query = query.where(`dynamicFields.${key}`, '==', value);
            }
        });
        const snapshot = await query.get();
        if (snapshot.empty) {
            console.log('⚠️ No photos found for these criteria');
            return [];
        }
        // Process in memory to find the latest for each *required* topic
        const latestPhotosMap = new Map();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const topic = data.topic;
            // Only consider topics relevant to this report
            if (topic && allTopics.includes(topic)) {
                // Since we ordered by createdAt desc, the first one we see for a topic is the latest
                if (!latestPhotosMap.has(topic)) {
                    latestPhotosMap.set(topic, data);
                }
            }
        });
        // Convert the found latest photos to PhotoData format for loading
        const photosToLoad = [];
        latestPhotosMap.forEach((data, topic) => {
            photosToLoad.push({
                topic: topic,
                originalTopic: topic, // Store original topic name if needed later
                imageBase64: null,
                storageUrl: data.filePath, // Use filePath for loading
                isPlaceholder: false,
            });
        });
        console.log(`✅ Found ${photosToLoad.length} unique latest photos matching required topics`);
        // Load images (fetches base64) - Function already handles errors/placeholders
        return await loadImagesFromStorage(photosToLoad);
    }
    catch (error) {
        console.error('❌ Error getting latest QC photos:', error);
        return []; // Return empty array on error
    }
}
/**
 * สร้าง Full Layout (QC)
 */
function createFullLayout(allTopics, foundPhotos) {
    console.log(`📐 Creating full layout with ${allTopics.length} topics and ${foundPhotos.length} found photos`);
    const photosByTopic = new Map();
    foundPhotos.forEach(photo => {
        // Use originalTopic if available, otherwise topic
        const key = photo.originalTopic || photo.topic;
        if (key) {
            photosByTopic.set(key, photo);
        }
    });
    const fullLayout = allTopics.map((topic, index) => {
        const photo = photosByTopic.get(topic);
        if (photo && !photo.isPlaceholder) { // Make sure it's not a placeholder from loading failure
            return Object.assign(Object.assign({}, photo), { topic: topic, topicOrder: index + 1, originalTopic: topic // Keep original topic if needed
             });
        }
        else {
            return {
                topic: topic,
                topicOrder: index + 1,
                imageBase64: null,
                isPlaceholder: true,
                originalTopic: topic
            };
        }
    });
    console.log(`✅ Created full layout: ${fullLayout.length} items`);
    return fullLayout;
}
/**
 * สร้าง PDF (QC)
 */
async function generatePDF(reportData, photos) {
    // Note: loadImagesFromStorage should now be called within getLatestPhotos
    // So 'photos' here should already have base64 or be marked as placeholder
    const pdfData = {
        photos: photos,
        projectName: reportData.projectName,
        category: `${reportData.mainCategory} > ${reportData.subCategory}`,
        dynamicFields: reportData.dynamicFields,
        building: reportData.dynamicFields['อาคาร'] || '',
        foundation: reportData.dynamicFields['ฐานรากเบอร์'] || '' // Adjust if field name differs
    };
    return await generateOptimizedPDF(pdfData); // Call the common PDF generator
}
/**
 * สร้าง PDF (Daily) - Wrapper function
 */
async function generateDailyPDFWrapper(reportData, photos) {
    // Note: photos should already have base64 from getDailyPhotosByDate
    // [FIX 2] เปลี่ยนชื่อฟังก์ชันที่เรียกใช้
    return await generateDailyPDFUsingPuppeteer(reportData, photos);
}
/**
 * อัปโหลด PDF to Storage
 */
async function uploadPDFToStorage(pdfBuffer, // <-- [FIX 2c] Changed back to Buffer
reportData, reportType) {
    try {
        const bucket = admin.storage().bucket();
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        let filename;
        let filePath;
        const basePath = `projects/${reportData.projectId}/reports`;
        if (reportType === 'QC') {
            const { mainCategory, subCategory, dynamicFields = {} } = reportData;
            const dynamicFieldsStr = Object.values(dynamicFields).filter(v => v).join('_') || 'all'; // Use 'all' if no fields
            const catPath = `${mainCategory.replace(/\s/g, '_')}_${subCategory.replace(/\s/g, '_')}`;
            filename = `QC-Report_${catPath}_${dynamicFieldsStr}_${timestamp}.pdf`;
            filePath = `${basePath}/QC/${filename}`;
        }
        else {
            const { date } = reportData;
            filename = `Daily-Report_${date}_${timestamp}.pdf`;
            filePath = `${basePath}/Daily/${filename}`;
        }
        console.log(`📤 Uploading PDF to: ${filePath}`);
        const file = bucket.file(filePath);
        await file.save(pdfBuffer, {
            metadata: {
                contentType: 'application/pdf',
                metadata: {
                    projectId: reportData.projectId,
                    reportType: reportType,
                    mainCategory: reportData.mainCategory || '',
                    subCategory: reportData.subCategory || '',
                    date: reportData.date || '',
                    generatedAt: new Date().toISOString()
                }
            }
        });
        console.log("Getting Signed URL...");
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491' // Far future expiry date
        });
        console.log(`✅ PDF uploaded successfully`);
        console.log(`📎 PDF URL: ${signedUrl}`);
        return { filename, publicUrl: signedUrl, filePath };
    }
    catch (error) {
        console.error('❌ Error uploading PDF:', error);
        // Re-throw the error so the calling function knows it failed
        throw error;
    }
}
/**
 * สร้าง PDF โดยใช้ Puppeteer (สำหรับ QC Report)
 */
async function generateOptimizedPDF(reportData) {
    let browser = null;
    let page = null;
    try {
        console.log('🎯 Starting QC PDF generation...');
        // Photos should already have base64 data from the calling function (generatePDF -> createFullLayout -> getLatestPhotos -> loadImagesFromStorage)
        const html = createOptimizedHTML(reportData);
        console.log('📄 QC HTML template created');
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
        page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
        await page.setJavaScriptEnabled(false);
        await page.setContent(html, { waitUntil: ['domcontentloaded'], timeout: 45000 });
        console.log('🌐 QC HTML content loaded');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for rendering
        const pdfUint8Array = await page.pdf({
            format: 'A4', printBackground: true, preferCSSPageSize: true,
            margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
            timeout: 60000
        });
        console.log(`✅ QC PDF generated! Size: ${pdfUint8Array.length} bytes`);
        return Buffer.from(pdfUint8Array); // <-- [FIX 2b] Convert to Buffer
    }
    catch (error) {
        console.error('❌ Error in QC PDF generation:', error);
        throw error;
    }
    finally {
        if (page)
            await page.close();
        if (browser)
            await browser.close();
        console.log('Browser closed for QC PDF');
    }
}
/**
 * สร้าง PDF โดยใช้ Puppeteer (สำหรับ Daily Report)
 */
// [FIX 3a] Renamed original function to avoid conflict
async function generateDailyPDFUsingPuppeteer(reportData, photos) {
    let browser = null;
    let page = null;
    try {
        console.log('🎯 Starting Daily PDF generation...');
        // Photos should already have base64 data from getDailyPhotosByDate -> loadImagesFromStorage
        const html = createDailyHTML(reportData, photos);
        console.log('📄 Daily HTML template created');
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
        page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
        await page.setJavaScriptEnabled(false);
        await page.setContent(html, { waitUntil: ['domcontentloaded'], timeout: 45000 });
        console.log('🌐 Daily HTML content loaded');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for rendering
        const pdfUint8Array = await page.pdf({
            format: 'A4', printBackground: true, preferCSSPageSize: true,
            margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
            timeout: 60000
        });
        console.log(`✅ Daily PDF generated! Size: ${pdfUint8Array.length} bytes`);
        return Buffer.from(pdfUint8Array); // <-- [FIX 2b] Convert to Buffer
    }
    catch (error) {
        console.error('❌ Error in Daily PDF generation:', error);
        throw error;
    }
    finally {
        if (page)
            await page.close();
        if (browser)
            await browser.close();
        console.log('Browser closed for Daily PDF');
    }
}
//# sourceMappingURL=pdf-generator.js.map