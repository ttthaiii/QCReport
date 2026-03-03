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
        .map(key => `${key}=${(dynamicFields[key] || '').toLowerCase().trim()}`) // <-- ✅ ต้องแก้บรรทัดนี้
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
    projectLogos: {}, // ✅  เปลี่ยนเป็น object ว่าง
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
async function fetchProjectLogos(logos) {
    const urls = [
        logos.left,
        logos.center,
        logos.right
    ];
    const base64Promises = urls.map(url => {
        if (url) {
            console.log(`Fetching project logo from: ${url}`);
            return fetchAndEncodeImage(url);
        }
        return Promise.resolve(null);
    });
    const [leftBase64, centerBase64, rightBase64] = await Promise.all(base64Promises);
    console.log(`Logos fetched. Left: ${!!leftBase64}, Center: ${!!centerBase64}, Right: ${!!rightBase64}`);
    return {
        left: leftBase64,
        center: centerBase64,
        right: rightBase64
    };
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
        // --- START: NEW CODE ---
        const subCatDoc = subCatSnap.docs[0]; // Get the document itself
        const subCatData = subCatDoc.data();
        const subCatId = subCatDoc.id;
        // 1. Get the custom order from the subCategory document
        const customOrder = subCatData.topicOrder;
        // --- END: NEW CODE ---
        const topicsSnap = await projectConfigRef.collection("topics")
            .where("subCategoryId", "==", subCatId)
            .where("isArchived", "==", false)
            .get();
        // --- START: MODIFIED CODE ---
        // 2. Get topics as objects (name only is fine)
        const alphabeticalTopics = topicsSnap.docs.map(doc => {
            return { name: doc.data().name };
        });
        let sortedTopics = alphabeticalTopics; // Default
        console.log("--- RUNNING PDF-GENERATOR v4 SORTING LOGIC ---");
        if (customOrder) {
            console.log(`✅ Using custom topicOrder for PDF: ${subCatId}`);
            // ✅ [แนะนำ] ให้สร้าง Array ใหม่ขึ้นมาเรียงลำดับ
            sortedTopics = [...alphabeticalTopics].sort((a, b) => {
                const indexA = customOrder.indexOf(a.name);
                const indexB = customOrder.indexOf(b.name);
                if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB; // Both in list, sort by list
                }
                if (indexA !== -1)
                    return -1; // Only A in list
                if (indexB !== -1)
                    return 1; // Only B in list
                return a.name.localeCompare(b.name, 'th'); // Neither in list
            });
        }
        else {
            console.log(`⚠️ No topicOrder found for PDF: ${subCatId}. Using alphabetical.`);
            // ✅ แก้ไขส่วนนี้ด้วย
            sortedTopics = [...alphabeticalTopics].sort((a, b) => a.name.localeCompare(b.name, 'th'));
        }
        // 4. Return just the array of names
        const allTopics = sortedTopics.map(t => t.name);
        // --- END: MODIFIED CODE ---
        return allTopics;
    }
    catch (error) {
        console.error("Error getting topics for filter:", error);
        return [];
    }
}
async function getDailyPhotosByDate(projectId, date) {
    const db = admin.firestore();
    // ✅ แก้ไข: ใช้ Timestamp แทน Date
    const startDate = admin.firestore.Timestamp.fromDate(new Date(`${date}T00:00:00+07:00`));
    const endDate = admin.firestore.Timestamp.fromDate(new Date(`${date}T23:59:59+07:00`) // ✅ ถึงสิ้นวัน
    );
    console.log(`🔍 Fetching Daily photos for ${projectId}`);
    console.log(`   - Date: ${date}`);
    console.log(`   - Start: ${startDate.toDate().toISOString()}`);
    console.log(`   - End: ${endDate.toDate().toISOString()}`);
    const photosSnapshot = await db.collection("dailyPhotos")
        .where("projectId", "==", projectId)
        .where("createdAt", ">=", startDate)
        .where("createdAt", "<=", endDate) // ✅ เปลี่ยนเป็น <= เพื่อรวมสิ้นวัน
        //.orderBy("createdAt", "asc")
        .get();
    console.log(`✅ Found ${photosSnapshot.docs.length} daily photos`);
    // ✅ เพิ่ม Debug แต่ละรูป
    photosSnapshot.docs.forEach((doc, i) => {
        const data = doc.data();
        const createdAt = data.createdAt.toDate();
        console.log(`   Photo ${i + 1}: ${doc.id} at ${createdAt.toISOString()}`);
    });
    const photos = await Promise.all(photosSnapshot.docs.map(async (doc, index) => {
        const data = doc.data();
        const createdAt = data.createdAt.toDate();
        const topicName = data.description
            ? data.description // แสดงแค่ "คำอธิบาย"
            : `(No Description)`;
        const imageBase64 = data.driveUrl
            ? await fetchAndEncodeImage(data.driveUrl)
            : null;
        return {
            id: doc.id, // ✅ คืนค่า id ควบคู่ไปด้วย
            topic: topicName,
            topicOrder: index,
            imageBase64: imageBase64,
            isPlaceholder: !imageBase64,
            location: data.location,
            timestamp: createdAt.toISOString(),
        };
    }));
    console.log(`📊 Processed ${photos.length} photos`);
    return photos;
}
async function getLatestPhotos(projectId, mainCategory, subCategory, allTopics, dynamicFields) {
    const db = admin.firestore();
    const category = `${mainCategory} > ${subCategory}`;
    console.log(`Fetching latest QC photos from 'qcPhotos' (Direct Query) for: ${category}`);
    console.log(`Dynamic fields:`, dynamicFields);
    // 1. Query รูปทั้งหมดในหมวดนี้ (และ Filter Dynamic Fields)
    let query = db.collection('qcPhotos')
        .where('projectId', '==', projectId)
        .where('category', '==', category);
    // Filter ด้วย Dynamic Fields (สำคัญมาก)
    if (dynamicFields) {
        Object.keys(dynamicFields).forEach(key => {
            const value = dynamicFields[key];
            if (value) {
                query = query.where(`dynamicFields.${key}`, '==', value);
            }
        });
    }
    const snapshot = await query.get();
    console.log(`✅ Found ${snapshot.size} total photos in this category.`);
    // 2. จัดกลุ่มรูปตาม Topic และเลือกรูปที่ใหม่ที่สุด
    const latestPhotosByTopic = new Map();
    snapshot.forEach(doc => {
        const data = doc.data();
        const topic = data.topic;
        // ข้ามถ้าไม่มี Topic (ไม่ควรเกิดขึ้น)
        if (!topic)
            return;
        // ถ้ายังไม่มีใน Map หรือ รูปนี้ใหม่กว่ารูปที่มีอยู่
        if (!latestPhotosByTopic.has(topic)) {
            latestPhotosByTopic.set(topic, Object.assign({ id: doc.id }, data));
        }
        else {
            const existing = latestPhotosByTopic.get(topic);
            // เปรียบเทียบ createdAt (ถ้ามี)
            const existingTime = existing.createdAt ? existing.createdAt.toMillis() : 0;
            const newTime = data.createdAt ? data.createdAt.toMillis() : 0;
            if (newTime > existingTime) {
                latestPhotosByTopic.set(topic, Object.assign({ id: doc.id }, data));
            }
        }
    });
    console.log(`✅ Identified latest photos for ${latestPhotosByTopic.size} topics.`);
    // 3. Map กลับไปยัง allTopics เพื่อให้ได้ลำดับที่ถูกต้อง (และเติม Placeholder)
    const photoPromises = allTopics.map(async (topic) => {
        const data = latestPhotosByTopic.get(topic);
        if (!data) {
            // ไม่พบรูปใน Topic นี้
            return null;
        }
        const imageBase64 = data.driveUrl ? await fetchAndEncodeImage(data.driveUrl) : null;
        if (imageBase64) {
            // Debug
            // console.log(`     📸 Encoded: ${topic}`);
        }
        else {
            console.log(`     ⚠️ Failed to encode image for topic: "${topic}"`);
        }
        return {
            id: data.id,
            topic: topic,
            imageBase64: imageBase64,
            isPlaceholder: false,
            location: data.location,
            timestamp: data.createdAt ? data.createdAt.toDate().toISOString() : undefined,
        };
    });
    const photos = await Promise.all(photoPromises);
    const foundPhotos = photos.filter((p) => p !== null);
    console.log(`✅ Final: Returning ${foundPhotos.length} photos ready for PDF.`);
    return foundPhotos;
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
function getInlineCSS(photosPerPage = 6) {
    let gridCols = 2;
    let gridRows = 3;
    if (photosPerPage === 1) {
        gridCols = 1;
        gridRows = 1;
    }
    else if (photosPerPage === 2) {
        gridCols = 1;
        gridRows = 2;
    }
    else if (photosPerPage === 4) {
        gridCols = 2;
        gridRows = 2;
    }
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
        
        display: flex;
        flex-direction: column;
      }
      
      /* Header Styles */
      .header {
        position: relative;
        margin-bottom: 15px;
        padding-top: 0; 
        flex-shrink: 0;
      }
      .logo-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        min-height: 60px; 
        padding-bottom: 10px; 
      }
      
      .logo-slot {
        flex-basis: 33.33%; 
        display: flex;
        align-items: center;
      }
      
      .logo-slot.logo-left   { justify-content: flex-start; }
      .logo-slot.logo-center { justify-content: center; }
      .logo-slot.logo-right  { justify-content: flex-end; }
      
      .logo-image {
        max-height: 50px; 
        max-width: 100%;  
        object-fit: contain;
      }      
      
      /* ... (CSS ส่วน .header-box, .info-table, .info-item ไม่เปลี่ยนแปลง) ... */

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
      .header-box {
        border: 2px solid #000;
        padding: 0; 
      }
      .info-table {
        width: 100%;
        border-collapse: collapse; 
      }
      .info-table td {
        width: 33.33%; 
        font-size: 11px;
        padding: 2px 6px;
        vertical-align: top;
        border-right: 1px solid #ccc;
      }
      .info-table td:last-child {
        border-right: none;
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
        /* white-space: nowrap; */
        /* overflow: hidden; */
        /* text-overflow: ellipsis; */
        /* max-width: 250px; */ 
      }
      
      /* --- [ส่วนแก้ไขหลัก] --- */
      
      .photos-grid {
        display: grid;
        grid-template-columns: repeat(${gridCols}, 1fr);
        grid-template-rows: repeat(${gridRows}, 1fr); /* บังคับจำนวนแถวตามการตั้งค่า */
        gap: 10px 12px;
        margin-top: 10px;
        
        flex-grow: 1; /* ยืดเต็มพื้นที่ */
        min-height: 0; 
      }
      
      .photo-item {
        break-inside: avoid;
        page-break-inside: avoid;
        
        display: flex;
        flex-direction: column;
        min-height: 0; /* บังคับไม่ให้ล้น */
        overflow: hidden; /* [ใหม่] ซ่อนส่วนที่ล้น (ถ้ามี) */
      }
      
      .photo-wrapper {
        width: 100%;
        background: #f5f5f5;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        margin-bottom: 4px;

        flex-grow: 1;
        min-height: 0;
        
        /* ✅ [แก้ไข 1/2] ทำให้ .photo-wrapper เป็นตัวกำหนดขอบเขต */
        position: relative;
      }
      
      .photo-wrapper.has-image {
        background: white;
      }
      
      .photo-wrapper img {
        /* ✅ [แก้ไข 2/2] บังคับให้ img อยู่ตรงกลางกรอบ และห้ามขยายกรอบ */
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        max-width: 100%; /* เปลี่ยนจาก 95% */
        max-height: 100%; /* เปลี่ยนจาก 95% */
        width: auto;
        height: auto;
        object-fit: contain; /* ยังคงใช้ contain เพื่อไม่ให้รูปถูกตัด */
      }
      
      /* ... (CSS ส่วน .placeholder-text, .photo-caption, .page-break ไม่เปลี่ยนแปลง) ... */

      .placeholder-text {
        display: none;
      }
      .photo-caption {
        text-align: center;
        font-size: 11px;
        padding: 2px 0;
        font-weight: normal;
        line-height: 1.3;
        flex-shrink: 0; 
      }
      .page-break {
        page-break-after: always;
      }
    </style>
  `;
}
function createDynamicHeader(reportData, pageNumber, totalPages, 
// ✅ [แก้ไข] รับเป็น Object ที่มี 3 ช่อง
projectLogoBase64s = null) {
    const currentDate = getCurrentThaiDate();
    const isQCReport = 'mainCategory' in reportData;
    // ✅ [ใหม่] สร้าง HTML สำหรับโลโก้ 3 ช่อง
    const logoContainerHTML = `
    <div class="logo-container">
      <div class="logo-slot logo-left">
        ${(projectLogoBase64s === null || projectLogoBase64s === void 0 ? void 0 : projectLogoBase64s.left) ? `<img src="${projectLogoBase64s.left}" alt="Left Logo" class="logo-image" />` : ''}
      </div>
      <div class="logo-slot logo-center">
        ${(projectLogoBase64s === null || projectLogoBase64s === void 0 ? void 0 : projectLogoBase64s.center) ? `<img src="${projectLogoBase64s.center}" alt="Center Logo" class="logo-image" />` : ''}
      </div>
      <div class="logo-slot logo-right">
        ${(projectLogoBase64s === null || projectLogoBase64s === void 0 ? void 0 : projectLogoBase64s.right) ? `<img src="${projectLogoBase64s.right}" alt="Right Logo" class="logo-image" />` : ''}
      </div>
    </div>
  `;
    // ===================================
    //  QC REPORT LOGIC (ใช้ <table>)
    // ===================================
    if (isQCReport) {
        const qcData = reportData;
        // --- Logic การจัดแถวแบบ Flow ---
        const allInfoItems = [];
        // ✅ [ใหม่] 1. แยก Code Note ออกมา (หาแบบ Case-insensitive)
        let codeNoteItem = null;
        const fieldEntries = Object.entries(qcData.dynamicFields || {})
            .filter(([_, value]) => value && value.trim());
        for (const [key, value] of fieldEntries) {
            // เช็คว่าเป็น Code note หรือไม่
            if (key.toLowerCase().includes('code note') || key.toLowerCase().includes('หมายเหตุ')) {
                codeNoteItem = { label: key, value: value };
            }
            else {
                // ถ้าไม่ใช่ ให้ใส่ในตาราง 3 คอลัมน์ตามปกติ
                allInfoItems.push({ label: key, value: value });
            }
        }
        allInfoItems.push({ label: 'วันที่', value: currentDate });
        allInfoItems.push({ label: 'แผ่นที่', value: `${pageNumber}/${totalPages}` });
        const infoRows = [];
        for (let i = 0; i < allInfoItems.length; i += 3) {
            infoRows.push(allInfoItems.slice(i, i + 3));
        }
        // --- จบ Logic Flow ---
        return `
      <header class="header">
        ${logoContainerHTML} <div class="header-box">
          <div class="title-section">
            <h1>รูปถ่ายประกอบการตรวจสอบ</h1>
          </div>
          
          <table class="info-table">
            <tbody>
              <tr>
                <td> <div class="info-item">
                    <span class="label">โครงการ:</span>
                    <span class="value">${qcData.projectName}</span>
                  </div>
                </td>
                <td> <div class="info-item">
                    <span class="label">หมวดงานหลัก:</span>
                    <span class="value">${qcData.mainCategory}</span>
                  </div>
                </td>
                <td> <div class="info-item">
                    <span class="label">หมวดงานย่อย:</span>
                    <span class="value">${qcData.subCategory}</span>
                  </div>
                </td>
              </tr>
              
              ${infoRows.map(rowItems => `
                <tr>
                  ${ /* 1. สร้าง <td> ที่มีข้อมูล */''}
                  ${rowItems.map(item => `
                    <td>
                      <div class="info-item">
                        <span class="label">${item.label}:</span>
                        <span class="value">${item.value}</span>
                      </div>
                    </td>
                  `).join('')}
                  
                  ${ /* 2. เติม <td> ว่างที่เหลือในแถว (ถ้ามี) */''}
                  ${rowItems.length < 3 ?
            Array.from({ length: 3 - rowItems.length }, () => `<td><div class="info-item">&nbsp;</div></td>`).join('')
            : ''}
                </tr>
              `).join('')}

              ${ /* ✅ [ใหม่] 2. แสดง Code Note บรรทัดสุดท้าย (เต็มความกว้าง) */''}
              ${codeNoteItem ? `
                <tr>
                  <td colspan="3" style="border-top: 1px solid #ccc;">
                    <div class="info-item">
                      <span class="label">${codeNoteItem.label}:</span>
                      <span class="value" style="white-space: pre-wrap;">${codeNoteItem.value}</span>
                    </div>
                  </td>
                </tr>
              ` : ''}
              
            </tbody>
          </table>
          
        </div>
      </header>
    `;
        // ===================================
        //  DAILY REPORT LOGIC (ไม่เปลี่ยนแปลง)
        // ===================================
    }
    else {
        // Daily Report Header (ใช้ Logic เดิมได้ เพราะมีแค่ 2 คอลัมน์)
        const dailyData = reportData;
        return `
      <header class="header">
        ${logoContainerHTML} <div class="header-box">
          <div class="title-section">
            <h1>รายงานการปฏิบัติงานประจำวัน</h1>
          </div>
          
          <table class="info-table">
             <tbody>
                <tr>
                  <td style="width: 50%;"> <div class="info-item">
                      <span class="label">โครงการ:</span>
                      <span class="value">${dailyData.projectName}</span>
                    </div>
                  </td>
                  <td style="width: 50%;"> <div class="info-item">
                      <span class="label">วันที่:</span>
                      <span class="value">${dailyData.date}</span>
                    </div>
                    <div class="info-item">
                      <span class="label">แผ่นที่:</span>
                      <span class="value">${pageNumber}/${totalPages}</span>
                    </div>
                  </td>
                </tr>
             </tbody>
          </table>
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
        const hasNoDescription = photo.topic.includes('(No Description)');
        return `
      <div class="photo-item">
        <div class="photo-wrapper has-image">
          <img src="${photo.imageBase64}" alt="${photo.topic}" />
        </div>
        ${!hasNoDescription ? `<div class="photo-caption">    
          <strong>${displayNumber}.</strong> ${photo.topic}
        </div>` : ''}                                       
      </div>
    `;
    }).join('');
    return `<div class="photos-grid">${photoItems}</div>`;
}
function createOptimizedHTML(reportData, photos, 
// ✅ [แก้ไข 1] รับเป็น Object ที่มี 3 ช่อง (เหมือน createDynamicHeader)
projectLogoBase64s = null, photosPerPage = 6) {
    const pages = [];
    // ✅ Debug: ตรวจสอบรูปก่อน slice
    console.log(`\n📄 Creating HTML for ${photos.length} photos:`);
    photos.forEach((photo, index) => {
        console.log(`  ${index + 1}. ${photo.topic}`);
        console.log(`     - Has image: ${!!photo.imageBase64}`);
        console.log(`     - Is placeholder: ${photo.isPlaceholder}`);
    });
    for (let i = 0; i < photos.length; i += photosPerPage) {
        const pagePhotos = photos.slice(i, i + photosPerPage);
        pages.push(pagePhotos);
    }
    console.log(`📄 Total pages: ${pages.length}`);
    const pageHTML = pages.map((pagePhotos, pageIndex) => {
        // ✅ Debug: แต่ละหน้ามีรูปอะไรบ้าง
        console.log(`\nPage ${pageIndex + 1} has ${pagePhotos.length} photos:`);
        pagePhotos.forEach((photo, index) => {
            console.log(`  ${index + 1}. ${photo.topic} - Has image: ${!!photo.imageBase64}`);
        });
        return `
    <div class="page ${pageIndex < pages.length - 1 ? 'page-break' : ''}">
      ${createDynamicHeader(reportData, pageIndex + 1, pages.length, projectLogoBase64s)}
      ${createPhotosGrid(pagePhotos, pageIndex)}
    </div>
  `;
    }).join('');
    return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>รายงานการตรวจสอบ</title>
      ${getInlineCSS(photosPerPage)}
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
    // ✅ [แก้ไข] เรียก fetchProjectLogos (เติม s) และส่ง settings.projectLogos (object)
    const projectLogoBase64s = await fetchProjectLogos(settings.projectLogos);
    const finalHtml = createOptimizedHTML(reportData, fullLayoutPhotos, projectLogoBase64s, settings.photosPerPage);
    return generateOptimizedPDF(finalHtml);
}
async function generateDailyPDFWrapper(reportData, fullLayoutPhotos, settings) {
    console.log(`📊 Generating Daily Report PDF...`);
    // ✅ [แก้ไข] เรียก fetchProjectLogos (เติม s) และส่ง settings.projectLogos (object)
    const projectLogoBase64s = await fetchProjectLogos(settings.projectLogos);
    const finalHtml = createOptimizedHTML(reportData, fullLayoutPhotos, projectLogoBase64s, settings.photosPerPage);
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
                cacheControl: 'public, max-age=604800', // ✅ Cache 1 สัปดาห์ (ประหยัด Bandwidth)
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