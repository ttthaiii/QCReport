"use strict";
// Filename: qc-functions/src/index.ts (VERSION 8 - Dynamic PDF Settings)
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
const storage_1 = require("firebase-admin/storage");
const https_1 = require("firebase-functions/v2/https");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const busboy_1 = __importDefault(require("busboy"));
// ✅ [แก้ไข] Import ReportSettings (ต้องสร้าง Interface นี้ใน pdf-generator.ts ด้วย)
const pdf_generator_1 = require("./services/pdf-generator");
const firestore_1 = require("./api/firestore");
const storage_2 = require("./api/storage");
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
        console.log("🔧 Running in EMULATOR mode (with Service Account)");
        const serviceAccount = require("../keys/qcreport-54164-4d8f26cbb52f.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "qcreport-54164.appspot.com"
        });
    }
    else {
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
// ... (คง Endpoint /health, /projects, /project-config, /projects/:projectId/report-settings ไว้เหมือนเดิม) ...
// ✅ Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        environment: IS_EMULATOR ? "emulator" : "production",
        version: "8.0" // <-- [ใหม่] อัปเดตเวอร์ชัน
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
        const topicsMap = new Map();
        topicSnap.forEach(doc => {
            const topicData = doc.data();
            const subId = topicData.subCategoryId;
            if (!topicsMap.has(subId)) {
                topicsMap.set(subId, []);
            }
            topicsMap.get(subId).push({
                id: doc.id,
                name: topicData.name,
                dynamicFields: topicData.dynamicFields || [],
            });
        });
        const subCategoriesMap = new Map();
        subSnap.forEach(doc => {
            const subData = doc.data();
            const mainId = subData.mainCategoryId;
            if (!subCategoriesMap.has(mainId)) {
                subCategoriesMap.set(mainId, []);
            }
            subCategoriesMap.get(mainId).push({
                id: doc.id,
                name: subData.name,
                dynamicFields: subData.dynamicFields || [],
                topics: topicsMap.get(doc.id) || [],
            });
        });
        const finalConfig = [];
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
    }
    catch (error) {
        console.error("Error in /project-config (V2):", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ [ใหม่ V11.3] Get Project Report Settings
app.get("/projects/:projectId/report-settings", async (req, res) => {
    try {
        const { projectId } = req.params;
        const projectRef = db.collection("projects").doc(projectId);
        const projectDoc = await projectRef.get();
        if (!projectDoc.exists) {
            return res.status(404).json({ success: false, error: "Project not found." });
        }
        const projectData = projectDoc.data();
        // ใช้ Default Settings ถ้าใน DB ไม่มีค่า
        const settings = (projectData === null || projectData === void 0 ? void 0 : projectData.reportSettings) || pdf_generator_1.DEFAULT_SETTINGS;
        // Merge defaults เพื่อให้แน่ใจว่ามีครบทุกคีย์
        const completeSettings = Object.assign(Object.assign({}, pdf_generator_1.DEFAULT_SETTINGS), settings);
        return res.json({ success: true, data: completeSettings });
    }
    catch (error) {
        console.error("Error fetching report settings:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
            data: pdf_generator_1.DEFAULT_SETTINGS // คืนค่า Default เมื่อเกิด Error
        });
    }
});
// ✅ Get Project Report Settings (V2 - อัปเดต Defaults & Logo)
app.post("/projects/:projectId/report-settings", async (req, res) => {
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
    }
    catch (error) {
        console.error("Error updating report settings:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ Endpoint สำหรับ Upload Logo โครงการ
// ✅ [แก้ไข V11.3] Endpoint สำหรับ Upload Logo โครงการ (แก้ไขปัญหา Busboy)
app.post("/projects/:projectId/upload-logo", async (req, res) => {
    var _a;
    const { projectId } = req.params;
    if (!((_a = req.headers['content-type']) === null || _a === void 0 ? void 0 : _a.startsWith('multipart/form-data'))) {
        return res.status(400).json({ success: false, error: 'Invalid Content-Type. Expected multipart/form-data.' });
    }
    // [ใหม่] ห่อหุ้ม Busboy ใน Promise
    return new Promise((resolve, reject) => {
        const busboy = (0, busboy_1.default)({
            headers: req.headers,
            limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
        });
        const bucket = (0, storage_1.getStorage)().bucket();
        let uploadPromise = null;
        let publicUrl = "";
        busboy.on('file', (fieldname, file, info) => {
            var _a;
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
            const fileExtension = ((_a = filename.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'png';
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
        busboy.on('error', (err) => {
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
                }
                else {
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
                }
                else if (!res.headersSent) {
                    // กรณีแปลกๆ ที่ uploadPromise สำเร็จ แต่ publicUrl ไม่มีค่า
                    res.status(500).json({ success: false, error: 'Upload finished but no URL was generated.' });
                    resolve(res);
                }
            }
            catch (err) {
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
        const storageResult = await (0, storage_2.uploadPhotoToStorage)({
            imageBuffer,
            filename,
            projectId,
            category: storageCategoryPath
        });
        photoData.filename = storageResult.filename;
        photoData.driveUrl = storageResult.publicUrl;
        photoData.filePath = storageResult.filePath;
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
// ✅ [แก้ไข] Generate PDF report (v8 - with Dynamic Settings)
app.post("/generate-report", async (req, res) => {
    var _a, _b;
    try {
        const { projectId, projectName, reportType, mainCategory, subCategory, dynamicFields, date } = req.body;
        if (!projectId || !reportType) {
            return res.status(400).json({
                success: false,
                error: "Missing projectId or reportType."
            });
        }
        // ===================================
        //  [ใหม่] Fetch Report Settings
        // ===================================
        let reportSettings = Object.assign({}, pdf_generator_1.DEFAULT_SETTINGS);
        try {
            const projectDoc = await db.collection("projects").doc(projectId).get();
            if (projectDoc.exists && ((_a = projectDoc.data()) === null || _a === void 0 ? void 0 : _a.reportSettings)) {
                const settingsFromDB = (_b = projectDoc.data()) === null || _b === void 0 ? void 0 : _b.reportSettings;
                // Merge defaults with DB settings to ensure all keys exist
                reportSettings = Object.assign(Object.assign({}, pdf_generator_1.DEFAULT_SETTINGS), settingsFromDB);
                console.log(`✅ Loaded custom report settings for ${projectId}: ${reportSettings.photosPerPage} photos/page`);
            }
            else {
                console.log(`⚠️ No custom report settings found for ${projectId}, using defaults.`);
            }
        }
        catch (settingsError) {
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
            const allTopics = topicsSnap.docs.map(doc => doc.data().name);
            if (allTopics.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: "No topics found."
                });
            }
            console.log(`✅ Found ${allTopics.length} total topics for the layout.`);
            const foundPhotos = await (0, pdf_generator_1.getLatestPhotos)(projectId, mainCategory, subCategory, allTopics, dynamicFields || {});
            console.log(`📸 Found and downloaded ${foundPhotos.length} photos.`);
            const fullLayoutPhotos = (0, pdf_generator_1.createFullLayout)(allTopics, foundPhotos);
            const reportData = {
                projectId,
                projectName: projectName || projectId,
                mainCategory,
                subCategory,
                dynamicFields: dynamicFields || {}
            };
            const qcReportSettings = Object.assign(Object.assign({}, reportSettings), { photosPerPage: reportSettings.qcPhotosPerPage // <-- แปลงค่า!
             });
            // ✅ [แก้ไข] ส่ง reportSettings เข้าไปด้วย
            const pdfBuffer = await (0, pdf_generator_1.generatePDF)(reportData, fullLayoutPhotos, qcReportSettings);
            console.log(`✅ QC PDF generated: ${pdfBuffer.length} bytes`);
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
            //  DAILY REPORT LOGIC
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
            const foundPhotos = await (0, pdf_generator_1.getDailyPhotosByDate)(projectId, date);
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
            const dailyReportSettings = Object.assign(Object.assign({}, reportSettings), { photosPerPage: reportSettings.dailyPhotosPerPage // <-- แปลงค่า!
             });
            // ✅ [แก้ไข] ส่ง reportSettings เข้าไปด้วย
            const pdfBuffer = await (0, pdf_generator_1.generateDailyPDFWrapper)(reportData, foundPhotos, dailyReportSettings);
            console.log(`✅ Daily PDF generated: ${pdfBuffer.length} bytes`);
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
// ... (คง Endpoint /checklist-status, /photos/:projectId, และ /project-config/... CRUD ทั้งหมดไว้เหมือนเดิม) ...
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
app.get("/photos/:projectId", async (req, res) => {
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
    }
    catch (error) {
        console.error("Error updating main category:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
app.delete("/project-config/:projectId/main-category/:mainCatId", async (req, res) => {
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
    }
    catch (error) {
        console.error("Error soft-deleting main category:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
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
        return res.status(201).json({ success: true, data: Object.assign({ id: newId }, newData) });
    }
    catch (error) {
        console.error("Error creating sub category:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
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
app.delete("/project-config/:projectId/sub-category/:subCatId", async (req, res) => {
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
    }
    catch (error) {
        console.error("Error soft-deleting sub category:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
app.post("/project-config/:projectId/topics", async (req, res) => {
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
        const addedTopics = [];
        for (const name of newTopicNames) {
            const trimmedName = name.trim();
            if (!trimmedName)
                continue;
            const newId = slugify(`${mainCategoryName}-${subCategoryName}-${trimmedName}`);
            const docRef = topicsCollectionRef.doc(newId);
            const newData = {
                name: trimmedName,
                subCategoryId: subCategoryId,
                isArchived: false
            };
            batch.create(docRef, newData);
            addedTopics.push(Object.assign({ id: newId }, newData));
        }
        if (addedTopics.length === 0) {
            return res.status(400).json({ success: false, error: "No valid topic names provided." });
        }
        await batch.commit();
        console.log(`✅ ${addedTopics.length} Topics created under: ${projectId}/${subCategoryId}`);
        return res.status(201).json({ success: true, data: addedTopics });
    }
    catch (error) {
        console.error("Error creating bulk topics:", error);
        if (error.code === 6) {
            return res.status(409).json({
                success: false,
                error: "การสร้างล้มเหลว: มีบางหัวข้อ (หรือ ID) ที่คุณพยายามเพิ่มซ้ำกับของเดิมที่มีอยู่"
            });
        }
        return res.status(500).json({ success: false, error: error.message });
    }
});
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
app.delete("/project-config/:projectId/topic/:topicId", async (req, res) => {
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
    }
    catch (error) {
        console.error("Error soft-deleting topic:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
app.post("/project-config/:projectId/sub-category/:subCatId/fields", async (req, res) => {
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