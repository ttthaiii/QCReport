// Filename: delete-wrong-gridline.js
// Script to find and delete "งานเสา" documents
// where 'Gridline' field contains 'ชั้น' or 'โซน' (Junk Data Type 2)

const admin = require('firebase-admin');

// ========================================
// 1. Configuration
// ========================================

const CONFIG = {
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json',
    
    // ‼️ ตั้งค่าเป็น false เพื่อ "ลบข้อมูลจริง"
    // ‼️ true = โหมดทดสอบ (แค่ค้นหาและแสดงผล)
    dryRun: false,
    
    collectionName: 'latestQcPhotos',
    targetCategory: 'งานโครงสร้าง > งานเสา' // 🎯 เป้าหมาย: แก้ไขเฉพาะ Category นี้
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

async function deleteWrongGridlineData() {
    console.log('🚀 Starting Junk Data Cleanup (Type 2 - Wrong Gridline)...');
    console.log(`Config: DryRun=${CONFIG.dryRun}, Category="${CONFIG.targetCategory}"\n`);
    console.log('='.repeat(60));

    const stats = { totalFound: 0, junkFound: 0, deleted: 0, skipped: 0, errors: 0 };
    const collectionRef = db.collection(CONFIG.collectionName);

    try {
        // ⭐️ 1. ค้นหาเฉพาะเอกสาร "งานเสา" ทั้งหมด
        const snapshot = await collectionRef
            .where('category', '==', CONFIG.targetCategory) 
            .get();

        stats.totalFound = snapshot.size;
        console.log(`📊 Found ${stats.totalFound} documents for category "${CONFIG.targetCategory}".\n`);

        if (stats.totalFound === 0) {
            console.log('✅ No documents found for this category.');
            return stats;
        }

        const batch = db.batch();
        let operations = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const dynamicFields = data.dynamicFields || {};
            const gridlineValue = dynamicFields.Gridline; // ดึงค่า Gridline

            let isJunk = false;

            // ⭐️ 2. ตรวจสอบ Logic ขยะ (ปัญหาข้อ 1)
            if (gridlineValue && typeof gridlineValue === 'string') {
                // ถ้าค่า Gridline ขึ้นต้นด้วย "ชั้น" หรือมีคำว่า "โซน"
                if (gridlineValue.startsWith('ชั้น') || gridlineValue.includes('โซน')) {
                    isJunk = true;
                }
            }

            if (isJunk) {
                // ----------------
                // 3a. ถ้าเป็นขยะ
                // ----------------
                stats.junkFound++;
                console.log(`[${stats.junkFound}/${stats.totalFound}] ${doc.id}`);
                console.log(`   🚨 JUNK FOUND: Gridline = "${gridlineValue}"`);
                
                if (CONFIG.dryRun) {
                    console.log(`   🔍 DRY RUN - Would delete`);
                    stats.deleted++;
                } else {
                    batch.delete(doc.ref);
                    stats.deleted++;
                    operations++;

                    if (operations >= 499) {
                        console.log('\n...Committing batch (500 operations)...\n');
                        await batch.commit();
                        batch = db.batch();
                        operations = 0;
                    }
                }
            } else {
                // ----------------
                // 3b. ถ้าไม่เป็นขยะ (ปล่อยไว้)
                // ----------------
                stats.skipped++;
                // console.log(`[OK] ${doc.id} (Skipped)`); // (ปิดไว้ Log จะได้ไม่รก)
            }
        }

        // Commit Batch สุดท้าย
        if (!CONFIG.dryRun && operations > 0) {
            console.log(`\nCommitting final batch (${operations} operations)...`);
            await batch.commit();
        }

    } catch (error) {
        console.error('💥 Fatal Error during cleanup:', error);
        stats.errors++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Cleanup Summary (Type 2)');
    console.log('='.repeat(60));
    console.log(`   Total "งานเสา" Scanned: ${stats.totalFound}`);
    console.log(`   Junk (Wrong Gridline): ${stats.junkFound}`);
    console.log(`   Skipped (Correct):     ${stats.skipped}`);
    console.log(`   ${CONFIG.dryRun ? 'Would Delete' : 'Deleted'}: ${stats.deleted}`);
    console.log(`   Errors:                ${stats.errors}`);
    console.log('\n✅ Cleanup Complete!\n');
    
    return stats;
}

// ========================================
// 4. Run
// ========================================

deleteWrongGridlineData()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n💥 Unhandled Fatal Error:', error);
        process.exit(1);
    });