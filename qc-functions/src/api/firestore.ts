// Filename: qc-functions/src/api/firestore.ts

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";  // ✅ เพิ่มบรรทัดนี้

export interface PhotoData {
  projectId: string;
  category: string;
  topic: string;
  filename: string;
  driveUrl: string;
  filePath: string;
  location?: string;
  dynamicFields?: object;
  reportType: "QC" | "Daily";
}

export async function logPhotoToFirestore(photoData: PhotoData): Promise<{success: boolean; firestoreId: string}> {
  try {
    console.log("Logging photo metadata to Firestore...");

    if (!photoData.projectId) {
      throw new Error("Project ID is required to log a photo.");
    }

    const db = admin.firestore();
    const collectionRef = db.collection("qcPhotos");
    const docRef = await collectionRef.add({
      ...photoData,
      createdAt: FieldValue.serverTimestamp(),  // ✅ ใช้ FieldValue โดยตรง
    });

    console.log(`Successfully logged photo to Firestore with ID: ${docRef.id}`);
    return { success: true, firestoreId: docRef.id };
  } catch (error) {
    console.error("Error logging photo to Firestore:", error);
    throw error;
  }
}