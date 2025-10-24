"use strict";
// pdf-generator.ts - Firebase Version 11 (Grid Layout for Both)
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
exports.getDailyPhotosByDate = exports.DEFAULT_SETTINGS = void 0;
exports.getUploadedTopicStatus = getUploadedTopicStatus;
exports.getLatestPhotos = getLatestPhotos;
exports.createFullLayout = createFullLayout;
exports.generatePDF = generatePDF;
exports.generateDailyPDFWrapper = generateDailyPDFWrapper;
exports.uploadPDFToStorage = uploadPDFToStorage;
exports.generateOptimizedPDF = generateOptimizedPDF;
const puppeteer = __importStar(require("puppeteer"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const axios_1 = __importDefault(require("axios"));
exports.DEFAULT_SETTINGS = {
    layoutType: 'default',
    qcPhotosPerPage: 6,
    dailyPhotosPerPage: 2,
    photosPerPage: 6,
    projectLogoUrl: '',
};
// ========================================
// HELPER FUNCTIONS (V11 - Unchanged)
// ========================================
async function fetchLogoAsBase64(url) {
    if (!url)
        return null;
    try {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        const mimeType = response.headers['content-type'] || 'image/png';
        const base64 = Buffer.from(response.data).toString('base64');
        return `data:${mimeType};base64,${base64}`;
    }
    catch (error) {
        console.error(`❌ Failed to fetch logo from ${url}:`, error.message);
        return null;
    }
}
async function loadImagesFromStorage(photos) {
    const bucket = admin.storage().bucket();
    if (!photos || photos.length === 0)
        return photos;
    console.log(`📥 Loading ${photos.length} images...`);
    const photosWithImages = [];
    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (photo.isPlaceholder) {
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: null }));
            continue;
        }
        const storagePath = photo.storageUrl;
        if (!storagePath) {
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: null }));
            continue;
        }
        try {
            const file = bucket.file(storagePath);
            const [buffer] = await file.download();
            const [metadata] = await file.getMetadata();
            const mimeType = metadata.contentType || 'image/jpeg';
            const base64 = buffer.toString('base64');
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: `data:${mimeType};base64,${base64}` }));
        }
        catch (error) {
            console.error(`❌ Failed to load image for "${photo.topic}" from ${storagePath}:`, error);
            photosWithImages.push(Object.assign(Object.assign({}, photo), { imageBase64: null }));
        }
    }
    return photosWithImages;
}
function getCurrentThaiDate() {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear() + 543;
    return `${day}/${month}/${year}`;
}
// ========================================
// HTML GENERATION FUNCTIONS (V11 - QC GRID)
// (This section is identical to V9.1)
// ========================================
function create2FieldHeader(fields, category, projectName, currentDate, pageNumber, totalPages, settings, logoBase64) {
    const fieldEntries = Object.entries(fields).filter(([key, value]) => value && value.trim());
    return `
    <header class="header">
      <div class="logo-section">
        ${logoBase64 ? `<img src="${logoBase64}" class="header-logo" alt="Logo">` : `
          <div class="logo-central-pattana"><span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span></div>`}
      </div>
      <div class="header-box">
        <div class="title-section"><h1>รูปถ่ายประกอบการตรวจสอบ</h1></div>
        <div class="info-section">
          <div class="info-column info-left">
            <div class="info-item"><span class="label">โครงการ:</span><span class="value">${projectName}</span></div>
            ${fieldEntries[0] ? `<div class="info-item"><span class="label">${fieldEntries[0][0]}:</span><span class="value">${fieldEntries[0][1]}</span></div>` : ''}
            <div class="info-item"><span class="label">หมวดงาน:</span><span class="value">${category}</span></div>
          </div>
          <div class="info-column info-right">
            <div class="info-item"><span class="label">วันที่:</span><span class="value">${currentDate}</span></div>
            ${fieldEntries[1] ? `<div class="info-item"><span class="label">${fieldEntries[1][0]}:</span><span class="value">${fieldEntries[1][1]}</span></div>` : ''}
            <div class="info-item"><span class="label">แผ่นที่:</span><span class="value">${pageNumber}/${totalPages}</span></div>
          </div>
        </div>
      </div>
    </header>`;
}
function create3FieldHeader(fields, category, projectName, currentDate, pageNumber, totalPages, settings, logoBase64) {
    const fieldEntries = Object.entries(fields).filter(([key, value]) => value && value.trim());
    return `
    <header class="header">
      <div class="logo-section">
        ${logoBase64 ? `<img src="${logoBase64}" class="header-logo" alt="Logo">` : `
          <div class="logo-central-pattana"><span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span></div>`}
      </div>
      <div class="header-box">
        <div class="title-section"><h1>รูปถ่ายประกอบการตรวจสอบ</h1></div>
        <div class="info-section">
          <div class="info-grid-3">
            <div class="info-item"><span class="label">โครงการ:</span><span class="value">${projectName}</span></div>
            <div class="info-item"><span class="label">วันที่:</span><span class="value">${currentDate}</span></div>
            <div class="info-item"><span class="label">หมวดงาน:</span><span class="value">${category}</span></div>
            ${fieldEntries.map(([key, value]) => `
              <div class="info-item"><span class="label">${key}:</span><span class="value">${value}</span></div>`).join('')}
            <div class="info-item"><span class="label">แผ่นที่:</span><span class="value">${pageNumber}/${totalPages}</span></div>
          </div>
        </div>
      </div>
    </header>`;
}
function create4FieldHeader(fields, category, projectName, currentDate, pageNumber, totalPages, settings, logoBase64) {
    const fieldEntries = Object.entries(fields).filter(([key, value]) => value && value.trim());
    return `
    <header class="header">
      <div class="logo-section">
        ${logoBase64 ? `<img src="${logoBase64}" class="header-logo" alt="Logo">` : `
          <div classs="logo-central-pattana"><span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span></div>`}
      </div>
      <div class="header-box">
        <div class="title-section"><h1>รูปถ่ายประกอบการตรวจสอบ</h1></div>
        <div class="info-section">
          <div class="info-grid-4">
            <div class="info-item"><span class="label">โครงการ:</span><span class="value">${projectName}</span></div>
            <div class="info-item"><span class="label">วันที่:</span><span class="value">${currentDate}</span></div>
            ${fieldEntries.map(([key, value]) => `
              <div class="info-item"><span class="label">${key}:</span><span class="value">${value}</span></div>`).join('')}
            <div class="info-item"><span class="label">หมวดงาน:</span><span class="value">${category}</span></div>
            <div class="info-item"><span class="label">แผ่นที่:</span><span class="value">${pageNumber}/${totalPages}</span></div>
          </div>
        </div>
      </div>
    </header>`;
}
function createDynamicHeader(reportData, pageNumber, totalPages, settings, logoBase64) {
    const { category, dynamicFields, projectName } = reportData;
    const currentDate = getCurrentThaiDate();
    const fieldsToDisplay = dynamicFields || {};
    const fieldCount = Object.keys(fieldsToDisplay).length;
    if (fieldCount <= 2) {
        return create2FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages, settings, logoBase64);
    }
    else if (fieldCount === 3) {
        return create3FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages, settings, logoBase64);
    }
    else {
        return create4FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages, settings, logoBase64);
    }
}
function createPhotosGrid(photos, pageIndex, photosPerPage) {
    const rows = [];
    const itemsPerBatch = photosPerPage === 1 ? 1 : 2;
    for (let i = 0; i < photos.length; i += itemsPerBatch) {
        rows.push(photos.slice(i, i + itemsPerBatch));
    }
    const totalGridHeight = 750;
    const numRows = rows.length > 0 ? rows.length : 1;
    const rowHeight = totalGridHeight / numRows;
    const rowsHTML = rows.map((rowPhotos, rowIndex) => {
        const photosHTML = rowPhotos.map((photo, photoIndex) => {
            const photoNumberInPage = (rowIndex * itemsPerBatch) + photoIndex + 1;
            const displayNumber = photo.topicOrder ||
                ((pageIndex * photosPerPage) + photoNumberInPage);
            // ✅ [V11] ใช้ topic (ซึ่ง Daily คือ description)
            const topicName = photo.topic || `รูปที่ ${displayNumber}`;
            return `
        <div class="photo-frame">
          <div class="photo-container">
            ${photo.imageBase64 ?
                `<img src="${photo.imageBase64}" alt="${topicName}" class="photo-image">` :
                `<div class="photo-placeholder"></div>`}
          </div>
          <div class="photo-caption">
            <span class="photo-number">${displayNumber}.</span>
            <span class="photo-title">${topicName}</span>
          </div>
        </div>
      `;
        }).join('');
        return `<div class="photo-row" style="height: ${rowHeight}px;">${photosHTML}</div>`;
    }).join('');
    return `<main class="photos-grid">${rowsHTML}</main>`;
}
function getInlineCSS() {
    // (CSS ทั้งหมดของ V9.1/V10 ถูกย้ายมาที่นี่)
    // (นี่คือ CSS ของ Grid Layout ที่สมบูรณ์แล้ว)
    return `
    <style>
      @page { size: A4; margin: 10mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 100%; height: 100%; font-family: 'Times New Roman', Times, serif;
        font-size: 12px; line-height: 1.4; color: #333; background: white;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .page {
        width: 100%; height: 100vh; background: white; padding: 12px;
        position: relative; display: flex; flex-direction: column;
      }
      .header { margin-bottom: 10px; flex-shrink: 0; }
      .logo-section {
        text-align: right; margin-bottom: 8px; height: 40px;
        display: flex; justify-content: flex-end; align-items: center;
      }
      .header-logo {
        max-height: 40px; max-width: 200px; width: auto;
        height: auto; object-fit: contain;
      }
      .logo-central-pattana {
        font-family: Arial, sans-serif; font-size: 16px;
        font-weight: bold; letter-spacing: 1px;
      }
      .logo-central { color: #000; }
      .logo-pattana { color: #C5A572; }
      .header-box {
        border: 2px solid #000; border-radius: 0;
        background: white; width: 100%;
      }
      .title-section {
        background: #fff; padding: 10px;
        text-align: center; border-bottom: 1px solid #000;
      }
      .title-section h1 {
        font-size: 18px; font-weight: bold; color: #000;
        margin: 0; font-family: 'Times New Roman', Times, serif;
      }
      .info-section {
        display: table; width: 100%; padding: 8px;
        background: #fff; min-height: 60px;
      }
      .info-column {
        display: table-cell; width: 50%; vertical-align: top; padding: 0 8px;
      }
      .info-right { border-left: 1px solid #ddd; }
      .info-grid-3 {
        display: grid; grid-template-columns: 1fr 1fr 1fr;
        grid-template-rows: 1fr 1fr; gap: 4px; padding: 8px; min-height: 60px;
      }
      .info-grid-4 {
        display: grid; grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr; gap: 3px; padding: 6px; min-height: 70px;
      }
      .info-item {
        margin-bottom: 4px; font-size: 10px; line-height: 1.2;
        font-family: 'Times New Roman', Times, serif;
        display: flex; align-items: center;
      }
      .info-grid-3 .info-item,
      .info-grid-4 .info-item {
        font-size: 9px; margin-bottom: 2px;
      }
      .label {
        font-weight: bold; color: #000; display: inline-block;
        min-width: 50px; flex-shrink: 0;
      }
      .info-grid-3 .label,
      .info-grid-4 .label {
        min-width: 40px; font-size: 9px;
      }
      .value {
        color: #333; margin-left: 4px; word-wrap: break-word; flex: 1;
      }
      .photos-grid {
        width: 100%; overflow: hidden; flex: 1;
        display: flex; flex-direction: column;
        margin-top: 5px; max-height: 750px;
      }
      .photo-row {
        display: flex; margin-bottom: 5px; justify-content: flex-start; 
      }
      .photo-row:last-child { margin-bottom: 0; }
      .photo-frame {
        flex: 1; display: flex; flex-direction: column;
        margin: 0 3px; max-width: 50%;
      }
      .photo-row .photo-frame:only-child {
        flex: 1; max-width: 100%;
      }
      .photo-frame:first-child { margin-left: 0; }
      .photo-frame:last-child { margin-right: 0; }
      .photo-container {
        flex: 1; background: white; text-align: center;
        position: relative; overflow: hidden; display: flex;
        align-items: center; justify-content: center; min-height: 0;
      }
      .photo-image {
        max-width: 95%; max-height: 95%; width: auto;
        height: auto; object-fit: contain;
      }
      .photo-placeholder {
        width: 100%; height: 100%; display: flex; align-items: center;
        justify-content: center; background: #f0f0f0; color: #999;
        font-style: italic; font-family: 'Times New Roman', Times, serif;
      }
      .photo-caption {
        background: white; text-align: center; font-size: 9px;
        line-height: 1.2; font-family: 'Times New Roman', Times, serif;
        padding: 3px 2px; min-height: 35px; display: flex;
        align-items: center; justify-content: center; flex-shrink: 0;
      }
      .photo-number {
        font-weight: bold; color: #000; margin-right: 3px;
      }
      .photo-title {
        color: #333; word-wrap: break-word; text-align: center;
      }
      @media print {
        .page {
          page-break-after: always; margin: 0;
          padding: 12px; height: 100vh;
        }
        .page:last-child { page-break-after: avoid; }
        .photo-image {
          print-color-adjust: exact; -webkit-print-color-adjust: exact;
        }
      }
    </style>
  `;
}
// ========================================
// [ลบ V11] - ลบ HTML Generation (Daily)
// ========================================
// (ฟังก์ชัน createDailyHTML ถูกลบออกทั้งหมด)
// ========================================
// HTML OPTIMIZATION (V11 - Unchanged)
// ========================================
function createOptimizedHTML(reportData, settings, logoBase64) {
    const { photos } = reportData;
    // ✅ (Unchanged)
    // ฟังก์ชันนี้จะอ่าน "photosPerPage" ที่ถูก "ยัด" มาให้โดย
    // index.ts (ไม่ว่าจะเป็น qcPhotosPerPage หรือ dailyPhotosPerPage)
    const photosPerPage = settings.photosPerPage || 6;
    const pages = [];
    for (let i = 0; i < photos.length; i += photosPerPage) {
        pages.push(photos.slice(i, i + photosPerPage));
    }
    if (pages.length === 0) {
        pages.push([]);
    }
    const pageHTML = pages.map((pagePhotos, pageIndex) => `
    <div class="page" ${pageIndex < pages.length - 1 ? 'style="page-break-after: always;"' : ''}>
      ${createDynamicHeader(reportData, pageIndex + 1, pages.length, settings, logoBase64)}
      ${createPhotosGrid(pagePhotos, pageIndex, photosPerPage)}
    </div>
  `).join('');
    return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>รายงานการตรวจสอบ</title> ${getInlineCSS()}
    </head>
    <body>
      ${pageHTML}
    </body>
    </html>
  `;
}
// ========================================
// MAIN EXPORTED FUNCTIONS (V11)
// ========================================
// (getUploadedTopicStatus - Unchanged)
async function getUploadedTopicStatus(projectId, category, dynamicFields) {
    const db = admin.firestore();
    let query = db.collection('qcPhotos').where('projectId', '==', projectId).where('category', '==', category);
    Object.entries(dynamicFields).forEach(([key, value]) => {
        if (key && value)
            query = query.where(`dynamicFields.${key}`, '==', value);
    });
    const snapshot = await query.get();
    const uploadedTopics = {};
    snapshot.forEach(doc => {
        const topic = doc.data().topic;
        if (topic && !uploadedTopics[topic])
            uploadedTopics[topic] = true;
    });
    return uploadedTopics;
}
// (getDailyPhotosByDate - Unchanged)
const getDailyPhotosByDate = async (projectId, date) => {
    const db = admin.firestore();
    const startDate = new Date(`${date}T00:00:00+07:00`);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    const photosSnapshot = await db
        .collection("dailyPhotos")
        .where("projectId", "==", projectId)
        .where("createdAt", ">=", firestore_1.Timestamp.fromDate(startDate))
        .where("createdAt", "<", firestore_1.Timestamp.fromDate(endDate))
        .orderBy("createdAt", "asc")
        .get();
    if (photosSnapshot.empty)
        return [];
    const photosToLoad = photosSnapshot.docs.map(doc => {
        const data = doc.data();
        let isoTimestamp = new Date().toISOString();
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            isoTimestamp = data.createdAt.toDate().toISOString();
        }
        return {
            topic: data.description || '', storageUrl: data.filePath,
            isPlaceholder: false, location: data.location || '',
            timestamp: isoTimestamp
        };
    });
    const photosWithBase64 = await loadImagesFromStorage(photosToLoad);
    return photosWithBase64.map(photo => ({
        description: photo.topic, base64: photo.imageBase64 || null,
        location: photo.location || '', timestamp: photo.timestamp || ''
    }));
};
exports.getDailyPhotosByDate = getDailyPhotosByDate;
// (getLatestPhotos - Unchanged)
async function getLatestPhotos(projectId, mainCategory, subCategory, allTopics, dynamicFields) {
    try {
        const category = `${mainCategory} > ${subCategory}`;
        const db = admin.firestore();
        let query = db.collection('qcPhotos').where('projectId', '==', projectId).where('category', '==', category).orderBy('createdAt', 'desc');
        Object.entries(dynamicFields).forEach(([key, value]) => {
            if (key && value)
                query = query.where(`dynamicFields.${key}`, '==', value);
        });
        const snapshot = await query.get();
        if (snapshot.empty)
            return [];
        const latestPhotosMap = new Map();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const topic = data.topic;
            if (topic && allTopics.includes(topic)) {
                if (!latestPhotosMap.has(topic))
                    latestPhotosMap.set(topic, data);
            }
        });
        const photosToLoad = [];
        latestPhotosMap.forEach((data, topic) => {
            photosToLoad.push({
                topic: topic, originalTopic: topic, imageBase64: null,
                storageUrl: data.filePath, isPlaceholder: false,
            });
        });
        return await loadImagesFromStorage(photosToLoad);
    }
    catch (error) {
        console.error('❌ Error getting latest QC photos:', error);
        return [];
    }
}
// (createFullLayout - Unchanged)
function createFullLayout(allTopics, foundPhotos) {
    const photosByTopic = new Map();
    foundPhotos.forEach(photo => {
        const key = photo.originalTopic || photo.topic;
        if (key)
            photosByTopic.set(key, photo);
    });
    const fullLayout = allTopics.map((topic, index) => {
        const photo = photosByTopic.get(topic);
        if (photo && !photo.isPlaceholder) {
            return Object.assign(Object.assign({}, photo), { topic: topic, topicOrder: index + 1, originalTopic: topic });
        }
        else {
            return {
                topic: topic, topicOrder: index + 1, imageBase64: null,
                isPlaceholder: true, originalTopic: topic
            };
        }
    });
    return fullLayout;
}
// (generatePDF (QC Wrapper) - Unchanged)
async function generatePDF(reportData, photos, settings) {
    const logoBase64 = await fetchLogoAsBase64(settings.projectLogoUrl);
    const pdfData = {
        photos: photos,
        projectName: reportData.projectName,
        category: `${reportData.mainCategory} > ${reportData.subCategory}`,
        dynamicFields: reportData.dynamicFields,
    };
    return await generateOptimizedPDF(pdfData, settings, logoBase64);
}
// ✅ [แก้ไข V11] - แก้ไข Daily Wrapper
async function generateDailyPDFWrapper(reportData, photos, settings // (นี่คือ dailySettings ที่มี photosPerPage ถูกต้องแล้ว)
) {
    console.log('🔄 [V11] Using GRID layout for Daily Report.');
    // 1. [ใหม่] แปลง DailyPhotoWithBase64[] ➜ FullLayoutPhoto[]
    const transformedPhotos = photos.map((photo, index) => {
        return {
            topic: photo.description || `รูปที่ ${index + 1}`, // (คำบรรยาย ➜ หัวข้อ)
            topicOrder: index + 1,
            imageBase64: photo.base64,
            isPlaceholder: !photo.base64,
            originalTopic: photo.description || `รูปที่ ${index + 1}`,
        };
    });
    // 2. [ใหม่] สร้าง PDFReportData (แบบเดียวกับ QC)
    // (แปลง Date ➜ Category เพื่อให้ Header ของ QC แสดงผลได้)
    const thaiDate = new Date(reportData.date).toLocaleDateString('th-TH', { dateStyle: 'long' });
    const pdfData = {
        photos: transformedPhotos,
        projectName: reportData.projectName,
        category: `รายงานประจำวัน (${thaiDate})`, // (แสดงวันที่แทนหมวดงาน)
        dynamicFields: {} // (Daily ไม่มี Dynamic Fields)
    };
    // 3. [ใหม่] ดึง Logo
    const logoBase64 = await fetchLogoAsBase64(settings.projectLogoUrl);
    // 4. [ใหม่] เรียกใช้ตัวสร้าง PDF ของ QC (generateOptimizedPDF)
    //    แทนตัวสร้าง Daily เดิม
    return await generateOptimizedPDF(pdfData, settings, logoBase64);
}
// (uploadPDFToStorage - Unchanged)
async function uploadPDFToStorage(pdfBuffer, reportData, reportType) {
    try {
        const bucket = admin.storage().bucket();
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        let filename;
        let filePath;
        const basePath = `projects/${reportData.projectId}/reports`;
        if (reportType === 'QC') {
            const { mainCategory, subCategory, dynamicFields = {} } = reportData;
            const dynamicFieldsStr = Object.values(dynamicFields).filter(v => v).join('_') || 'all';
            const catPath = `${mainCategory.replace(/\s/g, '_')}_${subCategory.replace(/\s/g, '_')}`;
            filename = `QC-Report_${catPath}_${dynamicFieldsStr}_${timestamp}.pdf`;
            filePath = `${basePath}/QC/${filename}`;
        }
        else {
            const { date } = reportData;
            filename = `Daily-Report_${date}_${timestamp}.pdf`;
            filePath = `${basePath}/Daily/${filename}`;
        }
        const file = bucket.file(filePath);
        await file.save(pdfBuffer, {
            metadata: {
                contentType: 'application/pdf',
                metadata: {
                    projectId: reportData.projectId, reportType: reportType,
                    mainCategory: reportData.mainCategory || '',
                    subCategory: reportData.subCategory || '',
                    date: reportData.date || '',
                    generatedAt: new Date().toISOString()
                }
            }
        });
        const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        return { filename, publicUrl: signedUrl, filePath };
    }
    catch (error) {
        console.error('❌ Error uploading PDF:', error);
        throw error;
    }
}
// (generateOptimizedPDF (Core Grid Generator) - Unchanged)
async function generateOptimizedPDF(reportData, settings, logoBase64) {
    let browser = null;
    let page = null;
    try {
        console.log(`🎯 Starting Optimized GRID PDF generation (V11)...`);
        const html = createOptimizedHTML(reportData, settings, logoBase64);
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
        page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
        await page.setJavaScriptEnabled(false);
        await page.setContent(html, { waitUntil: ['domcontentloaded'], timeout: 45000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        const pdfUint8Array = await page.pdf({
            format: 'A4', printBackground: true, preferCSSPageSize: true,
            margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
            timeout: 60000
        });
        console.log(`✅ GRID PDF generated! Size: ${pdfUint8Array.length} bytes`);
        return Buffer.from(pdfUint8Array);
    }
    catch (error) {
        console.error('❌ Error in GRID PDF generation:', error);
        throw error;
    }
    finally {
        if (page)
            await page.close();
        if (browser)
            await browser.close();
    }
}
// ========================================
// [ลบ V11] - ลบ Daily PDF Generator
// ========================================
// (ฟังก์ชัน generateDailyPDFUsingPuppeteer ถูกลบออกทั้งหมด)
//# sourceMappingURL=pdf-generator.js.map