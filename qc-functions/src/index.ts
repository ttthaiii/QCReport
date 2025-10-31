// Filename: qc-functions/src/index.ts (VERSION 8 - Dynamic PDF Settings)
import * as admin from "firebase-admin";
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onRequest } from "firebase-functions/v2/https";
import express, { Request, Response } from "express";
import cors from "cors";
import { createHash } from 'crypto';

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
  DEFAULT_SETTINGS,
  getTopicsForFilter, 
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

function createStableReportId(
  reportType: 'QC' | 'Daily',
  mainCategory?: string,
  subCategory?: string,
  dynamicFields?: Record<string, string>,
  date?: string
): string {
  
  if (reportType === 'Daily') {
    return `daily_${date || 'no-date'}`;
  }

  // สำหรับ QC
  const fieldString = dynamicFields 
    ? Object.keys(dynamicFields).sort().map(k => `${k}=${dynamicFields[k]}`).join('&')
    : '';
  
  const combinedString = `qc_${mainCategory || ''}_${subCategory || ''}_${fieldString}`;

  // ใช้ Hash เพื่อให้ ID สั้นและไม่ซ้ำกันสำหรับแต่ละ Filter
  return createHash('sha256').update(combinedString).digest('hex').substring(0, 20);
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

export interface SharedJob {
  id: string; // ID ของ Job (เช่น mainId_subId_fields)
  label: string; // ชื่อที่แสดงผล (เช่น "โครงสร้าง / กำแพงลิฟต์ / k/k/k")
  reportType: 'QC' | 'Daily';
  mainCategory: string;
  subCategory: string;
  dynamicFields: Record<string, string>;
  
  // สถานะ
  completedTopics: number;
  totalTopics: number;
  status: 'pending' | 'completed'; // เพิ่มสถานะ
  
  // การเรียงลำดับ
  lastUpdatedAt: string; // ISO Timestamp
}

export interface GeneratedReportInfo {
  reportId: string;
  reportType: 'QC' | 'Daily';
  createdAt: string; // ISO Timestamp string (Backend อาจจะส่ง Timestamp object มา)
  filename: string;
  publicUrl: string;
  storagePath: string;
  mainCategory?: string;
  subCategory?: string;
  dynamicFields?: Record<string, string>;
  reportDate?: string; // YYYY-MM-DD
  photosFound: number;
  totalTopics?: number; // Only for QC
  hasNewPhotos?: boolean;
}

const db = getFirestore();
const app = express();
app.use(cors({ origin: true }));

//app.use(cors({ origin: true }));
const jsonParser = express.json({ limit: "10mb" });
// --- API ROUTES ---

const checkAuth = async (req: Request, res: Response, next: Function) => {
  // 1.1 ตรวจสอบว่ามี Header 'Authorization' (ตั๋ว) ส่งมาไหม
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    console.warn("Auth Error: No token provided.");
    return res.status(403).json({ success: false, error: 'Unauthorized: No token provided.' });
  }
  
  const idToken = req.headers.authorization.split('Bearer ')[1];
  
  try {
    // 1.2 ตรวจสอบว่า Token ถูกต้องหรือไม่
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    
    // 1.3 [สำคัญ] ดึงข้อมูล Role/Status จาก Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
       console.warn(`Auth Error: User doc not found for UID: ${uid}`);
       return res.status(403).json({ success: false, error: 'User profile not found.' });
    }
    
    const userProfile = userDoc.data();
    
    if (userProfile?.status !== 'approved') {
        console.warn(`Auth Error: User ${userProfile?.email} is not approved (status: ${userProfile?.status}).`);
        // ส่ง 401 (Unauthorized) แทน 403 (Forbidden) 
        // เพื่อให้ Frontend รู้ว่าต้องแสดงหน้า "รออนุมัติ"
        return res.status(401).json({ success: false, error: 'Account not approved.' });
    }    
    // 1.4 แนบข้อมูล User (รวมถึง Role) ไปกับ Request
    //     เพื่อให้ API หลัก (เช่น /generate-report) รู้ว่าใครขอมา
    (req as any).user = { uid, ...userProfile }; 
    
    // 1.5 ไปยังขั้นตอนต่อไป (API หลัก)
    return next(); 
    
    } catch (error) {
    console.error("Auth Error: Invalid token.", error);
    return res.status(403).json({ success: false, error: 'Unauthorized: Invalid token.' });
  }
  return;
};

const checkRole = (roles: Array<'admin' | 'god'>) => {
  return (req: any, res: any, next: any) => { // <-- ลบ :any
    if (!req.user || !req.user.role) {
      res.status(401).json({ success: false, error: 'Unauthorized: No user role found.' });
      return; // <-- [แก้ไข]
    }
    
    if (roles.includes(req.user.role)) {
      return next(); 
    }
    
    res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions.' });
    return; // <-- [แก้ไข]
  };
};

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

