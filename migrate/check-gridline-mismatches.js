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

async function checkMismatches() {
    console.log('\n🔍 Loading Reference Data from CSV...');
    
    // Map: ColumnName -> { zone, gridline }
    const csvDataConfig = new Map();
    
    await new Promise((resolve, reject) => {
        fs.createReadStream(CSV_FILE_PATH)
            .pipe(csv({
                headers: ['Project', 'Category', 'เสาเบอร์', 'โซน', 'Gridline'], // Override headers
                skipLines: 1 // Skip original header
            }))
            .on('data', (row) => {
                const colName = row['เสาเบอร์'];
                if (colName) {
                    const cleanName = colName.trim();
                    const zone = row['โซน'] ? row['โซน'].trim() : '';
                    const gridline = row['Gridline'] ? row['Gridline'].trim() : '';
                    csvDataConfig.set(cleanName, { zone, gridline });
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });
    
    console.log(`✅ Loaded ${csvDataConfig.size} column configurations from CSV.\n`);
    
    console.log('--- Checking Existing Records from Firestore (latestQcPhotos) ---');
    const latestSnap = await db.collection('latestQcPhotos')
        .where('reportType', '==', 'QC')
        .get();

    let checkedCount = 0;
    let mismatchCount = 0;
    const mismatches = [];

    latestSnap.forEach(doc => {
        const data = doc.data();
        if(data.category?.includes('เสา') || data.topic?.includes('เสา')) {
            const colName = data.dynamicFields && (data.dynamicFields['เสาเบอร์'] || data.dynamicFields['เบอร์เสา'] || data.dynamicFields['ชื่อเสา']);
            
            if (colName) {
                const cleanName = colName.trim();
                const dbGridline = data.dynamicFields['Gridline'] ? data.dynamicFields['Gridline'].trim() : null;
                
                // If it exists in CSV, let's compare
                if (csvDataConfig.has(cleanName)) {
                    checkedCount++;
                    const csvGridline = csvDataConfig.get(cleanName).gridline;
                    
                    if (dbGridline !== csvGridline) {
                        mismatchCount++;
                        mismatches.push({
                            เสาเบอร์: cleanName,
                            'ใน Database (ของเก่า)': dbGridline,
                            'ใน CSV (ของใหม่)': csvGridline
                        });
                    }
                }
            }
        }
    });

    console.log(`✅ Checked ${checkedCount} existing records that exist in the CSV.`);
    
    if (mismatchCount > 0) {
        console.log(`\n⚠️  WARNING: Found ${mismatchCount} records where Database Gridline DOES NOT MATCH CSV:`);
        console.table(mismatches);
    } else {
        console.log(`\n🎉 GREAT: All checked records have Gridlines that perfectly match the CSV!`);
    }

    process.exit(0);
}

checkMismatches().catch(console.error);
