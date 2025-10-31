// pdf-generator.ts - Firebase Version 11 (Grid Layout for Both)

import * as puppeteer from 'puppeteer';
import * as admin from 'firebase-admin';
import { PhotoData as FirestorePhotoData } from '../api/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';

// ========================================
// TYPE DEFINITIONS (V11 - Based on V10)
// ========================================

// (ส่วนนี้เหมือน V10 ทุกประการ)
export interface ReportSettings {
  layoutType: 'default' | string;
  qcPhotosPerPage: 1 | 2 | 4 | 6;
  dailyPhotosPerPage: 1 | 2 | 4 | 6;
  photosPerPage: 1 | 2 | 4 | 6; // This is the "runtime" setting
  projectLogoUrl: string;
}

export const DEFAULT_SETTINGS: ReportSettings = {
  layoutType: 'default',
  qcPhotosPerPage: 6,
  dailyPhotosPerPage: 6, // [แก้ไข] เปลี่ยนจาก 2 เป็น 6
  photosPerPage: 6,
  projectLogoUrl: '',
};

export interface PhotoData {
  topic: string;
  topicOrder?: number;
  imageBase64?: string | null;
  isPlaceholder?: boolean;
  originalTopic?: string;
  storageUrl?: string;
  imageUrl?: string;
  location?: string;
  timestamp?: string;
}

export interface FullLayoutPhoto extends PhotoData {
  topicOrder: number;
}

export interface ReportData {
  projectId: string;
  projectName: string;
  mainCategory: string;
  subCategory: string;
  dynamicFields: Record<string, string>;
}

interface PDFReportData {
  photos: PhotoData[];
  projectName: string;
  category: string;
  dynamicFields?: Record<string, string>;
}

export interface ReportDataDaily {
  projectId: string;
  projectName: string;
  date: string; // YYYY-MM-DD
}

export interface DailyPhotoWithBase64 {
  description: string;
  base64: string | null;
  location: string;
  timestamp: string;
}

// ========================================
// HELPER FUNCTIONS (V11 - Unchanged)
// ========================================

async function fetchLogoAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const mimeType = response.headers['content-type'] || 'image/png';
    const base64 = Buffer.from(response.data).toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error: any) {
    console.error(`❌ Failed to fetch logo from ${url}:`, error.message);
    return null;
  }
}

async function loadImagesFromStorage(photos: PhotoData[]): Promise<PhotoData[]> {
  const bucket = admin.storage().bucket();
  if (!photos || photos.length === 0) return photos;
  console.log(`📥 Loading ${photos.length} images (Parallel Mode)...`);

  // ✅ [ใหม่] ใช้ Promise.all เพื่อดาวน์โหลดรูปภาพพร้อมกัน (เร็วขึ้น)
  const downloadPromises = photos.map(async (photo) => {
    if (photo.isPlaceholder) {
      return { ...photo, imageBase64: null };
    }
    const storagePath = photo.storageUrl;
    if (!storagePath) {
      return { ...photo, imageBase64: null };
    }

    try {
      const file = bucket.file(storagePath);

      // ✅ [สำคัญ] 1. Pre-check Metadata
      // การเรียก .getMetadata() จะบังคับให้ GCS หาไฟล์เวอร์ชันล่าสุด
      // และทำลาย Cache ที่ค้างอยู่ (ที่เป็นปัญหา 2-5 นาที)
      const [metadata] = await file.getMetadata();
      const mimeType = metadata.contentType || 'image/jpeg';

      // ✅ 2. Download (เมื่อมั่นใจว่าไฟล์พร้อมแล้ว)
      const [buffer] = await file.download();
      
      const base64 = buffer.toString('base64');
      return { ...photo, imageBase64: `data:${mimeType};base64,${base64}` };

    } catch (error) {
      console.error(`❌ Failed to load image (Cache/Propagation Issue?) for "${photo.topic}" from ${storagePath}:`, (error as Error).message);
      // ถ้าล้มเหลว (เช่น ไฟล์ไม่มีจริง) ให้คืนค่าว่าง
      return { ...photo, imageBase64: null };
    }
  });

  // รอให้การดาวน์โหลด (หรือล้มเหลว) ทั้งหมดเสร็จสิ้น
  const photosWithImages = await Promise.all(downloadPromises);
  
  return photosWithImages;
}

