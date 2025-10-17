"use strict";
// Filename: qc-functions/src/api/storage.ts
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadPhotoToStorage = uploadPhotoToStorage;
const admin = __importStar(require("firebase-admin"));
const uuid_1 = require("uuid");
const storage = admin.storage();
/**
 * อัปโหลดไฟล์รูปภาพ (ในรูปแบบ Buffer) ไปยัง Firebase Cloud Storage
 *
 * @param {UploadData} uploadData ข้อมูลที่จำเป็นสำหรับการอัปโหลด
 * @returns {Promise<UploadResult>} ผลลัพธ์พร้อม public URL และเส้นทางไฟล์
 */
async function uploadPhotoToStorage(uploadData) {
    try {
        const { imageBuffer, filename, projectId, category } = uploadData;
        if (!imageBuffer || !filename || !projectId) {
            throw new Error("Missing required data for upload (imageBuffer, filename, projectId).");
        }
        const bucket = storage.bucket();
        // สร้างเส้นทางไฟล์ที่มีโครงสร้างชัดเจน: projects/{projectId}/{category}/{filename}
        const filePath = `projects/${projectId}/${category}/${filename}`;
        const file = bucket.file(filePath);
        // สร้าง token สำหรับการเข้าถึงไฟล์แบบสาธารณะ
        const token = (0, uuid_1.v4)();
        console.log(`Uploading to Cloud Storage at path: ${filePath}`);
        // อัปโหลดไฟล์ Buffer ไปยัง Storage
        await file.save(imageBuffer, {
            metadata: {
                contentType: "image/jpeg",
                // เพิ่ม metadata สำหรับ token การเข้าถึง
                metadata: {
                    firebaseStorageDownloadTokens: token,
                },
            },
            public: true, // ตั้งค่าให้ไฟล์เป็นสาธารณะ
            validation: "md5",
        });
        // สร้าง Public URL ที่สามารถเข้าถึงได้จากภายนอก
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath)}`;
        console.log(`Successfully uploaded file. Public URL: ${publicUrl}`);
        return {
            success: true,
            publicUrl,
            filePath,
            filename,
        };
    }
    catch (error) {
        console.error("Error uploading to Cloud Storage:", error);
        throw error;
    }
}
//# sourceMappingURL=storage.js.map