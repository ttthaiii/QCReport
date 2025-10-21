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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestPhotos = getLatestPhotos;
exports.createFullLayout = createFullLayout;
exports.generatePDF = generatePDF;
exports.uploadPDFToStorage = uploadPDFToStorage;
exports.generateOptimizedPDF = generateOptimizedPDF;
const puppeteer_1 = __importDefault(require("puppeteer"));
const admin = __importStar(require("firebase-admin"));
// ========================================
// HELPER FUNCTIONS
// ========================================
/**
 * ดาวน์โหลดรูปจาก URL และแปลงเป็น base64
 */
async function downloadImageAsBase64(imageUrl) {
    try {
        console.log(`📥 Downloading image from: ${imageUrl}`);
        // 🔥 แปลง Production URL เป็น Emulator URL ถ้าจำเป็น
        const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
        let downloadUrl = imageUrl;
        if (isEmulator && imageUrl.includes('storage.googleapis.com')) {
            // แปลงจาก: https://storage.googleapis.com/bucket/path
            // เป็น: http://localhost:9199/bucket/path
            downloadUrl = imageUrl.replace('https://storage.googleapis.com', 'http://localhost:9199');
            console.log(`🔄 Converted to emulator URL: ${downloadUrl}`);
        }
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        console.log(`✅ Image downloaded: ${base64.length} chars`);
        return base64;
    }
    catch (error) {
        console.error(`❌ Error downloading image from ${imageUrl}:`, error);
        return null;
    }
}
/**
 * โหลดรูปทั้งหมดจาก URL
 */
