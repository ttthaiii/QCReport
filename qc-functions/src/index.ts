// Filename: qc-functions/src/index.ts

// --- STEP 1: INITIALIZE FIREBASE ADMIN SDK AT THE VERY TOP ---
import * as dotenv from "dotenv";
dotenv.config();
import * as admin from "firebase-admin";

try {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.GOOGLE_PROJECT_ID,
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
        privateKey: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
      // ✅ NEW: Add storage bucket for Cloud Storage
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET
    });
    console.log("Firebase Admin SDK initialized successfully.");
  }
} catch (error) {
  console.error("Firebase Admin SDK initialization failed.", error);
}

// --- STEP 2: NOW IT'S SAFE TO IMPORT EVERYTHING ELSE ---
import { onRequest } from "firebase-functions/v2/https";
import express, { Request, Response } from "express";
import cors from "cors";

// ✅ NEW: Import our Firestore logger and the NEW Storage uploader
import { logPhotoToFirestore, PhotoData } from "./api/firestore";
import { uploadPhotoToStorage } from "./api/storage"; // Replaced photos.js


const db = admin.firestore();

const app = express();
// โค้ดใหม่ (ที่ถูกต้อง)
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: "10mb" }));

// --- Firestore-based API Endpoints ---

app.get("/projects", async (req: Request, res: Response) => {
  try {
    const projectsSnapshot = await db.collection("projects").where("isActive", "==", true).get();
    if (projectsSnapshot.empty) {
      return res.json({ success: true, data: [] });
    }
    const projects = projectsSnapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get("/project-config/:projectId", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const categoriesRef = db.collection("projectConfig").doc(projectId).collection("categories");
    const categoriesSnapshot = await categoriesRef.orderBy("orderIndex").get();

    if (categoriesSnapshot.empty) {
      return res.status(404).json({ success: false, error: "Configuration for this project not found." });
    }

    const projectConfig: { [key: string]: string[] } = {};

    for (const categoryDoc of categoriesSnapshot.docs) {
      const categoryData = categoryDoc.data();
      const categoryName = categoryData.categoryName;
      const topicsRef = categoryDoc.ref.collection("topics");
      const topicsSnapshot = await topicsRef.orderBy("orderIndex").get();
      const topics = topicsSnapshot.docs.map((topicDoc: admin.firestore.QueryDocumentSnapshot) => topicDoc.data().topicName);
      projectConfig[categoryName] = topics;
    }
    res.json({ success: true, data: projectConfig });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ✅ UPDATED: This endpoint now uses Cloud Storage
app.post("/upload-photo-base64", async (req: Request, res: Response) => {
  try {
    const { photo, projectId, category, topic, location, dynamicFields } = req.body;
    if (!photo) {
      return res.status(400).json({ success: false, error: "No photo data provided" });
    }
    if (!projectId || !category || !topic) {
      return res.status(400).json({ success: false, error: "Missing required fields: projectId, category, topic" });
    }

    const imageBuffer = Buffer.from(photo, "base64");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${category}-${topic}-${timestamp}.jpg`.replace(/\s/g, "_");

    // ✅ NEW: Call the Cloud Storage upload function
    const storageResult = await uploadPhotoToStorage({
      imageBuffer,
      filename,
      projectId: projectId,
      category: category,
    });

    const photoData: PhotoData = {
      projectId,
      category,
      topic,
      filename: storageResult.filename,
      // ✅ UPDATED: Use the public URL from Cloud Storage
      driveUrl: storageResult.publicUrl,
      filePath: storageResult.filePath,
      location: location || "",
      dynamicFields: dynamicFields || {},
      reportType: "QC",
    };
    const firestoreResult = await logPhotoToFirestore(photoData);

    res.json({
      success: true,
      // ✅ UPDATED: Send back the correct data structure
      data: {
        fileId: firestoreResult.firestoreId, // Use Firestore ID as the main ID
        filename: storageResult.filename,
        driveUrl: storageResult.publicUrl, // Keep this field name for frontend compatibility
        firestoreId: firestoreResult.firestoreId,
        message: "Upload to Cloud Storage successful",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// --- ❌ REMOVED LEGACY ENDPOINT ---
// The "/qc-topics" endpoint that used sheets.js has been removed.

export const api = onRequest({ region: "asia-southeast1", memory: "2GiB", timeoutSeconds: 540 }, app);