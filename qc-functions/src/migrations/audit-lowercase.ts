
import * as admin from 'firebase-admin';
import * as express from 'express';

const auditRouter = express.Router();
const db = admin.firestore();

// Helper to check if a string has lowercase letters
function hasLowerCase(str: string): boolean {
    return /[a-z]/.test(str);
}

auditRouter.get('/audit-lowercase', async (req, res) => {
    try {
        const { projectId } = req.query;
        if (!projectId) {
            return res.status(400).json({ error: 'Missing projectId' });
        }

        const results: any[] = [];
        const collectionsToCheck = ['qcPhotos', 'latestQcPhotos', 'generatedReports']; // generatedReports is a subcollection, need special handling if we want to check all, but user likely means the ones active. Actually generatedReports is top-level in recent changes? No, it's subcollection of projects.

        // 1. Check qcPhotos
        console.log('Auditing qcPhotos...');
        const photosSnap = await db.collection('qcPhotos')
            .where('projectId', '==', projectId)
            .get();

        photosSnap.forEach(doc => {
            const data = doc.data();
            if (data.dynamicFields) {
                const lowerFields: string[] = [];
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
                const lowerFields: string[] = [];
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
                const lowerFields: string[] = [];
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

    } catch (error) {
        console.error('Audit failed:', error);
        return res.status(500).json({ error: (error as Error).message });
    }
});

export default auditRouter;
