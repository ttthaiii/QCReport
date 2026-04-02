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

async function loadCSVColumns() {
    const csvDataConfig = new Map();
    if (fs.existsSync(CSV_FILE_PATH)) {
        await new Promise((resolve, reject) => {
            fs.createReadStream(CSV_FILE_PATH)
                .pipe(csv({
                    headers: ['Project', 'Category', 'เสาเบอร์', 'โซน', 'Gridline'],
                    skipLines: 1 // Skip original header
                }))
                .on('data', (row) => {
                    const colName = row['เสาเบอร์'];
                    if (colName) {
                        const cleanName = colName.trim();
                        // Handle the C29 duplicate -> C2 if user hasn't saved yet
                        const finalName = cleanName === 'C29' && csvDataConfig.has('C29') ? 'C2' : cleanName;
                        csvDataConfig.set(finalName, row['Gridline'] ? row['Gridline'].trim() : '');
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });
    }
    return csvDataConfig;
}

async function checkCSVColumnsConsistency() {
    console.log(`\n🔍 Loading Reference Data from CSV...`);
    const csvConfig = await loadCSVColumns();
    const csvColumns = Array.from(csvConfig.keys());
    console.log(`✅ Loaded ${csvColumns.length} columns from CSV.`);

    console.log(`\n🔍 Checking Database for Historical Gridlines of these ${csvColumns.length} columns...`);

    const results = new Map();

    const snapshot = await db.collection('latestQcPhotos')
        .where('reportType', '==', 'QC')
        .get();

    snapshot.forEach(doc => {
        const data = doc.data();
        if(data.category?.includes('เสา') || data.topic?.includes('เสา')) {
            const floorStr = data.dynamicFields && data.dynamicFields['ชั้น'] ? data.dynamicFields['ชั้น'] : '';
            const gridline = data.dynamicFields && data.dynamicFields['Gridline'] ? data.dynamicFields['Gridline'].trim() : 'ไม่มีข้อมูล (null/empty)';
            const rawColName = data.dynamicFields && (data.dynamicFields['เสาเบอร์'] || data.dynamicFields['เบอร์เสา'] || data.dynamicFields['ชื่อเสา']);
            
            if (rawColName) {
                const cleanName = rawColName.trim();
                
                if (csvColumns.includes(cleanName)) {
                    if (!results.has(cleanName)) {
                        results.set(cleanName, new Set());
                    }
                    results.get(cleanName).add(gridline);
                }
            }
        }
    });

    let inconsistentCount = 0;
    console.log('\n--- ⚠️ Columns in CSV with MULTIPLE Historical Gridlines ---');
    
    for (const [colName, gridlinesSet] of results) {
        // If a column has more than 1 distinct Gridline historically recorded (ignoring null/empty if it's the only other one, maybe?)
        // Let's just output anything with more than 1 unique Gridline string.
        if (gridlinesSet.size > 1) {
            inconsistentCount++;
            console.log(`📌 เสา ${colName} (ใน CSV ระบุเป็น: ${csvConfig.get(colName)})`);
            for (const gl of gridlinesSet) {
                console.log(`   - ประวัติใน DB: ${gl}`);
            }
            console.log('');
        }
    }

    if (inconsistentCount === 0) {
        console.log('🎉 ยอดเยี่ยม! เสาทั้งหมดใน CSV มีการใช้งาน Gridline สอดคล้องกัน (มีแค่ 1 แบบ) ในอดีตทั้งหมดครับ');
    } else {
        console.log(`⚠️ พบเสาใน CSV จำนวน ${inconsistentCount} ต้น ที่ในอดีตเคยถูกกรอก Gridline หลายแบบผสมกัน!`);
    }

    process.exit(0);
}

checkCSVColumnsConsistency();
