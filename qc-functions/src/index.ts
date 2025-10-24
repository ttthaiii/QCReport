// Filename: qc-functions/src/index.ts (VERSION 8 - Dynamic PDF Settings)

import * as admin from "firebase-admin";
import { getStorage } from 'firebase-admin/storage';
import { onRequest } from "firebase-functions/v2/https";
import express, { Request, Response } from "express";
import cors from "cors";
import Busboy, { FileInfo } from 'busboy';
import { Readable } from 'stream';

// ✅ [แก้ไข] Import ReportSettings (ต้องสร้าง Interface นี้ใน pdf-generator.ts ด้วย)
import { 
  getLatestPhotos, 
  createFullLayout, 
  generatePDF, 
  generateDailyPDFWrapper,
  uploadPDFToStorage,
  getUploadedTopicStatus,
  getDailyPhotosByDate,
  ReportSettings, // <-- [ใหม่] Import
  DEFAULT_SETTINGS
} from './services/pdf-generator';

import { PhotoData as FirestorePhotoData, logPhotoToFirestore } from "./api/firestore";
import { uploadPhotoToStorage as uploadImageToStorage } from "./api/storage";

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

function slugify(text: string): string {
  if (typeof text !== 'string') return `doc-${Date.now()}`; // Fallback
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\u0E00-\u0E7F\w-]+/g, '') // Remove all non-word chars except Thai
    .replace(/--+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '')            // Trim - from end of text
    || `doc-${Date.now()}`;          // Fallback for empty string
}

if (!admin.apps.length) {
  if (IS_EMULATOR) {
    console.log("🔧 Running in EMULATOR mode (with Service Account)");
    const serviceAccount = require("../keys/qcreport-54164-4d8f26cbb52f.json");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount), 
      storageBucket: "qcreport-54164.appspot.com"
    });
  } else {
    console.log("🚀 Running in PRODUCTION mode");
    admin.initializeApp({
      storageBucket: "qcreport-54164.appspot.com"
    });
  }
}

const db = admin.firestore();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

// --- API ROUTES ---

// ... (คง Endpoint /health, /projects, /project-config, /projects/:projectId/report-settings ไว้เหมือนเดิม) ...
// ✅ Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ 
    status: "healthy",
    environment: IS_EMULATOR ? "emulator" : "production",
    version: "8.0" // <-- [ใหม่] อัปเดตเวอร์ชัน
  });
});

// ✅ Get all active projects
app.get("/projects", async (req: Request, res: Response): Promise<Response> => {
  try {
    const projectsSnapshot = await db
      .collection("projects")
      .where("isActive", "==", true)
      .get();
    
    if (projectsSnapshot.empty) {
      return res.json({ success: true, data: [] });
    }
    
    const projects = projectsSnapshot.docs.map((doc) => ({ 
      id: doc.id, 
      ...doc.data() 
    }));
    
    return res.json({ success: true, data: projects });
  } catch (error) {
    console.error("Error in /projects:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

// ✅ Get project configuration
app.get("/project-config/:projectId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    const projectConfigRef = db.collection("projectConfig").doc(projectId);

    const mainCategoriesPromise = projectConfigRef
      .collection("mainCategories")
      .where("isArchived", "==", false)
      .get();
      
    const subCategoriesPromise = projectConfigRef
      .collection("subCategories")
      .where("isArchived", "==", false)
      .get();
      
    const topicsPromise = projectConfigRef
      .collection("topics")
      .where("isArchived", "==", false)
      .get();

    const [mainSnap, subSnap, topicSnap] = await Promise.all([
      mainCategoriesPromise,
      subCategoriesPromise,
      topicsPromise,
    ]);

    const topicsMap = new Map<string, any[]>();
    topicSnap.forEach(doc => {
      const topicData = doc.data();
      const subId = topicData.subCategoryId;
      if (!topicsMap.has(subId)) {
        topicsMap.set(subId, []);
      }
      topicsMap.get(subId)!.push({
        id: doc.id,
        name: topicData.name,
        dynamicFields: topicData.dynamicFields || [],
      });
    });

    const subCategoriesMap = new Map<string, any[]>();
    subSnap.forEach(doc => {
      const subData = doc.data();
      const mainId = subData.mainCategoryId;
      if (!subCategoriesMap.has(mainId)) {
        subCategoriesMap.set(mainId, []);
      }
      subCategoriesMap.get(mainId)!.push({
        id: doc.id,
        name: subData.name,
        dynamicFields: subData.dynamicFields || [],
        topics: topicsMap.get(doc.id) || [],
      });
    });

    const finalConfig: any[] = [];
    mainSnap.forEach(doc => {
      finalConfig.push({
        id: doc.id,
        name: doc.data().name,
        subCategories: subCategoriesMap.get(doc.id) || [],
      });
    });

    if (finalConfig.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Config not found or is empty." 
      });
    }
    
    return res.json({ success: true, data: finalConfig });

  } catch (error) {
    console.error("Error in /project-config (V2):", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

// ✅ [ใหม่ V11.3] Get Project Report Settings
app.get("/projects/:projectId/report-settings", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    const projectRef = db.collection("projects").doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      return res.status(404).json({ success: false, error: "Project not found." });
    }

    const projectData = projectDoc.data();
    // ใช้ Default Settings ถ้าใน DB ไม่มีค่า
    const settings = projectData?.reportSettings || DEFAULT_SETTINGS;

    // Merge defaults เพื่อให้แน่ใจว่ามีครบทุกคีย์
    const completeSettings = { ...DEFAULT_SETTINGS, ...settings };

    return res.json({ success: true, data: completeSettings });

  } catch (error) {
    console.error("Error fetching report settings:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
      data: DEFAULT_SETTINGS // คืนค่า Default เมื่อเกิด Error
    });
  }
});

