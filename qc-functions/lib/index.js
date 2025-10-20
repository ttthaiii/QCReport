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
// --- STEP 1: INITIALIZE FIREBASE ADMIN SDK ---
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pdf_generator_1 = require("./services/pdf-generator");
// Import routes
const firestore_1 = require("./api/firestore");
const storage_1 = require("./api/storage");
// ✅ NEW: Environment detection
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
// Initialize Firebase Admin
if (!admin.apps.length) {
    if (IS_EMULATOR) {
        admin.initializeApp({
            projectId: "qcreport-54164",
            storageBucket: "qcreport-54164.appspot.com" // ✅ เพิ่มบรรทัดนี้
        });
        process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
        console.log("🔧 Running in EMULATOR mode");
    }
    else {
        admin.initializeApp({
            storageBucket: "qcreport-54164.appspot.com" // ✅ เพิ่มบรรทัดนี้
        });
        console.log("🚀 Running in PRODUCTION mode");
    }
}
const db = admin.firestore();
const app = (0, express_1.default)();
// ✅ FIXED: CORS configuration
app.use((0, cors_1.default)({
    origin: IS_EMULATOR
        ? ['http://localhost:3000', 'http://localhost:5000'] // Development
        : ['https://qcreport-54164.web.app', 'https://qcreport-54164.firebaseapp.com'] // Production
}));
app.use(express_1.default.json({ limit: "10mb" }));
// ✅ NEW: Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        environment: IS_EMULATOR ? "emulator" : "production",
        timestamp: new Date().toISOString()
    });
});
// ✅ FIXED: Add return types to all endpoints
app.get("/projects", async (req, res) => {
    try {
        console.log(`📋 Fetching projects from ${IS_EMULATOR ? 'EMULATOR' : 'PRODUCTION'}`);
        const projectsSnapshot = await db.collection("projects")
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
app.get("/project-config/:projectId", async (req, res) => {
    try {
        const { projectId } = req.params;
        // ✅ 1. FIX: Update the type to expect an object containing topics and dynamicFields
        const projectConfig = {};
        const mainCategoriesSnapshot = await db.collection("projectConfig")
            .doc(projectId)
            .collection("mainCategories")
            .get();
        if (mainCategoriesSnapshot.empty) {
            return res.status(404).json({
                success: false,
                error: "Configuration for this project not found."
            });
        }
        for (const mainCategoryDoc of mainCategoriesSnapshot.docs) {
            const mainCategoryData = mainCategoryDoc.data();
            const mainCategoryName = mainCategoryData.name;
            projectConfig[mainCategoryName] = {};
            const subCategoriesSnapshot = await mainCategoryDoc.ref.collection("subCategories").get();
            for (const subCategoryDoc of subCategoriesSnapshot.docs) {
                const subCategoryData = subCategoryDoc.data();
                const subCategoryName = subCategoryData.name;
                const topicsSnapshot = await subCategoryDoc.ref.collection("topics").get();
                const topics = topicsSnapshot.docs.map((doc) => doc.data().name);
                // ✅ 2. FIX: Populate the object with BOTH topics and dynamicFields
                projectConfig[mainCategoryName][subCategoryName] = {
                    topics: topics,
                    dynamicFields: subCategoryData.dynamicFields || [] // <-- THE MISSING PIECE!
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
app.post("/upload-photo-base64", async (req, res) => {
    try {
        // ดึง reportType และ description จาก request body
        const { photo, projectId, reportType, category, topic, description, // <--- รับค่าใหม่
        location, dynamicFields } = req.body;
        if (!photo) {
            return res.status(400).json({ success: false, error: "No photo data provided" });
        }
        if (!projectId || !reportType) {
            return res.status(400).json({ success: false, error: "Missing required fields: projectId, reportType" });
        }
        // --- **KEY LOGIC**: ตรวจสอบ field ที่จำเป็นตาม reportType ---
        let filenamePrefix;
        let photoData;
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
        }
        else if (reportType === 'Daily') {
            filenamePrefix = `Daily-${(description === null || description === void 0 ? void 0 : description.substring(0, 20)) || 'report'}`;
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
        }
        else {
            return res.status(400).json({ success: false, error: "Invalid reportType specified" });
        }
        const imageBuffer = Buffer.from(photo, "base64");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${filenamePrefix}-${timestamp}.jpg`.replace(/\s/g, "_");
        // Upload to Storage
        const storageResult = await (0, storage_1.uploadPhotoToStorage)({
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
        const firestoreResult = await (0, firestore_1.logPhotoToFirestore)(photoData);
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
    }
    catch (error) {
        console.error("Error in /upload-photo-base64:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ NEW: Test data endpoint (emulator only)
app.post("/seed-test-data", async (req, res) => {
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
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
app.post("/generate-report", async (req, res) => {
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
        let topics = [];
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
        const photos = await (0, pdf_generator_1.getLatestPhotos)(projectId, mainCategory, subCategory, topics, dynamicFields || {});
        console.log(`📸 Loaded ${photos.length} photos`);
        // 3. สร้าง PDF
        const reportData = {
            projectId,
            projectName: projectName || projectId,
            mainCategory,
            subCategory,
            dynamicFields: dynamicFields || {}
        };
        const pdfBuffer = await (0, pdf_generator_1.generatePDF)(reportData, photos);
        console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);
        // 4. Upload ไป Storage
        const uploadResult = await (0, pdf_generator_1.uploadPDFToStorage)(pdfBuffer, reportData);
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
    }
    catch (error) {
        console.error("❌ Error generating report:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
app.get("/photos/:projectId", async (req, res) => {
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
        const photos = [];
        qcSnapshot.forEach(doc => {
            const data = doc.data();
            photos.push(Object.assign(Object.assign({ id: doc.id }, data), { createdAt: data.createdAt.toDate().toISOString() }));
        });
        dailySnapshot.forEach(doc => {
            const data = doc.data();
            photos.push(Object.assign(Object.assign({ id: doc.id }, data), { createdAt: data.createdAt.toDate().toISOString() }));
        });
        console.log(`Found ${photos.length} total photos.`);
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
// Export function (อันนี้ควรอยู่บรรทัดสุดท้ายอยู่แล้ว)
exports.api = (0, https_1.onRequest)({
    region: "asia-southeast1",
    memory: IS_EMULATOR ? "1GiB" : "2GiB",
    timeoutSeconds: 540,
    maxInstances: IS_EMULATOR ? 2 : 10
}, app);
//# sourceMappingURL=index.js.map