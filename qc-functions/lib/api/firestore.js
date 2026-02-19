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
Object.defineProperty(exports, "__esModule", { value: true });
exports.logPhotoToFirestore = logPhotoToFirestore;
const crypto_1 = require("crypto");
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
// ✅ [New Helper] Create Stable ID for latestQcPhotos
function createStableQcId(projectId, category, topic, dynamicFields) {
    // 1. Sort dynamic fields to ensure consistency (e.g. Room=A,Floor=1 vs Floor=1,Room=A)
    const sortedFields = Object.keys(dynamicFields || {}).sort()
        .map(key => `${key}=${(dynamicFields[key] || '').toString().trim().toUpperCase()}`) // Force Uppercase for ID
        .join('&');
    const rawId = `${projectId}|${category}|${topic}|${sortedFields}`;
    return (0, crypto_1.createHash)('md5').update(rawId).digest('hex');
}
async function logPhotoToFirestore(photoData) {
    try {
        console.log(`Logging ${photoData.reportType} photo metadata to Firestore...`);
        if (!photoData.projectId) {
            throw new Error("Project ID is required to log a photo.");
        }
        const db = admin.firestore();
        // **KEY CHANGE**: เปลี่ยนชื่อ Collection ตาม reportType เพื่อการ Query ที่มีประสิทธิภาพ
        const collectionName = photoData.reportType === 'QC' ? 'qcPhotos' : 'dailyPhotos';
        const collectionRef = db.collection(collectionName);
        // 1. Save to Main Collection (qcPhotos or dailyPhotos)
        const docRef = await collectionRef.add(Object.assign(Object.assign({}, photoData), { createdAt: firestore_1.FieldValue.serverTimestamp() }));
        // 2. [New] If QC, Sync to latestQcPhotos for Suggestions
        if (photoData.reportType === 'QC' && photoData.category) {
            try {
                const stableId = createStableQcId(photoData.projectId, photoData.category, photoData.topic || '', photoData.dynamicFields || {});
                console.log(`🔄 Syncing to latestQcPhotos (ID: ${stableId})...`);
                await db.collection('latestQcPhotos').doc(stableId).set(Object.assign(Object.assign({}, photoData), { createdAt: firestore_1.FieldValue.serverTimestamp(), 
                    // Ensure we have keys for indexing
                    projectId: photoData.projectId, category: photoData.category, dynamicFields: photoData.dynamicFields }), { merge: true });
            }
            catch (syncError) {
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
                                const pVal = photoData.dynamicFields ? photoData.dynamicFields[key] : undefined;
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
                                newPhotosCount: firestore_1.FieldValue.increment(1),
                                hasNewPhotos: true,
                                lastUpdatedByPhoto: firestore_1.FieldValue.serverTimestamp() // Optional: helpful for debugging
                            });
                            updateCount++;
                        }
                    });
                    if (updateCount > 0) {
                        await batch.commit();
                        console.log(`🔔 Updated ${updateCount} reports with new photo notification.`);
                    }
                    else {
                        console.log(`🔔 Matches category, but no specific report fields matched.`);
                    }
                }
            }
            catch (notiError) {
                console.error('⚠️ Failed to update report notifications:', notiError);
            }
        }
        console.log(`Successfully logged photo to ${collectionName} with ID: ${docRef.id}`);
        return { success: true, firestoreId: docRef.id };
    }
    catch (error) {
        console.error("Error logging photo to Firestore:", error);
        throw error;
    }
}
//# sourceMappingURL=firestore.js.map