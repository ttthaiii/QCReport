const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 1. ตรวจสอบไฟล์เชื่อมต่อฐานข้อมูล
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ Error: ไม่พบไฟล์ serviceAccountKey.json ในโฟลเดอร์นี้!');
    process.exit(1);
}

// 2. เริ่มต้นเชื่อมต่อ Firebase
admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

// รายชื่อ Collection Path ที่ต้องการลบ
const collectionsToDelete = [
    'latestQcPhotos',
    'projects/project-001/generatedReports',
    'projects/project-001/sharedJobs'
];

async function deleteSpecificPhotos() {
    console.log('🔍 กำลังค้นหาข้อมูลที่ตรงตามเงื่อนไข (ชั้น 4 โซน 2, เสา CORE ST02, Gridline 23-23/M-P)...');

    let grandTotalDeleted = 0;

    for (const collectionPath of collectionsToDelete) {
        console.log(`\n=============================================`);
        console.log(`📁 ตรวจสอบ Collection: ${collectionPath}`);

        try {
            // Query ข้อมูลด้วยเงื่อนไข 3 ชั้น (ต้องตรงกันทั้ง 3 เงื่อนไข)
            const snapshot = await db.collection(collectionPath)
                .where('dynamicFields.ชั้น', '==', 'ชั้น 4 โซน 2')
                .where('dynamicFields.เสาเบอร์', '==', 'CORE ST02')
                .where('dynamicFields.Gridline', '==', '23-23/M-P')
                .get();

            if (snapshot.empty) {
                console.log(`✅ ไม่พบข้อมูลใน ${collectionPath} (ข้ามไป...)`);
                continue;
            }

            console.log(`⚠️ พบข้อมูลทั้งหมด: ${snapshot.size} รายการ`);
            console.log(`🗑️ กำลังลบข้อมูล (Batch mode)...`);

            let batch = db.batch();
            let totalDeleted = 0;
            let batchCount = 0; // Firestore 1 batch ลบได้สุงสุด 500 รอบ

            // ทำการวนลูปเพื่อเตรียมคำสั่งลบ
            for (const doc of snapshot.docs) {
                batch.delete(doc.ref);

                batchCount++;
                totalDeleted++;
                grandTotalDeleted++;

                // ถ้าถึง 500 (ลิมิตของ Firestore Batch) ให้ commit ของชุดนั้นก่อนแล้วเริ่ม batch ใหม่
                if (batchCount === 500) {
                    await batch.commit();
                    console.log(`  - บันทึกการลบสำเร็จ ${totalDeleted} รายการ...`);
                    batch = db.batch(); // สร้าง batch ใหม่
                    batchCount = 0;
                }
            }

            // Commit ส่วนที่เหลือ
            if (batchCount > 0) {
                await batch.commit();
            }

            console.log(`✅ ${collectionPath}: ลบข้อมูลรวมเสร็จสิ้น ${totalDeleted} รายการ`);

        } catch (error) {
            console.error(`❌ เกิดข้อผิดพลาดระหว่างลบข้อมูลใน ${collectionPath}:`, error);
        }
    }

    console.log(`\n=============================================`);
    console.log(`🎉 เสร็จสิ้นกระบวนการทั้งหมด!`);
    console.log(`📊 จำนวนข้อมูลที่ลบรวมทั้งหมดในทุก Collection: ${grandTotalDeleted} รายการ`);
    process.exit(0);
}

// รันฟังก์ชัน
deleteSpecificPhotos();
