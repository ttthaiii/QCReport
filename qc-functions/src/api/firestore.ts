import { createHash } from "crypto";
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

  // ✅ [ใหม่] Field สำหรับแทนที่รูปใน Daily Report (Optional)
  replaceDailyPhotoId?: string;
}

// ✅ [New Helper] Create Stable ID for latestQcPhotos
function createStableQcId(
  projectId: string,
  category: string,
  topic: string,
  dynamicFields: any
): string {
  // 1. Sort dynamic fields to ensure consistency (e.g. Room=A,Floor=1 vs Floor=1,Room=A)
  const sortedFields = Object.keys(dynamicFields || {}).sort()
    .map(key => `${key}=${(dynamicFields[key] || '').toString().trim().toUpperCase()}`) // Force Uppercase for ID
    .join('&');

  const rawId = `${projectId}|${category}|${topic}|${sortedFields}`;
  return createHash('md5').update(rawId).digest('hex');
}

export async function logPhotoToFirestore(photoData: PhotoData): Promise<{ success: boolean; firestoreId: string }> {
  try {
    console.log(`Logging ${photoData.reportType} photo metadata to Firestore...`);

    if (!photoData.projectId) {
      throw new Error("Project ID is required to log a photo.");
    }

    const db = admin.firestore();

    // **KEY CHANGE**: เปลี่ยนชื่อ Collection ตาม reportType เพื่อการ Query ที่มีประสิทธิภาพ
    const collectionName = photoData.reportType === 'QC' ? 'qcPhotos' : 'dailyPhotos';
    const collectionRef = db.collection(collectionName);

    // ✅ [ใหม่] รองรับการ Replace รูป Daily
    if (photoData.reportType === 'Daily' && photoData.replaceDailyPhotoId) {
      console.log(`🔄 Replacing Daily Photo ID: ${photoData.replaceDailyPhotoId}`);
      const replaceDocRef = collectionRef.doc(photoData.replaceDailyPhotoId);

      const updateData = { ...photoData };
      delete updateData.replaceDailyPhotoId; // ลบ field ชั่วคราวออกไป

      await replaceDocRef.update({
        ...updateData,
        // สำคัญ: เราไม่แก้ไข createdAt เพื่อให้ลำดับภาพยังคงเหมือนเดิม
      });
      console.log(`Successfully updated mapped Daily photo ID: ${photoData.replaceDailyPhotoId}`);
      return { success: true, firestoreId: photoData.replaceDailyPhotoId };
    }

    // 1. Save to Main Collection (qcPhotos or dailyPhotos)
    const dataToSave = { ...photoData };
    if (dataToSave.replaceDailyPhotoId === undefined) {
      delete dataToSave.replaceDailyPhotoId;
    }

    const docRef = await collectionRef.add({
      ...dataToSave,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2. [New] If QC, Sync to latestQcPhotos for Suggestions
    if (photoData.reportType === 'QC' && photoData.category) {
      try {
        const stableId = createStableQcId(
          photoData.projectId,
          photoData.category,
          photoData.topic || '',
          photoData.dynamicFields || {}
        );

        console.log(`🔄 Syncing to latestQcPhotos (ID: ${stableId})...`);

        await db.collection('latestQcPhotos').doc(stableId).set({
          ...photoData,
          createdAt: FieldValue.serverTimestamp(), // Update time to now
          // Ensure we have keys for indexing
          projectId: photoData.projectId,
          category: photoData.category,
          dynamicFields: photoData.dynamicFields
        }, { merge: true });

      } catch (syncError) {
        console.warn('⚠️ Failed to sync to latestQcPhotos:', syncError);
        // Don't fail the main upload if sync fails
      }

      // 3. [New] Optimize Notification: Update "newPhotosCount" on relevant Reports (On-Write)
      try {
        console.log('🔔 checking for relevant reports to update notification...');
        // Find reports that match this category
        const reportsRef = db.collection('projects').doc(photoData.projectId).collection('generatedReports');

        // Note: Querying by category is safe index-wise
        const relevantReportsSnapshot = await reportsRef
          .where('reportType', '==', 'QC')
          .where('mainCategory', '==', photoData.category.split(' > ')[0].trim())
          .where('subCategory', '==', photoData.category.split(' > ')[1].trim())
          .get();

        if (!relevantReportsSnapshot.empty) {
          const batch = db.batch();
          let updateCount = 0;

          relevantReportsSnapshot.forEach(doc => {
            const report = doc.data();

            // Check if this photo belongs to this report (Time check & Field check)
            // 1. Time Check: Photo must be NEWER than report
            // (Actually, since this is "On-Write", the photo is definitely newer than any existing report
            //  UNLESS the report was created literally milliseconds ago, which is fine)

            // 2. Dynamic Field Check
            let isMatch = true;
            if (report.dynamicFields) {
              for (const [key, rVal] of Object.entries(report.dynamicFields)) {
                // If report requires a specific field value (e.g. Room=14A), check if photo matches
                const pVal = photoData.dynamicFields ? (photoData.dynamicFields as any)[key] : undefined;
                // Use String comparison/trimming
                if (String(pVal || '').trim().toUpperCase() !== String(rVal || '').trim().toUpperCase()) {
                  isMatch = false;
                  break;
                }
              }
            }

            if (isMatch) {
              // Increment counter
              batch.update(doc.ref, {
                newPhotosCount: FieldValue.increment(1),
                hasNewPhotos: true,
                lastUpdatedByPhoto: FieldValue.serverTimestamp() // Optional: helpful for debugging
              });
              updateCount++;
            }
          });

          if (updateCount > 0) {
            await batch.commit();
            console.log(`🔔 Updated ${updateCount} reports with new photo notification.`);
          } else {
            console.log(`🔔 Matches category, but no specific report fields matched.`);
          }
        }
      } catch (notiError) {
        console.error('⚠️ Failed to update report notifications:', notiError);
      }
    }

    console.log(`Successfully logged photo to ${collectionName} with ID: ${docRef.id}`);
    return { success: true, firestoreId: docRef.id };
  } catch (error) {
    console.error("Error logging photo to Firestore:", error);
    throw error;
  }
}