// Filename: qc-functions/src/api/firestore.ts

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface PhotoData {
  projectId: string;
  reportType: "QC" | "Daily"; // ระบุประเภทของรายงาน
  filename: string;
  driveUrl: string;
  filePath: string;
  location?: string;
  dynamicFields?: object;
  
  // --- Fields for QC Report ---
  category?: string; // เปลี่ยนเป็น optional
  topic?: string;    // เปลี่ยนเป็น optional

  // --- Fields for Daily Report ---
  description?: string; // เพิ่ม field นี้
  createdAt?: admin.firestore.Timestamp;
}

export async function logPhotoToFirestore(photoData: PhotoData): Promise<{success: boolean; firestoreId: string}> {
  try {
    console.log(`Logging ${photoData.reportType} photo metadata to Firestore...`);

    if (!photoData.projectId) {
      throw new Error("Project ID is required to log a photo.");
    }

    const db = admin.firestore();
    
    // **KEY CHANGE**: เปลี่ยนชื่อ Collection ตาม reportType เพื่อการ Query ที่มีประสิทธิภาพ
    const collectionName = photoData.reportType === 'QC' ? 'qcPhotos' : 'dailyPhotos';
    const collectionRef = db.collection(collectionName);
    
    const docRef = await collectionRef.add({
      ...photoData,
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(`Successfully logged photo to ${collectionName} with ID: ${docRef.id}`);
    return { success: true, firestoreId: docRef.id };
  } catch (error) {
    console.error("Error logging photo to Firestore:", error);
    throw error;
  }
}