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

async function checkColumnNames() {
    console.log('\n🔍 Loading Column Names from CSV...');
    
    const csvColumnNames = new Set();
    
    await new Promise((resolve, reject) => {
        fs.createReadStream(CSV_FILE_PATH)
            .pipe(csv())
            .on('data', (row) => {
                // Assuming the column name header is 'เบอร์เสา' or 'ชื่อเสา'. 
                // We'll inspect the CSV to be sure, but for now we look for likely headers.
                const colName = row['เบอร์เสา'] || row['เสาเบอร์'] || row['ชื่อเสา'] || row['Column Name'] || row['Name'];
                if (colName) {
                    csvColumnNames.add(colName.trim());
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });
    
    console.log(`✅ Loaded ${csvColumnNames.size} unique column names from CSV.\n`);
    
    console.log('--- Fetching Existing Records from Firestore (latestQcPhotos) ---');
    const latestSnap = await db.collection('latestQcPhotos')
        .where('reportType', '==', 'QC')
        .get();

    const dbColumnNames = new Set();
    const missingInCsv = new Set();

    latestSnap.forEach(doc => {
        const data = doc.data();
        if(data.category?.includes('เสา') || data.topic?.includes('เสา')) {
            const colName = data.dynamicFields && (data.dynamicFields['เสาเบอร์'] || data.dynamicFields['เบอร์เสา'] || data.dynamicFields['ชื่อเสา']);
            if (colName) {
                const cleanName = colName.trim();
                dbColumnNames.add(cleanName);
                if (!csvColumnNames.has(cleanName)) {
                    missingInCsv.add(cleanName);
                }
            }
        }
    });

    console.log(`✅ Found ${dbColumnNames.size} unique column names in Database.`);
    
    if (missingInCsv.size > 0) {
        console.log(`\n⚠️  WARNING: Found ${missingInCsv.size} column names in the Database that are MISSING from the CSV:`);
        Array.from(missingInCsv).sort().forEach(name => console.log(`   - ${name}`));
    } else if (dbColumnNames.size > 0) {
        console.log(`\n🎉 GREAT: All ${dbColumnNames.size} existing Database column names are present in the CSV!`);
    } else {
        console.log(`\nℹ️  No column names found in the Database to check against.`);
    }

    process.exit(0);
}

checkColumnNames().catch(console.error);