// ✅ Get Project Report Settings (V2 - อัปเดต Defaults & Logo)
app.post("/projects/:projectId/report-settings", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    const newSettings = req.body; 

    if (typeof newSettings.photosPerPage !== 'number' || ![1, 2, 4, 6].includes(newSettings.photosPerPage)) {
         console.warn("Invalid photosPerPage value received:", newSettings.photosPerPage);
         newSettings.photosPerPage = 6;
    }

    const projectRef = db.collection("projects").doc(projectId);

    await projectRef.set({ reportSettings: newSettings }, { merge: true });

    console.log(`✅ Report settings updated for project: ${projectId}`);
    return res.json({ success: true, data: newSettings });

  } catch (error) {
    console.error("Error updating report settings:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// ✅ Endpoint สำหรับ Upload Logo โครงการ
// ✅ [แก้ไข V11.3] Endpoint สำหรับ Upload Logo โครงการ (แก้ไขปัญหา Busboy)
app.post("/projects/:projectId/upload-logo", async (req: Request, res: Response): Promise<Response> => {
  const { projectId } = req.params;

  if (!req.headers['content-type']?.startsWith('multipart/form-data')) {
    return res.status(400).json({ success: false, error: 'Invalid Content-Type. Expected multipart/form-data.' });
  }

  // [ใหม่] ห่อหุ้ม Busboy ใน Promise
  return new Promise<Response>((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
    });

    const bucket = getStorage().bucket();
    let uploadPromise: Promise<void> | null = null;
    let publicUrl = "";

    busboy.on('file', (fieldname: string, file: Readable, info: FileInfo): void => {
      // ตรวจสอบ Field name
      if (fieldname !== 'logo') {
        console.warn(`Unexpected field name: ${fieldname}. Skipping file.`);
        file.resume();
        return;
      }
      
      const { filename, mimeType } = info;
      console.log(`Receiving logo file: ${filename}, mimetype: ${mimeType}`);

      // ตรวจสอบ MimeType
      if (!mimeType.startsWith('image/')) {
        console.error('Invalid file type uploaded.');
        file.resume(); 
        // [แก้ไข] ส่ง Error ผ่าน reject ของ Promise หลัก
        if (!res.headersSent) {
          res.status(400).json({ success: false, error: 'Invalid file type. Only images are allowed.' });
          resolve(res); // จบ Promise นี้ด้วย Response ที่ส่งไปแล้ว
        }
        return;
      }

      // สร้าง Path และ File Upload
      const fileExtension = filename.split('.').pop()?.toLowerCase() || 'png';
      const uniqueFilename = `logo_${Date.now()}.${fileExtension}`;
      const filePath = `logos/${projectId}/${uniqueFilename}`;
      const fileUpload = bucket.file(filePath);
      
      console.log(`Uploading logo to: ${filePath}`);

      const stream = fileUpload.createWriteStream({
        metadata: { contentType: mimeType, cacheControl: 'public, max-age=3600' },
        resumable: false,
      });

      // [ใหม่] สร้าง Promise สำหรับการอัปโหลดไฟล์นี้
      uploadPromise = new Promise((resolveUpload, rejectUpload) => {
        file.pipe(stream)
            .on('finish', () => {
              console.log('File pipe finished.');
              // เมื่ออัปโหลดเสร็จ ให้ Make Public และเก็บ URL
              fileUpload.makePublic()
                .then(() => {
                  publicUrl = fileUpload.publicUrl();
                  console.log(`Logo uploaded successfully: ${publicUrl}`);
                  resolveUpload();
                })
                .catch(rejectUpload);
            })
            .on('error', rejectUpload);
      });
    }); // ปิด busboy.on('file')

    busboy.on('error', (err: Error) => {
      console.error('Busboy error:', err);
      if (!res.headersSent) {
        res.status(400).json({ success: false, error: `Error parsing upload request: ${err.message}` });
        resolve(res); // จบ Promise
      }
    });

    busboy.on('finish', async () => {
      console.log('Busboy finish event triggered.');
      
      try {
        // [ใหม่] รอให้การอัปโหลดไฟล์ (ถ้ามี) เสร็จสิ้น
        if (uploadPromise) {
          await uploadPromise;
        } else {
          // กรณีที่ไม่มีไฟล์ 'logo' ถูกส่งมา
          if (!res.headersSent) {
             console.log('Finish called, but no valid file was processed.');
             res.status(400).json({ success: false, error: 'No valid file uploaded or fieldname mismatch.' });
             resolve(res);
          }
          return;
        }

        // ถ้าอัปโหลดสำเร็จ (publicUrl ต้องมีค่า)
        if (publicUrl) {
          // บันทึก URL ลง Firestore
          const projectRef = db.collection("projects").doc(projectId);
          await projectRef.set({ reportSettings: { projectLogoUrl: publicUrl } }, { merge: true });

          // [ใหม่] ส่ง Response สำเร็จกลับไป
          if (!res.headersSent) {
            res.json({ success: true, data: { logoUrl: publicUrl } });
            resolve(res);
          }
        } else if (!res.headersSent) {
          // กรณีแปลกๆ ที่ uploadPromise สำเร็จ แต่ publicUrl ไม่มีค่า
           res.status(500).json({ success: false, error: 'Upload finished but no URL was generated.' });
           resolve(res);
        }
        
      } catch (err: any) {
        console.error('Error during Storage upload or Firestore save:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: `Error processing file after upload: ${err.message}` });
          resolve(res);
        }
      }
    }); // ปิด busboy.on('finish')

    // เริ่มกระบวนการ
    req.pipe(busboy);

  }); // ปิด new Promise
});

