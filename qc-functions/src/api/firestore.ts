// Filename: qc-functions/src/api/firestore.ts

import * as admin from "firebase-admin";

// "พิมพ์เขียว" สำหรับข้อมูลรูปภาพของเรา
// การกำหนดโครงสร้างและชนิดข้อมูล ทำให้เรามั่นใจว่าจะบันทึกข้อมูลในรูปแบบที่ถูกต้องเสมอ
export interface PhotoData {
  projectId: string;
  category: string;
  topic: string;
  filename: string;
  driveUrl: string;
  filePath: string; // เส้นทางไฟล์ใน Google Drive/Storage
  location?: string; // เครื่องหมาย ? ทำให้ field นี้ไม่บังคับ
  dynamicFields?: object; // ไม่บังคับ สำหรับตอนนี้
  reportType: "QC" | "Daily"; // ค่าต้องเป็น "QC" หรือ "Daily" เท่านั้น
}

const db = admin.firestore();

/**
 * บันทึกข้อมูลรูปภาพลงใน collection qcPhotos บน Firestore
 * ฟังก์ชันนี้ใช้ Interface 'PhotoData' เพื่อความปลอดภัยของชนิดข้อมูล
 *
 * @param {PhotoData} photoData ข้อมูลรูปภาพที่ตรงตามโครงสร้างของ PhotoData interface
 * @returns {Promise<{success: boolean, firestoreId: string}>} ผลลัพธ์พร้อม ID ของ document ที่สร้างใหม่
 */
export async function logPhotoToFirestore(photoData: PhotoData): Promise<{success: boolean; firestoreId: string}> {
  try {
    console.log("Logging photo metadata to Firestore...");

    if (!photoData.projectId) {
      throw new Error("Project ID is required to log a photo.");
    }

    const collectionRef = db.collection("qcPhotos");
    const docRef = await collectionRef.add({
      ...photoData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Successfully logged photo to Firestore with ID: ${docRef.id}`);
    return { success: true, firestoreId: docRef.id };
  } catch (error) {
    console.error("Error logging photo to Firestore:", error);
    // ส่งต่อ error เดิมออกไปให้ฟังก์ชันที่เรียกใช้จัดการต่อ
    throw error;
  }
}