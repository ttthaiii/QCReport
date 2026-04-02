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

// Function to process a specific collection
async function processCollection(collectionName) {
    console.log(`\n--- Processing Collection: ${collectionName} ---`);
    const snapshot = await db.collection(collectionName)
        .where('reportType', '==', 'QC')
        .get();

    let updatedCount = 0;

    const batchArgs = [];
    let currentBatch = db.batch();
    let batchCount = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.category?.includes('เสา') || data.topic?.includes('เสา')) {
            if (data.dynamicFields && data.dynamicFields['ชั้น']) {
                const floorString = data.dynamicFields['ชั้น'];
                
                // Check if it contains "โซน" e.g., "ชั้น 16 โซน 2"
                if (floorString.includes('โซน')) {
                    // Split the string by " โซน " or "โซน"
                    const parts = floorString.split(/ โซน |โซน/);
                    if (parts.length >= 2) {
                        const newFloor = parts[0].trim(); // e.g., "ชั้น 16"
                        const newZone = `โซน ${parts[1].trim()}`; // e.g., "โซน 2"

                        // Prepare the updated dynamicFields object
                        const newDynamicFields = { ...data.dynamicFields };
                        newDynamicFields['ชั้น'] = newFloor;
                        
                        // Only add Zone if they didn't already have one
                        if (!newDynamicFields['โซน']) {
                            newDynamicFields['โซน'] = newZone;
                        }

                        // Add to batch
                        currentBatch.update(doc.ref, { dynamicFields: newDynamicFields });
                        batchCount++;
                        updatedCount++;

                        console.log(`Prepared Update [${doc.id}]: "${floorString}" -> ชั้น: "${newFloor}", โซน: "${newDynamicFields['โซน']}"`);

                        // Commit batch every 400 operations (Firestore limit is 500)
                        if (batchCount >= 400) {
                            batchArgs.push(currentBatch.commit());
                            currentBatch = db.batch();
                            batchCount = 0;
                        }
                    }
                }
            }
        }
    });

    // Commit any remaining updates
    if (batchCount > 0) {
        batchArgs.push(currentBatch.commit());
    }

    if (batchArgs.length > 0) {
        await Promise.all(batchArgs);
        console.log(`✅ Passed batch commit for ${updatedCount} documents in ${collectionName}.`);
    } else {
        console.log(`ℹ️ No documents needed updating in ${collectionName}.`);
    }
}

async function migrateData() {
    console.log('🚀 Starting Data Migration: Separating "ชั้น" and "โซน" only...');
    try {
        await processCollection('qcPhotos');
        await processCollection('latestQcPhotos');
        console.log('\n🎉 Data Migration Completed Successfully!');
    } catch (error) {
        console.error('❌ Migration Error:', error);
    }
    process.exit(0);
}

migrateData();
