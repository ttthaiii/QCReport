// pdf-generator.ts - Fixed Version with Original Layout
// รูปแบบเหมือนรูปที่ 1-2 (มี logo มุมขวา, header เป็นตาราง, รูปไม่มีกรอบ)

import puppeteer, { Browser, Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import * as admin from 'firebase-admin';
import { PhotoData as FirestorePhotoData } from '../api/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';
import { createHash } from 'crypto';

// ========================================
// Helper Functions
// ========================================

function createStableQcId(
  projectId: string,
  category: string,
  topic: string,
  dynamicFields: Record<string, string>
): string {
  const sortedFields = Object.keys(dynamicFields || {}).sort()
    .map(key => `${key}=${dynamicFields[key]}`)
    .join('&');
  const rawId = `${projectId}|${category}|${topic}|${sortedFields}`;
  return createHash('md5').update(rawId).digest('hex');
}

function getCurrentThaiDate(): string {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface ReportSettings {
  layoutType: 'default' | string;
  qcPhotosPerPage: 1 | 2 | 4 | 6;
  dailyPhotosPerPage: 1 | 2 | 4 | 6;
  photosPerPage: 1 | 2 | 4 | 6;
  projectLogoUrl: string;
}

export const DEFAULT_SETTINGS: ReportSettings = {
  layoutType: 'default',
  qcPhotosPerPage: 6,
  dailyPhotosPerPage: 6,
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

export interface DailyReportData {
  projectId: string;
  projectName: string;
  date: string;
}

type PDFReportData = ReportData | DailyReportData;

// ========================================
// DATA FETCHING FUNCTIONS
// ========================================

async function fetchAndEncodeImage(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const mimeType = response.headers['content-type'] || 'image/jpeg';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch (error: any) {
    console.warn(`⚠️ Failed to fetch or encode image: ${url}`, error.message);
    return null;
  }
}

async function fetchProjectLogo(projectLogoUrl: string): Promise<string | null> {
  if (!projectLogoUrl) return null;
  console.log(`Fetching project logo from: ${projectLogoUrl}`);
  return fetchAndEncodeImage(projectLogoUrl);
}

export async function getTopicsForFilter(
  db: admin.firestore.Firestore,
  projectId: string,
  mainCategory: string,
  subCategory: string
): Promise<string[]> {
  try {
    const projectConfigRef = db.collection("projectConfig").doc(projectId);
    
    const mainCatSnap = await projectConfigRef.collection("mainCategories")
      .where("name", "==", mainCategory).limit(1).get();
    if (mainCatSnap.empty) throw new Error("Main category not found.");
    const mainCatId = mainCatSnap.docs[0].id;

    const subCatSnap = await projectConfigRef.collection("subCategories")
      .where("name", "==", subCategory)
      .where("mainCategoryId", "==", mainCatId)
      .limit(1).get();
    if (subCatSnap.empty) throw new Error("Sub category not found.");
    const subCatId = subCatSnap.docs[0].id;

    const topicsSnap = await projectConfigRef.collection("topics")
      .where("subCategoryId", "==", subCatId)
      .where("isArchived", "==", false)
      .get();
      
    const allTopics: string[] = topicsSnap.docs.map(doc => doc.data().name as string);
    return allTopics;

  } catch (error) {
    console.error("Error getting topics for filter:", error);
    return [];
  }
}

export async function getDailyPhotosByDate(
  projectId: string,
  date: string
): Promise<FullLayoutPhoto[]> {
  
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

  const photos: FullLayoutPhoto[] = await Promise.all(
    photosSnapshot.docs.map(async (doc, index) => {
      const data = doc.data() as FirestorePhotoData;
      const createdAt = (data.createdAt as Timestamp).toDate();
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
    })
  );

  return photos;
}

export async function getLatestPhotos(
  projectId: string,
  mainCategory: string,
  subCategory: string,
  allTopics: string[],
  dynamicFields: Record<string, string>
): Promise<PhotoData[]> {
  
  const db = admin.firestore();
  const category = `${mainCategory} > ${subCategory}`;
  
  console.log(`Fetching latest QC photos from 'latestQcPhotos' for: ${category}`);
  console.log(`Dynamic fields:`, dynamicFields);
  
  const photoPromises = allTopics.map(async (topic) => {
    const stableId = createStableQcId(
      projectId,
      category,
      topic,
      dynamicFields || {}
    );
    
    const docRef = db.collection('latestQcPhotos').doc(stableId);
    const doc = await docRef.get();
      
    if (!doc.exists) {
      return null;
    }
    
    const data = doc.data() as FirestorePhotoData;
    const imageBase64 = data.driveUrl ? await fetchAndEncodeImage(data.driveUrl) : null;
    
    // ✅ Debug: ตรวจสอบว่า Base64 ถูกสร้างหรือไม่
    if (imageBase64) {
      const base64Length = imageBase64.length;
      const isValidBase64 = imageBase64.startsWith('data:image/');
      console.log(`     📸 Base64 encoded: ${base64Length} chars, Valid: ${isValidBase64}`);
    } else {
      console.log(`     ⚠️ Failed to encode image for topic: "${topic}"`);
    }
    
    return {
      topic: topic,
      imageBase64: imageBase64,
      isPlaceholder: false,
      location: data.location,
      timestamp: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : undefined,
    } as PhotoData;
  });
  
  const photos = await Promise.all(photoPromises);
  const foundPhotos = photos.filter((p): p is PhotoData => p !== null);

  console.log(`✅ Found ${foundPhotos.length} photos out of ${allTopics.length} topics`);

  // ✅ Debug ข้อมูลแต่ละรูป
  foundPhotos.forEach((photo, index) => {
    console.log(`  Photo ${index + 1}:`);
    console.log(`    - Topic: ${photo.topic}`);
    console.log(`    - Has Base64: ${!!photo.imageBase64}`);
    console.log(`    - Is Placeholder: ${photo.isPlaceholder}`);
    if (photo.imageBase64) {
      console.log(`    - Base64 length: ${photo.imageBase64.length}`);
      console.log(`    - Starts with: ${photo.imageBase64.substring(0, 30)}...`);
    }
  });

  return foundPhotos;
}

export function createFullLayoutPhotos(
  photos: PhotoData[],
  allTopics: string[]
): FullLayoutPhoto[] {
  
  const photosByTopic = new Map<string, PhotoData>();
  photos.forEach(photo => {
    photosByTopic.set(photo.topic, photo);
  });
  
  const fullLayoutPhotos: FullLayoutPhoto[] = [];
  
  allTopics.forEach((topic, index) => {
    const photo = photosByTopic.get(topic);
    
    if (photo && photo.imageBase64) {
      fullLayoutPhotos.push({
        ...photo,
        topicOrder: index + 1,
        originalTopic: topic
      });
    } else {
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
export function createFullLayout(
  allTopics: string[],
  foundPhotos: PhotoData[]
): FullLayoutPhoto[] {
  return createFullLayoutPhotos(foundPhotos, allTopics);
}

// ========================================
// HELPER FUNCTIONS FOR INDEX.TS
// ========================================

/**
 * ตรวจสอบสถานะการอัปโหลดรูปของแต่ละหัวข้อ
 * Returns: Map<topicName, boolean> - true ถ้ามีรูปอัปโหลดแล้ว
 */
export async function getUploadedTopicStatus(
  projectId: string,
  category: string,
  dynamicFields: Record<string, string>
): Promise<Record<string, boolean>> {
  
  const db = admin.firestore();
  const statusMap: Record<string, boolean> = {};
  
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
    
  } catch (error) {
    console.error('Error in getUploadedTopicStatus:', error);
    return statusMap;
  }
}

// ========================================
// HTML/CSS GENERATION (Original Layout Style)
// ========================================

function getInlineCSS(): string {
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

function createDynamicHeader(
  reportData: ReportData | DailyReportData, 
  pageNumber: number, 
  totalPages: number,
  projectLogoBase64: string | null = null
): string {
  const currentDate = getCurrentThaiDate();
  
  // Check if it's QC Report or Daily Report
  const isQCReport = 'mainCategory' in reportData;
  
  if (isQCReport) {
    const qcData = reportData as ReportData;
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
    } else {
      // ถ้ามี fields มากกว่า 3
      // แถวที่ 2 แสดง 3 fields
      // แถวที่ 3 แสดง (เหลือ) ไม่เกิน 1 field (เพราะต้องเหลือที่สำหรับ วันที่ + แผ่นที่)
      row2FieldCount = 3;
      row3FieldCount = Math.min(1, totalFields - 3);
    }
    
    const row2Fields = fieldEntries.slice(0, row2FieldCount);
    const row3Fields = fieldEntries.slice(row2FieldCount, row2FieldCount + row3FieldCount);
    
    // ✅ สร้าง logo section โดยใช้โลโก้จาก settings (ถ้ามี) หรือใช้ default
    const logoSection = projectLogoBase64 
      ? `<img src="${projectLogoBase64}" alt="Project Logo" style="max-width: 150px; max-height: 60px; object-fit: contain;" />`
      : `<div class="logo-central-pattana"><span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span></div>`;
    
    return `
      <header class="header">
        <div class="logo-section">
          ${logoSection}
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
  } else {
    // Daily Report Header
    const dailyData = reportData as DailyReportData;
    
    // ✅ สร้าง logo section โดยใช้โลโก้จาก settings (ถ้ามี) หรือใช้ default
    const logoSection = projectLogoBase64 
      ? `<img src="${projectLogoBase64}" alt="Project Logo" style="max-width: 150px; max-height: 60px; object-fit: contain;" />`
      : `<div class="logo-central-pattana"><span class="logo-central">CENTRAL</span><span class="logo-pattana">PATTANA</span></div>`;
    
    return `
      <header class="header">
        <div class="logo-section">
          ${logoSection}
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

function createPhotosGrid(photos: FullLayoutPhoto[], pageIndex: number): string {
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

function createOptimizedHTML(
  reportData: PDFReportData, 
  photos: FullLayoutPhoto[],
  projectLogoBase64: string | null = null
): string {
  const photosPerPage = 6;
  const pages: FullLayoutPhoto[][] = [];
  
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
      ${createDynamicHeader(reportData, pageIndex + 1, pages.length, projectLogoBase64)}
      ${createPhotosGrid(pagePhotos, pageIndex)}
    </div>
  `}).join('');

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

async function generateOptimizedPDF(
  finalHtml: string
): Promise<Buffer> {
  
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`🎯 Starting Optimized PDF generation...`);
    
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
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
    
  } catch (error) {
    console.error('❌ Error in PDF generation:', error);
    throw error;
  } finally {
    console.log('Cleaning up Puppeteer instance...');
    if (page) {
      page.close().catch(e => console.warn('Warning: page.close() failed.', (e as Error).message));
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

export async function generatePDF(
  reportData: ReportData,
  fullLayoutPhotos: FullLayoutPhoto[],
  settings: ReportSettings
): Promise<Buffer> {
  
  console.log(`📊 Generating QC Report PDF...`);
  
  // ✅ ดึงโลโก้จาก settings
  const projectLogoBase64 = await fetchProjectLogo(settings.projectLogoUrl);
  if (projectLogoBase64) {
    console.log(`✅ Project logo loaded successfully`);
  } else {
    console.log(`ℹ️ No project logo provided, using default`);
  }
  
  const finalHtml = createOptimizedHTML(reportData, fullLayoutPhotos, projectLogoBase64);
  return generateOptimizedPDF(finalHtml);
}

export async function generateDailyPDFWrapper(
  reportData: DailyReportData,
  fullLayoutPhotos: FullLayoutPhoto[],
  settings: ReportSettings
): Promise<Buffer> {
  
  console.log(`📊 Generating Daily Report PDF...`);
  
  // ✅ ดึงโลโก้จาก settings
  const projectLogoBase64 = await fetchProjectLogo(settings.projectLogoUrl);
  if (projectLogoBase64) {
    console.log(`✅ Project logo loaded successfully`);
  } else {
    console.log(`ℹ️ No project logo provided, using default`);
  }
  
  const finalHtml = createOptimizedHTML(reportData, fullLayoutPhotos, projectLogoBase64);
  return generateOptimizedPDF(finalHtml);
}

// ========================================
// STORAGE UPLOAD
// ========================================

const CORRECT_BUCKET_NAME = "tts2004-smart-report-generate.firebasestorage.app";

export async function uploadPDFToStorage(
  pdfBuffer: Buffer,
  reportData: any,
  reportType: 'QC' | 'Daily',
  filename: string
): Promise<{ publicUrl: string; filePath: string }> {
  
  const { projectId, mainCategory, subCategory, date } = reportData;
  
  try {
    const bucket = admin.storage().bucket(CORRECT_BUCKET_NAME);
    
    let storagePath = `generated-reports/${projectId}/`;
    
    if (reportType === 'QC') {
      const mainSlug = mainCategory ? mainCategory.replace(/\s+/g, '_') : 'unknown';
      const subSlug = subCategory ? subCategory.replace(/\s+/g, '_') : 'unknown';
      storagePath += `QC/${mainSlug}/${subSlug}/`;
    } else {
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

  } catch (error) {
    console.error(`❌ Error uploading PDF to Storage:`, error);
    throw error;
  }
}