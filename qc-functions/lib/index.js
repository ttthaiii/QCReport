"use strict";
// Filename: qc-functions/src/index.ts
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
exports.api = void 0;
// --- STEP 1: INITIALIZE FIREBASE ADMIN SDK AT THE VERY TOP ---
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin immediately
if (!admin.apps.length) {
    // Use application default credentials in emulator
    admin.initializeApp({
        projectId: "qcreport-54164",
        storageBucket: "qcreport-54164.firebasestorage.app"
    });
    console.log("Firebase Admin SDK initialized successfully.");
}
// --- STEP 2: NOW IT'S SAFE TO IMPORT EVERYTHING ELSE ---
const https_1 = require("firebase-functions/v2/https");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
// Lazy load heavy dependencies
let firestoreModule;
let storageModule;
async function loadDependencies() {
    if (!firestoreModule) {
        firestoreModule = await Promise.resolve().then(() => __importStar(require("./api/firestore")));
    }
    if (!storageModule) {
        storageModule = await Promise.resolve().then(() => __importStar(require("./api/storage")));
    }
}
const db = admin.firestore();
const app = (0, express_1.default)();
// Configure middleware
app.use((0, cors_1.default)({ origin: true })); // Allow all origins in development
app.use(express_1.default.json({ limit: "10mb" }));
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
});
// --- Firestore-based API Endpoints ---
app.get("/projects", async (req, res) => {
    try {
        const projectsSnapshot = await db.collection("projects").where("isActive", "==", true).get();
        if (projectsSnapshot.empty) {
            return res.json({ success: true, data: [] });
        }
        const projects = projectsSnapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        return res.json({ success: true, data: projects });
    }
    catch (error) {
        console.error("Error in /projects:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
app.get("/project-config/:projectId", async (req, res) => {
    try {
        const { projectId } = req.params;
        const categoriesRef = db.collection("projectConfig").doc(projectId).collection("categories");
        const categoriesSnapshot = await categoriesRef.orderBy("orderIndex").get();
        if (categoriesSnapshot.empty) {
            return res.status(404).json({ success: false, error: "Configuration for this project not found." });
        }
        const projectConfig = {};
        for (const categoryDoc of categoriesSnapshot.docs) {
            const categoryData = categoryDoc.data();
            const categoryName = categoryData.categoryName;
            const topicsRef = categoryDoc.ref.collection("topics");
            const topicsSnapshot = await topicsRef.orderBy("orderIndex").get();
            const topics = topicsSnapshot.docs.map((topicDoc) => topicDoc.data().topicName);
            projectConfig[categoryName] = topics;
        }
        return res.json({ success: true, data: projectConfig });
    }
    catch (error) {
        console.error("Error in /project-config:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ UPDATED: This endpoint now uses Cloud Storage
app.post("/upload-photo-base64", async (req, res) => {
    try {
        // Load dependencies on first use
        await loadDependencies();
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
        const storageResult = await storageModule.uploadPhotoToStorage({
            imageBuffer,
            filename,
            projectId: projectId,
            category: category,
        });
        const photoData = {
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
        const firestoreResult = await firestoreModule.logPhotoToFirestore(photoData);
        return res.json({
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
    }
    catch (error) {
        console.error("Error in /upload-photo-base64:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// Export with increased timeout
exports.api = (0, https_1.onRequest)({
    region: "asia-southeast1",
    memory: "2GiB",
    timeoutSeconds: 540,
    maxInstances: 10
}, app);
//# sourceMappingURL=index.js.map