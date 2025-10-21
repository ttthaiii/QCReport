"use strict";
// Filename: qc-functions/src/index.ts (VERSION 7 - Final)
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
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
// ✅ Import functions from pdf-generator v7
const pdf_generator_1 = require("./services/pdf-generator");
// ✅ Import Firestore and Storage functions
const firestore_1 = require("./api/firestore");
const storage_1 = require("./api/storage");
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
if (!admin.apps.length) {
    admin.initializeApp({
        storageBucket: "qcreport-54164.appspot.com"
    });
    if (IS_EMULATOR) {
        console.log("🔧 Running in EMULATOR mode");
    }
    else {
        console.log("🚀 Running in PRODUCTION mode");
    }
}
const db = admin.firestore();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json({ limit: "10mb" }));
// --- API ROUTES ---
// ✅ Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        environment: IS_EMULATOR ? "emulator" : "production",
        version: "7.0"
    });
});
// ✅ Get all active projects
app.get("/projects", async (req, res) => {
    try {
        const projectsSnapshot = await db
            .collection("projects")
            .where("isActive", "==", true)
            .get();
        if (projectsSnapshot.empty) {
            return res.json({ success: true, data: [] });
        }
        const projects = projectsSnapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        return res.json({ success: true, data: projects });
    }
    catch (error) {
        console.error("Error in /projects:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ Get project configuration
app.get("/project-config/:projectId", async (req, res) => {
    try {
        const { projectId } = req.params;
        const projectConfig = {};
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
    }
    catch (error) {
        console.error("Error in /project-config:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ Upload photo with base64
app.post("/upload-photo-base64", async (req, res) => {
    try {
        const { photo, projectId, reportType, category, topic, description, location, dynamicFields } = req.body;
        if (!photo || !projectId || !reportType) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields."
            });
        }
        let filenamePrefix;
        let photoData;
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
        }
        else if (reportType === 'Daily') {
            filenamePrefix = `Daily-${(description === null || description === void 0 ? void 0 : description.substring(0, 20)) || 'report'}`;
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
        }
        else {
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
        const storageResult = await (0, storage_1.uploadPhotoToStorage)({
            imageBuffer,
            filename,
            projectId,
            category: storageCategoryPath
        });
        // Update photo data
        photoData.filename = storageResult.filename;
        photoData.driveUrl = storageResult.publicUrl;
        photoData.filePath = storageResult.filePath;
        // Log to Firestore
        const firestoreResult = await (0, firestore_1.logPhotoToFirestore)(photoData);
        return res.json({
            success: true,
            data: Object.assign(Object.assign({}, firestoreResult), storageResult)
        });
    }
    catch (error) {
        console.error("Error in /upload-photo-base64:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ Generate PDF report (v7 - with base64 images)
app.post("/generate-report", async (req, res) => {
    try {
        const { projectId, projectName, mainCategory, subCategory, dynamicFields } = req.body;
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
        let allTopics = [];
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
        const foundPhotos = await (0, pdf_generator_1.getLatestPhotos)(projectId, mainCategory, subCategory, allTopics, dynamicFields || {});
        console.log(`📸 Found and downloaded ${foundPhotos.length} photos.`);
        // 3. Create full layout (photos + placeholders)
        const fullLayoutPhotos = (0, pdf_generator_1.createFullLayout)(allTopics, foundPhotos);
        // 4. Generate PDF
        const reportData = {
            projectId,
            projectName: projectName || projectId,
            mainCategory,
            subCategory,
            dynamicFields: dynamicFields || {}
        };
        const pdfBuffer = await (0, pdf_generator_1.generatePDF)(reportData, fullLayoutPhotos);
        console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);
        // 5. Upload PDF to Storage
        const uploadResult = await (0, pdf_generator_1.uploadPDFToStorage)(pdfBuffer, reportData);
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
    }
    catch (error) {
        console.error("❌ Error generating report:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ Get photos by project ID
app.get("/photos/:projectId", async (req, res) => {
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
        const photos = [];
        qcSnapshot.forEach(doc => {
            const data = doc.data();
            photos.push(Object.assign(Object.assign({ id: doc.id }, data), { createdAt: data.createdAt.toDate().toISOString() }));
        });
        dailySnapshot.forEach(doc => {
            const data = doc.data();
            photos.push(Object.assign(Object.assign({ id: doc.id }, data), { createdAt: data.createdAt.toDate().toISOString() }));
        });
        return res.json({ success: true, data: photos });
    }
    catch (error) {
        console.error("Error in /photos/:projectId:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ Export Cloud Function
exports.api = (0, https_1.onRequest)({
    region: "asia-southeast1",
    memory: "2GiB",
    timeoutSeconds: 540,
}, app);
//# sourceMappingURL=index.js.map