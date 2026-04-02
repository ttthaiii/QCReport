// Filename: fix-dynamic-fields.js
// Script to fix dynamic fields with trailing/leading spaces in Firestore

const admin = require('firebase-admin');
const crypto = require('crypto');

// ========================================
// 1. Configuration
// ========================================

const CONFIG = {
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json',
    dryRun: false, // Set to false to actually fix the data
    batchSize: 50,
};

// ========================================
// 2. Initialize Firebase
// ========================================

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(CONFIG.serviceAccountPath)
    });
}

const db = admin.firestore();
console.log('✅ Firebase Admin initialized\n');

// ========================================
// 3. Helper Functions
// ========================================

// [โค้ดใหม่ที่จะวางแทน]
function createStableQcId(projectId, category, topic, dynamicFields) {
    // Logic นี้คัดลอกมาจาก pdf-generator.ts เพื่อให้ Hashing ตรงกัน
    const sortedFields = Object.keys(dynamicFields || {}).sort()
        .map(key => `${key}=${(dynamicFields[key] || '').toUpperCase().trim()}`) // ✅ เปลี่ยนเป็น toUpperCase
        .join('&');
    const rawId = `${projectId}|${category}|${topic}|${sortedFields}`;
    return crypto.createHash('md5').update(rawId).digest('hex');
}

function trimDynamicFields(dynamicFields) {
    if (!dynamicFields || typeof dynamicFields !== 'object') {
        return { trimmed: dynamicFields, hasChanges: false };
    }

    const trimmed = {};
    let hasChanges = false;

    Object.keys(dynamicFields).forEach(key => {
        const value = dynamicFields[key];
        if (typeof value === 'string') {
            const trimmedValue = value.trim().toUpperCase(); // ✅ เปลี่ยนเป็น toUpperCase
            trimmed[key] = trimmedValue;
            if (trimmedValue !== value) {
                hasChanges = true;
            }
        } else {
            trimmed[key] = value;
        }
    });

    return { trimmed, hasChanges };
}

// ========================================
// 4. Fix Functions
// ========================================

async function fixQcPhotos() {
    console.log('🔧 Fixing qcPhotos collection...\n');

    const stats = { total: 0, fixed: 0, skipped: 0, errors: [] };

    try {
        const snapshot = await db.collection('qcPhotos').get();
        stats.total = snapshot.size;
        console.log(`📊 Found ${stats.total} documents\n`);

        if (stats.total === 0) return stats;

        for (let i = 0; i < snapshot.docs.length; i++) {
            const doc = snapshot.docs[i];
            const data = doc.data();

            console.log(`[${i + 1}/${stats.total}] ${data.topic?.substring(0, 40) || doc.id}...`);

            try {
                const { trimmed, hasChanges } = trimDynamicFields(data.dynamicFields);

                console.log(`   Old: ${JSON.stringify(data.dynamicFields)}`);
                console.log(`   New: ${JSON.stringify(trimmed)}`);

                if (CONFIG.dryRun) {
                    console.log(`   🔍 DRY RUN - Would update`);
                    stats.fixed++;
                } else {
                    await doc.ref.update({ dynamicFields: trimmed });
                    console.log(`   ✅ Updated`);
                    stats.fixed++;
                }

            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                stats.errors.push({ docId: doc.id, error: error.message });
            }
        }

    } catch (error) {
        console.error('Fatal error in fixQcPhotos:', error);
        throw error;
    }

    return stats;
}

