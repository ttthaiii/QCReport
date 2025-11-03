"use strict";
// pdf-generator.ts - Fixed Version with Original Layout
// รูปแบบเหมือนรูปที่ 1-2 (มี logo มุมขวา, header เป็นตาราง, รูปไม่มีกรอบ)
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
exports.DEFAULT_SETTINGS = void 0;
exports.getTopicsForFilter = getTopicsForFilter;
exports.getDailyPhotosByDate = getDailyPhotosByDate;
exports.getLatestPhotos = getLatestPhotos;
exports.createFullLayoutPhotos = createFullLayoutPhotos;
exports.createFullLayout = createFullLayout;
exports.getUploadedTopicStatus = getUploadedTopicStatus;
exports.generatePDF = generatePDF;
exports.generateDailyPDFWrapper = generateDailyPDFWrapper;
exports.uploadPDFToStorage = uploadPDFToStorage;
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const chromium_1 = __importDefault(require("@sparticuz/chromium"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
// ========================================
// Helper Functions
// ========================================
function createStableQcId(projectId, category, topic, dynamicFields) {
    const sortedFields = Object.keys(dynamicFields || {}).sort()
        .map(key => `${key}=${dynamicFields[key]}`)
        .join('&');
    const rawId = `${projectId}|${category}|${topic}|${sortedFields}`;
    return (0, crypto_1.createHash)('md5').update(rawId).digest('hex');
}
function getCurrentThaiDate() {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear() + 543;
    return `${day}/${month}/${year}`;
}
exports.DEFAULT_SETTINGS = {
    layoutType: 'default',
    qcPhotosPerPage: 6,
    dailyPhotosPerPage: 6,
    photosPerPage: 6,
    projectLogoUrl: '',
};
// ========================================
// DATA FETCHING FUNCTIONS
// ========================================
async function fetchAndEncodeImage(url) {
    try {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
    catch (error) {
        console.warn(`⚠️ Failed to fetch or encode image: ${url}`, error.message);
        return null;
    }
}
async function fetchProjectLogo(projectLogoUrl) {
    if (!projectLogoUrl)
        return null;
    console.log(`Fetching project logo from: ${projectLogoUrl}`);
    return fetchAndEncodeImage(projectLogoUrl);
}
async function getTopicsForFilter(db, projectId, mainCategory, subCategory) {
    try {
        const projectConfigRef = db.collection("projectConfig").doc(projectId);
        const mainCatSnap = await projectConfigRef.collection("mainCategories")
            .where("name", "==", mainCategory).limit(1).get();
        if (mainCatSnap.empty)
            throw new Error("Main category not found.");
        const mainCatId = mainCatSnap.docs[0].id;
        const subCatSnap = await projectConfigRef.collection("subCategories")
            .where("name", "==", subCategory)
            .where("mainCategoryId", "==", mainCatId)
            .limit(1).get();
        if (subCatSnap.empty)
            throw new Error("Sub category not found.");
        const subCatId = subCatSnap.docs[0].id;
        const topicsSnap = await projectConfigRef.collection("topics")
            .where("subCategoryId", "==", subCatId)
            .where("isArchived", "==", false)
            .get();
        const allTopics = topicsSnap.docs.map(doc => doc.data().name);
        return allTopics;
    }
    catch (error) {
        console.error("Error getting topics for filter:", error);
        return [];
    }
}
async function getDailyPhotosByDate(projectId, date) {
    const db = admin.firestore();
    const startDate = new Date(`${date}T00:00:00+07:00`);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    console.log(`Fetching Daily photos for ${projectId} between ${startDate.toISOString()} and ${endDate.toISOString()}`);
    const photosSnapshot = await db.collection("dailyPhotos")
        .where("projectId", "==", projectId)
        .where("createdAt", ">=", startDate)
        .where("createdAt", "<", endDate)
        .orderBy("createdAt", "asc")
        .get();
    console.log(`Found ${photosSnapshot.docs.length} daily photos.`);
    const photos = await Promise.all(photosSnapshot.docs.map(async (doc, index) => {
        const data = doc.data();
        const createdAt = data.createdAt.toDate();
        const timeString = createdAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
        const topicName = data.description
            ? `${timeString} - ${data.description}`
            : `${timeString} - (No Description)`;
        const imageBase64 = data.driveUrl ? await fetchAndEncodeImage(data.driveUrl) : null;
        return {
            topic: topicName,
            topicOrder: index,
            imageBase64: imageBase64,
            isPlaceholder: !imageBase64,
            location: data.location,
            timestamp: createdAt.toISOString(),
        };
    }));
    return photos;
}
async function getLatestPhotos(projectId, mainCategory, subCategory, allTopics, dynamicFields) {
    const db = admin.firestore();
    const category = `${mainCategory} > ${subCategory}`;
    console.log(`Fetching latest QC photos from 'latestQcPhotos' for: ${category}`);
    console.log(`Dynamic fields:`, dynamicFields);
    const photoPromises = allTopics.map(async (topic) => {
        const stableId = createStableQcId(projectId, category, topic, dynamicFields || {});
        const docRef = db.collection('latestQcPhotos').doc(stableId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        const imageBase64 = data.driveUrl ? await fetchAndEncodeImage(data.driveUrl) : null;
        return {
            topic: topic,
            imageBase64: imageBase64,
            isPlaceholder: false,
            location: data.location,
            timestamp: data.createdAt ? data.createdAt.toDate().toISOString() : undefined,
        };
    });
    const photos = await Promise.all(photoPromises);
    return photos.filter((p) => p !== null);
}
function createFullLayoutPhotos(photos, allTopics) {
    const photosByTopic = new Map();
    photos.forEach(photo => {
        photosByTopic.set(photo.topic, photo);
    });
    const fullLayoutPhotos = [];
    allTopics.forEach((topic, index) => {
        const photo = photosByTopic.get(topic);
        if (photo && photo.imageBase64) {
            fullLayoutPhotos.push(Object.assign(Object.assign({}, photo), { topicOrder: index + 1, originalTopic: topic }));
        }
        else {
            fullLayoutPhotos.push({
                topic: topic,
                topicOrder: index + 1,
                imageBase64: null,
                isPlaceholder: true,
                originalTopic: topic
            });
        }
    });
    return fullLayoutPhotos;
}
// Alias for backward compatibility with index.ts
// Signature: createFullLayout(allTopics: string[], foundPhotos: PhotoData[]): FullLayoutPhoto[]
function createFullLayout(allTopics, foundPhotos) {
    return createFullLayoutPhotos(foundPhotos, allTopics);
}
// ========================================
// HELPER FUNCTIONS FOR INDEX.TS
// ========================================
/**
 * ตรวจสอบสถานะการอัปโหลดรูปของแต่ละหัวข้อ
 * Returns: Map<topicName, boolean> - true ถ้ามีรูปอัปโหลดแล้ว
 */
async function getUploadedTopicStatus(projectId, category, dynamicFields) {
    const db = admin.firestore();
    const statusMap = {};
    try {
        // Query qcPhotos collection
        let query = db.collection('qcPhotos')
            .where('projectId', '==', projectId)
            .where('category', '==', category);
        // Add dynamic fields filters
        if (dynamicFields) {
            Object.keys(dynamicFields).forEach(key => {
                const value = dynamicFields[key];
                if (value) {
                    query = query.where(`dynamicFields.${key}`, '==', value);
                }
            });
        }
        const snapshot = await query.get();
        // Create status map
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.topic) {
                statusMap[data.topic] = true;
            }
        });
        console.log(`📊 Found ${Object.keys(statusMap).length} uploaded topics for ${category}`);
        return statusMap;
    }
    catch (error) {
        console.error('Error in getUploadedTopicStatus:', error);
        return statusMap;
    }
}
// ========================================
// HTML/CSS GENERATION (Original Layout Style)
// ========================================
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
      
      body {
        font-family: 'Sarabun', 'TH Sarabun New', sans-serif;
        font-size: 12px;
        line-height: 1.3;
        color: #000;
        background: white;
      }
      
      .page {
        width: 210mm;
        min-height: 297mm;
        padding: 0;
        margin: 0 auto;
        background: white;
        position: relative;
      }
      
      /* Header Styles - แก้ไข Logo ไม่ให้ทับ */
      .header {
        position: relative;
        margin-bottom: 15px;
        padding-top: 22px;
      }
      
      .logo-section {
        position: absolute;
        top: 0;
        right: 0;
        z-index: 10;
      }
      
      .logo-central-pattana {
        font-size: 16px;
        font-weight: bold;
        letter-spacing: 0.5px;
      }
      
      .logo-central {
        color: #000;
      }
      
      .logo-pattana {
        color: #FFA500;
      }
      
      /* Header Box */
      .header-box {
        border: 2px solid #000;
        padding: 6px 8px;
      }
      
      .title-section {
        text-align: center;
        padding: 4px 0;
        border-bottom: 2px solid #000;
        margin-bottom: 6px;
      }
      
      .title-section h1 {
        font-size: 16px;
        font-weight: bold;
      }
      
      .info-section {
        display: flex;
        justify-content: space-between;
      }
      
      .info-column {
        flex: 1;
        padding: 2px 6px;
        font-size: 11px;
      }
      
      /* เส้นแบ่งสีเทาอ่อน */
      .info-left {
        border-right: 1px solid #ccc;
      }
      
      .info-right {
        /* No border for the rightmost column */
      }
      
      .info-item {
        padding: 1px 0;
        display: flex;
        line-height: 1.4;
      }
      
      .info-item .label {
        font-weight: bold;
        min-width: 70px;
        flex-shrink: 0;
      }
      
      .info-item .value {
        flex: 1;
        word-break: break-word;
      }
      
      /* Photos Grid - ลดขนาดรูป เพิ่มระยะห่าง */
      .photos-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px 12px;
        margin-top: 10px;
      }
      
      .photo-item {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      
      .photo-wrapper {
        width: 100%;
        aspect-ratio: 4/3;
        background: #f5f5f5;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        margin-bottom: 4px;
      }
      
      /* กรอบที่มีรูป - ไม่มี background สีเทา */
      .photo-wrapper.has-image {
        background: white;
      }
      
      .photo-wrapper img {
        max-width: 95%;
        max-height: 95%;
        width: auto;
        height: auto;
        object-fit: contain;
      }
      
      /* ซ่อนข้อความ "ไม่มีรูปภาพ" */
      .placeholder-text {
        display: none;
      }
      
      .photo-caption {
        text-align: center;
        font-size: 11px;
        padding: 2px 0;
        font-weight: normal;
        line-height: 1.3;
      }
      
      /* Page Break */
      .page-break {
        page-break-after: always;
      }
    </style>
  `;
}
function createDynamicHeader(reportData, pageNumber, totalPages) {
    const currentDate = getCurrentThaiDate();
    // Check if it's QC Report or Daily Report
    const isQCReport = 'mainCategory' in reportData;
    if (isQCReport) {
        const qcData = reportData;
        const fieldEntries = Object.entries(qcData.dynamicFields || {}).filter(([_, value]) => value && value.trim());
        // คำนวณว่าต้องใช้กี่ช่อง (3 ช่องต่อแถว)
        // แถวแรก: โครงการ, หมวดงานหลัก, หมวดงานย่อย (ใช้ไป 3 ช่อง)
        // แถวสุดท้าย: ต้องเหลือที่สำหรับ วันที่ + แผ่นที่ (ใช้ไป 2 ช่อง, เหลือ 1 ช่องสำหรับ dynamic field)
        const totalFields = fieldEntries.length;
        const lastRowFieldCount = Math.max(0, totalFields - 3); // จำนวน fields ที่จะแสดงในแถวที่ 2+
        // ถ้ามี fields เหลือ ให้คำนวณว่าแถวที่ 2 ต้องแสดงกี่ fields
        // และแถวสุดท้าย (แถวที่ 3) จะมี field อีกกี่ตัว
        let row2FieldCount = 0;
        let row3FieldCount = 0;
        if (totalFields <= 3) {
            // ถ้ามี fields น้อยกว่าหรือเท่ากับ 3 -> แสดงทั้งหมดในแถวที่ 2
            row2FieldCount = totalFields;
            row3FieldCount = 0;
        }
        else {
            // ถ้ามี fields มากกว่า 3
            // แถวที่ 2 แสดง 3 fields
            // แถวที่ 3 แสดง (เหลือ) ไม่เกิน 1 field (เพราะต้องเหลือที่สำหรับ วันที่ + แผ่นที่)
            row2FieldCount = 3;
            row3FieldCount = Math.min(1, totalFields - 3);
        }
        const row2Fields = fieldEntries.slice(0, row2FieldCount);
        const row3Fields = fieldEntries.slice(row2FieldCount, row2FieldCount + row3FieldCount);
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
          
          <!-- แถวที่ 1: โครงการ | หมวดงานหลัก | หมวดงานย่อย -->
          <div class="info-section">
            <div class="info-column info-left">
              <div class="info-item">
                <span class="label">โครงการ:</span>
                <span class="value">${qcData.projectName}</span>
              </div>
            </div>
            
            <div class="info-column info-left">
              <div class="info-item">
                <span class="label">หมวดงานหลัก:</span>
                <span class="value">${qcData.mainCategory}</span>
              </div>
            </div>
            
            <div class="info-column info-right">
              <div class="info-item">
                <span class="label">หมวดงานย่อย:</span>
                <span class="value">${qcData.subCategory}</span>
              </div>
            </div>
          </div>
          
          <!-- แถวที่ 2: Dynamic Fields (แสดงไม่เกิน 3 fields) -->
          ${row2Fields.length > 0 ? `
          <div class="info-section">
            ${row2Fields.map(([key, value]) => `
            <div class="info-column info-left">
              <div class="info-item">
                <span class="label">${key}:</span>
                <span class="value">${value}</span>
              </div>
            </div>
            `).join('')}
            ${row2Fields.length < 3 ? `<div class="info-column info-left"></div>`.repeat(3 - row2Fields.length) : ''}
          </div>
          ` : ''}
          
          <!-- แถวที่ 3: Dynamic Field ที่เหลือ (ไม่เกิน 1 field) | วันที่ | แผ่นที่ -->
          <div class="info-section">
            ${row3Fields.length > 0 ? `
            <div class="info-column info-left">
              <div class="info-item">
                <span class="label">${row3Fields[0][0]}:</span>
                <span class="value">${row3Fields[0][1]}</span>
              </div>
            </div>
            ` : '<div class="info-column info-left"></div>'}
            
            <div class="info-column info-left">
              <div class="info-item">
                <span class="label">วันที่:</span>
                <span class="value">${currentDate}</span>
              </div>
            </div>
            
            <div class="info-column info-right">
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
    else {
        // Daily Report Header
        const dailyData = reportData;
        return `
      <header class="header">
        <div class="logo-section">
          <div class="logo-central-pattana">
            <span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span>
          </div>
        </div>
        
        <div class="header-box">
          <div class="title-section">
            <h1>รายงานการปฏิบัติงานประจำวัน</h1>
          </div>
          
          <div class="info-section">
            <div class="info-column info-left">
              <div class="info-item">
                <span class="label">โครงการ:</span>
                <span class="value">${dailyData.projectName}</span>
              </div>
            </div>
            
            <div class="info-column info-right">
              <div class="info-item">
                <span class="label">วันที่:</span>
                <span class="value">${dailyData.date}</span>
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
}
function createPhotosGrid(photos, pageIndex) {
    const photoItems = photos.map((photo, index) => {
        const displayNumber = pageIndex * 6 + index + 1;
        if (photo.isPlaceholder || !photo.imageBase64) {
            return `
        <div class="photo-item">
          <div class="photo-wrapper">
            <div class="placeholder-text">ไม่มีรูปภาพ</div>
          </div>
          <div class="photo-caption">
            <strong>${displayNumber}.</strong> ${photo.topic}
          </div>
        </div>
      `;
        }
        return `
      <div class="photo-item">
        <div class="photo-wrapper has-image">
          <img src="${photo.imageBase64}" alt="${photo.topic}" />
        </div>
        <div class="photo-caption">
          <strong>${displayNumber}.</strong> ${photo.topic}
        </div>
      </div>
    `;
    }).join('');
    return `<div class="photos-grid">${photoItems}</div>`;
}
function createOptimizedHTML(reportData, photos) {
    const photosPerPage = 6;
    const pages = [];
    for (let i = 0; i < photos.length; i += photosPerPage) {
        const pagePhotos = photos.slice(i, i + photosPerPage);
        pages.push(pagePhotos);
    }
    const pageHTML = pages.map((pagePhotos, pageIndex) => `
    <div class="page ${pageIndex < pages.length - 1 ? 'page-break' : ''}">
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
      <title>รายงานการตรวจสอบ</title>
      ${getInlineCSS()}
    </head>
    <body>
      ${pageHTML}
    </body>
    </html>
  `;
}
// ========================================
// PDF GENERATION
// ========================================
async function generateOptimizedPDF(finalHtml) {
    let browser = null;
    let page = null;
    try {
        console.log(`🎯 Starting Optimized PDF generation...`);
        browser = await puppeteer_core_1.default.launch({
            args: chromium_1.default.args,
            executablePath: await chromium_1.default.executablePath(),
            headless: chromium_1.default.headless,
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
        await page.setJavaScriptEnabled(false);
        await page.setContent(finalHtml, { waitUntil: ['domcontentloaded'], timeout: 45000 });
        const pdfUint8Array = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
            timeout: 60000
        });
        console.log(`✅ PDF generated! Size: ${pdfUint8Array.length} bytes`);
        return Buffer.from(pdfUint8Array);
    }
    catch (error) {
        console.error('❌ Error in PDF generation:', error);
        throw error;
    }
    finally {
        console.log('Cleaning up Puppeteer instance...');
        if (page) {
            page.close().catch(e => console.warn('Warning: page.close() failed.', e.message));
        }
        if (browser) {
            await browser.disconnect();
        }
        console.log('Cleanup complete.');
    }
}
// ========================================
// MAIN WRAPPER FUNCTIONS
// ========================================
async function generatePDF(reportData, fullLayoutPhotos, settings) {
    console.log(`📊 Generating QC Report PDF...`);
    const finalHtml = createOptimizedHTML(reportData, fullLayoutPhotos);
    return generateOptimizedPDF(finalHtml);
}
async function generateDailyPDFWrapper(reportData, fullLayoutPhotos, settings) {
    console.log(`📊 Generating Daily Report PDF...`);
    const finalHtml = createOptimizedHTML(reportData, fullLayoutPhotos);
    return generateOptimizedPDF(finalHtml);
}
// ========================================
// STORAGE UPLOAD
// ========================================
const CORRECT_BUCKET_NAME = "tts2004-smart-report-generate.firebasestorage.app";
async function uploadPDFToStorage(pdfBuffer, reportData, reportType, filename) {
    const { projectId, mainCategory, subCategory, date } = reportData;
    try {
        const bucket = admin.storage().bucket(CORRECT_BUCKET_NAME);
        let storagePath = `generated-reports/${projectId}/`;
        if (reportType === 'QC') {
            const mainSlug = mainCategory ? mainCategory.replace(/\s+/g, '_') : 'unknown';
            const subSlug = subCategory ? subCategory.replace(/\s+/g, '_') : 'unknown';
            storagePath += `QC/${mainSlug}/${subSlug}/`;
        }
        else {
            const subFolder = date ? date.substring(0, 7) : 'unknown-date';
            storagePath += `Daily/${subFolder}/`;
        }
        const filePath = storagePath + filename;
        const file = bucket.file(filePath);
        console.log(`Uploading PDF to: ${filePath}`);
        await file.save(pdfBuffer, {
            metadata: {
                contentType: 'application/pdf',
                cacheControl: 'public, max-age=3600',
            },
            public: true,
        });
        const publicUrl = file.publicUrl();
        console.log(`✅ PDF uploaded: ${publicUrl}`);
        return { publicUrl, filePath };
    }
    catch (error) {
        console.error(`❌ Error uploading PDF to Storage:`, error);
        throw error;
    }
}
//# sourceMappingURL=pdf-generator.js.map