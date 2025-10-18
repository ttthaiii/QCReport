// Filename: qc-functions/src/index.ts

// --- STEP 1: INITIALIZE FIREBASE ADMIN SDK ---
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express, { Request, Response } from "express";
import cors from "cors";

// Import routes
import { logPhotoToFirestore, PhotoData } from "./api/firestore";
import { uploadPhotoToStorage } from "./api/storage";

// ✅ NEW: Environment detection
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (IS_EMULATOR) {
    // For emulator - ไม่ต้องใช้ credentials
    admin.initializeApp({
      projectId: "qcreport-54164"
    });
    // Set emulator hosts
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
    console.log("🔧 Running in EMULATOR mode");
  } else {
    // For production - ใช้ default credentials
    admin.initializeApp();
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

app.get("/project-config/:projectId", async (req, res) => {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      return res.status(400).send("Project ID is required");
    }

    // 1. แก้ไขชื่อ Collection ให้ถูกต้องเป็น "projects"
    const projectDocRef = db.collection('projects').doc(projectId);
    const projectDoc = await projectDocRef.get();

    if (!projectDoc.exists) {
      return res.status(404).send(`Project with ID ${projectId} not found.`);
    }

    // 2. เขียนฟังก์ชันเพื่ออ่านข้อมูลแบบ Sub-collections ที่ซ้อนกัน
    const mainCategoriesSnapshot = await projectDocRef.collection('mainCategories').get();

    if (mainCategoriesSnapshot.empty) {
      return res.json({
        projectName: projectDoc.data()?.name || '',
        categories: []
      });
    }

    // 3. ใช้ Promise.all เพื่อดึงข้อมูล Sub-collections ทั้งหมดแบบขนาน (มีประสิทธิภาพ)
    const categoriesData = await Promise.all(
      mainCategoriesSnapshot.docs.map(async (mainCatDoc) => {
        const subCategoriesSnapshot = await mainCatDoc.ref.collection('subCategories').get();

        const subCategoriesData = await Promise.all(
          subCategoriesSnapshot.docs.map(async (subCatDoc) => {
            const topicsSnapshot = await subCatDoc.ref.collection('topics').get();
            const topics = topicsSnapshot.docs.map(topicDoc => ({
              id: topicDoc.id,
              ...topicDoc.data()
            }));

            return {
              id: subCatDoc.id,
              ...subCatDoc.data(),
              topics: topics
            };
          })
        );

        return {
          id: mainCatDoc.id,
          ...mainCatDoc.data(),
          subCategories: subCategoriesData
        };
      })
    );

    // 4. ส่งข้อมูลกลับไปให้ Frontend ในโครงสร้างที่ถูกต้อง
    return res.status(200).json({
      projectName: projectDoc.data()?.name || '',
      categories: categoriesData
    });

  } catch (error) {
    console.error("Error fetching project config:", error);
    return res.status(500).send("Internal Server Error");
  }
});

app.post("/upload-photo-base64", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { photo, projectId, category, topic, location, dynamicFields } = req.body;
    
    if (!photo) {
      return res.status(400).json({ 
        success: false, 
        error: "No photo data provided" 
      });
    }
    
    if (!projectId || !category || !topic) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: projectId, category, topic" 
      });
    }

    const imageBuffer = Buffer.from(photo, "base64");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${category}-${topic}-${timestamp}.jpg`.replace(/\s/g, "_");

    // Upload to Storage
    const storageResult = await uploadPhotoToStorage({
      imageBuffer,
      filename,
      projectId,
      category,
    });

    // Save to Firestore
    const photoData: PhotoData = {
      projectId,
      category,
      topic,
      filename: storageResult.filename,
      driveUrl: storageResult.publicUrl,
      filePath: storageResult.filePath,
      location: location || "",
      dynamicFields: dynamicFields || {},
      reportType: "QC",
    };
    
    const firestoreResult = await logPhotoToFirestore(photoData);

    return res.json({
      success: true,
      data: {
        fileId: firestoreResult.firestoreId,
        filename: storageResult.filename,
        driveUrl: storageResult.publicUrl,
        firestoreId: firestoreResult.firestoreId,
        message: `Upload to ${IS_EMULATOR ? 'EMULATOR' : 'PRODUCTION'} successful`,
      },
    });
  } catch (error) {
    console.error("Error in /upload-photo-base64:", error);
    return res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    });
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

// Export function
export const api = onRequest({ 
  region: "asia-southeast1", 
  memory: IS_EMULATOR ? "1GiB" : "2GiB",
  timeoutSeconds: 540,
  maxInstances: IS_EMULATOR ? 2 : 10
}, app);