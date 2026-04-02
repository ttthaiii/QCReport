const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ Error: serviceAccountKey.json not found!');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

// The missing 11 column names based on our previous calculation (after C2 is fixed)
const missingColumns = [
    'C17', 'C18', 'C19', 'C20', 'C21', 'C22', 'C23', 'C26', 'C39', 'C40', 'ST02'
];

async function checkHistoricalData() {
    console.log(`\n🔍 Checking Historical Gridlines for ${missingColumns.length} Missing Columns...`);

    const results = new Map();

    const snapshot = await db.collection('latestQcPhotos')
        .where('reportType', '==', 'QC')
        .get();

    snapshot.forEach(doc => {
        const data = doc.data();
        if(data.category?.includes('เสา') || data.topic?.includes('เสา')) {
            const floorStr = data.dynamicFields && data.dynamicFields['ชั้น'] ? data.dynamicFields['ชั้น'] : '';
            const gridline = data.dynamicFields && data.dynamicFields['Gridline'] ? data.dynamicFields['Gridline'] : 'ไม่มีข้อมูล (null/empty)';
            const rawColName = data.dynamicFields && (data.dynamicFields['เสาเบอร์'] || data.dynamicFields['เบอร์เสา'] || data.dynamicFields['ชื่อเสา']);
            
            if (rawColName) {
                const cleanName = rawColName.trim();
                
                if (missingColumns.includes(cleanName)) {
                    if (!results.has(cleanName)) {
                        results.set(cleanName, new Set());
                    }
                    results.get(cleanName).add(`${floorStr} -> Gridline: ${gridline}`);
                }
            }
        }
    });

    if (results.size === 0) {
        console.log('\n❌ ไม่พบประวัติข้อมูลของ 11 เสานี้ใน latestQcPhotos เลยครับ');
    } else {
        console.log('\n✅ พบประวัติข้อมูลดังนี้:\n');
        for (const [colName, historySet] of results) {
            console.log(`📌 เสา ${colName}:`);
            for (const history of historySet) {
                console.log(`   - ${history}`);
            }
            console.log('');
        }
    }

    process.exit(0);
}

checkHistoricalData();
