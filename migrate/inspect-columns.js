const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ Error: serviceAccountKey.json not found!');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

async function inspectColumns() {
    console.log('\n🔍 Inspecting "งานเสา" (Column) Data Structure...\n');
    
    try {
        // Query latestQcPhotos for reportType QC
        console.log('--- Checking latestQcPhotos (Latest 10) ---');
        const latestSnap = await db.collection('latestQcPhotos')
            .where('reportType', '==', 'QC')
            .limit(10)
            .get();

        if (latestSnap.empty) {
            console.log('No QC records found in latestQcPhotos.');
        } else {
            console.log(`Found ${latestSnap.size} sample records.\n`);
            latestSnap.forEach(doc => {
                const data = doc.data();
                if(data.category?.includes('เสา') || data.topic?.includes('เสา')) {
                    console.log(`Doc ID: ${doc.id}`);
                    console.log(`Category (Main): ${data.category}`);
                    console.log(`Topic (Sub): ${data.topic}`);
                    console.log(`Dynamic Fields:`, JSON.stringify(data.dynamicFields, null, 2));
                    console.log('-------------------------');
                }
            });
        }

        console.log('\n✅ Inspection Complete!');
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

inspectColumns().then(() => process.exit(0));
