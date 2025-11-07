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
        .map(key => `${key}=${dynamicFields[key]}`)
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
            const trimmedValue = value.trim();
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
// 5. Main Function
// ========================================

async function fixAllCollections() {
    console.log('🚀 Starting Dynamic Fields Fix...\n');
    console.log(`Config: DryRun=${CONFIG.dryRun}\n`);
    console.log('='.repeat(60));
    
    const qcStats = await fixQcPhotos();
    const latestStats = await fixLatestQcPhotos();
    
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
    
    const allErrors = [...qcStats.errors, ...latestStats.errors];
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