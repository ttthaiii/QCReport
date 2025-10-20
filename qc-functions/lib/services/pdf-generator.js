"use strict";
// Filename: qc-functions/src/services/pdf-generator.ts (FINAL, COMPLETE, AND CORRECTED VERSION)
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
const admin = __importStar(require("firebase-admin"));
const puppeteer_1 = __importDefault(require("puppeteer"));
// --- CORE FUNCTIONS ---
/**
 * This is the fully corrected function that combines your original logic
 * with the necessary bug fixes and enhancements.
 */
async function getLatestPhotos(projectId, mainCategory, subCategory, topics, dynamicFields) {
    const db = admin.firestore();
    const storage = admin.storage();
    const bucket = storage.bucket();
    const photosRef = db.collection("qcPhotos");
    const photoPromises = topics.map(async (topic) => {
        var _a, _b, _c;
        let query = photosRef
            .where("projectId", "==", projectId)
            .where("category", "==", `${mainCategory} > ${subCategory}`) // Your original, correct query
            .where("topic", "==", topic)
            .where("reportType", "==", "QC")
            .orderBy("createdAt", "desc")
            .limit(1);
        // Robust check for both key and value to prevent 'invalid field path' error
        for (const [key, value] of Object.entries(dynamicFields)) {
            if (key && key.trim() && value && value.trim()) {
                query = query.where(`dynamicFields.${key}`, "==", value);
            }
        }
        const snapshot = await query.get();
        if (snapshot.empty) {
            return null;
        }
        const doc = snapshot.docs[0];
        const data = doc.data();
        const photoData = {
            topic: data.topic,
            driveUrl: data.driveUrl,
            filePath: data.filePath,
            timestamp: ((_c = (_b = (_a = data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString()) || data.timestamp,
            location: data.location || ""
        };
        if (photoData.filePath) {
            try {
                const [fileBuffer] = await bucket.file(photoData.filePath).download();
                photoData.imageBase64 = fileBuffer.toString('base64');
            }
            catch (error) {
                console.error(`❌ Image download failed for "${photoData.topic}":`, error.message);
                photoData.imageBase64 = null;
            }
        }
        else {
            photoData.imageBase64 = null;
        }
        return photoData;
    });
    const results = await Promise.all(photoPromises);
    return results.filter(p => p !== null);
}
/**
 * Creates the full layout with placeholders (includes filePath for type safety).
 */
function createFullLayout(allTopics, foundPhotos) {
    const photosByTopic = new Map();
    foundPhotos.forEach(photo => {
        photosByTopic.set(photo.topic, photo);
    });
    return allTopics.map((topic, index) => {
        const foundPhoto = photosByTopic.get(topic);
        if (foundPhoto) {
            return Object.assign(Object.assign({}, foundPhoto), { topicOrder: index + 1 });
        }
        else {
            return {
                topic: topic, topicOrder: index + 1, isPlaceholder: true,
                driveUrl: "", filePath: "", timestamp: "", location: "", imageBase64: null,
            };
        }
    });
}
/**
 * Generates the PDF buffer.
 */
async function generatePDF(reportData, photos) {
    const html = generateOptimizedHTML(reportData, photos);
    const browser = await puppeteer_1.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfData = await page.pdf({
        format: 'A4', printBackground: true,
        margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' }
    });
    await browser.close();
    return Buffer.from(pdfData);
}
/**
 * Uploads PDF to storage with emulator support.
 */
async function uploadPDFToStorage(pdfBuffer, reportData) {
    const storage = admin.storage();
    const bucket = storage.bucket();
    const { projectId, mainCategory, subCategory, dynamicFields } = reportData;
    const fieldsStr = Object.entries(dynamicFields).filter(([, value]) => value && value.trim()).map(([, value]) => value.replace(/\s/g, "")).join("_");
    const filename = `${projectId}_${mainCategory}_${subCategory}${fieldsStr ? '_' + fieldsStr : ''}.pdf`.replace(/\s/g, "_").replace(/>/g, "-");
    const filePath = `projects/${projectId}/reports/${filename}`;
    const file = bucket.file(filePath);
    await file.save(pdfBuffer, { metadata: { contentType: 'application/pdf' }, public: true });
    const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
    const publicUrl = IS_EMULATOR
        ? `http://localhost:9199/${bucket.name}/${encodeURIComponent(filePath)}`
        : `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath)}`;
    console.log(`📎 PDF URL: ${publicUrl}`);
    return { publicUrl, filePath, filename };
}
// --- HTML & CSS GENERATION ---
function generateOptimizedHTML(reportData, photos) {
    const photosPerPage = 6;
    const pages = [];
    for (let i = 0; i < photos.length; i += photosPerPage) {
        pages.push(photos.slice(i, i + photosPerPage));
    }
    const pageHTML = pages.map((pagePhotos, pageIndex) => `
        <div class="page">
            ${createDynamicHeader(reportData, pageIndex + 1, pages.length)}
            ${createPhotosGrid(pagePhotos)}
        </div>
    `).join('<div class="page-break"></div>');
    return `
        <!DOCTYPE html>
        <html lang="th"><head><meta charset="UTF-8"><title>QC Report</title>${getOptimizedCSS()}</head>
        <body>${pageHTML}</body></html>
    `;
}
function createDynamicHeader(reportData, pageNumber, totalPages) {
    const { subCategory, dynamicFields, projectName } = reportData;
    const currentDate = new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
    const fieldsToDisplay = Object.entries(dynamicFields).filter(([, value]) => value && value.trim());
    const fieldCount = fieldsToDisplay.length;
    let fieldsHTML = '';
    if (fieldCount <= 2) {
        const leftFields = [{ label: 'โครงการ', value: projectName }, fieldsToDisplay[0] ? { label: fieldsToDisplay[0][0], value: fieldsToDisplay[0][1] } : null, { label: 'หมวดงาน', value: subCategory }];
        const rightFields = [{ label: 'วันที่', value: currentDate }, fieldsToDisplay[1] ? { label: fieldsToDisplay[1][0], value: fieldsToDisplay[1][1] } : null, { label: 'แผ่นที่', value: `${pageNumber}/${totalPages}` }];
        fieldsHTML = `
            <div class="info-column info-left">${leftFields.filter(f => f).map(f => `<div class="info-item"><span class="label">${f.label}:</span> <span class="value">${f.value}</span></div>`).join('')}</div>
            <div class="info-column info-right">${rightFields.filter(f => f).map(f => `<div class="info-item"><span class="label">${f.label}:</span> <span class="value">${f.value}</span></div>`).join('')}</div>
        `;
    }
    else {
        const gridClass = fieldCount === 3 ? 'info-grid-3' : 'info-grid-4';
        const allFields = [{ label: 'โครงการ', value: projectName }, { label: 'วันที่', value: currentDate }, ...fieldsToDisplay.map(([key, value]) => ({ label: key, value })), { label: 'หมวดงาน', value: subCategory }, { label: 'แผ่นที่', value: `${pageNumber}/${totalPages}` }];
        fieldsHTML = `<div class="${gridClass}">${allFields.map(f => `<div class="info-item"><span class="label">${f.label}:</span> <span class="value">${f.value}</span></div>`).join('')}</div>`;
    }
    return `
        <header class="header">
            <div class="logo-section"><div class="logo-central-pattana"><span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span></div></div>
            <div class="header-box"><div class="title-section"><h1>รูปถ่ายประกอบการตรวจสอบ</h1></div><div class="info-section">${fieldsHTML}</div></div>
        </header>
    `;
}
function createPhotosGrid(photos) {
    const rows = [];
    for (let i = 0; i < photos.length; i += 2) {
        rows.push(photos.slice(i, i + 2));
    }
    const rowsHTML = rows.map(rowPhotos => {
        const photosHTML = rowPhotos.map(photo => {
            const imageTag = photo.imageBase64
                ? `<img src="data:image/jpeg;base64,${photo.imageBase64}" alt="${photo.topic}" class="photo-image">`
                : `<div class="photo-placeholder"><span class="placeholder-text">ไม่มีรูปภาพ</span></div>`;
            return `
                <div class="photo-frame">
                    <div class="photo-container">${imageTag}</div>
                    <div class="photo-caption"><span class="photo-number">${photo.topicOrder}.</span> <span class="photo-title">${photo.topic}</span></div>
                </div>
            `;
        }).join('');
        return `<div class="photo-row">${photosHTML}</div>`;
    }).join('');
    return `<main class="photos-grid">${rowsHTML}</main>`;
}
function getOptimizedCSS() {
    return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
      @page { size: A4; margin: 12mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Sarabun', sans-serif; font-size: 10px; line-height: 1.4; color: #333; background: white; -webkit-print-color-adjust: exact; }
      .page { width: 100%; height: 100%; display: flex; flex-direction: column; }
      .page-break { page-break-after: always; }
      .header { margin-bottom: 10px; flex-shrink: 0; }
      .logo-section { text-align: right; margin-bottom: 8px; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; }
      .logo-central { color: #000; }
      .logo-pattana { color: #C5A572; }
      .header-box { border: 2px solid #000; }
      .title-section { padding: 8px; text-align: center; border-bottom: 1px solid #000; }
      .title-section h1 { font-size: 16px; font-weight: bold; font-family: 'Sarabun', sans-serif; }
      .info-section { display: flex; width: 100%; padding: 8px; min-height: 60px; }
      .info-column { width: 50%; padding: 0 8px; }
      .info-right { border-left: 1px solid #ddd; }
      .info-grid-3, .info-grid-4 { display: grid; width:100%; gap: 4px; padding: 0 8px; }
      .info-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
      .info-grid-4 { grid-template-columns: 1fr 1fr; }
      .info-item { display: flex; align-items: flex-start; }
      .label { font-weight: bold; min-width: 50px; flex-shrink: 0; }
      .value { margin-left: 4px; word-break: break-word; }
      .photos-grid { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
      .photo-row { display: flex; justify-content: flex-start; }
      .photo-frame {
        width: 50%;
        max-width: 50%;
        padding: 0 4px;
        display: flex; 
        flex-direction: column;
        height: 250px;
      }
      .photo-container { flex: 1; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; background: #f9f9f9; overflow: hidden; margin-bottom: 4px; }
      .photo-image { max-width: 100%; max-height: 100%; object-fit: contain; }
      .photo-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f0f0f0; }
      .placeholder-text { color: #999; font-style: italic; }
      .photo-caption { text-align: center; font-size: 9px; padding: 4px 2px; min-height: 35px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .photo-number { font-weight: bold; margin-right: 4px; }
    </style>
  `;
}
//# sourceMappingURL=pdf-generator.js.map