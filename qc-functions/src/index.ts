// Filename: qc-functions/src/index.ts (VERSION 7 - Final)

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express, { Request, Response } from "express";
import cors from "cors";

// ✅ Import functions from pdf-generator v7
import { 
  getLatestPhotos, 
  createFullLayout, 
  generatePDF, 
  uploadPDFToStorage 
} from './services/pdf-generator';

// ✅ Import Firestore and Storage functions
import { PhotoData as FirestorePhotoData, logPhotoToFirestore } from "./api/firestore";
import { uploadPhotoToStorage as uploadImageToStorage } from "./api/storage";

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "qcreport-54164.appspot.com"
  });
  if (IS_EMULATOR) {
    console.log("🔧 Running in EMULATOR mode");
  } else {
    console.log("🚀 Running in PRODUCTION mode");
  }
}

const db = admin.firestore();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

// --- API ROUTES ---

// ✅ Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ 
    status: "healthy",
    environment: IS_EMULATOR ? "emulator" : "production",
    version: "7.0"
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
    
    const projectConfig: { 
      [main: string]: { 
        [sub: string]: { 
          topics: string[]; 
          dynamicFields: string[] 
        } 
      } 
    } = {};
    
    const mainCategoriesSnapshot = await db
      .collection("projectConfig")
      .doc(projectId)
      .collection("mainCategories")
      .get();
    
    if (mainCategoriesSnapshot.empty) {
      return res.status(404).json({ 
        success: false, 
        error: "Config not found." 
      });
    }
    
    // Build nested config structure
    for (const mainCategoryDoc of mainCategoriesSnapshot.docs) {
      const mainData = mainCategoryDoc.data();
      const mainName = mainData.name;
      projectConfig[mainName] = {};
      
      const subCategoriesSnapshot = await mainCategoryDoc.ref
        .collection("subCategories")
        .get();
      
      for (const subCategoryDoc of subCategoriesSnapshot.docs) {
        const subData = subCategoryDoc.data();
        const subName = subData.name;
        
        const topicsSnapshot = await subCategoryDoc.ref
          .collection("topics")
          .get();
        
        const topics = topicsSnapshot.docs.map((doc) => doc.data().name);
        
        projectConfig[mainName][subName] = {
          topics: topics,
          dynamicFields: subData.dynamicFields || []
        };
      }
    }
    
    return res.json({ success: true, data: projectConfig });
  } catch (error) {
    console.error("Error in /project-config:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
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

    // Convert base64 to buffer
    // 🔥 ตรวจสอบและทำความสะอาด base64
    let cleanBase64 = photo;
    
    // ลบ data URL prefix ถ้ามี (data:image/jpeg;base64,)
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    
    // ลบ whitespace
    cleanBase64 = cleanBase64.replace(/\s/g, '');
    
    console.log(`📏 Base64 length: ${cleanBase64.length} chars`);
    
    const imageBuffer = Buffer.from(cleanBase64, "base64");
    console.log(`📊 Buffer size: ${imageBuffer.length} bytes`);
    
    // 🔥 Validate image buffer
    if (imageBuffer.length < 100) {
      throw new Error('Invalid image data: buffer too small');
    }
    
    // 🔥 Check JPEG magic number (FF D8 FF)
    if (imageBuffer[0] !== 0xFF || imageBuffer[1] !== 0xD8) {
      console.error('❌ Invalid JPEG header:', imageBuffer.slice(0, 10));
      throw new Error('Invalid image data: not a valid JPEG');
    }
    
    console.log('✅ Valid JPEG image detected');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${filenamePrefix}-${timestamp}.jpg`.replace(/\s/g, "_");

    // Upload to Storage
    const storageCategoryPath = reportType === 'QC'
      ? category.replace(/\s*>\s*/g, "_")
      : 'daily-reports';
    
    const storageResult = await uploadImageToStorage({ 
      imageBuffer, 
      filename, 
      projectId, 
      category: storageCategoryPath 
    });
    
    // Update photo data
    photoData.filename = storageResult.filename;
    photoData.driveUrl = storageResult.publicUrl;
    photoData.filePath = storageResult.filePath;
    
    // 🔥 เก็บ base64 แบบบีบอัดสำหรับ emulator (เก็บแค่ 200KB แรก)
    if (IS_EMULATOR) {
      const base64Size = photo.length;
      console.log(`📏 Original base64 size: ${Math.round(base64Size / 1024)} KB`);
      
      // ถ้ารูปใหญ่เกิน 200KB ให้เก็บแค่ส่วนหนึ่ง (สำหรับ test)
      // หรือใช้วิธีดาวน์โหลดจาก Storage URL แทน
      if (base64Size > 200000) {
        console.log('⚠️ Base64 too large, will download from Storage URL instead');
        // ไม่เก็บ base64 ใน Firestore
      } else {
        (photoData as any).imageBase64 = photo;
        console.log(`✅ Stored base64 in Firestore (${Math.round(base64Size / 1024)} KB)`);
      }
    }

    // Log to Firestore
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

// ✅ Generate PDF report (v7 - with base64 images)
app.post("/generate-report", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { 
      projectId, 
      projectName, 
      mainCategory, 
      subCategory, 
      dynamicFields 
    } = req.body;
    
    if (!projectId || !mainCategory || !subCategory) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields." 
      });
    }
    
    console.log(`📊 Generating report for ${projectName}`);
    
    // 1. Get all topics from config
    const mainCategoriesSnap = await db
      .collection("projectConfig")
      .doc(projectId)
      .collection("mainCategories")
      .where("name", "==", mainCategory)
      .get();
    
    let allTopics: string[] = [];
    
    if (!mainCategoriesSnap.empty) {
      const subCategoriesSnap = await mainCategoriesSnap.docs[0].ref
        .collection("subCategories")
        .where("name", "==", subCategory)
        .get();
      
      if (!subCategoriesSnap.empty) {
        const topicsSnap = await subCategoriesSnap.docs[0].ref
          .collection("topics")
          .orderBy("name")
          .get();
        
        allTopics = topicsSnap.docs.map(doc => doc.data().name);
      }
    }
    
    if (allTopics.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "No topics found." 
      });
    }
    
    console.log(`✅ Found ${allTopics.length} total topics for the layout.`);
    
    // 2. Get latest photos (with base64 images)
    const foundPhotos = await getLatestPhotos(
      projectId, 
      mainCategory, 
      subCategory, 
      allTopics, 
      dynamicFields || {}
    );
    
    console.log(`📸 Found and downloaded ${foundPhotos.length} photos.`);
    
    // 3. Create full layout (photos + placeholders)
    const fullLayoutPhotos = createFullLayout(allTopics, foundPhotos);
    
    // 4. Generate PDF
    const reportData = { 
      projectId, 
      projectName: projectName || projectId, 
      mainCategory, 
      subCategory, 
      dynamicFields: dynamicFields || {} 
    };
    
    const pdfBuffer = await generatePDF(reportData, fullLayoutPhotos);
    console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);
    
    // 5. Upload PDF to Storage
    const uploadResult = await uploadPDFToStorage(pdfBuffer, reportData);
    
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
  } catch (error) {
    console.error("❌ Error generating report:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

// ✅ Get photos by project ID
app.get("/photos/:projectId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      return res.status(400).json({ 
        success: false, 
        error: "Project ID is required" 
      });
    }
    
    // Query both QC and Daily photos
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

// ✅ Export Cloud Function
export const api = onRequest({ 
  region: "asia-southeast1", 
  memory: "2GiB",
  timeoutSeconds: 540,
}, app);