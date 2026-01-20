// Filename: delete-empty-fields.js
// Script to find and delete documents with empty dynamicFields

const admin = require('firebase-admin');

// ========================================
// 1. Configuration
// ========================================

const CONFIG = {
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json',
    
    // ‼️ ตั้งค่าเป็น false เพื่อ "ลบข้อมูลจริง"
    // ‼️ true = โหมดทดสอบ (แค่ค้นหาและแสดงผล)
    dryRun: false,
    
    // 🎯 เป้าหมาย: Collection ที่เราจะล้างข้อมูล
    collectionName: 'latestQcPhotos' 
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
// 3. Main Function
// ========================================

async function deleteEmptyDynamicFields() {
    console.log('🚀 Starting Junk Data Cleanup...');
    console.log(`Config: DryRun=${CONFIG.dryRun}, Collection=${CONFIG.collectionName}\n`);
    console.log('='.repeat(60));

    const stats = { found: 0, deleted: 0, errors: 0 };
    const collectionRef = db.collection(CONFIG.collectionName);

    try {
        //
        // ⭐️⭐️⭐️ นี่คือหัวใจหลัก ⭐️⭐️⭐️
        // ค้นหาเอกสารทั้งหมดที่ field 'dynamicFields'
        // มีค่าเท่ากับ Object ว่าง ( {} )
        //
        const snapshot = await collectionRef
            .where('dynamicFields', '==', {}) 
            .get();

        stats.found = snapshot.size;
        console.log(`📊 Found ${stats.found} documents with empty dynamicFields.\n`);

        if (stats.found === 0) {
            console.log('✅ No junk data found. System is clean!');
            return stats;
        }

        // ใช้ Batch Writer เพื่อการลบที่มีประสิทธิภาพ
        const batch = db.batch();
        let operations = 0;

        for (const doc of snapshot.docs) {
            console.log(`[${stats.deleted + 1}/${stats.found}] ${doc.id}`);
            
            if (CONFIG.dryRun) {
                console.log(`   🔍 DRY RUN - Would delete`);
                stats.deleted++;
            } else {
                // เพิ่มคำสั่งลบลงใน Batch
                batch.delete(doc.ref);
                stats.deleted++;
                operations++;

                // Firestore จำกัด 500 operations ต่อ batch
                if (operations >= 499) {
                    console.log('\n...Committing batch (500 operations)...\n');
                    await batch.commit();
                    // รีเซ็ต Batch ใหม่
                    batch = db.batch();
                    operations = 0;
                }
            }
        }

        // Commit Batch สุดท้ายที่เหลือ
        if (!CONFIG.dryRun && operations > 0) {
            console.log(`\nCommitting final batch (${operations} operations)...`);
            await batch.commit();
        }

    } catch (error) {
        console.error('💥 Fatal Error during cleanup:', error);
        stats.errors++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Cleanup Summary');
    console.log('='.repeat(60));
    console.log(`   Total Found:  ${stats.found}`);
    console.log(`   ${CONFIG.dryRun ? 'Would Delete' : 'Deleted'}: ${stats.deleted}`);
    console.log(`   Errors:       ${stats.errors}`);
    console.log('\n✅ Cleanup Complete!\n');
    
    return stats;
}

// ========================================
// 4. Run
// ========================================

deleteEmptyDynamicFields()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n💥 Unhandled Fatal Error:', error);
        process.exit(1);
    });