async function fixLatestQcPhotos() {
    console.log('\n\n🔧 Fixing latestQcPhotos collection...\n');

    const stats = { total: 0, fixed: 0, skipped: 0, relocated: 0, errors: [] };

    try {
        const snapshot = await db.collection('latestQcPhotos').get();
        stats.total = snapshot.size;
        console.log(`📊 Found ${stats.total} documents\n`);

        if (stats.total === 0) return stats;

        for (let i = 0; i < snapshot.docs.length; i++) {
            const doc = snapshot.docs[i];
            const data = doc.data();
            const oldDocId = doc.id;

            console.log(`[${i + 1}/${stats.total}] ${data.topic?.substring(0, 40) || oldDocId.substring(0, 12)}...`);

            try {
                const { trimmed, hasChanges } = trimDynamicFields(data.dynamicFields);

                console.log(`   Old Fields: ${JSON.stringify(data.dynamicFields)}`);
                console.log(`   New Fields: ${JSON.stringify(trimmed)}`);

                const newStableId = createStableQcId(
                    data.projectId,
                    data.category,
                    data.topic,
                    trimmed
                );

                if (oldDocId === newStableId) {
                    // Same ID, just update
                    if (CONFIG.dryRun) {
                        console.log(`   🔍 DRY RUN - Would update in place`);
                        stats.fixed++;
                    } else {
                        await doc.ref.update({ dynamicFields: trimmed });
                        console.log(`   ✅ Updated in place`);
                        stats.fixed++;
                    }
                } else {
                    // Different ID, need to relocate
                    console.log(`   Old ID: ${oldDocId.substring(0, 12)}...`);
                    console.log(`   New ID: ${newStableId.substring(0, 12)}...`);

                    if (CONFIG.dryRun) {
                        console.log(`   🔍 DRY RUN - Would relocate`);
                        stats.relocated++;
                    } else {
                        await db.collection('latestQcPhotos').doc(newStableId).set({
                            ...data,
                            dynamicFields: trimmed,
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        await doc.ref.delete();
                        console.log(`   ✅ Relocated`);
                        stats.relocated++;
                    }
                }

            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                stats.errors.push({ docId: doc.id, error: error.message });
            }
        }

    } catch (error) {
        console.error('Fatal error in fixLatestQcPhotos:', error);
        throw error;
    }

    return stats;
}

// ========================================
// 4b. Fix Shared Jobs Collection
// ========================================

async function fixSharedJobs() {
    console.log('\n\n🔧 Fixing sharedJobs collection across all projects...\n');

    const stats = { total: 0, fixed: 0, skipped: 0, errors: [] };

    try {
        const projectsSnapshot = await db.collection('projects').get();
        console.log(`📊 Found ${projectsSnapshot.size} projects\n`);

        for (const projectDoc of projectsSnapshot.docs) {
            const projectId = projectDoc.id;
            console.log(`   Processing project: ${projectId}`);

            const sharedJobsSnapshot = await db.collection('projects').doc(projectId).collection('sharedJobs').get();
            stats.total += sharedJobsSnapshot.size;

            for (let i = 0; i < sharedJobsSnapshot.docs.length; i++) {
                const doc = sharedJobsSnapshot.docs[i];
                const job = doc.data();

                try {
                    let needsUpdate = false;
                    const newDynamicFields = {};

                    // 1. Check & Convert Fields
                    if (job.dynamicFields) {
                        for (const key of Object.keys(job.dynamicFields)) {
                            const value = job.dynamicFields[key];
                            if (typeof value === 'string' && value !== value.toUpperCase().trim()) {
                                needsUpdate = true;
                                newDynamicFields[key] = value.toUpperCase().trim();
                            } else {
                                newDynamicFields[key] = value;
                            }
                        }
                    }

                    if (needsUpdate) {
                        // 2. Re-generate ID/Label
                        const sanitizeForFirestoreId = (str) => (str || '').toString().replace(/[\/\.\$\[\]#]/g, '_');

                        const mainId = sanitizeForFirestoreId(job.mainCategory);
                        const subId = sanitizeForFirestoreId(job.subCategory);
                        const fieldValues = Object.keys(newDynamicFields).sort().map(k => newDynamicFields[k]).filter(v => !!v).map(sanitizeForFirestoreId).join('_');
                        const newId = `${mainId}_${subId}_${fieldValues}`;

                        const newLabel = [job.mainCategory, job.subCategory, ...Object.keys(newDynamicFields).sort().map(k => newDynamicFields[k]).filter(v => !!v)].join(' / ');

                        if (CONFIG.dryRun) {
                            console.log(`   🔍 DRY RUN - Would update sharedJob in ${projectId}`);
                            stats.fixed++;
                        } else {
                            // 3. Prepare New Job Data
                            const newJob = {
                                ...job,
                                id: newId,
                                dynamicFields: newDynamicFields,
                                label: newLabel
                            };

                            // 4. Save New & Delete Old
                            if (doc.id !== newId) {
                                await db.collection('projects').doc(projectId).collection('sharedJobs').doc(newId).set(newJob);
                                await doc.ref.delete();
                            } else {
                                await doc.ref.update(newJob);
                            }
                            console.log(`   ✅ Updated sharedJob in ${projectId}`);
                            stats.fixed++;
                        }
                    } else {
                        stats.skipped++;
                    }
                } catch (error) {
                    console.error(`   ❌ Error processing job ${doc.id}: ${error.message}`);
                    stats.errors.push({ docId: doc.id, error: error.message });
                }
            }
        }
    } catch (error) {
        console.error('Fatal error in fixSharedJobs:', error);
        throw error;
    }

    return stats;
}

// ========================================
// 5. Main Function
// ========================================

async function fixAllCollections() {
    console.log('🚀 Starting Dynamic Fields Fix...\n');
    console.log(`Config: DryRun=${CONFIG.dryRun}\n`);
    console.log('='.repeat(60));

    const qcStats = await fixQcPhotos();
    const latestStats = await fixLatestQcPhotos();
    const sharedJobsStats = await fixSharedJobs(); // ✅ Add this missing part

    console.log('\n\n' + '='.repeat(60));
    console.log('📊 Summary');
    console.log('='.repeat(60));

    console.log('\n📂 qcPhotos:');
    console.log(`   Total:   ${qcStats.total}`);
    console.log(`   Fixed:   ${qcStats.fixed}`);
    console.log(`   Skipped: ${qcStats.skipped}`);
    console.log(`   Errors:  ${qcStats.errors.length}`);

    console.log('\n📂 latestQcPhotos:');
    console.log(`   Total:     ${latestStats.total}`);
    console.log(`   Fixed:     ${latestStats.fixed}`);
    console.log(`   Relocated: ${latestStats.relocated}`);
    console.log(`   Skipped:   ${latestStats.skipped}`);
    console.log(`   Errors:    ${latestStats.errors.length}`);

    console.log('\n📂 sharedJobs (All Projects):');
    console.log(`   Total:   ${sharedJobsStats.total}`);
    console.log(`   Fixed:   ${sharedJobsStats.fixed}`);
    console.log(`   Skipped: ${sharedJobsStats.skipped}`);
    console.log(`   Errors:  ${sharedJobsStats.errors.length}`);

    const allErrors = [...qcStats.errors, ...latestStats.errors, ...sharedJobsStats.errors];
    if (allErrors.length > 0) {
        console.log('\n❌ Errors:');
        allErrors.forEach((err, i) => {
            console.log(`   ${i + 1}. ${err.docId}: ${err.error}`);
        });
    }

    console.log('\n✅ Fix Complete!\n');
}

// ========================================
// 6. Run
// ========================================

fixAllCollections()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n💥 Fatal Error:', error);
        process.exit(1);
    });