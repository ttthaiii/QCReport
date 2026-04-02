const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ Error: serviceAccountKey.json not found!');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();
const CSV_FILE_PATH = path.join(__dirname, 'Column_options.csv');

async function runAudit() {
    console.log('🔍 Loading Master Plan from CSV...');
    const masterPlan = new Set(); // Store "C18|Zone 1|14/A"
    const masterCols = new Set(); // Store just "C18"
    let expectedCount = 0;

    if (fs.existsSync(CSV_FILE_PATH)) {
        await new Promise((resolve, reject) => {
            fs.createReadStream(CSV_FILE_PATH)
                .pipe(csv({
                    headers: ['Project', 'Category', 'เสาเบอร์', 'โซน', 'Gridline'],
                    skipLines: 1
                }))
                .on('data', (row) => {
                    const colName = row['เสาเบอร์']?.trim();
                    const zone = row['โซน']?.trim();
                    const gridline = row['Gridline']?.trim();
                    if (colName) {
                        masterPlan.add(`${colName}|${zone}|${gridline}`);
                        masterCols.add(colName);
                        expectedCount++;
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });
    } else {
        console.error('❌ Error: CSV not found!');
        process.exit(1);
    }

    console.log(`✅ Loaded ${expectedCount} column entries from CSV Master Plan (from ${masterCols.size} unique column names).\n`);

    console.log('🔍 Fetching database records (latestQcPhotos) to audit by Floor...');
    const snapshot = await db.collection('latestQcPhotos')
        .where('reportType', '==', 'QC')
        .get();

    // Group by floor
    const floorsMap = new Map();

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.category?.includes('เสา') || data.topic?.includes('เสา')) {
            const floorRaw = data.dynamicFields && data.dynamicFields['ชั้น'] ? data.dynamicFields['ชั้น'].trim() : 'ไม่มีชั้น (Unknown)';
            
            // Clean up floor string if it contains zone
            let floor = floorRaw;
            if (floorRaw.includes('โซน')) {
                floor = floorRaw.split(/ โซน |โซน/)[0].trim();
            }

            const rawColName = data.dynamicFields && (data.dynamicFields['เสาเบอร์'] || data.dynamicFields['เบอร์เสา'] || data.dynamicFields['ชื่อเสา']);
            const colName = rawColName ? rawColName.trim() : 'ไม่มีชื่อเสา';
            
            let zone = data.dynamicFields && data.dynamicFields['โซน'] ? data.dynamicFields['โซน'].trim() : '';
            if (!zone && floorRaw.includes('โซน')) {
                const parts = floorRaw.split(/ โซน |โซน/);
                if (parts.length >= 2) zone = `Zone ${parts[1].trim()}`; // Note: user CSV uses "Zone 1", but DB might have "โซน 1". We might need to handle this.
            }
            // Normalize "โซน 1" to "Zone 1" to match CSV for auditing purposes
            if (zone.startsWith('โซน ')) zone = zone.replace('โซน ', 'Zone ');
            if (zone === 'โซน1' || zone === 'โซน2') zone = zone.replace('โซน', 'Zone ');

            const gridline = data.dynamicFields && data.dynamicFields['Gridline'] ? data.dynamicFields['Gridline'].trim() : '';

            if (!floorsMap.has(floor)) {
                floorsMap.set(floor, {
                    records: [],
                    foundMasterItems: new Set()
                });
            }

            const floorData = floorsMap.get(floor);
            const signature = `${colName}|${zone}|${gridline}`;
            
            const isMatch = masterPlan.has(signature);
            if (isMatch) floorData.foundMasterItems.add(signature);

            floorData.records.push({
                colName, zone, gridline, isMatch, docId: doc.id
            });
        }
    });

    console.log(`\n================ AUDIT REPORT BY FLOOR ================`);
    
    // Sort floors by name conceptually
    const sortedFloors = Array.from(floorsMap.keys()).sort();

    for (const floor of sortedFloors) {
        const data = floorsMap.get(floor);
        console.log(`\n🏢 ชั้น: ${floor}`);
        console.log(`   รวมทั้งหมดในระบบ: ${data.records.length} รายการ`);

        const missing = [];
        for (const item of masterPlan) {
            if (!data.foundMasterItems.has(item)) {
                missing.push(item);
            }
        }

        const extraOrMismatched = data.records.filter(r => !r.isMatch);

        console.log(`   ✅ ตรงกับ CSV (Match): ${data.foundMasterItems.size} รายการ`);
        
        if (extraOrMismatched.length > 0) {
            console.log(`   ⚠️ ข้อมูลเกิน หรือ กรอกผิด (Extra/Mismatch): ${extraOrMismatched.length} รายการ`);
            // Show max 5 examples to not flood screen
            const printCount = Math.min(5, extraOrMismatched.length);
            for (let i = 0; i < printCount; i++) {
                const r = extraOrMismatched[i];
                console.log(`       - ${r.colName} | ${r.zone || 'ไม่มีโซน'} | ${r.gridline || 'ไม่มีกลิดไลน์'} (ID: ${r.docId})`);
            }
            if (extraOrMismatched.length > 5) console.log(`       ... และอื่นๆ อีก ${extraOrMismatched.length - 5} รายการ`);
        } else {
            console.log(`   ⚠️ ข้อมูลเกิน หรือ กรอกผิด (Extra/Mismatch): 0 รายการ`);
        }

        if (missing.length > 0) {
            console.log(`   ❌ ข้อมูลที่หายไปจาก CSV (Missing): ${missing.length} รายการ`);
            // Do not print all missing items as it might be a floor that just didn't have these columns (like Floor 20 missing parking columns)
            // But let's show a few.
            const printCount = Math.min(3, missing.length);
            for (let i = 0; i < printCount; i++) {
                const parts = missing[i].split('|');
                console.log(`       - ${parts[0]} | ${parts[1]} | ${parts[2]}`);
            }
            if (missing.length > 3) console.log(`       ... และอื่นๆ อีก ${missing.length - 3} รายการ`);
        } else {
            console.log(`   ❌ ข้อมูลที่หายไปจาก CSV (Missing): 0 รายการ (ครบถ้วนสมบูรณ์!)`);
        }
    }

    console.log(`\n=======================================================`);
    process.exit(0);
}

runAudit();
