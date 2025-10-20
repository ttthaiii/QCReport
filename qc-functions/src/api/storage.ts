// Filename: qc-functions/src/api/storage.ts

import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";

// "พิมพ์เขียว" สำหรับข้อมูลที่จะส่งเข้ามาในฟังก์ชัน
interface UploadData {
  imageBuffer: Buffer;
  filename: string;
  projectId: string;
  category: string;
}

// "พิมพ์เขียว" สำหรับข้อมูลที่จะส่งกลับไปหลังอัปโหลดสำเร็จ
interface UploadResult {
  success: boolean;
  publicUrl: string;
  filePath: string;
  filename: string;
}

/**
 * อัปโหลดไฟล์รูปภาพ (ในรูปแบบ Buffer) ไปยัง Firebase Cloud Storage
 *
 * @param {UploadData} uploadData ข้อมูลที่จำเป็นสำหรับการอัปโหลด
 * @returns {Promise<UploadResult>} ผลลัพธ์พร้อม public URL และเส้นทางไฟล์
 */
export async function uploadPhotoToStorage(uploadData: UploadData): Promise<UploadResult> {
  try {
    const { imageBuffer, filename, projectId, category } = uploadData;

    if (!imageBuffer || !filename || !projectId) {
      throw new Error("Missing required data for upload (imageBuffer, filename, projectId).");
    }

    // ✅ เรียกใช้ storage() ภายในฟังก์ชัน
    const storage = admin.storage();
    const bucket = storage.bucket();
    const filePath = `projects/${projectId}/${category}/${filename}`;
    const file = bucket.file(filePath);

    const token = uuidv4();

    console.log(`Uploading to Cloud Storage at path: ${filePath}`);

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
      public: true,
      validation: "md5",
    });
    
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath)}`;

    console.log(`Successfully uploaded file. Public URL: ${publicUrl}`);

    return {
      success: true,
      publicUrl,
      filePath,
      filename,
    };
  } catch (error) {
    console.error("Error uploading to Cloud Storage:", error);
    throw error;
  }
}