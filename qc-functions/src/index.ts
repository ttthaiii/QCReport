// Filename: qc-functions/src/index.ts

// --- STEP 1: INITIALIZE FIREBASE ADMIN SDK ---
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express, { Request, Response } from "express";
import cors from "cors";
import { generatePDF, getLatestPhotos, uploadPDFToStorage } from "./services/pdf-generator";

// Import routes
import { logPhotoToFirestore, PhotoData } from "./api/firestore";
import { uploadPhotoToStorage } from "./api/storage";

// ✅ NEW: Environment detection
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (IS_EMULATOR) {
    admin.initializeApp({
      projectId: "qcreport-54164",
      storageBucket: "qcreport-54164.appspot.com"  // ✅ เพิ่มบรรทัดนี้
    });
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
    console.log("🔧 Running in EMULATOR mode");
  } else {
    admin.initializeApp({
      storageBucket: "qcreport-54164.appspot.com"  // ✅ เพิ่มบรรทัดนี้
    });
    console.log("🚀 Running in PRODUCTION mode");
  }
}

const db = admin.firestore();
const app = express();


// ✅ FIXED: CORS configuration
app.use(cors({ 
  origin: IS_EMULATOR 
    ? ['http://localhost:3000', 'http://localhost:5000'] // Development
    : ['https://qcreport-54164.web.app', 'https://qcreport-54164.firebaseapp.com'] // Production
}));
app.use(express.json({ limit: "10mb" }));

// ✅ NEW: Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ 
    status: "healthy",
    environment: IS_EMULATOR ? "emulator" : "production",
    timestamp: new Date().toISOString()
  });
});

