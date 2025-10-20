"use strict";
// Filename: qc-functions/src/index.ts (FINAL, COMPLETE, AND CORRECTED VERSION)
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
// ✅ Import all necessary functions
const pdf_generator_1 = require("./services/pdf-generator");
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
// ✅ RESTORED: Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        environment: IS_EMULATOR ? "emulator" : "production",
    });
});
// ✅ RESTORED: Your original /projects endpoint
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
// ✅ CORRECTED: Your project-config endpoint is correct as is
app.get("/project-config/:projectId", async (req, res) => {
    try {
        const { projectId } = req.params;
        const projectConfig = {};
        const mainCategoriesSnapshot = await db.collection("projectConfig").doc(projectId).collection("mainCategories").get();
        if (mainCategoriesSnapshot.empty) {
            return res.status(404).json({ success: false, error: "Config not found." });
        }
        for (const mainCategoryDoc of mainCategoriesSnapshot.docs) {
            const mainData = mainCategoryDoc.data();
            const mainName = mainData.name;
            projectConfig[mainName] = {};
            const subCategoriesSnapshot = await mainCategoryDoc.ref.collection("subCategories").get();
            for (const subCategoryDoc of subCategoriesSnapshot.docs) {
                const subData = subCategoryDoc.data();
                const subName = subData.name;
                const topicsSnapshot = await subCategoryDoc.ref.collection("topics").get();
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
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ CORRECTED: The name is reverted to "/upload-photo-base64" and the logic is type-safe
app.post("/upload-photo-base64", async (req, res) => {
    try {
        // Your frontend sends `photo`, not `photoBase64` in the body
        const { photo, projectId, reportType, category, topic, description, location, dynamicFields } = req.body;
        if (!photo || !projectId || !reportType) {
            return res.status(400).json({ success: false, error: "Missing required fields." });
        }
        let filenamePrefix;
        let photoData;
        if (reportType === 'QC') {
            if (!category || !topic) {
                return res.status(400).json({ success: false, error: "Missing QC fields." });
            }
            filenamePrefix = `${category}-${topic}`;
            photoData = {
                projectId, reportType, category, topic,
                location: location || "", dynamicFields: dynamicFields || {},
                filename: '', driveUrl: '', filePath: ''
            };
        }
        else if (reportType === 'Daily') {
            filenamePrefix = `Daily-${(description === null || description === void 0 ? void 0 : description.substring(0, 20)) || 'report'}`;
            photoData = {
                projectId, reportType, description: description || "",
                location: location || "", dynamicFields: dynamicFields || {},
                filename: '', driveUrl: '', filePath: '',
                category: '', topic: '' // Add required but empty fields
            };
        }
        else {
            return res.status(400).json({ success: false, error: "Invalid reportType." });
        }
        const imageBuffer = Buffer.from(photo, "base64");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${filenamePrefix}-${timestamp}.jpg`.replace(/\s/g, "_");
        // Use category for storage path for both QC and Daily
        const storageCategoryPath = reportType === 'QC' ? category : 'daily-reports';
        const storageResult = await (0, storage_1.uploadPhotoToStorage)({ imageBuffer, filename, projectId, category: storageCategoryPath });
        photoData.filename = storageResult.filename;
        photoData.driveUrl = storageResult.publicUrl;
        photoData.filePath = storageResult.filePath;
        const firestoreResult = await (0, firestore_1.logPhotoToFirestore)(photoData);
        return res.json({ success: true, data: Object.assign(Object.assign({}, firestoreResult), storageResult) });
    }
    catch (error) {
        console.error("Error in /upload-photo-base64:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ CORRECTED: The fully functional report generation endpoint
app.post("/generate-report", async (req, res) => {
    try {
        const { projectId, projectName, mainCategory, subCategory, dynamicFields } = req.body;
        if (!projectId || !mainCategory || !subCategory)
            return res.status(400).json({ success: false, error: "Missing required fields." });
        console.log(`📊 Generating report for ${projectName}`);
        const mainCategoriesSnap = await db.collection("projectConfig").doc(projectId).collection("mainCategories").where("name", "==", mainCategory).get();
        let allTopics = [];
        if (!mainCategoriesSnap.empty) {
            const subCategoriesSnap = await mainCategoriesSnap.docs[0].ref.collection("subCategories").where("name", "==", subCategory).get();
            if (!subCategoriesSnap.empty) {
                const topicsSnap = await subCategoriesSnap.docs[0].ref.collection("topics").orderBy("name").get();
                allTopics = topicsSnap.docs.map(doc => doc.data().name);
            }
        }
        if (allTopics.length === 0)
            return res.status(404).json({ success: false, error: "No topics found." });
        console.log(`✅ Found ${allTopics.length} total topics for the layout.`);
        const foundPhotos = await (0, pdf_generator_1.getLatestPhotos)(projectId, mainCategory, subCategory, allTopics, dynamicFields || {});
        console.log(`📸 Found and downloaded ${foundPhotos.length} photos.`);
        const fullLayoutPhotos = (0, pdf_generator_1.createFullLayout)(allTopics, foundPhotos);
        const reportData = { projectId, projectName: projectName || projectId, mainCategory, subCategory, dynamicFields: dynamicFields || {} };
        const pdfBuffer = await (0, pdf_generator_1.generatePDF)(reportData, fullLayoutPhotos);
        console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);
        const uploadResult = await (0, pdf_generator_1.uploadPDFToStorage)(pdfBuffer, reportData);
        return res.json({
            success: true,
            data: {
                filename: uploadResult.filename,
                publicUrl: uploadResult.publicUrl,
                totalTopics: allTopics.length,
                photosFound: foundPhotos.length
            }
        });
    }
    catch (error) {
        console.error("❌ Error generating report:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ RESTORED: Your original /photos/:projectId endpoint
app.get("/photos/:projectId", async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!projectId)
            return res.status(400).json({ success: false, error: "Project ID is required" });
        const qcPhotosPromise = db.collection("qcPhotos").where("projectId", "==", projectId).get();
        const dailyPhotosPromise = db.collection("dailyPhotos").where("projectId", "==", projectId).get();
        const [qcSnapshot, dailySnapshot] = await Promise.all([qcPhotosPromise, dailyPhotosPromise]);
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
        return res.status(500).json({ success: false, error: error.message });
    }
});
exports.api = (0, https_1.onRequest)({
    region: "asia-southeast1",
    memory: "2GiB",
    timeoutSeconds: 540,
}, app);
//# sourceMappingURL=index.js.map