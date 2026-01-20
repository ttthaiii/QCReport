// Filename: summarize_reports.js
// Script to read qcPhotos and summarize reports based on
// "Category" + "Dynamic Fields"

const admin = require('firebase-admin');

// ========================================
// 1. Configuration
// ========================================

const CONFIG = {
    // ❗️ (สำคัญ) วางไฟล์ serviceAccountKey.json ของคุณไว้ที่เดียวกับสคริปต์นี้
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json',
    
    // ❗️ (สำคัญ) ID ของโปรเจกต์ที่คุณต้องการสรุป
    projectId: 'project-001',
    
    // 🎯 Collection ที่เราจะดึงข้อมูลประวัติ (Log) ทั้งหมด
    collectionName: 'latestQcPhotos'
};

// ========================================
// 2. Initialize Firebase
// ========================================

try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(CONFIG.serviceAccountPath)
        });
    }
    db = admin.firestore();
    console.log("✅ Firebase Admin initialized\n");
} catch (e) {
    console.error(`❌ Error initializing Firebase: ${e.message}`);
    console.log("👉 Please make sure 'serviceAccountKey.json' is in the same directory.");
    process.exit(1);
}

// ========================================
// 3. Helper Function
// ========================================

function createReportKey(category, dynamicFields) {
    /**
     * สร้าง Key ที่ไม่ซ้ำกันสำหรับรายงาน 1 ฉบับ
     * โดยการรวม Category + Dynamic Fields ที่เรียงลำดับแล้ว
     */
    if (!dynamicFields || Object.keys(dynamicFields).length === 0) {
        return `${category}|EMPTY`;
    }
    
    // 1. ดึง Keys ทั้งหมดแล้วเรียงลำดับ
    const sortedKeys = Object.keys(dynamicFields).sort();
    
    // 2. สร้าง String "key=value" ที่เรียงลำดับแล้ว
    const sortedFields = sortedKeys.map(key => {
        return `${key}=${dynamicFields[key]}`;
    }).join('&');
    
    // 3. ใช้ JSON.stringify สำหรับการเปรียบเทียบที่แน่นอน (เผื่อกรณี Type ต่างกัน)
    // นี่เป็นวิธีที่ปลอดภัยที่สุดในการเปรียบเทียบ Object
    const stableJsonString = JSON.stringify(
        sortedKeys.reduce((obj, key) => { 
            obj[key] = dynamicFields[key]; 
            return obj; 
        }, {})
    );

    return `${category}|${stableJsonString}`;
}

// ========================================
// 4. Main Function
// ========================================

async function summarizeReports() {
    console.log(`🚀 Starting Report Summary for Project: ${CONFIG.projectId}`);
    console.log(`Reading from collection: ${CONFIG.collectionName}...\n`);
    console.log("=".repeat(60));

    // ใช้ Map เพื่อเก็บรายงาน (Key: Report Key, Value: Report Object)
    const reports = new Map();
    let totalPhotos = 0;

    try {
        // 1. ดึงข้อมูลทั้งหมดที่ตรงกับ projectId
        const snapshot = await db.collection(CONFIG.collectionName)
                                 .where("projectId", "==", CONFIG.projectId)
                                 .get();

        totalPhotos = snapshot.size;

        // 2. วนลูปข้อมูลทั้งหมด
        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            const category = data.category || "N/A";
            const dynamicFields = data.dynamicFields || {};
            
            // 3. สร้าง Key ที่ไม่ซ้ำกันสำหรับรายงานฉบับนี้
            const reportKey = createReportKey(category, dynamicFields);
            
            // 4. นับจำนวนรูปภาพ
            if (!reports.has(reportKey)) {
                reports.set(reportKey, {
                    category: category,
                    dynamic_fields: dynamicFields,
                    photo_count: 0
                });
            }
            
            // เพิ่มจำนวนรูป
            reports.get(reportKey).photo_count += 1;
        }

    } catch (error) {
        console.error(`💥 Fatal Error during data query: ${error.message}`);
        return;
    }

    // 5. พิมพ์สรุปผล
    console.log(`📊 Summary Complete!\n`);
    console.log(`Total Photos Scanned: ${totalPhotos}`);
    console.log(`Total Unique Reports: ${reports.size}\n`);
    console.log("-".repeat(60));

    // เรียงลำดับผลลัพธ์ตาม Category เพื่อง่ายต่อการอ่าน
    const sortedReports = Array.from(reports.values())
        .sort((a, b) => {
            if (a.category < b.category) return -1;
            if (a.category > b.category) return 1;
            return b.photo_count - a.photo_count; // รองลงมา เรียงตามจำนวนรูป
        });

    sortedReports.forEach((report, i) => {
        console.log(`\nReport #${i + 1}`);
        console.log(`  Category: ${report.category}`);
        
        // แปลง dynamic_fields เป็น JSON string ที่อ่านง่าย
        const fieldsStr = Object.keys(report.dynamic_fields).length > 0 
            ? JSON.stringify(report.dynamic_fields) 
            : "{}";
        console.log(`  Fields:   ${fieldsStr}`);
        console.log(`  Photos:   ${report.photo_count} รูป`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("✅ Analysis Complete!\n");
}

// ========================================
// 5. Run
// ========================================

summarizeReports()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n💥 Unhandled Fatal Error:', error);
        process.exit(1);
    });