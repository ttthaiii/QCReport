"use strict";
// Filename: qc-functions/src/services/pdf-generator.ts
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
exports.generatePDF = generatePDF;
exports.uploadPDFToStorage = uploadPDFToStorage;
const admin = __importStar(require("firebase-admin"));
const puppeteer_1 = __importDefault(require("puppeteer"));
/**
 * ดึงรูปภาพล่าสุดของแต่ละหัวข้อ
 */
async function getLatestPhotos(projectId, mainCategory, subCategory, topics, dynamicFields) {
    var _a, _b, _c;
    const db = admin.firestore();
    const photosRef = db.collection("qcPhotos");
    const photos = [];
    console.log(`🔍 Getting latest photos for ${topics.length} topics`);
    console.log(`📋 Dynamic fields:`, JSON.stringify(dynamicFields));
    // Loop through each topic to get the latest photo
    for (const topic of topics) {
        // ✅ เริ่มต้นด้วย base query (ไม่มี dynamic fields)
        const query = photosRef
            .where("projectId", "==", projectId)
            .where("category", "==", `${mainCategory} > ${subCategory}`)
            .where("topic", "==", topic)
            .where("reportType", "==", "QC")
            .orderBy("createdAt", "desc")
            .limit(1);
        // ✅ สำหรับตอนนี้ ไม่ filter ด้วย dynamic fields เพื่อให้ได้รูปมาก่อน
        // TODO: เพิ่ม dynamic fields filtering ในอนาคต
        const snapshot = await query.get();
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            photos.push({
                topic: data.topic,
                driveUrl: data.driveUrl,
                timestamp: ((_c = (_b = (_a = data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString()) || data.timestamp,
                location: data.location || ""
            });
        }
        else {
            // ถ้าไม่มีรูป ใส่ placeholder
            photos.push({
                topic: topic,
                driveUrl: "",
                timestamp: "",
                location: ""
            });
        }
    }
    return photos;
}
/**
 * สร้าง HTML สำหรับ PDF
 */
function generateHTML(reportData, photos) {
    const { projectName, subCategory, dynamicFields } = reportData;
    // สร้าง Dynamic Fields Display
    const fieldsDisplay = Object.entries(dynamicFields)
        .filter(([key, value]) => value && value.trim())
        .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
        .join("");
    const currentDate = new Date().toLocaleDateString("th-TH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    // แบ่งรูปเป็นหน้าๆ (6 รูปต่อหน้า)
    const photosPerPage = 6;
    const totalPages = Math.ceil(photos.length / photosPerPage);
    let pagesHTML = "";
    for (let page = 0; page < totalPages; page++) {
        const startIdx = page * photosPerPage;
        const endIdx = Math.min(startIdx + photosPerPage, photos.length);
        const pagePhotos = photos.slice(startIdx, endIdx);
        const photosHTML = pagePhotos.map((photo, idx) => {
            const photoNumber = startIdx + idx + 1;
            const imageHTML = photo.driveUrl
                ? `<img src="${photo.driveUrl}" alt="${photo.topic}" />`
                : `<div class="placeholder">ไม่มีรูปภาพ</div>`;
            return `
        <div class="photo-item">
          <div class="photo-container">
            ${imageHTML}
          </div>
          <div class="photo-caption">
            <strong>${photoNumber}.</strong> ${photo.topic}
          </div>
        </div>
      `;
        }).join("");
        pagesHTML += `
      <div class="page">
        <div class="header">
          <div class="logo">
            <span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span>
          </div>
          <div class="header-content">
            <h1>รูปถ่ายประกอบการตรวจสอบ</h1>
            <div class="header-info">
              <div><strong>โครงการ:</strong> ${projectName}</div>
              <div><strong>วันที่:</strong> ${currentDate}</div>
              ${fieldsDisplay}
              <div><strong>หมวดงาน:</strong> ${subCategory}</div>
              <div><strong>แผ่นที่:</strong> ${page + 1}/${totalPages}</div>
            </div>
          </div>
        </div>
        
        <div class="photos-grid">
          ${photosHTML}
        </div>
      </div>
      ${page < totalPages - 1 ? '<div class="page-break"></div>' : ''}
    `;
    }
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Sarabun', 'Arial', sans-serif;
          background: white;
        }
        
        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          margin: 0 auto;
          background: white;
          position: relative;
        }
        
        .page-break {
          page-break-after: always;
        }
        
        .header {
          border: 2px solid #333;
          padding: 15px;
          margin-bottom: 20px;
        }
        
        .logo {
          text-align: center;
          margin-bottom: 10px;
          font-weight: bold;
          font-size: 24px;
        }
        
        .logo-central {
          color: #000;
        }
        
        .logo-pattana {
          color: #d4a574;
        }
        
        .header-content h1 {
          text-align: center;
          font-size: 20px;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px solid #ddd;
        }
        
        .header-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 14px;
        }
        
        .header-info div {
          padding: 4px 0;
        }
        
        .photos-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
        }
        
        .photo-item {
          break-inside: avoid;
        }
        
        .photo-container {
          width: 100%;
          height: 180px;
          border: 1px solid #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          overflow: hidden;
        }
        
        .photo-container img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        
        .placeholder {
          color: #999;
          font-size: 14px;
        }
        
        .photo-caption {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.4;
          color: #333;
        }
        
        @media print {
          .page {
            margin: 0;
            border: none;
            box-shadow: none;
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
/**
 * สร้าง PDF จาก HTML
 */
async function generatePDF(reportData, photos) {
    const html = generateHTML(reportData, photos);
    const browser = await puppeteer_1.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfData = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
            top: '0mm',
            right: '0mm',
            bottom: '0mm',
            left: '0mm'
        }
    });
    await browser.close();
    // ✅ แปลง Uint8Array เป็น Buffer
    return Buffer.from(pdfData);
}
/**
 * Upload PDF ไป Storage พร้อม Overwrite logic
 */
async function uploadPDFToStorage(pdfBuffer, reportData) {
    const storage = admin.storage();
    const bucket = storage.bucket();
    const { projectId, mainCategory, subCategory, dynamicFields } = reportData;
    const fieldsStr = Object.entries(dynamicFields)
        .filter(([key, value]) => value && value.trim())
        .map(([key, value]) => value.replace(/\s/g, ""))
        .join("_");
    const filename = `${projectId}_${mainCategory}_${subCategory}_${fieldsStr}.pdf`
        .replace(/\s/g, "_")
        .replace(/>/g, "-");
    const filePath = `projects/${projectId}/reports/${filename}`;
    const file = bucket.file(filePath);
    await file.save(pdfBuffer, {
        metadata: {
            contentType: 'application/pdf'
        },
        public: true
    });
    // ✅ ใช้ Emulator URL ถ้ารันใน emulator
    const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
    const publicUrl = IS_EMULATOR
        ? `http://localhost:9199/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`
        : `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath)}`;
    console.log(`📎 PDF URL: ${publicUrl}`);
    return {
        publicUrl,
        filePath,
        filename
    };
}
//# sourceMappingURL=pdf-generator.js.map