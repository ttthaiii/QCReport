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
const admin = __importStar(require("firebase-admin"));
const express = __importStar(require("express"));
const auditRouter = express.Router();
const db = admin.firestore();
// Helper to check if a string has lowercase letters
function hasLowerCase(str) {
    return /[a-z]/.test(str);
}
auditRouter.get('/audit-lowercase', async (req, res) => {
    try {
        const { projectId } = req.query;
        if (!projectId) {
            return res.status(400).json({ error: 'Missing projectId' });
        }
        const results = [];
        const collectionsToCheck = ['qcPhotos', 'latestQcPhotos', 'generatedReports']; // generatedReports is a subcollection, need special handling if we want to check all, but user likely means the ones active. Actually generatedReports is top-level in recent changes? No, it's subcollection of projects.
        // 1. Check qcPhotos
        console.log('Auditing qcPhotos...');
        const photosSnap = await db.collection('qcPhotos')
            .where('projectId', '==', projectId)
            .get();
        photosSnap.forEach(doc => {
            const data = doc.data();
            if (data.dynamicFields) {
                const lowerFields = [];
                Object.entries(data.dynamicFields).forEach(([key, value]) => {
                    if (typeof value === 'string' && hasLowerCase(value)) {
                        lowerFields.push(`${key}: ${value}`);
                    }
                });
                if (lowerFields.length > 0) {
                    results.push({
                        collection: 'qcPhotos',
                        id: doc.id,
                        category: data.category,
                        lowerFields
                    });
                }
            }
        });
        // 2. Check latestQcPhotos
        console.log('Auditing latestQcPhotos...');
        const latestSnap = await db.collection('latestQcPhotos')
            .where('projectId', '==', projectId)
            .get();
        latestSnap.forEach(doc => {
            const data = doc.data();
            if (data.dynamicFields) {
                const lowerFields = [];
                Object.entries(data.dynamicFields).forEach(([key, value]) => {
                    if (typeof value === 'string' && hasLowerCase(value)) {
                        lowerFields.push(`${key}: ${value}`);
                    }
                });
                if (lowerFields.length > 0) {
                    results.push({
                        collection: 'latestQcPhotos',
                        id: doc.id,
                        category: data.category,
                        lowerFields
                    });
                }
            }
        });
        // 3. Check generatedReports (Subcollection of project)
        console.log('Auditing generatedReports...');
        const reportsSnap = await db.collection('projects').doc(String(projectId)).collection('generatedReports').get();
        reportsSnap.forEach(doc => {
            const data = doc.data();
            if (data.dynamicFields) {
                const lowerFields = [];
                Object.entries(data.dynamicFields).forEach(([key, value]) => {
                    // Generated reports might preserve case, but let's check
                    if (typeof value === 'string' && hasLowerCase(value)) {
                        lowerFields.push(`${key}: ${value}`);
                    }
                });
                if (lowerFields.length > 0) {
                    results.push({
                        collection: 'generatedReports',
                        id: doc.id,
                        filename: data.filename,
                        lowerFields
                    });
                }
            }
        });
        return res.json({
            success: true,
            totalFound: results.length,
            details: results
        });
    }
    catch (error) {
        console.error('Audit failed:', error);
        return res.status(500).json({ error: error.message });
    }
});
// 4. [New] List all projects
auditRouter.get('/projects', async (req, res) => {
    try {
        const snapshot = await db.collection('projects').select('projectName').get();
        const projects = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().projectName || '(No Name)'
        }));
        return res.json({
            success: true,
            projects
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
exports.default = auditRouter;
//# sourceMappingURL=audit-lowercase.js.map