// ✅ Upload photo with base64
app.post("/upload-photo-base64", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { 
      photo, 
      projectId, 
      reportType, 
      category, 
      topic, 
      description, 
      location, 
      dynamicFields 
    } = req.body;
    
    if (!photo || !projectId || !reportType) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields." 
      });
    }
    
    let filenamePrefix: string;
    let photoData: FirestorePhotoData;
    
    if (reportType === 'QC') {
      if (!category || !topic) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing QC fields." 
        });
      }
      
      const sanitizedCategoryForPrefix = category.replace(/\s*>\s*/g, "_");
      filenamePrefix = `${sanitizedCategoryForPrefix}-${topic}`;
      
      photoData = { 
        projectId, 
        reportType, 
        category, 
        topic, 
        location: location || "", 
        dynamicFields: dynamicFields || {},
        filename: '', 
        driveUrl: '', 
        filePath: ''
      };
    } else if (reportType === 'Daily') {
      filenamePrefix = `Daily-${description?.substring(0, 20) || 'report'}`;
      
      photoData = { 
        projectId, 
        reportType, 
        description: description || "", 
        location: location || "", 
        dynamicFields: dynamicFields || {},
        filename: '', 
        driveUrl: '', 
        filePath: '',
        category: '', 
        topic: ''
      };
    } else {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid reportType." 
      });
    }

    let cleanBase64 = photo;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    cleanBase64 = cleanBase64.replace(/\s/g, '');
    
    console.log(`📏 Base64 length: ${cleanBase64.length} chars`);
    
    const imageBuffer = Buffer.from(cleanBase64, "base64");
    console.log(`📊 Buffer size: ${imageBuffer.length} bytes`);
    
    if (imageBuffer.length < 100) {
      throw new Error('Invalid image data: buffer too small');
    }
    
    if (imageBuffer[0] !== 0xFF || imageBuffer[1] !== 0xD8) {
      console.error('❌ Invalid JPEG header:', imageBuffer.slice(0, 10));
      throw new Error('Invalid image data: not a valid JPEG');
    }
    
    console.log('✅ Valid JPEG image detected');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${filenamePrefix}-${timestamp}.jpg`.replace(/\s/g, "_");

    const storageCategoryPath = reportType === 'QC'
      ? category.replace(/\s*>\s*/g, "_")
      : 'daily-reports';
    
    const storageResult = await uploadImageToStorage({ 
      imageBuffer, 
      filename, 
      projectId, 
      category: storageCategoryPath 
    });
    
    photoData.filename = storageResult.filename;
    photoData.driveUrl = storageResult.publicUrl;
    photoData.filePath = storageResult.filePath;

    const firestoreResult = await logPhotoToFirestore(photoData);
    
    return res.json({ 
      success: true, 
      data: { 
        ...firestoreResult, 
        ...storageResult 
      } 
    });
  } catch (error) {
    console.error("Error in /upload-photo-base64:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

// ✅ [แก้ไข] Generate PDF report (v8 - with Dynamic Settings)
app.post("/generate-report", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { 
      projectId, 
      projectName, 
      reportType,
      mainCategory, 
      subCategory, 
      dynamicFields,
      date
    } = req.body;
    
    if (!projectId || !reportType) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing projectId or reportType." 
      });
    }

    // ===================================
    //  [ใหม่] Fetch Report Settings
    // ===================================
    let reportSettings: ReportSettings = { ...DEFAULT_SETTINGS };
    try {
      const projectDoc = await db.collection("projects").doc(projectId).get();
      if (projectDoc.exists && projectDoc.data()?.reportSettings) {
        const settingsFromDB = projectDoc.data()?.reportSettings;
        // Merge defaults with DB settings to ensure all keys exist
        reportSettings = { ...DEFAULT_SETTINGS, ...settingsFromDB };
        console.log(`✅ Loaded custom report settings for ${projectId}: ${reportSettings.photosPerPage} photos/page`);
      } else {
        console.log(`⚠️ No custom report settings found for ${projectId}, using defaults.`);
      }
    } catch (settingsError) {
      console.error(`❌ Error fetching report settings:`, settingsError);
      // Continue with defaults
    }
    
    console.log(`📊 Generating ${reportType} report for ${projectName}`);

    // ===================================
    //  QC REPORT LOGIC
    // ===================================
    if (reportType === 'QC') {
      if (!mainCategory || !subCategory) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing QC fields (mainCategory, subCategory)." 
        });
      }

      const projectConfigRef = db.collection("projectConfig").doc(projectId);

      const mainCatSnap = await projectConfigRef
        .collection("mainCategories")
        .where("name", "==", mainCategory)
        .limit(1)
        .get();
      
      if (mainCatSnap.empty) {
        return res.status(404).json({ success: false, error: `Main category '${mainCategory}' not found.` });
      }
      const mainCatId = mainCatSnap.docs[0].id;

      const subCatSnap = await projectConfigRef
        .collection("subCategories")
        .where("name", "==", subCategory)
        .where("mainCategoryId", "==", mainCatId)
        .limit(1)
        .get();

      if (subCatSnap.empty) {
        return res.status(404).json({ success: false, error: `Sub category '${subCategory}' not found under '${mainCategory}'.` });
      }
      const subCatId = subCatSnap.docs[0].id;

      const topicsSnap = await projectConfigRef
        .collection("topics")
        .where("subCategoryId", "==", subCatId)
        .where("isArchived", "==", false)
        .get();
        
      const allTopics: string[] = topicsSnap.docs.map(doc => doc.data().name as string);
      
      if (allTopics.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No topics found."
        });
      }
      
      console.log(`✅ Found ${allTopics.length} total topics for the layout.`);
      
      const foundPhotos = await getLatestPhotos(
        projectId, 
        mainCategory, 
        subCategory, 
        allTopics, 
        dynamicFields || {}
      );
      
      console.log(`📸 Found and downloaded ${foundPhotos.length} photos.`);
      
      const fullLayoutPhotos = createFullLayout(allTopics, foundPhotos);
      
      const reportData = { 
        projectId, 
        projectName: projectName || projectId, 
        mainCategory, 
        subCategory, 
        dynamicFields: dynamicFields || {} 
      };

      const qcReportSettings: ReportSettings = {
        ...reportSettings,
        photosPerPage: reportSettings.qcPhotosPerPage // <-- แปลงค่า!
      };

      // ✅ [แก้ไข] ส่ง reportSettings เข้าไปด้วย
      const pdfBuffer = await generatePDF(reportData, fullLayoutPhotos, qcReportSettings); 
      console.log(`✅ QC PDF generated: ${pdfBuffer.length} bytes`);
      
      const uploadResult = await uploadPDFToStorage(pdfBuffer, reportData, 'QC');
      
      return res.json({
        success: true,
        data: {
          filename: uploadResult.filename,
          publicUrl: uploadResult.publicUrl,
          totalTopics: allTopics.length,
          photosFound: foundPhotos.length,
          placeholders: allTopics.length - foundPhotos.length
        }
      });
    
    // ===================================
    //  DAILY REPORT LOGIC
    // ===================================
    } else if (reportType === 'Daily') {
      if (!date) {
         return res.status(400).json({ 
          success: false, 
          error: "Missing Daily field (date)." 
        });
      }

      console.log(`📅 Fetching Daily photos for date: ${date}`);

      const foundPhotos = await getDailyPhotosByDate(projectId, date);
      console.log(`📸 Found and downloaded ${foundPhotos.length} daily photos.`);

      if (foundPhotos.length === 0) {
        return res.status(404).json({
          success: false,
          error: `ไม่พบรูปรายงานประจำวันสำหรับวันที่ ${date}`
        });
      }
      
      const reportData = { 
        projectId, 
        projectName: projectName || projectId, 
        date
      };

      const dailyReportSettings: ReportSettings = {
        ...reportSettings,
        photosPerPage: reportSettings.dailyPhotosPerPage // <-- แปลงค่า!
      };

      // ✅ [แก้ไข] ส่ง reportSettings เข้าไปด้วย
      const pdfBuffer = await generateDailyPDFWrapper(reportData, foundPhotos, dailyReportSettings);
      console.log(`✅ Daily PDF generated: ${pdfBuffer.length} bytes`);

      const uploadResult = await uploadPDFToStorage(pdfBuffer, reportData, 'Daily');

      return res.json({
        success: true,
        data: {
          filename: uploadResult.filename,
          publicUrl: uploadResult.publicUrl,
          photosFound: foundPhotos.length
        }
      });

    } else {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid reportType." 
      });
    }

  } catch (error) {
    console.error("❌ Error generating report:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

// ... (คง Endpoint /checklist-status, /photos/:projectId, และ /project-config/... CRUD ทั้งหมดไว้เหมือนเดิม) ...
app.post("/checklist-status", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { 
      projectId, 
      mainCategory, 
      subCategory, 
      dynamicFields 
    } = req.body;
    
    if (!projectId || !mainCategory || !subCategory || !dynamicFields) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields." 
      });
    }

    const category = `${mainCategory} > ${subCategory}`;

    const statusMap = await getUploadedTopicStatus(
      projectId,
      category,
      dynamicFields
    );
    
    return res.json({ success: true, data: statusMap });

  } catch (error) {
    console.error("❌ Error in /checklist-status:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

app.get("/photos/:projectId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      return res.status(400).json({ 
        success: false, 
        error: "Project ID is required" 
      });
    }
    
    const qcPhotosPromise = db
      .collection("qcPhotos")
      .where("projectId", "==", projectId)
      .get();
    
    const dailyPhotosPromise = db
      .collection("dailyPhotos")
      .where("projectId", "==", projectId)
      .get();
    
    const [qcSnapshot, dailySnapshot] = await Promise.all([
      qcPhotosPromise, 
      dailyPhotosPromise
    ]);
    
    const photos: any[] = [];
    
    qcSnapshot.forEach(doc => {
      const data = doc.data();
      photos.push({ 
        id: doc.id, 
        ...data, 
        createdAt: data.createdAt.toDate().toISOString() 
      });
    });
    
    dailySnapshot.forEach(doc => {
      const data = doc.data();
      photos.push({ 
        id: doc.id, 
        ...data, 
        createdAt: data.createdAt.toDate().toISOString() 
      });
    });
    
    return res.json({ success: true, data: photos });
  } catch (error) {
    console.error("Error in /photos/:projectId:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

app.post("/project-config/:projectId/main-category/:mainCatId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId, mainCatId } = req.params;
    const { newName } = req.body;

    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        error: "Missing or invalid 'newName' in request body." 
      });
    }
    
    const docRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("mainCategories")
      .doc(mainCatId);
      
    await docRef.update({
      name: newName.trim()
    });
    
    console.log(`✅ Config updated: ${projectId}/${mainCatId} -> ${newName.trim()}`);
    
    return res.json({ 
      success: true, 
      data: { id: mainCatId, name: newName.trim() } 
    });

  } catch (error) {
    console.error("Error updating main category:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

app.delete("/project-config/:projectId/main-category/:mainCatId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId, mainCatId } = req.params;

    const docRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("mainCategories")
      .doc(mainCatId);
      
    await docRef.update({
      isArchived: true
    });
    
    console.log(`✅ Config soft-deleted: ${projectId}/${mainCatId}`);
    
    return res.json({ 
      success: true, 
      data: { id: mainCatId, status: 'archived' } 
    });

  } catch (error) {
    console.error("Error soft-deleting main category:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

app.post("/project-config/:projectId/main-categories", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    const { newName } = req.body;

    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        error: "Missing or invalid 'newName' in request body." 
      });
    }
    
    const trimmedName = newName.trim();
    const newId = slugify(trimmedName);
    
    const docRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("mainCategories")
      .doc(newId);
      
    const existingDoc = await docRef.get();
    if (existingDoc.exists) {
        return res.status(409).json({
            success: false,
            error: `หมวดหมู่ชื่อ '${trimmedName}' (ID: ${newId}) มีอยู่แล้ว`
        });
    }
      
    const newData = {
        name: trimmedName,
        isArchived: false
    };
    
    await docRef.set(newData);
    
    console.log(`✅ Config created: ${projectId}/${newId} -> ${trimmedName}`);
    
    return res.status(201).json({
      success: true, 
      data: { id: newId, ...newData } 
    });

  } catch (error) {
    console.error("Error creating main category:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

app.post("/project-config/:projectId/sub-categories", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    const { newName, mainCategoryId, mainCategoryName } = req.body;

    if (!newName || !mainCategoryId || !mainCategoryName) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields (newName, mainCategoryId, mainCategoryName)." 
      });
    }

    const trimmedName = newName.trim();
    const newId = slugify(`${mainCategoryName}-${trimmedName}`); 
    
    const docRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("subCategories")
      .doc(newId);
      
    const existingDoc = await docRef.get();
    if (existingDoc.exists) {
        return res.status(409).json({
            success: false,
            error: `หมวดหมู่ย่อยชื่อ '${trimmedName}' (ID: ${newId}) มีอยู่แล้ว`
        });
    }
      
    const newData = {
        name: trimmedName,
        mainCategoryId: mainCategoryId,
        dynamicFields: [],
        isArchived: false
    };
    
    await docRef.set(newData);
    
    console.log(`✅ SubConfig created: ${projectId}/${newId} -> ${trimmedName}`);
    return res.status(201).json({ success: true, data: { id: newId, ...newData } });

  } catch (error) {
    console.error("Error creating sub category:", error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post("/project-config/:projectId/sub-category/:subCatId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId, subCatId } = req.params;
    const { newName } = req.body;

    if (!newName) {
      return res.status(400).json({ success: false, error: "Missing 'newName'." });
    }
    
    const docRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("subCategories")
      .doc(subCatId);
      
    await docRef.update({ name: newName.trim() });
    
    console.log(`✅ SubConfig updated: ${projectId}/${subCatId} -> ${newName.trim()}`);
    return res.json({ success: true, data: { id: subCatId, name: newName.trim() } });

  } catch (error) {
    console.error("Error updating sub category:", error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.delete("/project-config/:projectId/sub-category/:subCatId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId, subCatId } = req.params;

    const docRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("subCategories")
      .doc(subCatId);
      
    await docRef.update({ isArchived: true });
    
    console.log(`✅ SubConfig soft-deleted: ${projectId}/${subCatId}`);
    
    return res.json({ success: true, data: { id: subCatId, status: 'archived' } });

  } catch (error) {
    console.error("Error soft-deleting sub category:", error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post("/project-config/:projectId/topics", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    const { newTopicNames, subCategoryId, mainCategoryName, subCategoryName } = req.body; 

    if (!Array.isArray(newTopicNames) || !subCategoryId || !mainCategoryName || !subCategoryName) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields (newTopicNames must be an array, subCategoryId, mainCategoryName, subCategoryName)." 
      });
    }

    const topicsCollectionRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("topics");
      
    const batch = db.batch();
    const addedTopics: any[] = [];
    
    for (const name of newTopicNames) {
      const trimmedName = name.trim();
      if (!trimmedName) continue;

      const newId = slugify(`${mainCategoryName}-${subCategoryName}-${trimmedName}`); 
      const docRef = topicsCollectionRef.doc(newId);
      
      const newData = {
          name: trimmedName,
          subCategoryId: subCategoryId,
          isArchived: false
      };
      
      batch.create(docRef, newData);
      addedTopics.push({ id: newId, ...newData });
    }
    
    if (addedTopics.length === 0) {
       return res.status(400).json({ success: false, error: "No valid topic names provided." });
    }

    await batch.commit();
    
    console.log(`✅ ${addedTopics.length} Topics created under: ${projectId}/${subCategoryId}`);
    return res.status(201).json({ success: true, data: addedTopics });

  } catch (error) {
    console.error("Error creating bulk topics:", error);
    if ((error as any).code === 6) {
         return res.status(409).json({ 
            success: false, 
            error: "การสร้างล้มเหลว: มีบางหัวข้อ (หรือ ID) ที่คุณพยายามเพิ่มซ้ำกับของเดิมที่มีอยู่" 
        });
    }
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post("/project-config/:projectId/topic/:topicId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId, topicId } = req.params;
    const { newName } = req.body;

    if (!newName) {
      return res.status(400).json({ success: false, error: "Missing 'newName'." });
    }
    
    const docRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("topics")
      .doc(topicId);
      
    await docRef.update({ name: newName.trim() });
    
    console.log(`✅ Topic updated: ${projectId}/${topicId} -> ${newName.trim()}`);
    return res.json({ success: true, data: { id: topicId, name: newName.trim() } });

  } catch (error) {
    console.error("Error updating topic:", error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.delete("/project-config/:projectId/topic/:topicId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId, topicId } = req.params;

    const docRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("topics")
      .doc(topicId);
      
    await docRef.update({ isArchived: true });
    
    console.log(`✅ Topic soft-deleted: ${projectId}/${topicId}`);
    
    return res.json({ success: true, data: { id: topicId, status: 'archived' } });

  } catch (error) {
    console.error("Error soft-deleting topic:", error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post("/project-config/:projectId/sub-category/:subCatId/fields", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId, subCatId } = req.params;
    const { fields } = req.body;

    if (!Array.isArray(fields)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid input: 'fields' must be an array." 
      });
    }

    const cleanedFields = fields
      .map(f => typeof f === 'string' ? f.trim() : '')
      .filter((f, index, self) => f && self.indexOf(f) === index);
    
    const docRef = db
      .collection("projectConfig")
      .doc(projectId)
      .collection("subCategories")
      .doc(subCatId);
      
    await docRef.update({
      dynamicFields: cleanedFields
    });
    
    console.log(`✅ Fields updated: ${projectId}/${subCatId} -> [${cleanedFields.join(', ')}]`);
    
    return res.json({ 
      success: true, 
      data: { id: subCatId, dynamicFields: cleanedFields } 
    });

  } catch (error) {
    console.error("Error updating dynamic fields:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

// ✅ Export Cloud Function
export const api = onRequest({ 
  region: "asia-southeast1", 
  memory: "2GiB",
  timeoutSeconds: 540,
}, app);