async function loadImagesFromStorage(photos) {
    if (!photos || photos.length === 0) {
        console.log('⚠️ No photos to load');
        return photos;
    }
    console.log(`📥 Loading ${photos.length} images...`);
    const photosWithImages = [];
    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (photo.isPlaceholder) {
            console.log(`🔳 Skipping placeholder ${i + 1}/${photos.length}: "${photo.topic}"`);
            photosWithImages.push(photo);
            continue;
        }
        if (photo.imageBase64) {
            console.log(`✅ Photo ${i + 1}/${photos.length} already has base64: "${photo.topic}"`);
            photosWithImages.push(photo);
            continue;
        }
        console.log(`📷 Loading image ${i + 1}/${photos.length}: "${photo.topic}"`);
        try {
            const imageUrl = photo.storageUrl || photo.imageUrl;
            if (!imageUrl) {
                console.log(`⚠️ No image URL for "${photo.topic}"`);
                photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: null }));
                continue;
            }
            const base64 = await downloadImageAsBase64(imageUrl);
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: base64 }));
        }
        catch (error) {
            console.error(`❌ Failed to load image for "${photo.topic}":`, error);
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: null }));
        }
    }
    const successCount = photosWithImages.filter(p => p.imageBase64).length;
    const placeholderCount = photosWithImages.filter(p => p.isPlaceholder).length;
    const failCount = photosWithImages.filter(p => !p.imageBase64 && !p.isPlaceholder).length;
    console.log(`📊 Image loading results: ${successCount} loaded, ${placeholderCount} placeholders, ${failCount} failed`);
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
                `<img src="data:image/jpeg;base64,${photo.imageBase64}" 
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
/**
 * สร้าง HTML Template
 */
function createOptimizedHTML(reportData) {
    const { photos } = reportData;
    const photosPerPage = 6;
    const pages = [];
    for (let i = 0; i < photos.length; i += photosPerPage) {
        const pagePhotos = photos.slice(i, i + photosPerPage);
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
// ========================================
// MAIN EXPORTED FUNCTIONS
// ========================================
/**
 * ดึงรูปล่าสุดจาก Firestore
 */
async function getLatestPhotos(projectId, mainCategory, subCategory, allTopics, dynamicFields) {
    try {
        console.log(`🔍 Getting latest photos for ${mainCategory} > ${subCategory}`);
        const db = admin.firestore();
        const category = `${mainCategory} > ${subCategory}`;
        let query = db.collection('qcPhotos')
            .where('projectId', '==', projectId)
            .where('category', '==', category);
        Object.entries(dynamicFields).forEach(([key, value]) => {
            if (value) {
                query = query.where(`dynamicFields.${key}`, '==', value);
            }
        });
        const snapshot = await query.get();
        if (snapshot.empty) {
            console.log('⚠️ No photos found');
            return [];
        }
        const photosByTopic = new Map();
        snapshot.forEach(doc => {
            var _a, _b, _c, _d;
            const data = doc.data();
            const topic = data.topic;
            if (!photosByTopic.has(topic)) {
                photosByTopic.set(topic, data);
            }
            else {
                const existing = photosByTopic.get(topic);
                const existingTime = ((_b = (_a = existing.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date(0);
                const newTime = ((_d = (_c = data.createdAt) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c)) || new Date(0);
                if (newTime > existingTime) {
                    photosByTopic.set(topic, data);
                }
            }
        });
        const photos = [];
        for (const [topic, data] of photosByTopic.entries()) {
            const photoItem = {
                topic: topic,
                imageBase64: data.imageBase64 || null,
                imageUrl: data.driveUrl || data.filePath,
                storageUrl: data.filePath,
                isPlaceholder: false
            };
            // 🔥 Debug log
            console.log(`📸 Photo "${topic}":`, {
                hasBase64: !!photoItem.imageBase64,
                imageUrl: photoItem.imageUrl,
                storageUrl: photoItem.storageUrl
            });
            photos.push(photoItem);
        }
        console.log(`✅ Found ${photos.length} unique photos`);
        // 🔥 โหลดรูปเฉพาะตัวที่ยังไม่มี base64
        return await loadImagesFromStorage(photos);
    }
    catch (error) {
        console.error('❌ Error getting latest photos:', error);
        return [];
    }
}
/**
 * สร้าง Full Layout
 */
function createFullLayout(allTopics, foundPhotos) {
    console.log(`📐 Creating full layout with ${allTopics.length} topics`);
    const photosByTopic = new Map();
    foundPhotos.forEach(photo => {
        photosByTopic.set(photo.topic, photo);
    });
    const fullLayout = [];
    allTopics.forEach((topic, index) => {
        const photo = photosByTopic.get(topic);
        if (photo) {
            fullLayout.push(Object.assign(Object.assign({}, photo), { topicOrder: index + 1, originalTopic: topic }));
        }
        else {
            fullLayout.push({
                topic: topic,
                topicOrder: index + 1,
                imageBase64: null,
                isPlaceholder: true,
                originalTopic: topic
            });
        }
    });
    console.log(`✅ Created full layout: ${fullLayout.length} items`);
    return fullLayout;
}
/**
 * สร้าง PDF
 */
async function generatePDF(reportData, photos) {
    const pdfData = {
        photos: photos,
        projectName: reportData.projectName,
        category: `${reportData.mainCategory} > ${reportData.subCategory}`,
        dynamicFields: reportData.dynamicFields,
        building: reportData.dynamicFields['อาคาร'] || '',
        foundation: reportData.dynamicFields['ฐานรากเบอร์'] || ''
    };
    return await generateOptimizedPDF(pdfData);
}
/**
 * อัปโหลด PDF
 */
async function uploadPDFToStorage(pdfBuffer, reportData) {
    try {
        const bucket = admin.storage().bucket();
        const dynamicFieldsStr = Object.entries(reportData.dynamicFields)
            .map(([k, v]) => v)
            .filter(v => v)
            .join('_') || 'd';
        const filename = `${reportData.projectId}_${reportData.mainCategory.replace(/\s/g, '_')}_${reportData.subCategory.replace(/\s/g, '_')}_${dynamicFieldsStr}.pdf`;
        const filePath = `projects/${reportData.projectId}/reports/${filename}`;
        console.log(`📤 Uploading PDF to: ${filePath}`);
        const file = bucket.file(filePath);
        await file.save(pdfBuffer, {
            metadata: {
                contentType: 'application/pdf',
                metadata: {
                    projectId: reportData.projectId,
                    mainCategory: reportData.mainCategory,
                    subCategory: reportData.subCategory,
                    generatedAt: new Date().toISOString()
                }
            }
        });
        // 🔥 Make public (จะไม่ทำงานใน emulator แต่ไม่ error)
        await file.makePublic().catch(() => {
            console.log('⚠️ makePublic() not supported in emulator');
        });
        // 🔥 สร้าง URL ที่ถูกต้องตาม environment
        const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' ||
            process.env.FIRESTORE_EMULATOR_HOST;
        let publicUrl;
        if (isEmulator) {
            // Emulator URL
            const encodedPath = encodeURIComponent(filePath);
            publicUrl = `http://localhost:9199/${bucket.name}/${encodedPath}`;
        }
        else {
            // Production URL
            publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        }
        console.log(`✅ PDF uploaded successfully`);
        console.log(`📎 PDF URL: ${publicUrl}`);
        return {
            filename,
            publicUrl,
            filePath
        };
    }
    catch (error) {
        console.error('❌ Error uploading PDF:', error);
        throw error;
    }
}
/**
 * สร้าง PDF (Main Function)
 */
async function generateOptimizedPDF(reportData) {
    let browser = null;
    let page = null;
    try {
        console.log('🎯 Starting Firebase PDF generation...');
        const photosWithImages = await loadImagesFromStorage(reportData.photos);
        const updatedReportData = Object.assign(Object.assign({}, reportData), { photos: photosWithImages });
        const html = createOptimizedHTML(updatedReportData);
        console.log('📄 HTML template created');
        browser = await puppeteer_1.default.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        page = await browser.newPage();
        await page.setViewport({
            width: 1200,
            height: 800,
            deviceScaleFactor: 2
        });
        await page.setJavaScriptEnabled(false);
        await page.setContent(html, {
            waitUntil: ['domcontentloaded'],
            timeout: 45000
        });
        console.log('🌐 HTML content loaded');
        await new Promise(resolve => setTimeout(resolve, 2000));
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
        console.log(`✅ PDF generated! Size: ${pdfBuffer.length} bytes`);
        return Buffer.from(pdfBuffer);
    }
    catch (error) {
        console.error('❌ Error in PDF generation:', error);
        throw error;
    }
    finally {
        if (page) {
            await page.close();
        }
        if (browser) {
            await browser.close();
        }
    }
}
//# sourceMappingURL=pdf-generator.js.map