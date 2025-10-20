"use strict";
// Filename: qc-functions/src/api/firestore.ts
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
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
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
        const docRef = await collectionRef.add(Object.assign(Object.assign({}, photoData), { createdAt: firestore_1.FieldValue.serverTimestamp() }));
        console.log(`Successfully logged photo to ${collectionName} with ID: ${docRef.id}`);
        return { success: true, firestoreId: docRef.id };
    }
    catch (error) {
        console.error("Error logging photo to Firestore:", error);
        throw error;
    }
}
//# sourceMappingURL=firestore.js.map