// ✅ FIXED: Add return types to all endpoints
app.get("/projects", async (req: Request, res: Response): Promise<Response> => {
  try {
    console.log(`📋 Fetching projects from ${IS_EMULATOR ? 'EMULATOR' : 'PRODUCTION'}`);
    
    const projectsSnapshot = await db.collection("projects")
      .where("isActive", "==", true)
      .get();
    
    if (projectsSnapshot.empty) {
      return res.json({ success: true, data: [] });
    }
    
    const projects = projectsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
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

app.get("/project-config/:projectId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    
    // The final 3-level nested object we will send to the frontend
    const projectConfig: { [mainCategory: string]: { [subCategory: string]: string[] } } = {};

    // 1. Get all Main Categories for the project
    const mainCategoriesSnapshot = await db.collection("projectConfig")
      .doc(projectId)
      .collection("mainCategories")
      .get();

    if (mainCategoriesSnapshot.empty) {
      return res.status(404).json({ 
        success: false, 
        error: "Configuration (Main Categories) for this project not found." 
      });
    }

    // 2. Loop through each Main Category to get its Sub Categories
    for (const mainCategoryDoc of mainCategoriesSnapshot.docs) {
      const mainCategoryData = mainCategoryDoc.data();
      const mainCategoryName = mainCategoryData.name;
      projectConfig[mainCategoryName] = {}; // Initialize sub-category object

      const subCategoriesSnapshot = await mainCategoryDoc.ref.collection("subCategories").get();

      // 3. Loop through each Sub Category to get its Topics
      for (const subCategoryDoc of subCategoriesSnapshot.docs) {
        const subCategoryData = subCategoryDoc.data();
        const subCategoryName = subCategoryData.name;
        
        const topicsSnapshot = await subCategoryDoc.ref.collection("topics").get();
        const topics = topicsSnapshot.docs.map((doc) => doc.data().name);

        // 4. Populate the final object
        projectConfig[mainCategoryName][subCategoryName] = topics;
      }
    }
    
    return res.json({ success: true, data: projectConfig });
  } catch (error) {
    console.error("Error in /project-config (3-level):", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

app.post("/upload-photo-base64", async (req: Request, res: Response): Promise<Response> => {
  try {
    // ดึง reportType และ description จาก request body
    const { 
      photo, projectId, reportType, 
      category, topic, description, // <--- รับค่าใหม่
      location, dynamicFields 
    } = req.body;
    
    if (!photo) {
      return res.status(400).json({ success: false, error: "No photo data provided" });
    }
    
    if (!projectId || !reportType) {
      return res.status(400).json({ success: false, error: "Missing required fields: projectId, reportType" });
    }

    // --- **KEY LOGIC**: ตรวจสอบ field ที่จำเป็นตาม reportType ---
    let filenamePrefix: string;
    let photoData: PhotoData;

    if (reportType === 'QC') {
      if (!category || !topic) {
        return res.status(400).json({ success: false, error: "Missing QC fields: category, topic" });
      }
      filenamePrefix = `${category}-${topic}`;
      photoData = {
        projectId,
        reportType,
        category,
        topic,
        location: location || "",
        dynamicFields: dynamicFields || {},
        // fields ที่จะถูกเติมหลัง upload
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
        // fields ที่จะถูกเติมหลัง upload
        filename: '',
        driveUrl: '',
        filePath: ''
      };

    } else {
      return res.status(400).json({ success: false, error: "Invalid reportType specified" });
    }

    const imageBuffer = Buffer.from(photo, "base64");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${filenamePrefix}-${timestamp}.jpg`.replace(/\s/g, "_");

    // Upload to Storage
    const storageResult = await uploadPhotoToStorage({
      imageBuffer,
      filename,
      projectId,
      // **REFACTOR**: ส่ง category หรือ "daily-reports" เป็น path
      category: reportType === 'QC' ? category : 'daily-reports', 
    });

    // Save to Firestore
    photoData.filename = storageResult.filename;
    photoData.driveUrl = storageResult.publicUrl;
    photoData.filePath = storageResult.filePath;
    
    const firestoreResult = await logPhotoToFirestore(photoData);

    return res.json({
      success: true,
      data: {
        fileId: firestoreResult.firestoreId,
        filename: storageResult.filename,
        driveUrl: storageResult.publicUrl,
        firestoreId: firestoreResult.firestoreId,
        message: `Upload (${reportType}) to ${IS_EMULATOR ? 'EMULATOR' : 'PRODUCTION'} successful`,
      },
    });
  } catch (error) {
    console.error("Error in /upload-photo-base64:", error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ✅ NEW: Test data endpoint (emulator only)
app.post("/seed-test-data", async (req: Request, res: Response): Promise<Response> => {
  if (!IS_EMULATOR) {
    return res.status(403).json({ 
      success: false, 
      error: "This endpoint is only available in emulator mode" 
    });
  }

  try {
    // Create test project
    const projectRef = await db.collection("projects").add({
      projectName: "Test Project",
      projectCode: "TEST-001",
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create categories
    const categories = [
      { name: "งานโครงสร้าง", topics: ["เสาเข็ม", "ฐานราก", "เสา", "คาน", "พื้น"] },
      { name: "งานสถาปัตยกรรม", topics: ["ผนัง", "ฝ้าเพดาน", "พื้นปูกระเบื้อง", "ประตู-หน้าต่าง"] },
      { name: "งานระบบ", topics: ["ระบบไฟฟ้า", "ระบบประปา", "ระบบปรับอากาศ"] }
    ];

    for (let i = 0; i < categories.length; i++) {
      const categoryRef = await db.collection("projectConfig")
        .doc(projectRef.id)
        .collection("categories")
        .add({
          categoryName: categories[i].name,
          orderIndex: i + 1
        });

      // Add topics
      for (let j = 0; j < categories[i].topics.length; j++) {
        await categoryRef.collection("topics").add({
          topicName: categories[i].topics[j],
          orderIndex: j + 1
        });
      }
    }

    return res.json({
      success: true,
      message: "Test data created successfully",
      projectId: projectRef.id
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

app.post("/generate-report", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId, projectName, mainCategory, subCategory, dynamicFields } = req.body;
    
    if (!projectId || !mainCategory || !subCategory) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: projectId, mainCategory, subCategory"
      });
    }
    
    console.log(`📊 Generating report for ${projectName}`);
    console.log(`Main: ${mainCategory}, Sub: ${subCategory}`);
    
    // 1. ดึงรายการหัวข้อทั้งหมดในหมวดย่อยนี้
    const projectConfigRef = db.collection("projectConfig")
      .doc(projectId)
      .collection("mainCategories");
    
    const mainCategoriesSnapshot = await projectConfigRef.get();
    
    let topics: string[] = [];
    
    for (const mainCategoryDoc of mainCategoriesSnapshot.docs) {
      const mainCategoryData = mainCategoryDoc.data();
      if (mainCategoryData.name === mainCategory) {
        const subCategoriesSnapshot = await mainCategoryDoc.ref.collection("subCategories").get();
        
        for (const subCategoryDoc of subCategoriesSnapshot.docs) {
          const subCategoryData = subCategoryDoc.data();
          if (subCategoryData.name === subCategory) {
            const topicsSnapshot = await subCategoryDoc.ref.collection("topics").get();
            topics = topicsSnapshot.docs.map(doc => doc.data().name);
            break;
          }
        }
        break;
      }
    }
    
    if (topics.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No topics found for this category"
      });
    }
    
    console.log(`✅ Found ${topics.length} topics`);
    
    // 2. ดึงรูปล่าสุดของแต่ละหัวข้อ
    const photos = await getLatestPhotos(
      projectId,
      mainCategory,
      subCategory,
      topics,
      dynamicFields || {}
    );
    
    console.log(`📸 Loaded ${photos.length} photos`);
    
    // 3. สร้าง PDF
    const reportData = {
      projectId,
      projectName: projectName || projectId,
      mainCategory,
      subCategory,
      dynamicFields: dynamicFields || {}
    };
    
    const pdfBuffer = await generatePDF(reportData, photos);
    console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);
    
    // 4. Upload ไป Storage
    const uploadResult = await uploadPDFToStorage(pdfBuffer, reportData);
    console.log(`🚀 PDF uploaded: ${uploadResult.filename}`);
    
    return res.json({
      success: true,
      data: {
        filename: uploadResult.filename,
        publicUrl: uploadResult.publicUrl,
        filePath: uploadResult.filePath,
        totalTopics: topics.length,
        photosFound: photos.filter(p => p.driveUrl).length
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

app.get("/photos/:projectId", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ success: false, error: "Project ID is required" });
    }

    console.log(`📸 Fetching all photos for project: ${projectId}`);

    const qcPhotosPromise = db.collection("qcPhotos")
      .where("projectId", "==", projectId)
      .get();
      
    const dailyPhotosPromise = db.collection("dailyPhotos")
      .where("projectId", "==", projectId)
      .get();

    const [qcSnapshot, dailySnapshot] = await Promise.all([
      qcPhotosPromise,
      dailyPhotosPromise,
    ]);

    const photos: any[] = [];

    qcSnapshot.forEach(doc => {
      const data = doc.data();
      photos.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt.toDate().toISOString(), // แปลง Timestamp เป็น ISO string
      });
    });

    dailySnapshot.forEach(doc => {
      const data = doc.data();
      photos.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt.toDate().toISOString(), // แปลง Timestamp เป็น ISO string
      });
    });
    
    console.log(`Found ${photos.length} total photos.`);

    return res.json({ success: true, data: photos });

  } catch (error) {
    console.error("Error in /photos/:projectId:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
  }
});

// Export function (อันนี้ควรอยู่บรรทัดสุดท้ายอยู่แล้ว)
export const api = onRequest({ 
  region: "asia-southeast1", 
  memory: IS_EMULATOR ? "1GiB" : "2GiB",
  timeoutSeconds: 540,
  maxInstances: IS_EMULATOR ? 2 : 10
}, app);