function getCurrentThaiDate(): string {
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

function create2FieldHeader(
  fields: Record<string, string>, category: string, projectName: string, 
  currentDate: string, pageNumber: number, totalPages: number,
  settings: ReportSettings, logoBase64: string | null
): string {
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

function create3FieldHeader(
  fields: Record<string, string>, category: string, projectName: string, 
  currentDate: string, pageNumber: number, totalPages: number,
  settings: ReportSettings, logoBase64: string | null
): string {
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
            ${fieldEntries.map(([key, value]: [string, string]): string => `
              <div class="info-item"><span class="label">${key}:</span><span class="value">${value}</span></div>`).join('')}
            <div class="info-item"><span class="label">แผ่นที่:</span><span class="value">${pageNumber}/${totalPages}</span></div>
          </div>
        </div>
      </div>
    </header>`;
}

function create4FieldHeader(
  fields: Record<string, string>, category: string, projectName: string, 
  currentDate: string, pageNumber: number, totalPages: number,
  settings: ReportSettings, logoBase64: string | null
): string {
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
            ${fieldEntries.map(([key, value]: [string, string]): string => `
              <div class="info-item"><span class="label">${key}:</span><span class="value">${value}</span></div>`).join('')}
            <div class="info-item"><span class="label">หมวดงาน:</span><span class="value">${category}</span></div>
            <div class="info-item"><span class="label">แผ่นที่:</span><span class="value">${pageNumber}/${totalPages}</span></div>
          </div>
        </div>
      </div>
    </header>`;
}

function createDynamicHeader(
  reportData: PDFReportData, pageNumber: number, totalPages: number,
  settings: ReportSettings, logoBase64: string | null
): string {
  const { category, dynamicFields, projectName } = reportData;
  const currentDate = getCurrentThaiDate();
  const fieldsToDisplay = dynamicFields || {};
  const fieldCount = Object.keys(fieldsToDisplay).length;
  
  if (fieldCount <= 2) {
    return create2FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages, settings, logoBase64);
  } else if (fieldCount === 3) {
    return create3FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages, settings, logoBase64);
  } else {
    return create4FieldHeader(fieldsToDisplay, category, projectName, currentDate, pageNumber, totalPages, settings, logoBase64);
  }
}

