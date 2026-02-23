"use strict";
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
// Filename: qc-functions/src/index.ts (VERSION 8 - Dynamic PDF Settings)
const admin = __importStar(require("firebase-admin"));
const storage_1 = require("firebase-admin/storage");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const express_1 = __importDefault(require("express")); // [แก้ไข] import express Router ด้วย
const cors_1 = __importDefault(require("cors"));
const crypto_1 = require("crypto");
// ✅ [แก้ไข] Import ReportSettings (ต้องสร้าง Interface นี้ใน pdf-generator.ts ด้วย)
const pdf_generator_1 = require("./services/pdf-generator");
const firestore_2 = require("./api/firestore");
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
function createStableReportId(reportType, mainCategory, subCategory, dynamicFields, date) {
    if (reportType === 'Daily') {
        return `daily_${date || 'no-date'}`;
    }
    // สำหรับ QC
    const fieldString = dynamicFields
        ? Object.keys(dynamicFields).sort().map(k => `${k}=${dynamicFields[k]}`).join('&')
        : '';
    const combinedString = `qc_${mainCategory || ''}_${subCategory || ''}_${fieldString}`;
    // ใช้ Hash เพื่อให้ ID สั้นและไม่ซ้ำกันสำหรับแต่ละ Filter
    return (0, crypto_1.createHash)('sha256').update(combinedString).digest('hex').substring(0, 20);
}
// ✅ --- [เพิ่มใหม่] ---
// ฟังก์ชันสร้าง ID ที่ไม่ซ้ำกันสำหรับ QC Photo (จาก projectId, category, topic, dynamicFields)
function createStableQcId(projectId, category, topic, dynamicFields) {
    const sortedFields = Object.keys(dynamicFields || {}).sort()
        .map(key => `${key}=${(dynamicFields[key] || '').toLowerCase().trim()}`) // <-- ✅ แก้ไขบรรทัดนี้
        .join('&');
    const rawId = `${projectId}|${category}|${topic}|${sortedFields}`;
    return (0, crypto_1.createHash)('md5').update(rawId).digest('hex');
}
// ✅ --- [จบส่วนเพิ่มใหม่] ---
const NEW_PROJECT_ID = "tts2004-smart-report-generate";
// ✅ [แก้ไข] ระบุชื่อ Bucket ที่ถูกต้องของคุณที่นี่
const CORRECT_BUCKET_NAME = "tts2004-smart-report-generate.firebasestorage.app";
if (!admin.apps.length) {
    if (IS_EMULATOR) {
        console.log("🔧 Running in EMULATOR mode (with Service Account)");
        // TODO: ควรเปลี่ยนไปใช้ Service Account ของโปรเจกต์ใหม่ด้วย
        const serviceAccount = require("../keys/tts2004-smart-report-generate-firebase-adminsdk-fbsvc-6e20b0c418.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: CORRECT_BUCKET_NAME // <-- ✅ แก้ไขเป็นชื่อที่ถูกต้อง
        });
    }
    else {
        console.log("🚀 Running in PRODUCTION mode");
        admin.initializeApp({
            storageBucket: CORRECT_BUCKET_NAME // <-- ✅ แก้ไขเป็นชื่อที่ถูกต้อง
        });
    }
}
const db = (0, firestore_1.getFirestore)();
// --- [แก้ไข] ---
const checkAuth = async (req, res, next) => {
    // ✅ อนุญาตให้เรียก API ดูรายชื่อโครงการได้โดยไม่ต้องล็อกอิน (หน้าสมัครสมาชิก)
    if (req.method === 'GET' && req.path === '/projects') {
        return next();
    }
    // 1.1 ตรวจสอบว่ามี Header 'Authorization' (ตั๋ว) ส่งมาไหม
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        console.warn("Auth Error: No token provided.");
        return res.status(403).json({ success: false, error: 'Unauthorized: No token provided.' });
    }
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
        // 1.2 ตรวจสอบว่า Token ถูกต้องหรือไม่
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        // 1.3 [สำคัญ] ดึงข้อมูล Role/Status จาก Firestore
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            console.warn(`Auth Error: User doc not found for UID: ${uid}`);
            return res.status(403).json({ success: false, error: 'User profile not found.' });
        }
        const userProfile = userDoc.data();
        if ((userProfile === null || userProfile === void 0 ? void 0 : userProfile.status) !== 'approved') {
            console.warn(`Auth Error: User ${userProfile === null || userProfile === void 0 ? void 0 : userProfile.email} is not approved (status: ${userProfile === null || userProfile === void 0 ? void 0 : userProfile.status}).`);
            // ส่ง 401 (Unauthorized) แทน 403 (Forbidden) 
            // เพื่อให้ Frontend รู้ว่าต้องแสดงหน้า "รออนุมัติ"
            return res.status(401).json({ success: false, error: 'Account not approved.' });
        }
        // 1.4 แนบข้อมูล User (รวมถึง Role) ไปกับ Request
        //     เพื่อให้ API หลัก (เช่น /generate-report) รู้ว่าใครขอมา
        req.user = Object.assign({ uid }, userProfile);
        // 1.5 ไปยังขั้นตอนต่อไป (API หลัก)
        return next();
    }
    catch (error) {
        console.error("Auth Error: Invalid token.", error);
        return res.status(403).json({ success: false, error: 'Unauthorized: Invalid token.' });
    }
    return;
};
const checkRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            res.status(401).json({ success: false, error: 'Unauthorized: No user role found.' });
            return; // <-- [แก้ไข]
        }
        if (roles.includes(req.user.role)) {
            return next();
        }
        res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions.' });
        return; // <-- [แก้ไข]
    };
};
// 1. สร้าง App หลัก
const mainApp = (0, express_1.default)();
mainApp.use((0, cors_1.default)({ origin: true }));
// 2. ใช้ json parser กับ App หลัก เพื่อให้ทุก route รับ json body ได้
mainApp.use(express_1.default.json({ limit: "10mb" }));
// 3. สร้าง Router ใหม่สำหรับ API
const apiRouter = express_1.default.Router();
apiRouter.use((0, cors_1.default)({ origin: true }));
apiRouter.use(express_1.default.json({ limit: "50mb" }));
apiRouter.use(checkAuth); // ✅ บังคับ Check Auth ทุก Route ใน apiRouter
// --- จบการแก้ไข ---
// --- API ROUTES ---
// (Moved checkAuth/checkRole to top)
// ... (คง Endpoint /health, /projects, /project-config, /projects/:projectId/report-settings ไว้เหมือนเดิม) ...
// --- [แก้ไข] เปลี่ยน "app." ทั้งหมดเป็น "apiRouter." ---
// ✅ Health check endpoint
apiRouter.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        environment: IS_EMULATOR ? "emulator" : "production",
        version: "8.0" // <-- [ใหม่] อัปเดตเวอร์ชัน
    });
});
// ✅ Get all active projects
apiRouter.get("/projects", async (req, res) => {
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
// [แก้ไข] ใช้ middleware กับ apiRouter
apiRouter.use(checkAuth);
apiRouter.get("/admin/users", checkAuth, checkRole(['admin', 'god']), async (req, res) => {
    try {
        // [แก้ไข] สั่งดึงข้อมูล 3 อย่างพร้อมกัน (Parallel)
        const [listUsersResult, firestoreUsersSnap, projectsSnap] = await Promise.all([
            admin.auth().listUsers(),
            db.collection('users').get(),
            db.collection('projects').get()
        ]);
        // ✅ [ใหม่] 2. ดึงข้อมูล Projects ทั้งหมดมาสร้าง Map
        const projectsMap = new Map();
        projectsSnap.forEach(doc => {
            projectsMap.set(doc.id, doc.data().projectName || doc.id); // เก็บ projectName
        });
        const firestoreUsersData = {};
        firestoreUsersSnap.forEach(doc => {
            firestoreUsersData[doc.id] = doc.data();
        });
        // 3. รวมข้อมูล (เหมือนเดิม)
        const combinedUsers = listUsersResult.users.map(userRecord => {
            const firestoreData = firestoreUsersData[userRecord.uid] || {};
            // ✅ [ใหม่] 4. เพิ่ม assignedProjectName จาก Map
            const assignedProjectId = firestoreData.assignedProjectId || null;
            const assignedProjectName = assignedProjectId
                ? projectsMap.get(assignedProjectId) // ดึงชื่อจาก Map
                : null;
            return {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: firestoreData.displayName || userRecord.displayName || 'N/A',
                role: firestoreData.role || 'user',
                status: firestoreData.status || 'unknown',
                assignedProjectId: assignedProjectId,
                assignedProjectName: assignedProjectName || assignedProjectId || 'N/A' // ส่งชื่อกลับไป
            };
        });
        // ✅ --- [เพิ่มส่วนนี้] ---
        // 4. กรองข้อมูลตาม Role ของ "ผู้ที่ร้องขอ" (Requester)
        const requesterUser = req.user;
        if (requesterUser.role === 'admin') {
            // ถ้าเป็น Admin, กรองให้เหลือเฉพาะโครงการของตัวเอง
            const adminProjectId = requesterUser.assignedProjectId;
            const filteredUsers = combinedUsers.filter(user => user.assignedProjectId === adminProjectId);
            res.status(200).json({ success: true, data: filteredUsers });
        }
        else if (requesterUser.role === 'god') {
            // ถ้าเป็น God, ส่งให้ทั้งหมด (แบบเดิม)
            res.status(200).json({ success: true, data: combinedUsers });
        }
        else {
            // (เผื่อไว้สำหรับ Role อื่นๆ ที่อาจหลุดเข้ามา)
            res.status(403).json({ success: false, error: "Insufficient permissions." });
        }
        // ✅ --- [จบส่วนที่เพิ่ม] ---
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
apiRouter.post("/projects", checkAuth, checkRole(['god']), async (req, res) => {
    try {
        const { projectName } = req.body;
        if (!projectName || typeof projectName !== 'string' || projectName.trim() === '') {
            return res.status(400).json({ success: false, error: "Missing 'projectName'." });
        }
        const trimmedName = projectName.trim();
        // 1. สร้าง Doc ใน 'projects' (ให้ Firestore สร้าง ID)
        const newProjectRef = db.collection('projects').doc(); // สร้าง Ref ID ใหม่
        // 2. สร้าง Doc ใน 'projectConfig' โดยใช้ ID เดียวกัน
        const newConfigRef = db.collection('projectConfig').doc(newProjectRef.id);
        // 3. ใช้ Batch Write เพื่อให้มั่นใจว่าสร้างสำเร็จทั้งคู่
        const batch = db.batch();
        batch.set(newProjectRef, {
            projectName: trimmedName,
            isActive: true,
            reportSettings: pdf_generator_1.DEFAULT_SETTINGS // (ใช้ DEFAULT_SETTINGS ที่ import มา)
        });
        // สร้าง Config เริ่มต้น (ว่างเปล่า)
        // (สำคัญมาก! ไม่งั้นหน้า Admin Config จะพังเมื่อพยายามอ่าน 'collections')
        batch.set(newConfigRef, {
        // ปล่อยว่างไว้ ให้ Admin ไปสร้าง MainCategory เองทีหลัง
        });
        await batch.commit();
        // ส่งข้อมูลโปรเจกต์ใหม่กลับไป
        const newProjectData = {
            id: newProjectRef.id,
            projectName: trimmedName,
            isActive: true,
            reportSettings: pdf_generator_1.DEFAULT_SETTINGS
        };
        return res.status(201).json({ success: true, data: newProjectData });
    }
    catch (error) {
        console.error("Error creating new project:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * (Admin) อัปเดตสถานะผู้ใช้ (อนุมัติ/ปฏิเสธ)
 * (ต้องเป็น Admin หรือ God)
 */
apiRouter.post("/admin/update-status/:uid", checkAuth, checkRole(['admin', 'god']), async (req, res) => {
    try {
        const { uid } = req.params;
        const { status } = req.body; // รับ 'approved' หรือ 'rejected'
        if (!uid || !status || (status !== 'approved' && status !== 'rejected')) {
            return res.status(400).json({ success: false, error: 'Invalid uid or status' });
        }
        const userDocRef = db.collection('users').doc(uid);
        await userDocRef.update({ status: status });
        return res.status(200).json({ success: true, data: { uid, newStatus: status } });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * (God) ตั้งค่า Role ผู้ใช้
 * (ต้องเป็น God เท่านั้น)
 */
apiRouter.post("/admin/set-role/:uid", checkAuth, checkRole(['god']), async (req, res) => {
    try {
        const { uid } = req.params;
        const { role } = req.body; // รับ 'user', 'admin', หรือ 'god'
        if (!uid || !role || !['user', 'admin', 'god'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid uid or role' });
        }
        // 1. อัปเดตใน Auth Custom Claims (สำคัญต่อความปลอดภัยของ Rules)
        await admin.auth().setCustomUserClaims(uid, { role: role });
        // 2. อัปเดตใน Firestore (เพื่อให้ UI แสดงผลถูกต้อง)
        const userDocRef = db.collection('users').doc(uid);
        await userDocRef.update({ role: role });
        return res.status(200).json({ success: true, data: { uid, newRole: role } });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ Get project configuration
apiRouter.get("/project-config/:projectId", async (req, res) => {
    const user = req.user;
    const { projectId } = req.params;
    // [ใหม่] ตรวจสอบสิทธิ์: User ทั่วไปสามารถดูได้เฉพาะ Config โครงการตัวเอง (ยกเว้น God)
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied to this project config.' });
    }
    try {
        // const { projectId } = req.params; // (ประกาศซ้ำซ้อน)
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
            // ✅ --- START: ส่วนที่แก้ไข ---
            // 1. ดึงหัวข้อที่เรียงตามตัวอักษร (แบบเดิม)
            const alphabeticalTopics = topicsMap.get(doc.id) || [];
            // 2. ดึงลำดับที่ถูกต้อง (ที่เพิ่งบันทึก)
            const customOrder = subData.topicOrder;
            let sortedTopics = alphabeticalTopics; // ใช้แบบเดิม ถ้าไม่มี customOrder
            // 3. ถ้ามี customOrder ให้จัดเรียงใหม่เดี๋ยวนี้
            if (customOrder) {
                sortedTopics = alphabeticalTopics.sort((a, b) => {
                    const indexA = customOrder.indexOf(a.name);
                    const indexB = customOrder.indexOf(b.name);
                    // ถ้าเจอทั้งคู่ใน Array, เรียงตาม Array
                    if (indexA !== -1 && indexB !== -1) {
                        return indexA - indexB;
                    }
                    // ถ้าเจอแค่ A, ให้ A มาก่อน
                    if (indexA !== -1)
                        return -1;
                    // ถ้าเจอแค่ B, ให้ B มาก่อน
                    if (indexB !== -1)
                        return 1;
                    // ถ้าไม่เจอทั้งคู่ (เช่น topic ที่ถูกลบไปแล้ว) ก็เรียงตามตัวอักษร
                    return a.name.localeCompare(b.name);
                });
            }
            // ✅ --- END: ส่วนที่แก้ไข ---
            subCategoriesMap.get(mainId).push({
                id: doc.id,
                name: subData.name,
                dynamicFields: subData.dynamicFields || [],
                fieldDependencies: subData.fieldDependencies, // <-- ✅ เพิ่ม fieldDependencies ส่งกลับไปด้วย
                topics: sortedTopics, // <-- 4. ใช้ตัวแปรที่จัดเรียงแล้ว
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
            return res.json({
                success: true,
                data: []
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
apiRouter.get("/projects/:projectId/report-settings", async (req, res) => {
    const user = req.user;
    const { projectId } = req.params;
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied to settings.' });
    }
    try {
        // const { projectId } = req.params; // (ประกาศซ้ำซ้อน)
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
apiRouter.post("/projects/:projectId/report-settings", async (req, res) => {
    const user = req.user;
    const { projectId } = req.params;
    if (user.role === 'user') { // User ทั่วไปห้ามแก้ไข
        return res.status(403).json({ success: false, error: 'Only Admins can change settings.' });
    }
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        // const { projectId } = req.params; // (ประกาศซ้ำซ้อน)
        const newSettings = req.body;
        // (Validate)
        if (newSettings.qcPhotosPerPage && (typeof newSettings.qcPhotosPerPage !== 'number' || ![1, 2, 4, 6].includes(newSettings.qcPhotosPerPage))) {
            newSettings.qcPhotosPerPage = 6;
        }
        if (newSettings.dailyPhotosPerPage && (typeof newSettings.dailyPhotosPerPage !== 'number' || ![1, 2, 4, 6].includes(newSettings.dailyPhotosPerPage))) {
            newSettings.dailyPhotosPerPage = 6;
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
apiRouter.post("/projects/:projectId/upload-logo/:slot", async (req, res) => {
    // [ใหม่] ตรวจสอบสิทธิ์ (เฉพาะ Admin/God)
    const user = req.user;
    const { projectId, slot } = req.params; // ✅ [แก้ไข] ดึง slot จาก params
    // ✅ [ใหม่] ตรวจสอบ slot
    if (!['left', 'center', 'right'].includes(slot)) {
        return res.status(400).json({ success: false, error: 'Invalid logo slot (must be left, center, or right).' });
    }
    if (user.role === 'user') {
        return res.status(403).json({ success: false, error: 'Only Admins can upload logo.' });
    }
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        console.log(`--- BASE64 LOGO HANDLER (Slot: ${slot}) ---`);
        const { logoBase64 } = req.body;
        if (!logoBase64) {
            return res.status(400).json({ success: false, error: "No logoBase64 was uploaded." });
        }
        // 2. แยกส่วนข้อมูลและ MimeType
        const matches = logoBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ success: false, error: 'Invalid Base64 string format.' });
        }
        const mimeType = matches[1];
        const cleanBase64 = matches[2];
        if (!mimeType.startsWith('image/')) {
            return res.status(400).json({ success: false, error: 'Invalid file type. Only images are allowed.' });
        }
        // 3. แปลง Base64 กลับเป็น Buffer
        const fileBuffer = Buffer.from(cleanBase64, "base64");
        // 4. อัปโหลด Buffer ไปยัง Storage
        const bucket = (0, storage_1.getStorage)().bucket(CORRECT_BUCKET_NAME);
        const fileExtension = mimeType.split('/')[1] || 'png';
        const uniqueFilename = `logo_${slot}_${Date.now()}.${fileExtension}`; // ✅ [แก้ไข] เพิ่ม slot ในชื่อไฟล์
        const filePath = `logos/${projectId}/${uniqueFilename}`;
        const fileUpload = bucket.file(filePath);
        console.log(`Uploading logo buffer to: ${filePath}`);
        // 5. ใช้ .save() กับ Buffer
        await fileUpload.save(fileBuffer, {
            metadata: { contentType: mimeType, cacheControl: 'public, max-age=3600' },
            public: true,
        });
        const publicUrl = fileUpload.publicUrl();
        console.log(`Logo uploaded successfully: ${publicUrl}`);
        // ✅ [แก้ไข] 6. บันทึก URL ลง Firestore (ส่วนที่สำคัญที่สุด)
        const projectRef = db.collection("projects").doc(projectId);
        // เราใช้ Dot notation เพื่ออัปเดต field ภายใน map
        // เช่น projectLogos.left = "url..."
        const updatePath = `reportSettings.projectLogos.${slot}`;
        await projectRef.set({
            reportSettings: {
                projectLogos: {
                    [slot]: publicUrl // <-- [แก้ไข] ใช้ [slot] เพื่อระบุ key (left, center, right)
                }
            }
        }, { merge: true }); // merge: true สำคัญมาก
        // 7. ส่ง Response สำเร็จ
        return res.json({ success: true, data: { logoUrl: publicUrl, slot: slot } });
    }
    catch (err) {
        console.error('Error during Base64 upload or Storage save:', err);
        return res.status(500).json({ success: false, error: `Error processing file: ${err.message}` });
    }
});
// ✅ Upload photo with base64
apiRouter.post("/upload-photo-base64", async (req, res) => {
    const user = req.user;
    let projectIdFromBody = req.body.projectId; // (ใช้ let เพราะอาจต้องแก้)
    // 1. ตรวจสอบสถานะ "approved"
    if (user.status !== 'approved') {
        return res.status(403).json({ success: false, error: 'Account not approved.' });
    }
    // 2. ตรวจสอบว่าอัปโหลดเข้า Project ตัวเองหรือไม่ (ยกเว้น God)
    if (user.role !== 'god' && user.assignedProjectId !== projectIdFromBody) {
        console.warn(`User ${user.email} (role ${user.role}) trying to upload to ${projectIdFromBody} but is assigned to ${user.assignedProjectId}`);
        // (ทางเลือก: บังคับให้เป็น Project ID ของ User)
        // projectIdFromBody = user.assignedProjectId;
        // (ทางเลือก: ปฏิเสธ)
        return res.status(403).json({ success: false, error: 'Project mismatch. Cannot upload to this project.' });
    }
    try {
        // ✅✅✅ --- START OF FIX --- ✅✅✅
        const { photoBase64, // <-- [แก้ไข] เปลี่ยนจาก 'photo'
        // projectId, (ใช้ projectIdFromBody แทน)
        reportType, category, topic, description, location, dynamicFields } = req.body;
        // [แก้ไข] เปลี่ยน 'photo' เป็น 'photoBase64'
        if (!photoBase64 || !projectIdFromBody || !reportType) {
            // ✅✅✅ --- END OF FIX --- ✅✅✅
            return res.status(400).json({
                success: false,
                error: "Missing required fields."
            });
        }
        let filenamePrefix;
        let photoData;
        let stableQcId = null; // (ตัวแปรสำหรับ ID ใหม่)
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
                projectId: projectIdFromBody,
                reportType,
                category,
                topic,
                location: location || "",
                dynamicFields: dynamicFields || {},
                filename: '',
                driveUrl: '',
                filePath: ''
            };
            // ✅ --- [เพิ่มใหม่] ---
            // สร้าง Stable ID สำหรับ 'latestQcPhotos'
            stableQcId = createStableQcId(projectIdFromBody, category, topic, dynamicFields || {});
            // ✅ --- [จบส่วนเพิ่มใหม่] ---
        }
        else if (reportType === 'Daily') {
            filenamePrefix = `Daily-${(description === null || description === void 0 ? void 0 : description.substring(0, 20)) || 'report'}`;
            photoData = {
                projectId: projectIdFromBody,
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
        // ✅✅✅ --- START OF FIX --- ✅✅✅
        let cleanBase64 = photoBase64; // <-- [แก้ไข] เปลี่ยนจาก 'photo'
        // ✅✅✅ --- END OF FIX --- ✅✅✅
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
        // (Comment out JPEG check - might cause issues with PNGs/HEIC)
        // if (imageBuffer[0] !== 0xFF || imageBuffer[1] !== 0xD8) {
        //   console.error('❌ Invalid JPEG header:', imageBuffer.slice(0, 10));
        //   throw new Error('Invalid image data: not a valid JPEG');
        // }
        // console.log('✅ Valid JPEG image detected');
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${filenamePrefix}-${timestamp}.jpg`.replace(/\s/g, "_");
        const storageCategoryPath = reportType === 'QC'
            ? category.replace(/\s*>\s*/g, "_")
            : 'daily-reports';
        const storageResult = await (0, storage_2.uploadPhotoToStorage)({
            imageBuffer,
            filename,
            projectId: projectIdFromBody,
            category: storageCategoryPath
        });
        photoData.filename = storageResult.filename;
        photoData.driveUrl = storageResult.publicUrl;
        photoData.filePath = storageResult.filePath;
        // 1. บันทึกลง Collection หลัก (qcPhotos หรือ dailyPhotos)
        const firestoreResult = await (0, firestore_2.logPhotoToFirestore)(photoData);
        // ✅ --- [ลบออก] ---
        // ไม่ต้องอัปเดต 'latestQcPhotos' แล้ว เพราะเรา Query จาก 'qcPhotos' โดยตรง
        // (เพื่อลด Write Operation และรองรับข้อมูลเก่า)
        /*
        if (reportType === 'QC' && stableQcId) {
          console.log(`Updating latestQcPhotos for ID: ${stableQcId}`);
          await db.collection('latestQcPhotos').doc(stableQcId).set({
            ...photoData,
            createdAt: FieldValue.serverTimestamp()
          });
        }
        */
        // ✅ --- [จบส่วนลบออก] ---
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
apiRouter.post("/generate-report", async (req, res) => {
    var _a, _b;
    const user = req.user;
    const { projectId } = req.body;
    // 1. ตรวจสอบสถานะ "approved"
    if (user.status !== 'approved') {
        return res.status(403).json({ success: false, error: 'Account not approved.' });
    }
    // 2. ตรวจสอบว่าสร้าง Report ของ Project ตัวเองหรือไม่ (ยกเว้น God)
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Project mismatch. Cannot generate report.' });
    }
    try {
        const { projectId, projectName, reportType, mainCategory, subCategory, dynamicFields, date } = req.body;
        // ... (ส่วนการตรวจสอบ projectId, reportType, และ Fetch Report Settings เหมือนเดิม) ...
        let reportSettings = Object.assign({}, pdf_generator_1.DEFAULT_SETTINGS);
        try {
            const projectDoc = await db.collection("projects").doc(projectId).get();
            if (projectDoc.exists && ((_a = projectDoc.data()) === null || _a === void 0 ? void 0 : _a.reportSettings)) {
                reportSettings = Object.assign(Object.assign({}, pdf_generator_1.DEFAULT_SETTINGS), (_b = projectDoc.data()) === null || _b === void 0 ? void 0 : _b.reportSettings);
            }
        }
        catch (settingsError) {
            console.error(`❌ Error fetching report settings:`, settingsError);
        }
        console.log(`📊 Generating ${reportType} report (Overwrite Mode) for ${projectName}`);
        // ✅ [ใหม่] 1. สร้าง Stable ID และ Stable Filename
        const stableDocId = createStableReportId(reportType, mainCategory, subCategory, dynamicFields, date);
        let stableFilename = ""; // เราจะกำหนดชื่อไฟล์ให้เสถียร (ไม่มี Timestamp)
        // ✅ [ใหม่] 2. สร้างตัวแปรสำหรับเก็บข้อมูล Metadata
        let generatedReportData = {};
        const reportTimestamp = firestore_1.FieldValue.serverTimestamp(); // <-- (ต้องแน่ใจว่าใช้ FieldValue จาก v10)
        let pdfBuffer;
        let responseData = {};
        // ===================================
        //  QC REPORT LOGIC
        // ===================================
        if (reportType === 'QC') {
            if (!mainCategory || !subCategory) {
                return res.status(400).json({ success: false, error: "Missing QC fields." });
            }
            // ... (Logic การหา allTopics, foundPhotos, fullLayoutPhotos เหมือนเดิม) ...
            const projectConfigRef = db.collection("projectConfig").doc(projectId);
            const mainCatSnap = await projectConfigRef.collection("mainCategories").where("name", "==", mainCategory).limit(1).get();
            if (mainCatSnap.empty)
                return res.status(404).json({ success: false, error: "Main category not found." });
            const mainCatId = mainCatSnap.docs[0].id;
            const subCatSnap = await projectConfigRef.collection("subCategories").where("name", "==", subCategory).where("mainCategoryId", "==", mainCatId).limit(1).get();
            if (subCatSnap.empty)
                return res.status(404).json({ success: false, error: "Sub category not found." });
            console.log(`[generate-report] Calling getTopicsForFilter to get sorted topics...`);
            const allTopics = await (0, pdf_generator_1.getTopicsForFilter)(db, projectId, mainCategory, subCategory);
            if (allTopics.length === 0)
                return res.status(404).json({ success: false, error: "No topics found." });
            // ✅ --- [แก้ไข] ---
            // (นี่คือจุดที่ Error เกิดขึ้น)
            // เราจะเรียก getLatestPhotos (เวอร์ชันใหม่) ที่ไม่ต้องใช้ Index
            console.log('Calling NEW getLatestPhotos function...');
            const foundPhotos = await (0, pdf_generator_1.getLatestPhotos)(projectId, mainCategory, subCategory, allTopics, dynamicFields || {});
            // ✅ --- [จบการแก้ไข] ---
            const fullLayoutPhotos = (0, pdf_generator_1.createFullLayout)(allTopics, foundPhotos);
            const reportData = { projectId, projectName, mainCategory, subCategory, dynamicFields: dynamicFields || {} };
            const qcReportSettings = Object.assign(Object.assign({}, reportSettings), { photosPerPage: reportSettings.qcPhotosPerPage });
            pdfBuffer = await (0, pdf_generator_1.generatePDF)(reportData, fullLayoutPhotos, qcReportSettings);
            // ✅ [ใหม่] สร้างชื่อไฟล์ที่เสถียร (ไม่มีเวลา)
            const fieldSlug = (dynamicFields && Object.keys(dynamicFields).length > 0)
                ? `_${Object.keys(dynamicFields).sort().map(key => slugify(String(dynamicFields[key] || ''))).join('_')}` // <-- ✅ แก้ไขบรรทัดนี้
                : '';
            stableFilename = `QC-Report_${slugify(mainCategory)}_${slugify(subCategory)}${fieldSlug}.pdf`;
            // เตรียม Metadata
            generatedReportData = {
                reportType: 'QC',
                createdAt: reportTimestamp, // อัปเดตเวลาที่สร้างล่าสุด
                filename: stableFilename,
                mainCategory: mainCategory,
                subCategory: subCategory,
                dynamicFields: dynamicFields || {},
                photosFound: foundPhotos.length,
                totalTopics: allTopics.length,
            };
            responseData = {
                filename: stableFilename,
                totalTopics: allTopics.length,
                photosFound: foundPhotos.length
            };
            // ===================================
            //  DAILY REPORT LOGIC
            // ===================================
        }
        else if (reportType === 'Daily') {
            if (!date) {
                return res.status(400).json({ success: false, error: "Missing Daily field (date)." });
            }
            // ... (Logic การหา foundPhotos เหมือนเดิม) ...
            const foundPhotos = await (0, pdf_generator_1.getDailyPhotosByDate)(projectId, date);
            if (foundPhotos.length === 0) {
                return res.status(404).json({ error: `ไม่พบรูปสำหรับวันที่ ${date}` });
            }
            const reportData = { projectId, projectName, date };
            const dailyReportSettings = Object.assign(Object.assign({}, reportSettings), { photosPerPage: reportSettings.dailyPhotosPerPage });
            pdfBuffer = await (0, pdf_generator_1.generateDailyPDFWrapper)(reportData, foundPhotos, dailyReportSettings);
            // ✅ [ใหม่] สร้างชื่อไฟล์ที่เสถียร
            stableFilename = `Daily-Report_${date}.pdf`;
            // เตรียม Metadata
            generatedReportData = {
                reportType: 'Daily',
                createdAt: reportTimestamp, // อัปเดตเวลาที่สร้างล่าสุด
                filename: stableFilename,
                reportDate: date,
                photosFound: foundPhotos.length,
                dynamicFields: {},
                mainCategory: "",
                subCategory: ""
            };
            responseData = {
                filename: stableFilename,
                photosFound: foundPhotos.length
            };
        }
        else {
            return res.status(400).json({ success: false, error: "Invalid reportType." });
        }
        // ===================================
        //  ✅ [ใหม่] 3. UPLOAD & SAVE (ส่วนที่แก้ไข)
        // ===================================
        // 3.1 Upload to Storage (ด้วยชื่อไฟล์ที่เสถียร)
        // การอัปโหลดไฟล์ไปยัง Path เดิม จะเป็นการ "เขียนทับ" ไฟล์เก่าใน Storage อัตโนมัติ
        const reportDataForUpload = { projectId, projectName, mainCategory, subCategory, dynamicFields, date }; // (ข้อมูลสำหรับ path)
        // เราส่ง stableFilename เข้าไปแทนการสร้างชื่อใหม่
        const uploadResult = await (0, pdf_generator_1.uploadPDFToStorage)(pdfBuffer, reportDataForUpload, reportType, stableFilename);
        console.log(`✅ PDF Overwritten in Storage: ${uploadResult.filePath}`);
        // 3.2 Save Metadata to Firestore (ด้วย Stable ID)
        const reportDocRef = db
            .collection('projects')
            .doc(projectId)
            .collection('generatedReports')
            .doc(stableDocId); // <-- ใช้ ID ที่เสถียร
        // เพิ่ม URL และ Path ที่ได้จากการอัปโหลด
        generatedReportData.publicUrl = uploadResult.publicUrl;
        generatedReportData.storagePath = uploadResult.filePath;
        // ✅ [ใหม่] Reset Notification เมื่อสร้างรายงานใหม่/อัปเดต
        generatedReportData.newPhotosCount = 0;
        generatedReportData.hasNewPhotos = false;
        generatedReportData.checkPhotoAt = admin.firestore.FieldValue.serverTimestamp(); // บันทึกเวลาที่เช็คล่าสุด
        // ใช้ .set() เพื่อ "สร้างหรือเขียนทับ" เอกสารใน Firestore
        await reportDocRef.set(generatedReportData, { merge: true }); // merge:true เผื่อไว้
        console.log(`✅ Firestore Metadata Overwritten: ${stableDocId}`);
        // 3.3 ส่ง Response กลับ
        return res.json({
            success: true,
            data: Object.assign(Object.assign({}, responseData), { publicUrl: uploadResult.publicUrl, firepath: uploadResult.filePath })
        });
    }
    catch (error) {
        console.error("❌ Error generating report (Overwrite Mode):", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
apiRouter.get("/photos/:projectId", async (req, res) => {
    // [ใหม่] (Optional) ตรวจสอบสิทธิ์
    const user = req.user;
    const { projectId } = req.params;
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        // const { projectId } = req.params; // (ประกาศซ้ำซ้อน)
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
const checkAdminOrGod = (req, res, next) => {
    const user = req.user;
    const { projectId } = req.params;
    if (user.role === 'user') {
        return res.status(403).json({ success: false, error: 'Only Admins or God can modify config.' });
    }
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Admin access denied for this project.' });
    }
    return next();
};
apiRouter.post("/project-config/:projectId/main-category/:mainCatId", checkAdminOrGod, async (req, res) => {
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
apiRouter.delete("/project-config/:projectId/main-category/:mainCatId", checkAdminOrGod, async (req, res) => {
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
apiRouter.post("/project-config/:projectId/main-categories", checkAdminOrGod, async (req, res) => {
    var _a;
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
        // [แก้ไข] ตรวจสอบว่าเอกสารนั้น "มีอยู่ และ ใช้งานอยู่ (active)" หรือไม่
        if (existingDoc.exists && ((_a = existingDoc.data()) === null || _a === void 0 ? void 0 : _a.isArchived) === false) {
            // ถ้ามีอยู่ และ isArchived เป็น false (คือยังใช้งานอยู่) ถึงจะเป็นการซ้ำจริง
            return res.status(409).json({
                success: false,
                error: `หมวดหมู่ชื่อ '${trimmedName}' (ID: ${newId}) ที่ "ใช้งานอยู่" มีอยู่แล้ว`
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
apiRouter.post("/project-config/:projectId/sub-categories", checkAdminOrGod, async (req, res) => {
    var _a;
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
        // [แก้ไข] ตรวจสอบว่า "มีอยู่ และ ใช้งานอยู่" หรือไม่
        if (existingDoc.exists && ((_a = existingDoc.data()) === null || _a === void 0 ? void 0 : _a.isArchived) === false) {
            return res.status(409).json({
                success: false,
                error: `หมวดหมู่ย่อยชื่อ '${trimmedName}' (ID: ${newId}) ที่ "ใช้งานอยู่" มีอยู่แล้ว`
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
apiRouter.post("/project-config/:projectId/sub-category/:subCatId", checkAdminOrGod, async (req, res) => {
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
apiRouter.delete("/project-config/:projectId/sub-category/:subCatId", checkAdminOrGod, async (req, res) => {
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
apiRouter.post("/project-config/:projectId/topics", checkAdminOrGod, async (req, res) => {
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
            batch.set(docRef, newData); // <-- [แก้ไข] เปลี่ยนเป็น .set() เพื่อให้เขียนทับได้
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
apiRouter.post("/project-config/:projectId/topic/:topicId", checkAdminOrGod, async (req, res) => {
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
apiRouter.delete("/project-config/:projectId/topic/:topicId", checkAdminOrGod, async (req, res) => {
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
apiRouter.post("/project-config/:projectId/sub-category/:subCatId/fields", checkAdminOrGod, async (req, res) => {
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
apiRouter.post("/project-config/:projectId/sub-category/:subCatId/topic-order", checkAdminOrGod, async (req, res) => {
    try {
        const { projectId, subCatId } = req.params;
        const { topicOrder } = req.body; // นี่คือ Array ของ string
        if (!Array.isArray(topicOrder)) {
            return res.status(400).json({ success: false, error: "'topicOrder' ต้องเป็น Array." });
        }
        const docRef = db
            .collection("projectConfig")
            .doc(projectId)
            .collection("subCategories")
            .doc(subCatId);
        // บันทึก Array ลง field ใหม่
        await docRef.update({
            topicOrder: topicOrder
        });
        console.log(`✅ Topic order updated for: ${projectId}/${subCatId}`);
        return res.json({ success: true, data: { id: subCatId, topicOrder: topicOrder } });
    }
    catch (error) {
        console.error("Error updating topic order:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
apiRouter.get("/projects/:projectId/shared-jobs", async (req, res) => {
    // [ใหม่] (Optional) ตรวจสอบสิทธิ์
    const user = req.user;
    const { projectId } = req.params;
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        // const { projectId } = req.params; // (ประกาศซ้ำซ้อน)
        const jobsSnapshot = await db
            .collection("projects") // <-- [สำคัญ] แก้ไข Collection หลักให้ถูกต้อง (ถ้าจำเป็น)
            .doc(projectId)
            .collection("sharedJobs") // <-- สร้าง Subcollection ใหม่ชื่อ 'sharedJobs'
            .where("status", "==", "pending") // <-- กรองเฉพาะงานที่ยังไม่เสร็จ
            .orderBy("lastUpdatedAt", "desc") // <-- เรียงตามวันที่อัปเดตล่าสุด
            // .limit(500) // <-- [แก้ไข] ปลด Limit ตามคำขอ (ระวังเรื่อง Performance ในระยะยาว)
            .get();
        if (jobsSnapshot.empty) {
            return res.json({ success: true, data: [] }); // ถ้าไม่มี ก็ส่ง array ว่างกลับไป
        }
        const jobs = jobsSnapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        return res.json({ success: true, data: jobs });
    }
    catch (error) {
        console.error("Error in GET /shared-jobs:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
async function checkHasNewPhotos(projectId, reportData, reportCreatedAt) {
    const debugLog = {
        reportId: reportData.filename,
        inputs: {
            reportCreatedAt: reportCreatedAt ? reportCreatedAt.toDate().toISOString() : 'N/A',
            dynamicFields: reportData.dynamicFields
        },
        query: {},
        result: 0
    };
    // ถ้าไม่มีเวลาอ้างอิง ก็ไม่ต้องเช็ค
    if (!reportCreatedAt)
        return { count: 0, debug: debugLog };
    try {
        if (reportData.reportType === 'QC') {
            const mainCat = (reportData.mainCategory || '').trim();
            const subCat = (reportData.subCategory || '').trim();
            const category = `${mainCat} > ${subCat}`;
            debugLog.inputs.category = category;
            // Query หา "รูปในหมวดนี้" ที่ "ใหม่กว่ารายงาน"
            // Query หา "รูปในหมวดนี้" ที่ "ใหม่กว่ารายงาน"
            // ✅ [FIX] ไม่ต้อง Filter Dynamic Fields ในท่อนนี้ เพื่อเลี่ยงปัญหา Index Missing
            // เราจะไป Filter ใน Memory แทน
            const query = db.collection('qcPhotos')
                .where('projectId', '==', projectId)
                .where('category', '==', category)
                .where('createdAt', '>', reportCreatedAt);
            debugLog.query = {
                collection: 'qcPhotos',
                projectId,
                category,
                minDate: reportCreatedAt.toDate().toISOString(),
                filters: 'In-Memory'
            };
            // ✅ Fetch documents (ยอม trade-off read operation เพื่อความชัวร์และแก้ index error)
            const snapshot = await query.get();
            let count = 0;
            const reportDynamicFields = reportData.dynamicFields || {};
            // ✅ In-Memory Filtering Matcher
            snapshot.forEach(doc => {
                const photoData = doc.data();
                const photoDynamicFields = photoData.dynamicFields || {};
                let isMatch = true;
                // เช็คว่า Photo นี้มี Dynamic Fields ตรงกับ Report หรือไม่
                for (const [key, reportValue] of Object.entries(reportDynamicFields)) {
                    // ใช้ String comparison เพื่อความชัวร์
                    const pVal = String(photoDynamicFields[key] || '').trim();
                    const rVal = String(reportValue || '').trim();
                    if (pVal !== rVal) {
                        isMatch = false;
                        break;
                    }
                }
                if (isMatch) {
                    count++;
                }
            });
            // ✅ Assign count ที่นับได้จริง
            // const count = snapshot.data().count; // Old way
            debugLog.result = count;
            if (count > 0) {
                console.log(`✅ Found ${count} new photos for report ${reportData.filename}`);
            }
            return { count, debug: debugLog };
        }
        else if (reportData.reportType === 'Daily') {
            // Daily Report
            const count = 0; // TODO: Implement Daily logic debug if needed
            return { count, debug: Object.assign(Object.assign({}, debugLog), { note: 'Daily report not fully debugged yet' }) };
        }
        else {
            return { count: 0, debug: debugLog };
        }
    }
    catch (error) {
        console.warn(`⚠️ Error checking new photos (Optimized):`, error);
        debugLog.error = error.message;
        return { count: 0, debug: debugLog };
    }
}
apiRouter.get("/projects/:projectId/generated-reports", async (req, res) => {
    // [ใหม่] (Optional) ตรวจสอบสิทธิ์
    const user = req.user;
    const { projectId } = req.params;
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        // const { projectId } = req.params; // (ประกาศซ้ำซ้อน)
        const _a = req.query, { reportType, mainCategory, subCategory, date } = _a, 
        // เพิ่มการอ่าน dynamicFields จาก query string
        dynamicFieldsQuery = __rest(_a, ["reportType", "mainCategory", "subCategory", "date"]) // ตัวแปรนี้จะเก็บ dynamicFields ทั้งหมด เช่น { 'dynamicFields[field1]': 'value1' }
        ;
        console.log(`🔍 Fetching generated reports for project ${projectId} with filter:`, req.query);
        if (!reportType || (reportType !== 'QC' && reportType !== 'Daily')) {
            return res.status(400).json({ success: false, error: "Missing or invalid 'reportType' query parameter (QC or Daily)." });
        }
        // สร้าง Query เริ่มต้นไปยัง Subcollection
        let query = db
            .collection('projects') // <-- ตรวจสอบ Collection หลัก
            .doc(projectId)
            .collection('generatedReports') // ใช้ subcollection ที่สร้างจาก migration script
            .where('reportType', '==', reportType);
        // --- เพิ่มเงื่อนไขการ Filter ตาม reportType ---
        if (reportType === 'QC') {
            if (mainCategory) {
                query = query.where('mainCategory', '==', mainCategory);
            }
            if (subCategory) {
                query = query.where('subCategory', '==', subCategory);
            }
            // Filter ด้วย Dynamic Fields (ถ้ามีส่งมา)
            Object.keys(dynamicFieldsQuery).forEach(key => {
                if (key.startsWith('dynamicFields[')) {
                    const fieldName = key.substring(14, key.length - 1); // ดึงชื่อ field ออกมา
                    const fieldValue = dynamicFieldsQuery[key];
                    if (fieldName && fieldValue) {
                        console.log(`  -> Filtering by dynamic field: ${fieldName} = ${fieldValue}`);
                        // ใช้ dot notation สำหรับ query field ที่อยู่ใน map
                        query = query.where(`dynamicFields.${fieldName}`, '==', fieldValue);
                    }
                }
            });
        }
        else if (reportType === 'Daily') {
            if (date) {
                query = query.where('reportDate', '==', date);
            }
            else {
                // (No filter needed)
            }
        }
        // --- ดึงข้อมูลและเรียงลำดับ ---
        const reportsSnapshot = await query
            .orderBy('createdAt', 'desc') // เรียงตามวันที่สร้างล่าสุด
            // .limit(500) // [แก้ไข] ปลด Limit ตามคำขอ
            .get();
        if (reportsSnapshot.empty) {
            console.log("  -> No matching reports found.");
            return res.json({ success: true, data: [] });
        }
        // --- ประมวลผลข้อมูล + [ชั่วคราว] เช็ค hasNewPhotos ---
        const reportDocs = reportsSnapshot.docs;
        const reportPromises = reportDocs.map(async (doc) => {
            const data = doc.data();
            const reportCreatedAt = data.createdAt;
            // --- [สำคัญ] เรียกใช้ฟังก์ชัน Helper ที่เราสร้าง ---
            // (นี่อาจจะเป็นจุดที่ช้า ถ้า Query ซับซ้อน)
            // const { count: newPhotosCount, debug } = await checkHasNewPhotos(projectId, data, reportCreatedAt);
            // --- จบส่วนแก้ไข ---
            // ✅ [Optimization] อ่านจาก Field โดยตรง (ไม่ต้อง Query ใหม่)
            const newPhotosCount = data.newPhotosCount || 0;
            return {
                reportId: doc.id,
                reportType: data.reportType,
                createdAt: reportCreatedAt && typeof reportCreatedAt.toDate === 'function'
                    ? reportCreatedAt.toDate().toISOString()
                    : new Date().toISOString(),
                filename: data.filename,
                publicUrl: data.publicUrl,
                storagePath: data.storagePath,
                firepath: data.storagePath,
                mainCategory: data.mainCategory,
                subCategory: data.subCategory,
                dynamicFields: data.dynamicFields,
                reportDate: data.reportDate,
                photosFound: data.photosFound,
                totalTopics: data.totalTopics,
                hasNewPhotos: newPhotosCount > 0, // <-- ยังคง field นี้ไว้เพื่อ compability
                newPhotosCount: newPhotosCount, // ✅ [ใหม่] ส่งจำนวนรูปใหม่ไปให้ Frontend
                debug: { note: 'Optimized Read (From Field)' } // ✅ [ใหม่] ส่ง Debug Info ไปด้วย
            };
        });
        // รอให้ทุก Promise (การเช็ค) ทำงานเสร็จ
        const reports = await Promise.all(reportPromises);
        // --- จบส่วนแก้ไข Promise.all ---
        console.log(`  -> Found ${reports.length} reports.`);
        return res.json({ success: true, data: reports });
    }
    catch (error) {
        console.error("Error in GET /generated-reports:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 2. POST /projects/:projectId/shared-jobs - สร้างหรืออัปเดตงาน
apiRouter.post("/projects/:projectId/shared-jobs", async (req, res) => {
    // [ใหม่] (Optional) ตรวจสอบสิทธิ์
    const user = req.user;
    const { projectId } = req.params;
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        // const { projectId } = req.params; // (ประกาศซ้ำซ้อน)
        // ตอนนี้ TypeScript รู้จัก 'SharedJob' แล้ว
        const jobData = req.body;
        // ตรวจสอบข้อมูลเบื้องต้น
        if (!jobData || !jobData.id || !jobData.reportType || !jobData.lastUpdatedAt) {
            return res.status(400).json({ success: false, error: "Missing required job data (id, reportType, lastUpdatedAt)." });
        }
        // กำหนด Document ID ให้ตรงกับ Job ID ที่ส่งมา
        const jobRef = db
            .collection("projects") // <-- [สำคัญ] แก้ไข Collection หลักให้ถูกต้อง (ถ้าจำเป็น)
            .doc(projectId)
            .collection("sharedJobs")
            .doc(jobData.id); // <-- ใช้ Job ID เป็น Document ID
        // ใช้ set + merge:true เพื่อสร้าง (ถ้ายังไม่มี) หรือ อัปเดต (ถ้ามีอยู่แล้ว)
        await jobRef.set(jobData, { merge: true });
        console.log(`✅ Shared Job saved/updated: ${projectId}/${jobData.id}`);
        return res.json({ success: true, data: { id: jobData.id, status: jobData.status } });
    }
    catch (error) {
        console.error("Error in POST /shared-jobs:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
apiRouter.get("/admin/pending-users", async (req, res) => {
    const user = req.user;
    // เฉพาะ Admin หรือ God เท่านั้น
    if (user.role === 'user') {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
    }
    try {
        let query = db.collection('users').where('status', '==', 'pending');
        // ถ้าเป็น Admin (ไม่ใช่ God) ให้เห็นแค่โครงการตัวเอง
        if (user.role === 'admin') {
            query = query.where('assignedProjectId', '==', user.assignedProjectId);
        }
        const snapshot = await query.get();
        const users = snapshot.docs.map(doc => doc.data());
        return res.json({ success: true, data: users });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});
// API สำหรับ Admin: อนุมัติ User
apiRouter.post("/admin/approve-user/:uidToApprove", async (req, res) => {
    var _a;
    const user = req.user;
    const { uidToApprove } = req.params;
    if (user.role === 'user') {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
    }
    try {
        const userToApproveRef = db.collection('users').doc(uidToApprove);
        const doc = await userToApproveRef.get();
        if (!doc.exists) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }
        // (God อนุมัติได้ทุกคน, Admin อนุมัติได้แค่คนในโครงการตัวเอง)
        if (user.role === 'admin' && ((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.assignedProjectId) !== user.assignedProjectId) {
            return res.status(403).json({ success: false, error: 'Cannot approve users outside your project.' });
        }
        await userToApproveRef.update({
            status: 'approved',
            approvedBy: user.uid,
            approvedAt: firestore_1.FieldValue.serverTimestamp()
        });
        return res.json({ success: true, data: { status: 'approved' } });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});
apiRouter.post("/checklist-status", async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    const user = req.user;
    const { projectId, reportType, // <-- [ใหม่] รับ reportType
    mainCategory, subCategory, dynamicFields, date // <-- [ใหม่] รับ date
     } = req.body;
    // 1. ตรวจสอบสิทธิ์ (เหมือนเดิม)
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        if (reportType === 'QC') {
            // --- Logic สำหรับ QC ---
            if (!projectId || !mainCategory || !subCategory || !dynamicFields) {
                console.error("Missing required QC fields:", { projectId, mainCategory, subCategory, dynamicFields });
                return res.status(400).json({
                    success: false,
                    error: `Missing required QC fields. (proj=${!!projectId}, main=${!!mainCategory}, sub=${!!subCategory}, dyn=${!!dynamicFields})`
                });
            }
            const category = `${mainCategory} > ${subCategory}`;
            // 1. หา "Total" (เรียกฟังก์ชันใหม่)
            const allTopics = await (0, pdf_generator_1.getTopicsForFilter)(db, projectId, mainCategory, subCategory);
            const total = allTopics.length;
            if (total === 0) {
                return res.status(404).json({ success: false, error: "ไม่พบหัวข้อสำหรับหมวดหมู่นี้" });
            }
            // 2. หา "Found" (เรียกฟังก์ชันเดิม)
            const statusMap = await (0, pdf_generator_1.getUploadedTopicStatus)(projectId, category, dynamicFields);
            const found = Object.keys(statusMap).length;
            // 3. ส่งข้อมูลกลับ
            return res.json({ success: true, data: { found, total, statusMap } });
        }
        else if (reportType === 'Daily') {
            // --- Logic สำหรับ Daily ---
            if (!projectId || !date) {
                return res.status(400).json({ success: false, error: "Missing required Daily fields (date)." });
            }
            // 1. นับจำนวนรูปในวันนั้น
            const startDate = new Date(`${date}T00:00:00+07:00`);
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 1);
            // [แก้ไข] ใช้ .count() เพื่อประสิทธิภาพ
            const query = db.collection("dailyPhotos")
                .where("projectId", "==", projectId)
                .where("createdAt", ">=", startDate) // ใช้ Timestamp object
                .where("createdAt", "<", endDate); // ใช้ Timestamp object
            const photosSnapshot = await query.count().get();
            const found = photosSnapshot.data().count;
            // 2. ส่งข้อมูลกลับ
            return res.json({ success: true, data: { found, total: 0 } }); // Daily ไม่มี Total
        }
        else {
            return res.status(400).json({ success: false, error: "Invalid reportType." });
        }
    }
    catch (error) {
        console.error("❌ Error in /checklist-status (V2):", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
apiRouter.get("/projects/:projectId/dynamic-field-values", async (req, res) => {
    const user = req.user;
    const { projectId } = req.params;
    const { subCategoryId } = req.query;
    console.log('🔍 GET /dynamic-field-values called:', { projectId, subCategoryId });
    // Check permissions
    if (user.role !== 'god' && user.assignedProjectId !== projectId) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        if (!subCategoryId) {
            return res.json({ success: true, data: {} });
        }
        // ✅ [แก้ไข 1] Query ข้อมูลจาก latestQcPhotos แทน qcPhotos (เร็วกว่า)
        const snapshot = await db.collection('latestQcPhotos')
            .where('projectId', '==', projectId)
            .get();
        console.log(`📊 Found ${snapshot.size} photos in latestQcPhotos`);
        // ✅ [แก้ไข 2] รวบรวมค่า dynamicFields โดยเช็ค category ที่ตรงกับ subCategory
        const fieldValuesMap = new Map();
        let matchCount = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            const category = data.category;
            // ✅ [แก้ไข 3] ปรับ logic การเช็ค category
            // category format: "งานโครงสร้าง > งานเสา"
            // subCategoryId format: "งานโครงสร้าง-งานเสา" (slug)
            if (category) {
                // 1. แปลง "A > B [C]" ให้เป็น "A-B [C]"
                const categoryToSlugify = category.replace(/\s*>\s*/g, '-');
                // 2. [แก้ไข] เรียกใช้ฟังก์ชัน slugify() ที่ถูกต้อง (ที่อยู่บรรทัด 66)
                //    ฟังก์ชันนี้จะลบ [] และจัดการ space ถูกต้อง
                const categorySlug = slugify(categoryToSlugify);
                const targetSlug = subCategoryId.toLowerCase();
                console.log(`Comparing: "${categorySlug}" vs "${targetSlug}"`);
                // 3. [แก้ไข] เปลี่ยน .includes() เป็นการเปรียบเทียบตรงๆ (===)
                if (categorySlug === targetSlug) {
                    matchCount++;
                    const dynamicFields = data.dynamicFields;
                    if (dynamicFields && typeof dynamicFields === 'object') {
                        Object.entries(dynamicFields).forEach(([fieldName, value]) => {
                            if (!fieldValuesMap.has(fieldName)) {
                                fieldValuesMap.set(fieldName, new Set());
                            }
                            // ✅ [แก้ไข 4] เก็บค่าตามจริง (ไม่บังคับตัวเล็ก) เพื่อให้ตรงกับมาตรฐาน Uppercase
                            const cleanValue = String(value).trim(); // ตัดแค่วรรคหน้าหลังพอ (ไม่ต้อง toLowerCase)
                            if (cleanValue && cleanValue !== 'undefined' && cleanValue !== 'null') {
                                fieldValuesMap.get(fieldName).add(cleanValue);
                            }
                        });
                    }
                }
            }
        });
        console.log(`✅ Matched ${matchCount} photos for subCategory: ${subCategoryId}`);
        // ✅ [แก้ไข 5] แปลงเป็น object และเรียงตามตัวอักษร
        const result = {};
        fieldValuesMap.forEach((values, fieldName) => {
            result[fieldName] = Array.from(values)
                .filter(v => v && v.length > 0) // กรองค่าว่างอีกครั้ง
                .sort((a, b) => a.localeCompare(b, 'th')); // เรียงตามภาษาไทย
        });
        console.log('📋 Result:', JSON.stringify(result, null, 2));
        return res.json({ success: true, data: result });
    }
    catch (error) {
        console.error("❌ Error fetching dynamic field values:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ✅ [ใหม่] Proxy Geocode Endpoint (แก้ CORS สำหรับ Nominatim)
apiRouter.get("/proxy-geocode", async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ success: false, error: "Missing lat/lon" });
        }
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=th&zoom=18&addressdetails=1`;
        // ต้อง use import dynamic สำหรับ node-fetch (เหมือน proxy-image)
        const fetch = (await Promise.resolve().then(() => __importStar(require('node-fetch')))).default;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'QCReport-App/1.0 (Contact: thai.l@tts2004.co.th)' }
        });
        if (!response.ok) {
            throw new Error(`Nominatim API Error: ${response.statusText}`);
        }
        const data = await response.json();
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error("❌ Proxy Geocode Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// ✅ [ใหม่] Proxy Image Endpoint (แก้ CORS)
// Ensure body parsing is enabled for this route
// apiRouter.use(express.json()); // <-- [ลบ] ย้ายไปข้างบนแล้ว
apiRouter.post("/proxy-image", async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, error: "Missing URL" });
        }
        // validate URL to be from firebase storage
        if (!url.includes("firebasestorage.googleapis.com") && !url.includes("storage.googleapis.com")) {
            return res.status(400).json({ success: false, error: "Invalid URL domain" });
        }
        const fetch = (await Promise.resolve().then(() => __importStar(require('node-fetch')))).default;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        return res.json({
            success: true,
            data: `data:${mimeType};base64,${base64}`
        });
    }
    catch (error) {
        console.error("❌ Proxy Image Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
// --- [Audit Tool] ---
const audit_lowercase_1 = __importDefault(require("./migrations/audit-lowercase"));
mainApp.use('/audit', audit_lowercase_1.default);
// --- [แก้ไข] ---
// 4. บอก App หลัก ให้ใช้ apiRouter ที่ path "/api" (สำหรับ Production Hosting) และ "/" (สำหรับ Direct Call)
mainApp.use(["/api", "/"], apiRouter);
// --- จบการแก้ไข ---
// ✅ Export Cloud Function
exports.api = (0, https_1.onRequest)({
    region: "asia-southeast1",
    memory: "2GiB",
    timeoutSeconds: 540,
}, mainApp); // <-- [แก้ไข] export mainApp
//# sourceMappingURL=index.js.map