app.use(checkAuth);

app.get("/admin/users", checkAuth, checkRole(['admin', 'god']), async (req, res) => {
  try {
    // 1. ดึงข้อมูล User (เหมือนเดิม)
    const listUsersResult = await admin.auth().listUsers();
    const firestoreUsersSnap = await db.collection('users').get();
    
    // ✅ [ใหม่] 2. ดึงข้อมูล Projects ทั้งหมดมาสร้าง Map
    const projectsSnap = await db.collection('projects').get();
    const projectsMap = new Map<string, string>();
    projectsSnap.forEach(doc => {
      projectsMap.set(doc.id, doc.data().projectName || doc.id); // เก็บ projectName
    });

    const firestoreUsersData: { [uid: string]: any } = {};
    firestoreUsersSnap.forEach(doc => {
      firestoreUsersData[doc.id] = doc.data();
    });

    // 3. รวมข้อมูล (เหมือนเดิม)
    const combinedUsers = listUsersResult.users.map(userRecord => {
      const firestoreData = firestoreUsersData[userRecord.uid] || {};
      
      // ✅ [ใหม่] 4. เพิ่ม assignedProjectName จาก Map
      const assignedProjectId = firestoreData.assignedProjectId || null;
      const assignedProjectName = assignedProjectId 
        ? projectsMap.get(assignedProjectId) // ดึงชื่อจาก Map
        : null;

      return {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: firestoreData.displayName || userRecord.displayName || 'N/A',
        role: firestoreData.role || 'user',
        status: firestoreData.status || 'unknown',
        assignedProjectId: assignedProjectId,
        assignedProjectName: assignedProjectName || assignedProjectId || 'N/A' // ส่งชื่อกลับไป
      };
    });

    res.status(200).json({ success: true, data: combinedUsers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * (Admin) อัปเดตสถานะผู้ใช้ (อนุมัติ/ปฏิเสธ)
 * (ต้องเป็น Admin หรือ God)
 */
app.post("/admin/update-status/:uid", checkAuth, checkRole(['admin', 'god']), async (req, res): Promise<Response> => {
  try {
    const { uid } = req.params;
    const { status } = req.body; // รับ 'approved' หรือ 'rejected'

    if (!uid || !status || (status !== 'approved' && status !== 'rejected')) {
       return res.status(400).json({ success: false, error: 'Invalid uid or status' });
    }

    const userDocRef = db.collection('users').doc(uid);
    await userDocRef.update({ status: status });

    return res.status(200).json({ success: true, data: { uid, newStatus: status } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * (God) ตั้งค่า Role ผู้ใช้
 * (ต้องเป็น God เท่านั้น)
 */
app.post("/admin/set-role/:uid", checkAuth, checkRole(['god']), async (req, res) => {
  try {
    const { uid } = req.params;
    const { role } = req.body; // รับ 'user', 'admin', หรือ 'god'

    if (!uid || !role || !['user', 'admin', 'god'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid uid or role' });
    }
    
    // 1. อัปเดตใน Auth Custom Claims (สำคัญต่อความปลอดภัยของ Rules)
    await admin.auth().setCustomUserClaims(uid, { role: role });

    // 2. อัปเดตใน Firestore (เพื่อให้ UI แสดงผลถูกต้อง)
    const userDocRef = db.collection('users').doc(uid);
    await userDocRef.update({ role: role });

    return res.status(200).json({ success: true, data: { uid, newRole: role } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Get project configuration
app.get("/project-config/:projectId", async (req: Request, res: Response): Promise<Response> => {
  const user = (req as any).user;
  const { projectId } = req.params;

  // [ใหม่] ตรวจสอบสิทธิ์: User ทั่วไปสามารถดูได้เฉพาะ Config โครงการตัวเอง (ยกเว้น God)
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Access denied to this project config.' });
  }

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
  const user = (req as any).user;
  const { projectId } = req.params;
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Access denied to settings.' });
  }

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
app.post("/projects/:projectId/report-settings", jsonParser, async (req: Request, res: Response): Promise<Response> => {
  const user = (req as any).user;
  const { projectId } = req.params;
  if (user.role === 'user') { // User ทั่วไปห้ามแก้ไข
     return res.status(403).json({ success: false, error: 'Only Admins can change settings.' });
  }
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Access denied.' });
  }

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
app.post("/projects/:projectId/upload-logo", jsonParser, async (req: Request, res: Response): Promise<Response> => {
  
  // [ใหม่] ตรวจสอบสิทธิ์ (เฉพาะ Admin/God)
  const user = (req as any).user;
  const { projectId } = req.params;
  if (user.role === 'user') {
     return res.status(403).json({ success: false, error: 'Only Admins can upload logo.' });
  }
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Access denied.' });
  }

  try {
    console.log("--- BASE64 LOGO HANDLER IS RUNNING! ---");
    const { logoBase64 } = req.body; 

    if (!logoBase64) {
      return res.status(400).json({ success: false, error: "No logoBase64 was uploaded." });
    }

    // 2. แยกส่วนข้อมูลและ MimeType ออกจาก Base64 string
    const matches = logoBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, error: 'Invalid Base64 string format.' });
    }
    
    const mimeType = matches[1]; // เช่น 'image/png'
    const cleanBase64 = matches[2]; // ข้อมูลไฟล์
    
    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({ success: false, error: 'Invalid file type. Only images are allowed.' });
    }
    
    // 3. แปลง Base64 กลับเป็น Buffer (เหมือนที่ทำกับ QC/Daily)
    const fileBuffer = Buffer.from(cleanBase64, "base64");
    
    // 4. อัปโหลด Buffer ไปยัง Storage
    const bucket = getStorage().bucket();
    const fileExtension = mimeType.split('/')[1] || 'png'; // เช่น 'png'
    const uniqueFilename = `logo_${Date.now()}.${fileExtension}`;
    const filePath = `logos/${projectId}/${uniqueFilename}`;
    const fileUpload = bucket.file(filePath);

    console.log(`Uploading logo buffer to: ${filePath}`);

    // 5. ใช้ .save() กับ Buffer
    await fileUpload.save(fileBuffer, {
      metadata: { contentType: mimeType, cacheControl: 'public, max-age=3600' },
      public: true,
    });

    const publicUrl = fileUpload.publicUrl();
    console.log(`Logo uploaded successfully: ${publicUrl}`);

    // 6. บันทึก URL ลง Firestore
    const projectRef = db.collection("projects").doc(projectId);
    await projectRef.set({ reportSettings: { projectLogoUrl: publicUrl } }, { merge: true });

    // 7. ส่ง Response สำเร็จ
    return res.json({ success: true, data: { logoUrl: publicUrl } });

  } catch (err: any) {
    console.error('Error during Base64 upload or Storage save:', err);
    // 8. ไม่ต้องเช็ค MulterError อีกต่อไป
    return res.status(500).json({ success: false, error: `Error processing file: ${err.message}` });
  }
});

// ✅ Upload photo with base64
app.post("/upload-photo-base64", jsonParser, async (req: Request, res: Response): Promise<Response> => {
  const user = (req as any).user;
  const { projectId } = req.body;

  // 1. ตรวจสอบสถานะ "approved"
  if (user.status !== 'approved') {
     return res.status(403).json({ success: false, error: 'Account not approved.' });
  }
  
  // 2. ตรวจสอบว่าอัปโหลดเข้า Project ตัวเองหรือไม่ (ยกเว้น God)
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Project mismatch. Cannot upload to this project.' });
  }

  try {
    // ✅✅✅ --- START OF FIX --- ✅✅✅
    const { 
      photoBase64, // <-- [แก้ไข] เปลี่ยนจาก 'photo'
      projectId, 
      reportType, 
      category, 
      topic, 
      description, 
      location, 
      dynamicFields 
    } = req.body;
    
    // [แก้ไข] เปลี่ยน 'photo' เป็น 'photoBase64'
    if (!photoBase64 || !projectId || !reportType) { 
    // ✅✅✅ --- END OF FIX --- ✅✅✅
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

    // ✅✅✅ --- START OF FIX --- ✅✅✅
    let cleanBase64 = photoBase64; // <-- [แก้ไข] เปลี่ยนจาก 'photo'
    // ✅✅✅ --- END OF FIX --- ✅✅✅
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
app.post("/generate-report", jsonParser, async (req: Request, res: Response): Promise<Response> => {
  const user = (req as any).user;
  const { projectId } = req.body;

  // 1. ตรวจสอบสถานะ "approved"
  if (user.status !== 'approved') {
     return res.status(403).json({ success: false, error: 'Account not approved.' });
  }
  
  // 2. ตรวจสอบว่าสร้าง Report ของ Project ตัวเองหรือไม่ (ยกเว้น God)
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Project mismatch. Cannot generate report.' });
  }

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
    
    // ... (ส่วนการตรวจสอบ projectId, reportType, และ Fetch Report Settings เหมือนเดิม) ...
    let reportSettings: ReportSettings = { ...DEFAULT_SETTINGS };
    try {
      const projectDoc = await db.collection("projects").doc(projectId).get();
      if (projectDoc.exists && projectDoc.data()?.reportSettings) {
        reportSettings = { ...DEFAULT_SETTINGS, ...projectDoc.data()?.reportSettings };
      }
    } catch (settingsError) {
      console.error(`❌ Error fetching report settings:`, settingsError);
    }
    
    console.log(`📊 Generating ${reportType} report (Overwrite Mode) for ${projectName}`);

    // ✅ [ใหม่] 1. สร้าง Stable ID และ Stable Filename
    const stableDocId = createStableReportId(reportType, mainCategory, subCategory, dynamicFields, date);
    let stableFilename = ""; // เราจะกำหนดชื่อไฟล์ให้เสถียร (ไม่มี Timestamp)

    // ✅ [ใหม่] 2. สร้างตัวแปรสำหรับเก็บข้อมูล Metadata
    let generatedReportData: any = {};
    const reportTimestamp = FieldValue.serverTimestamp(); // <-- (ต้องแน่ใจว่าใช้ FieldValue จาก v10)
    let pdfBuffer: Buffer;
    let responseData: any = {};

    // ===================================
    //  QC REPORT LOGIC
    // ===================================
    if (reportType === 'QC') {
      if (!mainCategory || !subCategory) {
        return res.status(400).json({ success: false, error: "Missing QC fields." });
      }

      // ... (Logic การหา allTopics, foundPhotos, fullLayoutPhotos เหมือนเดิม) ...
      const projectConfigRef = db.collection("projectConfig").doc(projectId);
      const mainCatSnap = await projectConfigRef.collection("mainCategories").where("name", "==", mainCategory).limit(1).get();
      if (mainCatSnap.empty) return res.status(404).json({ success: false, error: "Main category not found." });
      const mainCatId = mainCatSnap.docs[0].id;
      const subCatSnap = await projectConfigRef.collection("subCategories").where("name", "==", subCategory).where("mainCategoryId", "==", mainCatId).limit(1).get();
      if (subCatSnap.empty) return res.status(404).json({ success: false, error: "Sub category not found." });
      const subCatId = subCatSnap.docs[0].id;
      const topicsSnap = await projectConfigRef.collection("topics").where("subCategoryId", "==", subCatId).where("isArchived", "==", false).get();
      const allTopics: string[] = topicsSnap.docs.map(doc => doc.data().name as string);
      if (allTopics.length === 0) return res.status(404).json({ success: false, error: "No topics found."});
      const foundPhotos = await getLatestPhotos(projectId, mainCategory, subCategory, allTopics, dynamicFields || {});
      const fullLayoutPhotos = createFullLayout(allTopics, foundPhotos);
      
      const reportData = { projectId, projectName, mainCategory, subCategory, dynamicFields: dynamicFields || {} };
      const qcReportSettings: ReportSettings = { ...reportSettings, photosPerPage: reportSettings.qcPhotosPerPage };

      pdfBuffer = await generatePDF(reportData, fullLayoutPhotos, qcReportSettings);
      
      // ✅ [ใหม่] สร้างชื่อไฟล์ที่เสถียร (ไม่มีเวลา)
      const fieldSlug = (dynamicFields && Object.values(dynamicFields).length > 0) 
        ? `_${Object.values(dynamicFields).map((val: any) => slugify(String(val))).join('_')}` // <-- ✅ แก้ไข
        : '';
      stableFilename = `QC-Report_${slugify(mainCategory)}_${slugify(subCategory)}${fieldSlug}.pdf`;

      // เตรียม Metadata
      generatedReportData = {
        reportType: 'QC',
        createdAt: reportTimestamp, // อัปเดตเวลาที่สร้างล่าสุด
        filename: stableFilename,
        mainCategory: mainCategory,
        subCategory: subCategory,
        dynamicFields: dynamicFields || {},
        photosFound: foundPhotos.length,
        totalTopics: allTopics.length,
      };
      
      responseData = {
        filename: stableFilename,
        totalTopics: allTopics.length,
        photosFound: foundPhotos.length
      };
    
    // ===================================
    //  DAILY REPORT LOGIC
    // ===================================
    } else if (reportType === 'Daily') {
      if (!date) {
         return res.status(400).json({ success: false, error: "Missing Daily field (date)." });
      }
      
      // ... (Logic การหา foundPhotos เหมือนเดิม) ...
      const foundPhotos = await getDailyPhotosByDate(projectId, date);
      if (foundPhotos.length === 0) {
        return res.status(404).json({ error: `ไม่พบรูปสำหรับวันที่ ${date}` });
      }
      const reportData = { projectId, projectName, date };
      const dailyReportSettings: ReportSettings = { ...reportSettings, photosPerPage: reportSettings.dailyPhotosPerPage };

      pdfBuffer = await generateDailyPDFWrapper(reportData, foundPhotos, dailyReportSettings);
      
      // ✅ [ใหม่] สร้างชื่อไฟล์ที่เสถียร
      stableFilename = `Daily-Report_${date}.pdf`;

      // เตรียม Metadata
      generatedReportData = {
        reportType: 'Daily',
        createdAt: reportTimestamp, // อัปเดตเวลาที่สร้างล่าสุด
        filename: stableFilename,
        reportDate: date,
        photosFound: foundPhotos.length,
        dynamicFields: {},
        mainCategory: "",
        subCategory: ""
      };
      
      responseData = {
        filename: stableFilename,
        photosFound: foundPhotos.length
      };

    } else {
      return res.status(400).json({ success: false, error: "Invalid reportType." });
    }

    // ===================================
    //  ✅ [ใหม่] 3. UPLOAD & SAVE (ส่วนที่แก้ไข)
    // ===================================
    
    // 3.1 Upload to Storage (ด้วยชื่อไฟล์ที่เสถียร)
    // การอัปโหลดไฟล์ไปยัง Path เดิม จะเป็นการ "เขียนทับ" ไฟล์เก่าใน Storage อัตโนมัติ
    const reportDataForUpload = { projectId, projectName, mainCategory, subCategory, dynamicFields, date }; // (ข้อมูลสำหรับ path)
    
    // เราส่ง stableFilename เข้าไปแทนการสร้างชื่อใหม่
    const uploadResult = await uploadPDFToStorage(pdfBuffer, reportDataForUpload, reportType, stableFilename); 
    
    console.log(`✅ PDF Overwritten in Storage: ${uploadResult.filePath}`);

    // 3.2 Save Metadata to Firestore (ด้วย Stable ID)
    const reportDocRef = db
      .collection('projects')
      .doc(projectId)
      .collection('generatedReports')
      .doc(stableDocId); // <-- ใช้ ID ที่เสถียร

    // เพิ่ม URL และ Path ที่ได้จากการอัปโหลด
    generatedReportData.publicUrl = uploadResult.publicUrl;
    generatedReportData.storagePath = uploadResult.filePath;

    // ใช้ .set() เพื่อ "สร้างหรือเขียนทับ" เอกสารใน Firestore
    await reportDocRef.set(generatedReportData, { merge: true }); // merge:true เผื่อไว้
    
    console.log(`✅ Firestore Metadata Overwritten: ${stableDocId}`);
    
    // 3.3 ส่ง Response กลับ
    return res.json({
      success: true,
      data: {
        ...responseData,
        publicUrl: uploadResult.publicUrl,
      }
    });

  } catch (error) {
    console.error("❌ Error generating report (Overwrite Mode):", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

app.get("/photos/:projectId", async (req: Request, res: Response): Promise<Response> => {
  // [ใหม่] (Optional) ตรวจสอบสิทธิ์
  const user = (req as any).user;
  const { projectId } = req.params;
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Access denied.' });
  }

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

const checkAdminOrGod = (req: Request, res: Response, next: Function) => {
  const user = (req as any).user;
  const { projectId } = req.params;

  if (user.role === 'user') {
    return res.status(403).json({ success: false, error: 'Only Admins or God can modify config.' });
  }
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
    return res.status(403).json({ success: false, error: 'Admin access denied for this project.' });
  }
  return next();
};

app.post("/project-config/:projectId/main-category/:mainCatId", jsonParser, checkAdminOrGod,async (req: Request, res: Response): Promise<Response> => {
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

app.delete("/project-config/:projectId/main-category/:mainCatId", checkAdminOrGod, async (req: Request, res: Response): Promise<Response> => {
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

app.post("/project-config/:projectId/main-categories", jsonParser, checkAdminOrGod, async (req: Request, res: Response): Promise<Response> => {
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

app.post("/project-config/:projectId/sub-categories", jsonParser, checkAdminOrGod, async (req: Request, res: Response): Promise<Response> => {
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

app.post("/project-config/:projectId/sub-category/:subCatId", jsonParser, checkAdminOrGod, async (req: Request, res: Response): Promise<Response> => {
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

app.delete("/project-config/:projectId/sub-category/:subCatId", checkAdminOrGod, async (req: Request, res: Response): Promise<Response> => {
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

app.post("/project-config/:projectId/topics", jsonParser, checkAdminOrGod, async (req: Request, res: Response): Promise<Response> => {
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

app.post("/project-config/:projectId/topic/:topicId", jsonParser, checkAdminOrGod, async (req: Request, res: Response): Promise<Response> => {
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

app.delete("/project-config/:projectId/topic/:topicId", checkAdminOrGod, async (req: Request, res: Response): Promise<Response> => {
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

app.post("/project-config/:projectId/sub-category/:subCatId/fields", jsonParser, checkAdminOrGod, async (req: Request, res: Response): Promise<Response> => {
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

app.get("/projects/:projectId/shared-jobs", async (req: Request, res: Response): Promise<Response> => {
  // [ใหม่] (Optional) ตรวจสอบสิทธิ์
  const user = (req as any).user;
  const { projectId } = req.params;
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Access denied.' });
  }

  try {
    const { projectId } = req.params;

    const jobsSnapshot = await db
      .collection("projects") // <-- [สำคัญ] แก้ไข Collection หลักให้ถูกต้อง (ถ้าจำเป็น)
      .doc(projectId)
      .collection("sharedJobs") // <-- สร้าง Subcollection ใหม่ชื่อ 'sharedJobs'
      .where("status", "==", "pending") // <-- กรองเฉพาะงานที่ยังไม่เสร็จ
      .orderBy("lastUpdatedAt", "desc") // <-- เรียงตามวันที่อัปเดตล่าสุด
      .limit(20) // <-- จำกัดจำนวนที่ดึงมา (ปรับตามต้องการ)
      .get();

    if (jobsSnapshot.empty) {
      return res.json({ success: true, data: [] }); // ถ้าไม่มี ก็ส่ง array ว่างกลับไป
    }

    const jobs = jobsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json({ success: true, data: jobs });

  } catch (error) {
    console.error("Error in GET /shared-jobs:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

async function checkHasNewPhotos(
  projectId: string,
  reportData: admin.firestore.DocumentData,
  reportCreatedAt: admin.firestore.Timestamp
): Promise<boolean> {
  
  // ถ้าไม่มีเวลาอ้างอิง ก็ไม่ต้องเช็ค
  if (!reportCreatedAt) return false;

  try {
    let photoQuery: admin.firestore.Query;

    if (reportData.reportType === 'QC') {
      // สร้าง Query สำหรับ qcPhotos
      photoQuery = db.collection('qcPhotos')
        .where('projectId', '==', projectId)
        .where('category', '==', `${reportData.mainCategory} > ${reportData.subCategory}`);

      // เพิ่ม Filter Dynamic Fields
      if (reportData.dynamicFields) {
        Object.keys(reportData.dynamicFields).forEach(key => {
          const value = reportData.dynamicFields[key];
          if (value) {
            photoQuery = photoQuery.where(`dynamicFields.${key}`, '==', value);
          }
        });
      }

    } else if (reportData.reportType === 'Daily') {
      if (!reportData.reportDate) return false; // ถ้า report ไม่มีวันที่ ก็เช็คไม่ได้

      // สร้าง Query สำหรับ dailyPhotos
      // [ข้อควรระวัง] เราต้อง *สมมติ* ว่า dailyPhotos มี field 'reportDate' (YYYY-MM-DD)
      // ซึ่งถูกเพิ่มเข้าไปตอนอัปโหลดรูป (ถ้าไม่มี field นี้ Logic นี้ต้องปรับใหม่)
      photoQuery = db.collection('dailyPhotos')
        .where('projectId', '==', projectId)
        // [สมมติฐาน] กรองด้วย 'reportDate' เพื่อให้ตรงกับ Scope ของรายงาน
        .where('reportDate', '==', reportData.reportDate);

    } else {
      return false; // ไม่ใช่ Type ที่รู้จัก
    }

    // --- [สำคัญ] ค้นหารูปที่ใหม่กว่ารายงานฉบับนี้ ---
    const snapshot = await photoQuery
      .where('createdAt', '>', reportCreatedAt) // <-- เงื่อนไขหลัก
      .limit(1) // ขอแค่ 1 รูปก็พอ
      .get();

    return !snapshot.empty; // ถ้าเจอ (ไม่ว่าง) = true, ถ้าไม่เจอ (ว่าง) = false

  } catch (error) {
    console.error(`Error checking new photos for report:`, error);
    return false; // ถ้า Error ให้คืน false (ปลอดภัยกว่า)
  }
}

app.get("/projects/:projectId/generated-reports", async (req: Request, res: Response): Promise<Response> => {
  // [ใหม่] (Optional) ตรวจสอบสิทธิ์
  const user = (req as any).user;
  const { projectId } = req.params;
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Access denied.' });
  }

  try {
    const { projectId } = req.params;
    const {
      reportType,
      mainCategory,
      subCategory,
      date,
      // เพิ่มการอ่าน dynamicFields จาก query string
      ...dynamicFieldsQuery // ตัวแปรนี้จะเก็บ dynamicFields ทั้งหมด เช่น { 'dynamicFields[field1]': 'value1' }
    } = req.query;

    console.log(`🔍 Fetching generated reports for project ${projectId} with filter:`, req.query);

    if (!reportType || (reportType !== 'QC' && reportType !== 'Daily')) {
      return res.status(400).json({ success: false, error: "Missing or invalid 'reportType' query parameter (QC or Daily)." });
    }

    // สร้าง Query เริ่มต้นไปยัง Subcollection
    let query: admin.firestore.Query = db
      .collection('projects') // <-- ตรวจสอบ Collection หลัก
      .doc(projectId)
      .collection('generatedReports') // ใช้ subcollection ที่สร้างจาก migration script
      .where('reportType', '==', reportType);

    // --- เพิ่มเงื่อนไขการ Filter ตาม reportType ---
    if (reportType === 'QC') {
      if (mainCategory) {
        query = query.where('mainCategory', '==', mainCategory as string);
      }
      if (subCategory) {
        query = query.where('subCategory', '==', subCategory as string);
      }
      // Filter ด้วย Dynamic Fields (ถ้ามีส่งมา)
      Object.keys(dynamicFieldsQuery).forEach(key => {
        if (key.startsWith('dynamicFields[')) {
          const fieldName = key.substring(14, key.length - 1); // ดึงชื่อ field ออกมา
          const fieldValue = dynamicFieldsQuery[key] as string;
          if (fieldName && fieldValue) {
            console.log(`  -> Filtering by dynamic field: ${fieldName} = ${fieldValue}`);
            // ใช้ dot notation สำหรับ query field ที่อยู่ใน map
            query = query.where(`dynamicFields.${fieldName}`, '==', fieldValue);
          }
        }
      });

    } else if (reportType === 'Daily') {
      if (date) {
        query = query.where('reportDate', '==', date as string);
      } else {
        // ถ้าเป็น Daily แต่ไม่ส่ง date มา อาจจะคืนค่าว่าง หรือ error
        console.warn("Daily report requested without date filter.");
        // อาจจะไม่ต้องทำอะไร ปล่อยให้ query ดึง Daily ทั้งหมดมา (เรียงตามวันที่สร้าง)
        // หรือถ้าต้องการให้ error ก็ uncomment บรรทัดล่าง
        // return res.status(400).json({ success: false, error: "'date' query parameter is required for Daily reports." });
      }
    }

    // --- ดึงข้อมูลและเรียงลำดับ ---
    const reportsSnapshot = await query
      .orderBy('createdAt', 'desc') // เรียงตามวันที่สร้างล่าสุด
      .limit(30) // จำกัดจำนวนที่ดึง (ปรับตามต้องการ)
      .get();

    if (reportsSnapshot.empty) {
      console.log("  -> No matching reports found.");
      return res.json({ success: true, data: [] });
    }

    // --- ประมวลผลข้อมูล + [ชั่วคราว] เช็ค hasNewPhotos ---
    const reportDocs = reportsSnapshot.docs;

    const reportPromises = reportDocs.map(async (doc) => {
      const data = doc.data();
      const reportCreatedAt = data.createdAt as admin.firestore.Timestamp;

      // --- [สำคัญ] เรียกใช้ฟังก์ชัน Helper ที่เราสร้าง ---
      const hasNewPhotos = await checkHasNewPhotos(projectId, data, reportCreatedAt);
      // --- จบส่วนแก้ไข ---

      return {
        reportId: doc.id,
        reportType: data.reportType,
        createdAt: reportCreatedAt && typeof reportCreatedAt.toDate === 'function'
                     ? reportCreatedAt.toDate().toISOString()
                     : new Date().toISOString(),
        filename: data.filename,
        publicUrl: data.publicUrl,
        storagePath: data.storagePath,
        mainCategory: data.mainCategory,
        subCategory: data.subCategory,
        dynamicFields: data.dynamicFields,
        reportDate: data.reportDate,
        photosFound: data.photosFound,
        totalTopics: data.totalTopics,
        hasNewPhotos: hasNewPhotos, // <-- ใช้ค่าจริงที่ได้มา
      };
    });

    // รอให้ทุก Promise (การเช็ค) ทำงานเสร็จ
    const reports = await Promise.all(reportPromises);
    // --- จบส่วนแก้ไข Promise.all ---

    console.log(`  -> Found ${reports.length} reports.`);
    return res.json({ success: true, data: reports });

  } catch (error) {
    console.error("Error in GET /generated-reports:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// 2. POST /projects/:projectId/shared-jobs - สร้างหรืออัปเดตงาน
app.post("/projects/:projectId/shared-jobs", jsonParser, async (req: Request, res: Response): Promise<Response> => {
  // [ใหม่] (Optional) ตรวจสอบสิทธิ์
  const user = (req as any).user;
  const { projectId } = req.params;
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Access denied.' });
  }
  
  try {
    const { projectId } = req.params;
    // ตอนนี้ TypeScript รู้จัก 'SharedJob' แล้ว
    const jobData = req.body as SharedJob;

    // ตรวจสอบข้อมูลเบื้องต้น
    if (!jobData || !jobData.id || !jobData.reportType || !jobData.lastUpdatedAt) {
      return res.status(400).json({ success: false, error: "Missing required job data (id, reportType, lastUpdatedAt)." });
    }

    // กำหนด Document ID ให้ตรงกับ Job ID ที่ส่งมา
    const jobRef = db
      .collection("projects") // <-- [สำคัญ] แก้ไข Collection หลักให้ถูกต้อง (ถ้าจำเป็น)
      .doc(projectId)
      .collection("sharedJobs")
      .doc(jobData.id); // <-- ใช้ Job ID เป็น Document ID

    // ใช้ set + merge:true เพื่อสร้าง (ถ้ายังไม่มี) หรือ อัปเดต (ถ้ามีอยู่แล้ว)
    await jobRef.set(jobData, { merge: true });

    console.log(`✅ Shared Job saved/updated: ${projectId}/${jobData.id}`);
    return res.json({ success: true, data: { id: jobData.id, status: jobData.status } });

  } catch (error) {
    console.error("Error in POST /shared-jobs:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

app.get("/admin/pending-users", async (req: Request, res: Response) => {
  const user = (req as any).user;

  // เฉพาะ Admin หรือ God เท่านั้น
  if (user.role === 'user') {
    return res.status(403).json({ success: false, error: 'Forbidden.' });
  }

  try {
    let query = db.collection('users').where('status', '==', 'pending');
    
    // ถ้าเป็น Admin (ไม่ใช่ God) ให้เห็นแค่โครงการตัวเอง
    if (user.role === 'admin') {
      query = query.where('assignedProjectId', '==', user.assignedProjectId);
    }
    
    const snapshot = await query.get();
    const users = snapshot.docs.map(doc => doc.data());
    return res.json({ success: true, data: users });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API สำหรับ Admin: อนุมัติ User
app.post("/admin/approve-user/:uidToApprove", async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { uidToApprove } = req.params;

  if (user.role === 'user') {
    return res.status(403).json({ success: false, error: 'Forbidden.' });
  }
  
  try {
    const userToApproveRef = db.collection('users').doc(uidToApprove);
    const doc = await userToApproveRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    
    // (God อนุมัติได้ทุกคน, Admin อนุมัติได้แค่คนในโครงการตัวเอง)
    if (user.role === 'admin' && doc.data()?.assignedProjectId !== user.assignedProjectId) {
       return res.status(403).json({ success: false, error: 'Cannot approve users outside your project.' });
    }

    await userToApproveRef.update({
      status: 'approved',
      approvedBy: user.uid,
      approvedAt: FieldValue.serverTimestamp()
    });
    
    return res.json({ success: true, data: { status: 'approved' } });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/checklist-status", jsonParser, async (req: Request, res: Response): Promise<Response> => {
  const user = (req as any).user;
  const { 
    projectId, 
    reportType, // <-- [ใหม่] รับ reportType
    mainCategory, 
    subCategory, 
    dynamicFields,
    date // <-- [ใหม่] รับ date
  } = req.body;

  // 1. ตรวจสอบสิทธิ์ (เหมือนเดิม)
  if (user.role !== 'god' && user.assignedProjectId !== projectId) {
     return res.status(403).json({ success: false, error: 'Access denied.' });
  }

  try {
    if (reportType === 'QC') {
      // --- Logic สำหรับ QC ---
      if (!projectId || !mainCategory || !subCategory || !dynamicFields) {
        return res.status(400).json({ success: false, error: "Missing required QC fields." });
      }

      const category = `${mainCategory} > ${subCategory}`;

      // 1. หา "Total" (เรียกฟังก์ชันใหม่)
      const allTopics = await getTopicsForFilter(db, projectId, mainCategory, subCategory);
      const total = allTopics.length;
      
      if (total === 0) {
         return res.status(404).json({ success: false, error: "ไม่พบหัวข้อสำหรับหมวดหมู่นี้" });
      }

      // 2. หา "Found" (เรียกฟังก์ชันเดิม)
      const statusMap = await getUploadedTopicStatus(projectId, category, dynamicFields);
      const found = Object.keys(statusMap).length;

      // 3. ส่งข้อมูลกลับ
      return res.json({ success: true, data: { found, total, statusMap } });

    } else if (reportType === 'Daily') {
      // --- Logic สำหรับ Daily ---
      if (!projectId || !date) {
        return res.status(400).json({ success: false, error: "Missing required Daily fields (date)." });
      }
      
      // 1. นับจำนวนรูปในวันนั้น
      const startDate = new Date(`${date}T00:00:00+07:00`);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1);

      // [แก้ไข] ใช้ .count() เพื่อประสิทธิภาพ
      const query = db.collection("dailyPhotos")
        .where("projectId", "==", projectId)
        .where("createdAt", ">=", startDate) // ใช้ Timestamp object
        .where("createdAt", "<", endDate);   // ใช้ Timestamp object

      const photosSnapshot = await query.count().get();
      const found = photosSnapshot.data().count;

      // 2. ส่งข้อมูลกลับ
      return res.json({ success: true, data: { found, total: 0 } }); // Daily ไม่มี Total
    } else {
      return res.status(400).json({ success: false, error: "Invalid reportType." });
    }

  } catch (error) {
    console.error("❌ Error in /checklist-status (V2):", error);
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