function createPhotosGrid(
  photos: PhotoData[], pageIndex: number, photosPerPage: 1 | 2 | 4 | 6
): string {
  const rows: PhotoData[][] = [];
  const itemsPerBatch = photosPerPage === 1 ? 1 : 2;
  
  for (let i = 0; i < photos.length; i += itemsPerBatch) {
    rows.push(photos.slice(i, i + itemsPerBatch));
  }

  const rowsHTML = rows.map((rowPhotos: PhotoData[], rowIndex: number): string => {
    const photosHTML = rowPhotos.map((photo: PhotoData, photoIndex: number): string => {
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
              `<div class="photo-placeholder"></div>`
            }
          </div>
          <div class="photo-caption">
            <span class="photo-number">${displayNumber}.</span>
            <span class="photo-title">${topicName}</span>
          </div>
        </div>
      `;
    }).join('');
    
    // [แก้ไข] ลบ inline height ออก ให้ CSS จัดการ
    return `<div class="photo-row">${photosHTML}</div>`;
  }).join('');

  return `<main class="photos-grid">${rowsHTML}</main>`;
}

function getInlineCSS(): string {
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
        display: flex; 
        align-items: flex-start; /* [แก้ไข] เปลี่ยนจาก center เป็น flex-start */
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
        color: #333; margin-left: 4px; 
        word-wrap: break-word; 
        overflow-wrap: break-word;
        hyphens: auto; /* [เพิ่ม] ตัดคำแบบอัตโนมัติ */
        min-width: 0;
        flex: 1;
        white-space: pre-line; /* [เพิ่ม] ให้ \n ขึ้นบรรทัดใหม่ */
        /* [เพิ่ม] จำกัดความสูงสูงสุดไม่ให้เกิน 3 บรรทัด */
        max-height: 3.6em; /* 3 บรรทัด (1.2 line-height × 3) */
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 3; /* จำกัด 3 บรรทัด */
        -webkit-box-orient: vertical;
      }
      .photos-grid {
        width: 100%; overflow: hidden; flex: 1;
        display: flex; flex-direction: column;
        gap: 15px; /* [แก้ไข] ใช้ gap แทน space-between */
        margin-top: 5px; 
        min-height: 600px; /* [แก้ไข] ใช้ min-height แทน max-height */
      }
      .photo-row {
        display: flex; 
        flex: 1; /* [เพิ่ม] ให้แต่ละแถวแบ่งพื้นที่เท่าๆ กัน */
        margin-bottom: 0;
        justify-content: flex-start; 
      }
      .photo-row:last-child { margin-bottom: 0; }
      .photo-frame {
        flex: 1; display: flex; flex-direction: column;
        margin: 0 3px; max-width: 50%;
      }
      /* [แก้ไข] รูปเดียวในแถวให้คงขนาด 50% ไม่ขยายเต็ม */
      .photo-row .photo-frame:only-child {
        flex: 0 0 50%; /* [แก้ไข] ไม่ขยาย, คงขนาด 50% */
        max-width: 50%; /* [แก้ไข] จำกัดไว้ที่ 50% */
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

function createOptimizedHTML(
  reportData: PDFReportData,
  settings: ReportSettings,
  logoBase64: string | null
): string {
  const { photos } = reportData;
  
  // ✅ (Unchanged)
  // ฟังก์ชันนี้จะอ่าน "photosPerPage" ที่ถูก "ยัด" มาให้โดย
  // index.ts (ไม่ว่าจะเป็น qcPhotosPerPage หรือ dailyPhotosPerPage)
  const photosPerPage = settings.photosPerPage || 6;
  const pages: PhotoData[][] = [];

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
export async function getUploadedTopicStatus(
  projectId: string, category: string, dynamicFields: Record<string, string>
): Promise<Record<string, boolean>> {
  const db = admin.firestore();
  let query = db.collection('qcPhotos').where('projectId', '==', projectId).where('category', '==', category);
  Object.entries(dynamicFields).forEach(([key, value]) => {
    if (key && value) query = query.where(`dynamicFields.${key}`, '==', value);
  });
  const snapshot = await query.get();
  const uploadedTopics: Record<string, boolean> = {};
  snapshot.forEach(doc => {
    const topic = doc.data().topic;
    if (topic && !uploadedTopics[topic]) uploadedTopics[topic] = true;
  });
  return uploadedTopics;
}

// (getDailyPhotosByDate - Unchanged)
export const getDailyPhotosByDate = async (
    projectId: string, date: string
): Promise<DailyPhotoWithBase64[]> => {
    const db = admin.firestore();
    const startDate = new Date(`${date}T00:00:00+07:00`);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    const photosSnapshot = await db
        .collection("dailyPhotos")
        .where("projectId", "==", projectId)
        .where("createdAt", ">=", Timestamp.fromDate(startDate))
        .where("createdAt", "<", Timestamp.fromDate(endDate))
        .orderBy("createdAt", "asc")
        .get();
    if (photosSnapshot.empty) return [];
    const photosToLoad: PhotoData[] = photosSnapshot.docs.map(doc => {
        const data = doc.data() as FirestorePhotoData;
        let isoTimestamp = new Date().toISOString();
        if (data.createdAt && typeof (data.createdAt as any).toDate === 'function') {
           isoTimestamp = (data.createdAt as admin.firestore.Timestamp).toDate().toISOString();
        }
        return {
            topic: data.description || '', storageUrl: data.filePath,
            isPlaceholder: false, location: data.location || '',
            timestamp: isoTimestamp
        } as PhotoData;
    });
    const photosWithBase64 = await loadImagesFromStorage(photosToLoad);
    return photosWithBase64.map(photo => ({
        description: photo.topic, base64: photo.imageBase64 || null,
        location: photo.location || '', timestamp: photo.timestamp || ''
    }));
};

export async function getTopicsForFilter(
  db: admin.firestore.Firestore,
  projectId: string, 
  mainCategory: string, 
  subCategory: string
): Promise<string[]> {
  try {
    const projectConfigRef = db.collection("projectConfig").doc(projectId);

    // 1. ค้นหา Main Category ID
    const mainCatSnap = await projectConfigRef.collection("mainCategories")
      .where("name", "==", mainCategory).limit(1).get();
    if (mainCatSnap.empty) {
      throw new Error("Main category not found.");
    }
    const mainCatId = mainCatSnap.docs[0].id;

    // 2. ค้นหา Sub Category ID
    const subCatSnap = await projectConfigRef.collection("subCategories")
      .where("name", "==", subCategory)
      .where("mainCategoryId", "==", mainCatId)
      .limit(1).get();
    if (subCatSnap.empty) {
      throw new Error("Sub category not found.");
    }
    const subCatId = subCatSnap.docs[0].id;

    // 3. ค้นหา Topics ทั้งหมด
    const topicsSnap = await projectConfigRef.collection("topics")
      .where("subCategoryId", "==", subCatId)
      .where("isArchived", "==", false)
      .get();
      
    const allTopics: string[] = topicsSnap.docs.map(doc => doc.data().name as string);
    return allTopics;

  } catch (error) {
    console.error('Error in getTopicsForFilter:', error);
    return []; // คืนค่าว่างถ้า Error
  }
}

// (getLatestPhotos - Unchanged)
export async function getLatestPhotos(
  projectId: string, mainCategory: string, subCategory: string,
  allTopics: string[], dynamicFields: Record<string, string>
): Promise<PhotoData[]> {
  try {
    const category = `${mainCategory} > ${subCategory}`;
    const db = admin.firestore();
    let query = db.collection('qcPhotos').where('projectId', '==', projectId).where('category', '==', category).orderBy('createdAt', 'desc');
    Object.entries(dynamicFields).forEach(([key, value]) => {
      if (key && value) query = query.where(`dynamicFields.${key}`, '==', value);
    });
    const snapshot = await query.get();
    if (snapshot.empty) return [];
    const latestPhotosMap = new Map<string, FirestorePhotoData>();
    snapshot.docs.forEach(doc => {
      const data = doc.data() as FirestorePhotoData;
      const topic = data.topic;
      if (topic && allTopics.includes(topic)) {
        if (!latestPhotosMap.has(topic)) latestPhotosMap.set(topic, data);
      }
    });
    const photosToLoad: PhotoData[] = [];
    latestPhotosMap.forEach((data, topic) => {
      photosToLoad.push({
        topic: topic, originalTopic: topic, imageBase64: null,
        storageUrl: data.filePath, isPlaceholder: false,
      });
    });
    return await loadImagesFromStorage(photosToLoad);
  } catch (error) {
    console.error('❌ Error getting latest QC photos:', error);
    return [];
  }
}

// (createFullLayout - Unchanged)
export function createFullLayout(allTopics: string[], foundPhotos: PhotoData[]): FullLayoutPhoto[] {
  const photosByTopic = new Map<string, PhotoData>();
  foundPhotos.forEach(photo => {
    const key = photo.originalTopic || photo.topic;
    if (key) photosByTopic.set(key, photo);
  });
  const fullLayout: FullLayoutPhoto[] = allTopics.map((topic, index) => {
    const photo = photosByTopic.get(topic);
    if (photo && !photo.isPlaceholder) {
      return { ...photo, topic: topic, topicOrder: index + 1, originalTopic: topic };
    } else {
      return {
        topic: topic, topicOrder: index + 1, imageBase64: null,
        isPlaceholder: true, originalTopic: topic
      };
    }
  });
  return fullLayout;
}

// (generatePDF (QC Wrapper) - Unchanged)
export async function generatePDF(
  reportData: ReportData, 
  photos: FullLayoutPhoto[],
  settings: ReportSettings
): Promise<Buffer> {
  const logoBase64 = await fetchLogoAsBase64(settings.projectLogoUrl);
  const pdfData: PDFReportData = {
    photos: photos,
    projectName: reportData.projectName,
    category: `${reportData.mainCategory}\n${reportData.subCategory}`, // [แก้ไข] ใช้ \n แทน >
    dynamicFields: reportData.dynamicFields,
  };
  return await generateOptimizedPDF(pdfData, settings, logoBase64);
}

// ✅ [แก้ไข V11] - แก้ไข Daily Wrapper
export async function generateDailyPDFWrapper(
  reportData: ReportDataDaily, 
  photos: DailyPhotoWithBase64[],
  settings: ReportSettings // (นี่คือ dailySettings ที่มี photosPerPage ถูกต้องแล้ว)
): Promise<Buffer> {
    
  console.log('🔄 [V11] Using GRID layout for Daily Report.');

  // 1. [ใหม่] แปลง DailyPhotoWithBase64[] ➜ FullLayoutPhoto[]
  const transformedPhotos: FullLayoutPhoto[] = photos.map((photo, index) => {
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
  const pdfData: PDFReportData = {
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
export async function uploadPDFToStorage(
  pdfBuffer: Buffer, 
  reportData: any, 
  reportType: 'QC' | 'Daily',
  stableFilename?: string // <-- [ใหม่] 1. เพิ่ม Argument ที่ 4
): Promise<{ filename: string; publicUrl: string; filePath: string }> {
  try {
    const bucket = admin.storage().bucket();
    let filename: string;
    let filePath: string;
    const basePath = `projects/${reportData.projectId}/reports`; // <-- [แก้ไข] 2. แก้ไข Path ให้อยู่ใน projects/
    
    // ✅ [ใหม่] 3. ตรวจสอบว่ามี stableFilename ส่งมาหรือไม่
    if (stableFilename) {
      filename = stableFilename; // 3.1 ถ้ามี ให้ใช้ชื่อนั้นเลย
    } else {
      // 3.2 ถ้าไม่มี (Fallback) ให้สร้างชื่อแบบมี Timestamp (เหมือนเดิม)
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      if (reportType === 'QC') {
        const { mainCategory, subCategory, dynamicFields = {} } = reportData as ReportData;
        const dynamicFieldsStr = Object.values(dynamicFields).filter(v => v).join('_') || 'all';
        const catPath = `${mainCategory.replace(/\s/g, '_')}_${subCategory.replace(/\s/g, '_')}`;
        filename = `QC-Report_${catPath}_${dynamicFieldsStr}_${timestamp}.pdf`;
      } else {
        const { date } = reportData as ReportDataDaily;
        filename = `Daily-Report_${date}_${timestamp}.pdf`;
      }
    }

    // ✅ [ใหม่] 4. กำหนด Path ปลายทาง (ย้ายจากด้านบนลงมา)
    if (reportType === 'QC') {
      const { mainCategory, subCategory } = reportData as ReportData;
      // ใช้วิธี slugify (ถ้ามี) หรือ replace แบบเดิม เพื่อความปลอดภัย
      const safeMainCat = (mainCategory || 'qc-reports').replace(/\s/g, '_');
      const safeSubCat = (subCategory || 'unknown').replace(/\s/g, '_');
      filePath = `${basePath}/QC/${safeMainCat}/${safeSubCat}/${filename}`; // <-- [แก้ไข] จัด Path ให้ดีขึ้น
    } else {
      const { date } = reportData as ReportDataDaily;
      filePath = `${basePath}/Daily/${date}/${filename}`; // <-- [แก้ไข] จัด Path ให้ดีขึ้น
    }

    const file = bucket.file(filePath);
    await file.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
        cacheControl: 'public, max-age=300', // <-- [แนะนำ] ลด Cache Control ลง
        metadata: { // <-- Metadata เดิมของคุณ ถูกต้องแล้ว
          projectId: reportData.projectId, reportType: reportType,
          mainCategory: (reportData as ReportData).mainCategory || '',
          subCategory: (reportData as ReportData).subCategory || '',
          date: (reportData as ReportDataDaily).date || '',
          generatedAt: new Date().toISOString()
        }
      },
      public: true // <-- [ใหม่] 5. ต้องตั้งค่า Public เพื่อให้ URL ใช้งานได้
    });

    // ✅ [ใหม่] 6. ใช้ publicUrl() แทน getSignedUrl()
    // getSignedUrl() จะหมดอายุ แต่ publicUrl() จะถาวร (ถ้าไฟล์ตั้งค่าเป็น Public)
    const publicUrl = file.publicUrl();
    
    console.log(`✅ PDF Uploaded/Overwritten: ${filePath}`);

    return { filename, publicUrl: publicUrl, filePath };
    
  } catch (error) {
    console.error('❌ Error uploading PDF:', error);
    throw error;
  }
}

// (generateOptimizedPDF (Core Grid Generator) - Unchanged)
export async function generateOptimizedPDF(
  reportData: PDFReportData,
  settings: ReportSettings,
  logoBase64: string | null
): Promise<Buffer> {
  let browser: puppeteer.Browser | null = null;
  let page: puppeteer.Page | null = null;
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
  } catch (error) {
    console.error('❌ Error in GRID PDF generation:', error);
    throw error;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

// ========================================
// [ลบ V11] - ลบ Daily PDF Generator
// ========================================
// (ฟังก์ชัน generateDailyPDFUsingPuppeteer ถูกลบออกทั้งหมด)