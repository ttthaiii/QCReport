// Filename: fix-normalize-floors.js
// Script to normalize "ชั้น" (Floor) field for "งานเสา" (Column) category
// e.g., "ชั้น .1" -> "ชั้น 1"

const admin = require('firebase-admin');
const crypto = require('crypto');

// ========================================
// 1. Configuration
// ========================================

const CONFIG = {
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json',
    // ‼️ ตั้งค่าเป็น true เพื่อดู Log ก่อน / false เพื่อแก้ไขข้อมูลจริง
    dryRun: false, 
    // 🎯 เป้าหมาย: แก้ไขเฉพาะ Category นี้เท่านั้น
    TARGET_CATEGORY: 'งานโครงสร้าง > งานเสา'
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

// Hashing ID (จาก pdf-generator.ts)
function createStableQcId(projectId, category, topic, dynamicFields) {
    const sortedFields = Object.keys(dynamicFields || {}).sort()
        .map(key => `${key}=${dynamicFields[key]}`)
        .join('&');
    const rawId = `${projectId}|${category}|${topic}|${sortedFields}`;
    return crypto.createHash('md5').update(rawId).digest('hex');
}

/**
 * ฟังก์ชันใหม่: เพื่อ normalize field "ชั้น"
 * ลบจุด (.) และ trim() ช่องว่าง
 */
function normalizeFloorField(dynamicFields) {
    if (!dynamicFields || typeof dynamicFields !== 'object' || !dynamicFields.ชั้น) {
        // ไม่มี field "ชั้น" หรือ dynamicFields ไม่ถูกต้อง
        return { normalized: dynamicFields, hasChanges: false };
    }
    
    // สร้าง object ใหม่
    const normalized = { ...dynamicFields };
    let hasChanges = false;
    
    const oldValue = dynamicFields.ชั้น;
    
    if (typeof oldValue === 'string') {
        // ลบจุด (.) และ trim() ช่องว่าง
        const newValue = oldValue.replace(/\./g, '').trim();
        
        if (newValue !== oldValue) {
            normalized.ชั้น = newValue;
            hasChanges = true;
        }
    }
    
    return { normalized, hasChanges };
}

// ========================================
// 4. Fix Functions
// ========================================

async function fixQcPhotos() {
    console.log(`🔧 Fixing qcPhotos collection for "${CONFIG.TARGET_CATEGORY}"...\n`);
    
    const stats = { total: 0, fixed: 0, skipped: 0, errors: [] };
    
    try {
        // 🎯 Query เฉพาะ "งานเสา"
        const snapshot = await db.collection('qcPhotos')
            .where('category', '==', CONFIG.TARGET_CATEGORY)
            .get();
        
        stats.total = snapshot.size;
        console.log(`📊 Found ${stats.total} documents\n`);
        
        if (stats.total === 0) return stats;
        
        for (let i = 0; i < snapshot.docs.length; i++) {
            const doc = snapshot.docs[i];
            const data = doc.data();
            
            console.log(`[${i + 1}/${stats.total}] ${data.topic?.substring(0, 40) || doc.id}...`);
            
            try {
                // ⭐️ ใช้ฟังก์ชัน normalize ใหม่
                const { normalized, hasChanges } = normalizeFloorField(data.dynamicFields);
                
                if (!hasChanges) {
                    console.log(`   ✅ OK (No changes needed)`);
                    stats.skipped++;
                    continue;
                }
                
                console.log(`   Old Floor: ${JSON.stringify(data.dynamicFields.ชั้น)}`);
                console.log(`   New Floor: ${JSON.stringify(normalized.ชั้น)}`);
                
                if (CONFIG.dryRun) {
                    console.log(`   🔍 DRY RUN - Would update`);
                    stats.fixed++;
                } else {
                    await doc.ref.update({ dynamicFields: normalized });
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
    console.log(`\n\n🔧 Fixing latestQcPhotos collection for "${CONFIG.TARGET_CATEGORY}"...\n`);
    
    const stats = { total: 0, fixed: 0, skipped: 0, relocated: 0, errors: [] };
    
    try {
        // 🎯 Query เฉพาะ "งานเสา"
        const snapshot = await db.collection('latestQcPhotos')
            .where('category', '==', CONFIG.TARGET_CATEGORY)
            .get();
        
        stats.total = snapshot.size;
        console.log(`📊 Found ${stats.total} documents\n`);
        
        if (stats.total === 0) return stats;
        
        for (let i = 0; i < snapshot.docs.length; i++) {
            const doc = snapshot.docs[i];
            const data = doc.data();
            const oldDocId = doc.id;
            
            console.log(`[${i + 1}/${stats.total}] ${data.topic?.substring(0, 40) || oldDocId.substring(0, 12)}...`);
            
            try {
                // ⭐️ ใช้ฟังก์ชัน normalize ใหม่
                const { normalized, hasChanges } = normalizeFloorField(data.dynamicFields);
                
                if (!hasChanges) {
                    console.log(`   ✅ OK (No changes needed)`);
                    stats.skipped++;
                    continue;
                }
                
                console.log(`   Old Floor: ${JSON.stringify(data.dynamicFields.ชั้น)}`);
                console.log(`   New Floor: ${JSON.stringify(normalized.ชั้น)}`);
                
                // คำนวณ Hashing ID ใหม่จากข้อมูลที่ normalize แล้ว
                const newStableId = createStableQcId(
                    data.projectId,
                    data.category,
                    data.topic,
                    normalized
                );
                
                if (oldDocId === newStableId) {
                    // ไม่น่าเกิดขึ้นถ้า hasChanges=true แต่ใส่ไว้กันเหนียว
                    console.warn(`   ⚠️  ID is the same but changes were detected?`);
                    if (CONFIG.dryRun) {
                        console.log(`   🔍 DRY RUN - Would update in place`);
                        stats.fixed++;
                    } else {
                        await doc.ref.update({ dynamicFields: normalized });
                        console.log(`   ✅ Updated in place`);
                        stats.fixed++;
                    }
                } else {
                    // ‼️ ย้ายบ้าน: ID เก่า และ ID ใหม่ ไม่ตรงกัน
                    console.log(`   Old ID: ${oldDocId.substring(0, 12)}...`);
                    console.log(`   New ID: ${newStableId.substring(0, 12)}...`);
                    
                    if (CONFIG.dryRun) {
                        console.log(`   🔍 DRY RUN - Would relocate (Delete old, Create new)`);
                        stats.relocated++;
                    } else {
                        // 1. สร้างเอกสารใหม่ที่ ID ที่ถูกต้อง
                        await db.collection('latestQcPhotos').doc(newStableId).set({
                            ...data,
                            dynamicFields: normalized, // ใช้ข้อมูลที่แก้ไขแล้ว
                            createdAt: admin.firestore.FieldValue.serverTimestamp() // อัปเดตเวลา
                        });
                        // 2. ลบเอกสารเก่าที่ ID ผิด
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
    console.log('🚀 Starting Floor Field Normalization...\n');
    console.log(`Config: DryRun=${CONFIG.dryRun}, Target="${CONFIG.TARGET_CATEGORY}"\n`);
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
    console.log(`   Fixed (In-place): ${latestStats.fixed}`);
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