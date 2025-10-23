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
function slugify(text) {
    if (typeof text !== 'string')
        return `doc-${Date.now()}`; // Fallback
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\u0E00-\u0E7F\w-]+/g, '') // Remove all non-word chars except Thai
        .replace(/--+/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, '') // Trim - from end of text
        || `doc-${Date.now()}`; // Fallback for empty string
}
if (!admin.apps.length) {
    if (IS_EMULATOR) {
        // --- 🔧 [EMULATOR] ---
        console.log("🔧 Running in EMULATOR mode (with Service Account)");
        // 1. [แก้ไข] ระบุตำแหน่งไฟล์ Key ให้อยู่ในโฟลเดอร์ keys
        // (!! อย่าลืมเปลี่ยน "YOUR-KEY-FILENAME.json" ให้เป็นชื่อไฟล์ Key จริงของคุณ !!)
        const serviceAccount = require("../keys/qcreport-54164-4d8f26cbb52f.json");
        admin.initializeApp({
            // 2. ส่ง credential เข้าไปตรงๆ
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "qcreport-54164.appspot.com"
        });
    }
    else {
        // --- 🚀 [PRODUCTION] ---
        console.log("🚀 Running in PRODUCTION mode");
        admin.initializeApp({
            storageBucket: "qcreport-54164.appspot.com"
        });
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
        // 1. อ้างอิงไปยัง Collection หลักของ Config
        const projectConfigRef = db.collection("projectConfig").doc(projectId);
        // 2. [ใหม่] Query ทั้ง 3 Collections พร้อมกัน (Parallel Fetch)
        // (เราเพิ่ม .where("isArchived", "==", false) เพื่อรองรับการ "Soft Delete" ในอนาคต)
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
        // 3. [ใหม่] ประมวลผล Topics (ลูกสุด) ให้เป็น Map
        // (Key: subCategoryId, Value: Topic[])
        const topicsMap = new Map();
        topicSnap.forEach(doc => {
            const topicData = doc.data();
            const subId = topicData.subCategoryId; // นี่คือ "Foreign Key"
            if (!topicsMap.has(subId)) {
                topicsMap.set(subId, []);
            }
            topicsMap.get(subId).push({
                id: doc.id,
                name: topicData.name,
                dynamicFields: topicData.dynamicFields || [],
            });
        });
        // 4. [ใหม่] ประมวลผล SubCategories และ "Join" Topics เข้ามา
        // (Key: mainCategoryId, Value: SubCategory[])
        const subCategoriesMap = new Map();
        subSnap.forEach(doc => {
            const subData = doc.data();
            const mainId = subData.mainCategoryId; // นี่คือ "Foreign Key"
            if (!subCategoriesMap.has(mainId)) {
                subCategoriesMap.set(mainId, []);
            }
            subCategoriesMap.get(mainId).push({
                id: doc.id,
                name: subData.name,
                dynamicFields: subData.dynamicFields || [],
                topics: topicsMap.get(doc.id) || [], // ดึง Topics จาก Map ด้านบน
            });
        });
        // 5. [ใหม่] ประมวลผล MainCategories และ "Join" SubCategories เข้ามา
        const finalConfig = [];
        mainSnap.forEach(doc => {
            finalConfig.push({
                id: doc.id,
                name: doc.data().name,
                // (เราไม่ต้องส่ง isArchived ไปให้ Frontend ก็ได้)
                subCategories: subCategoriesMap.get(doc.id) || [], // ดึง SubCategories จาก Map
            });
        });
        if (finalConfig.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Config not found or is empty."
            });
        }
        // 6. ส่งข้อมูลโครงสร้างใหม่ (Array of Objects) กลับไป
        return res.json({ success: true, data: finalConfig });
    }
    catch (error) {
        console.error("Error in /project-config (V2):", error);
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
        const { projectId, projectName, reportType, // <-- [ใหม่] รับ reportType
        // QC fields (นี่คือ "ชื่อ" ที่ส่งมาจาก Frontend)
        mainCategory, subCategory, dynamicFields, 
        // Daily fields
        date // <-- [ใหม่] รับ date
         } = req.body;
        if (!projectId || !reportType) {
            return res.status(400).json({
                success: false,
                error: "Missing projectId or reportType."
            });
        }
        console.log(`📊 Generating ${reportType} report for ${projectName}`);
        // ===================================
        //  QC REPORT LOGIC (แก้ไข V2 - อ่าน Flat)
        // ===================================
        if (reportType === 'QC') {
            if (!mainCategory || !subCategory) {
                return res.status(400).json({
                    success: false,
                    error: "Missing QC fields (mainCategory, subCategory)."
                });
            }
            // 1. [ใหม่] ค้นหา Topics จากโครงสร้าง Flat
            const projectConfigRef = db.collection("projectConfig").doc(projectId);
            // 1a. ค้นหา MainCategory ID (จาก "ชื่อ")
            const mainCatSnap = await projectConfigRef
                .collection("mainCategories")
                .where("name", "==", mainCategory)
                .limit(1)
                .get();
            if (mainCatSnap.empty) {
                return res.status(404).json({ success: false, error: `Main category '${mainCategory}' not found.` });
            }
            const mainCatId = mainCatSnap.docs[0].id;
            // 1b. ค้นหา SubCategory ID (จาก "ชื่อ" และ "mainCatId")
            const subCatSnap = await projectConfigRef
                .collection("subCategories")
                .where("name", "==", subCategory)
                .where("mainCategoryId", "==", mainCatId) // กันชื่อซ้ำ
                .limit(1)
                .get();
            if (subCatSnap.empty) {
                return res.status(404).json({ success: false, error: `Sub category '${subCategory}' not found under '${mainCategory}'.` });
            }
            const subCatId = subCatSnap.docs[0].id;
            // 1c. ดึง Topics ทั้งหมดของ SubCategory นี้
            const topicsSnap = await projectConfigRef
                .collection("topics")
                .where("subCategoryId", "==", subCatId)
                .where("isArchived", "==", false)
                .get();
            const allTopics = topicsSnap.docs.map(doc => doc.data().name);
            // 1d. ตรวจสอบ (จุดที่เคยเกิด Error)
            if (allTopics.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: "No topics found." // <-- Error เดิม
                });
            }
            console.log(`✅ Found ${allTopics.length} total topics for the layout.`);
            // 2. Get latest photos (QC)
            // (ฟังก์ชันนี้ยังทำงานกับ "ชื่อ" Category ได้อยู่)
            const foundPhotos = await (0, pdf_generator_1.getLatestPhotos)(projectId, mainCategory, subCategory, allTopics, dynamicFields || {});
            console.log(`📸 Found and downloaded ${foundPhotos.length} photos.`);
            // 3. Create full layout (photos + placeholders)
            const fullLayoutPhotos = (0, pdf_generator_1.createFullLayout)(allTopics, foundPhotos);
            // 4. Generate PDF (QC)
            const reportData = {
                projectId,
                projectName: projectName || projectId,
                mainCategory,
                subCategory,
                dynamicFields: dynamicFields || {}
            };
            const pdfBuffer = await (0, pdf_generator_1.generatePDF)(reportData, fullLayoutPhotos);
            console.log(`✅ QC PDF generated: ${pdfBuffer.length} bytes`);
            // 5. Upload PDF to Storage
            const uploadResult = await (0, pdf_generator_1.uploadPDFToStorage)(pdfBuffer, reportData, 'QC');
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
            //  DAILY REPORT LOGIC (อันนี้ถูกต้องอยู่แล้ว)
            // ===================================
        }
        else if (reportType === 'Daily') {
            if (!date) {
                return res.status(400).json({
                    success: false,
                    error: "Missing Daily field (date)."
                });
            }
            console.log(`📅 Fetching Daily photos for date: ${date}`);
            // 1. Get daily photos
            const foundPhotos = await (0, pdf_generator_1.getDailyPhotosByDate)(projectId, date);
            console.log(`📸 Found and downloaded ${foundPhotos.length} daily photos.`);
            if (foundPhotos.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: `ไม่พบรูปรายงานประจำวันสำหรับวันที่ ${date}`
                });
            }
            // 2. Generate PDF
            const reportData = {
                projectId,
                projectName: projectName || projectId,
                date
            };
            const pdfBuffer = await (0, pdf_generator_1.generateDailyPDFWrapper)(reportData, foundPhotos);
            console.log(`✅ Daily PDF generated: ${pdfBuffer.length} bytes`);
            // 3. Upload PDF to Storage
            const uploadResult = await (0, pdf_generator_1.uploadPDFToStorage)(pdfBuffer, reportData, 'Daily');
            return res.json({
                success: true,
                data: {
                    filename: uploadResult.filename,
                    publicUrl: uploadResult.publicUrl,
                    photosFound: foundPhotos.length
                }
            });
        }
        else {
            return res.status(400).json({
                success: false,
                error: "Invalid reportType."
            });
        }
    }
    catch (error) {
        console.error("❌ Error generating report:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
app.post("/checklist-status", async (req, res) => {
    try {
        const { projectId, mainCategory, subCategory, dynamicFields } = req.body;
        if (!projectId || !mainCategory || !subCategory || !dynamicFields) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields."
            });
        }
        const category = `${mainCategory} > ${subCategory}`;
        const statusMap = await (0, pdf_generator_1.getUploadedTopicStatus)(projectId, category, dynamicFields);
        // ส่งกลับเป็น JSON object ธรรมดา
        return res.json({ success: true, data: statusMap });
    }
    catch (error) {
        console.error("❌ Error in /checklist-status:", error);
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
// ✅ [ใหม่] Endpoint สำหรับแก้ไขชื่อ Main Category
app.post("/project-config/:projectId/main-category/:mainCatId", async (req, res) => {
    try {
        const { projectId, mainCatId } = req.params;
        const { newName } = req.body;
        if (!newName || typeof newName !== 'string' || newName.trim() === '') {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'newName' in request body."
            });
        }
        // อ้างอิงไปยัง Document ที่ต้องการ
        const docRef = db
            .collection("projectConfig")
            .doc(projectId)
            .collection("mainCategories")
            .doc(mainCatId);
        // ทำการ Update เฉพาะ field 'name'
        await docRef.update({
            name: newName.trim()
        });
        console.log(`✅ Config updated: ${projectId}/${mainCatId} -> ${newName.trim()}`);
        return res.json({
            success: true,
            data: { id: mainCatId, name: newName.trim() }
        });
    }
    catch (error) {
        console.error("Error updating main category:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ [ใหม่] Endpoint สำหรับ "ลบ" (Soft Delete) Main Category
app.delete("/project-config/:projectId/main-category/:mainCatId", async (req, res) => {
    try {
        const { projectId, mainCatId } = req.params;
        // อ้างอิงไปยัง Document ที่ต้องการ
        const docRef = db
            .collection("projectConfig")
            .doc(projectId)
            .collection("mainCategories")
            .doc(mainCatId);
        // ทำการ "Soft Delete" โดยการอัปเดต field 'isArchived'
        // เราไม่ลบข้อมูลจริง เพื่อรักษาความสมบูรณ์ของรายงานเก่า
        await docRef.update({
            isArchived: true
        });
        console.log(`✅ Config soft-deleted: ${projectId}/${mainCatId}`);
        return res.json({
            success: true,
            data: { id: mainCatId, status: 'archived' }
        });
    }
    catch (error) {
        console.error("Error soft-deleting main category:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ [ใหม่] Endpoint สำหรับ "เพิ่ม" Main Category
app.post("/project-config/:projectId/main-categories", async (req, res) => {
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
        // 1. สร้าง ID ที่เสถียรจากชื่อ
        const newId = slugify(trimmedName);
        // 2. อ้างอิงไปยัง Document ใหม่
        const docRef = db
            .collection("projectConfig")
            .doc(projectId)
            .collection("mainCategories")
            .doc(newId); // <-- ใช้ ID ที่เราสร้างเอง
        // 3. ตรวจสอบว่า ID นี้ซ้ำหรือไม่ (ป้องกันการสร้างทับ)
        const existingDoc = await docRef.get();
        if (existingDoc.exists) {
            return res.status(409).json({
                success: false,
                error: `หมวดหมู่ชื่อ '${trimmedName}' (ID: ${newId}) มีอยู่แล้ว`
            });
        }
        // 4. สร้างข้อมูลใหม่
        const newData = {
            name: trimmedName,
            isArchived: false
            // (คุณอาจจะเพิ่ม field 'order' หรือ 'createdAt' ที่นี่ก็ได้)
        };
        await docRef.set(newData); // ใช้ .set() เพราะเราระบุ ID เอง
        console.log(`✅ Config created: ${projectId}/${newId} -> ${trimmedName}`);
        return res.status(201).json({
            success: true,
            data: Object.assign({ id: newId }, newData)
        });
    }
    catch (error) {
        console.error("Error creating main category:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
app.post("/project-config/:projectId/sub-categories", async (req, res) => {
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
        // 1. สร้าง ID ที่เสถียร (เหมือนตอน Migration)
        // เราใช้ mainCategoryName เพื่อให้ ID ไม่ซ้ำกันข้ามหมวด
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
            mainCategoryId: mainCategoryId, // <-- อ้างอิงกลับไปหา Level 1
            dynamicFields: [], // <-- ค่าเริ่มต้น
            isArchived: false
        };
        await docRef.set(newData);
        console.log(`✅ SubConfig created: ${projectId}/${newId} -> ${trimmedName}`);
        return res.status(201).json({ success: true, data: Object.assign({ id: newId }, newData) });
    }
    catch (error) {
        console.error("Error creating sub category:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ [ใหม่] Endpoint สำหรับ "แก้ไข" Sub Category
app.post("/project-config/:projectId/sub-category/:subCatId", async (req, res) => {
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
    }
    catch (error) {
        console.error("Error updating sub category:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ [ใหม่] Endpoint สำหรับ "ลบ" (Soft Delete) Sub Category
app.delete("/project-config/:projectId/sub-category/:subCatId", async (req, res) => {
    try {
        const { projectId, subCatId } = req.params;
        const docRef = db
            .collection("projectConfig")
            .doc(projectId)
            .collection("subCategories")
            .doc(subCatId);
        // ทำ "Soft Delete"
        await docRef.update({ isArchived: true });
        console.log(`✅ SubConfig soft-deleted: ${projectId}/${subCatId}`);
        // (TODO ในอนาคต: เราควรจะต้อง Soft Delete "Topics" ที่อยู่ข้างใต้นี้ด้วย)
        return res.json({ success: true, data: { id: subCatId, status: 'archived' } });
    }
    catch (error) {
        console.error("Error soft-deleting sub category:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ [ใหม่] Endpointสำหรับ "เพิ่ม" Topic (Level 3)
app.post("/project-config/:projectId/topics", async (req, res) => {
    try {
        const { projectId } = req.params;
        const { newName, subCategoryId, mainCategoryName, subCategoryName } = req.body; // <-- ต้องการ ID/Name จาก 2 ระดับบน
        if (!newName || !subCategoryId || !mainCategoryName || !subCategoryName) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields (newName, subCategoryId, mainCategoryName, subCategoryName)."
            });
        }
        const trimmedName = newName.trim();
        // 1. สร้าง ID ที่เสถียร (เหมือนตอน Migration)
        const newId = slugify(`${mainCategoryName}-${subCategoryName}-${trimmedName}`);
        const docRef = db
            .collection("projectConfig")
            .doc(projectId)
            .collection("topics")
            .doc(newId);
        const existingDoc = await docRef.get();
        if (existingDoc.exists) {
            return res.status(409).json({
                success: false,
                error: `หัวข้อชื่อ '${trimmedName}' (ID: ${newId}) มีอยู่แล้ว`
            });
        }
        const newData = {
            name: trimmedName,
            subCategoryId: subCategoryId, // <-- อ้างอิงกลับไปหา Level 2
            isArchived: false
            // (เราจะจัดการ dynamicFields ใน Level 4)
        };
        await docRef.set(newData);
        console.log(`✅ Topic created: ${projectId}/${newId} -> ${trimmedName}`);
        return res.status(201).json({ success: true, data: Object.assign({ id: newId }, newData) });
    }
    catch (error) {
        console.error("Error creating topic:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ [ใหม่] Endpoint สำหรับ "แก้ไข" Topic
app.post("/project-config/:projectId/topic/:topicId", async (req, res) => {
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
    }
    catch (error) {
        console.error("Error updating topic:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ [ใหม่] Endpoint สำหรับ "ลบ" (Soft Delete) Topic
app.delete("/project-config/:projectId/topic/:topicId", async (req, res) => {
    try {
        const { projectId, topicId } = req.params;
        const docRef = db
            .collection("projectConfig")
            .doc(projectId)
            .collection("topics")
            .doc(topicId);
        // ทำ "Soft Delete"
        await docRef.update({ isArchived: true });
        console.log(`✅ Topic soft-deleted: ${projectId}/${topicId}`);
        return res.json({ success: true, data: { id: topicId, status: 'archived' } });
    }
    catch (error) {
        console.error("Error soft-deleting topic:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ [ใหม่] Endpoint สำหรับ "อัปเดต" Dynamic Fields (Level 4)
app.post("/project-config/:projectId/sub-category/:subCatId/fields", async (req, res) => {
    try {
        const { projectId, subCatId } = req.params;
        const { fields } = req.body; // <-- รับ Array ของ Fields ใหม่
        // 1. ตรวจสอบว่า fields เป็น Array จริงๆ
        if (!Array.isArray(fields)) {
            return res.status(400).json({
                success: false,
                error: "Invalid input: 'fields' must be an array."
            });
        }
        // 2. (Optional) กรองค่าว่างและค่าซ้ำ
        const cleanedFields = fields
            .map(f => typeof f === 'string' ? f.trim() : '')
            .filter((f, index, self) => f && self.indexOf(f) === index);
        // 3. อ้างอิงไปยัง Sub Category
        const docRef = db
            .collection("projectConfig")
            .doc(projectId)
            .collection("subCategories")
            .doc(subCatId);
        // 4. ทำการ Update field 'dynamicFields' ทั้ง array
        await docRef.update({
            dynamicFields: cleanedFields
        });
        console.log(`✅ Fields updated: ${projectId}/${subCatId} -> [${cleanedFields.join(', ')}]`);
        return res.json({
            success: true,
            data: { id: subCatId, dynamicFields: cleanedFields }
        });
    }
    catch (error) {
        console.error("Error updating dynamic fields:", error);
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