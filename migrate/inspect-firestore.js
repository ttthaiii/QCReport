// Filename: inspect-firestore.js
// Script สำหรับดึงโครงสร้างข้อมูลจาก Firestore

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ========================================
// 1. Initialize Firebase Admin
// ========================================
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ Error: serviceAccountKey.json not found!');
    console.log('Please place your Firebase service account key file in the current directory.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath)
});

const db = admin.firestore();

// ========================================
// 2. Helper Functions
// ========================================

async function getCollectionStructure(collectionName, limit = 3) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📂 Collection: ${collectionName}`);
    console.log('='.repeat(60));
    
    try {
        const snapshot = await db.collection(collectionName)
            .limit(limit)
            .get();
        
        if (snapshot.empty) {
            console.log('   (Empty collection)');
            return null;
        }
        
        console.log(`   Total documents (sample): ${snapshot.size}`);
        
        const samples = [];
        snapshot.forEach((doc, index) => {
            const data = doc.data();
            console.log(`\n   --- Document ${index + 1}: ${doc.id} ---`);
            
            // Show all fields
            Object.keys(data).forEach(key => {
                let value = data[key];
                
                // Format different data types
                if (value && typeof value === 'object') {
                    if (value._seconds !== undefined) {
                        // Firestore Timestamp
                        value = `[Timestamp: ${new Date(value._seconds * 1000).toISOString()}]`;
                    } else {
                        value = JSON.stringify(value, null, 2).substring(0, 200);
                    }
                } else if (typeof value === 'string' && value.length > 100) {
                    value = value.substring(0, 100) + '...';
                }
                
                console.log(`   ${key}: ${value}`);
            });
            
            samples.push({ id: doc.id, data });
        });
        
        return samples;
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return null;
    }
}

async function getSubcollections(parentCollection, parentDocId, limit = 2) {
    console.log(`\n   📁 Subcollections in ${parentCollection}/${parentDocId}:`);
    
    try {
        const docRef = db.collection(parentCollection).doc(parentDocId);
        const collections = await docRef.listCollections();
        
        if (collections.length === 0) {
            console.log('      (No subcollections)');
            return;
        }
        
        for (const collection of collections) {
            console.log(`\n      ↳ Subcollection: ${collection.id}`);
            
            const snapshot = await collection.limit(limit).get();
            
            if (snapshot.empty) {
                console.log('         (Empty)');
                continue;
            }
            
            snapshot.forEach((doc, index) => {
                const data = doc.data();
                console.log(`\n         --- Document ${index + 1}: ${doc.id} ---`);
                
                Object.keys(data).forEach(key => {
                    let value = data[key];
                    
                    if (value && typeof value === 'object') {
                        if (value._seconds !== undefined) {
                            value = `[Timestamp]`;
                        } else {
                            value = JSON.stringify(value).substring(0, 100);
                        }
                    } else if (typeof value === 'string' && value.length > 80) {
                        value = value.substring(0, 80) + '...';
                    }
                    
                    console.log(`         ${key}: ${value}`);
                });
            });
        }
    } catch (error) {
        console.error(`      ❌ Error: ${error.message}`);
    }
}

async function getProjectStructure() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏗️  PROJECT CONFIGURATION STRUCTURE`);
    console.log('='.repeat(60));
    
    try {
        // Get projects
        const projectsSnapshot = await db.collection('projects').limit(1).get();
        
        if (projectsSnapshot.empty) {
            console.log('   (No projects found)');
            return;
        }
        
        const projectDoc = projectsSnapshot.docs[0];
        const projectId = projectDoc.id;
        const projectData = projectDoc.data();
        
        console.log(`\n📋 Project: ${projectId}`);
        console.log(`   Name: ${projectData.projectName || 'N/A'}`);
        console.log(`   Active: ${projectData.isActive || 'N/A'}`);
        
        // Check for projectConfig collection (alternative structure)
        console.log(`\n\n📂 Checking projectConfig collection...`);
        const projectConfigSnapshot = await db.collection('projectConfig').limit(1).get();
        
        if (!projectConfigSnapshot.empty) {
            const configDoc = projectConfigSnapshot.docs[0];
            const configId = configDoc.id;
            console.log(`\n   📋 Config Document: ${configId}`);
            
            // Get mainCategories subcollection
            const mainCatsSnapshot = await db.collection('projectConfig')
                .doc(configId)
                .collection('mainCategories')
                .get();
            
            console.log(`\n   📂 Main Categories (${mainCatsSnapshot.size} total):`);
            
            for (const mainCatDoc of mainCatsSnapshot.docs) {
                const mainCatData = mainCatDoc.data();
                console.log(`\n      ├── ${mainCatData.name} (id: ${mainCatDoc.id})`);
                
                // Get subCategories for this mainCategory
                const subCatsSnapshot = await db.collection('projectConfig')
                    .doc(configId)
                    .collection('subCategories')
                    .where('mainCategoryId', '==', mainCatDoc.id)
                    .get();
                
                console.log(`      │   Sub Categories: ${subCatsSnapshot.size}`);
                
                for (const subCatDoc of subCatsSnapshot.docs) {
                    const subCatData = subCatDoc.data();
                    console.log(`      │   ├── ${subCatData.name}`);
                    console.log(`      │   │   ID: ${subCatDoc.id}`);
                    console.log(`      │   │   Dynamic Fields: ${JSON.stringify(subCatData.dynamicFields || [])}`);
                    console.log(`      │   │   Archived: ${subCatData.isArchived || false}`);
                    
                    // Get topics for this subCategory
                    const topicsSnapshot = await db.collection('projectConfig')
                        .doc(configId)
                        .collection('topics')
                        .where('subCategoryId', '==', subCatDoc.id)
                        .limit(3)
                        .get();
                    
                    if (topicsSnapshot.size > 0) {
                        console.log(`      │   │   Topics (${topicsSnapshot.size}):`);
                        topicsSnapshot.forEach(topicDoc => {
                            const topicData = topicDoc.data();
                            console.log(`      │   │   └── ${topicData.name}`);
                        });
                    }
                }
            }
        } else {
            console.log('   (No projectConfig found)');
        }
        
        // Get main categories (original structure)
        console.log(`\n\n📂 Checking subcollections structure...`);
        const mainCatsSnapshot = await db.collection('projects')
            .doc(projectId)
            .collection('mainCategories')
            .limit(2)
            .get();
        
        if (!mainCatsSnapshot.empty) {
            console.log(`\n   Found mainCategories subcollection\n`);
            
            for (const mainCatDoc of mainCatsSnapshot.docs) {
                const mainCatData = mainCatDoc.data();
                console.log(`\n   ├── ${mainCatData.name} (id: ${mainCatDoc.id})`);
                
                // Get sub categories
                const subCatsSnapshot = await db.collection('projects')
                    .doc(projectId)
                    .collection('subCategories')
                    .where('mainCategoryId', '==', mainCatDoc.id)
                    .limit(5)
                    .get();
                
                for (const subCatDoc of subCatsSnapshot.docs) {
                    const subCatData = subCatDoc.data();
                    console.log(`   │   ├── ${subCatData.name}`);
                    console.log(`   │   │   Dynamic Fields: ${JSON.stringify(subCatData.dynamicFields || [])}`);
                    
                    // Get topics
                    const topicsSnapshot = await db.collection('projects')
                        .doc(projectId)
                        .collection('topics')
                        .where('subCategoryId', '==', subCatDoc.id)
                        .limit(3)
                        .get();
                    
                    topicsSnapshot.forEach(topicDoc => {
                        const topicData = topicDoc.data();
                        console.log(`   │   │   └── ${topicData.name}`);
                    });
                }
            }
        } else {
            console.log('   (No mainCategories subcollection found)');
        }
        
        // Check for generatedReports subcollection
        await getSubcollections('projects', projectId, 2);
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
    }
}

// ========================================
// 3. Main Inspection Function
// ========================================

async function inspectFirestore() {
    console.log('\n🔍 Starting Firestore Structure Inspection...\n');
    
    try {
        // 1. Show all root collections
        const collections = await db.listCollections();
        console.log('📚 Root Collections Found:');
        collections.forEach(col => console.log(`   - ${col.id}`));
        
        // 2. Inspect qcPhotos
        await getCollectionStructure('qcPhotos', 3);
        
        // 3. Inspect latestQcPhotos
        await getCollectionStructure('latestQcPhotos', 3);
        
        // 4. Inspect dailyPhotos
        await getCollectionStructure('dailyPhotos', 2);
        
        // 5. Inspect project structure
        await getProjectStructure();
        
        console.log('\n\n✅ Inspection Complete!\n');
        
    } catch (error) {
        console.error('\n❌ Fatal Error:', error);
    }
}

// ========================================
// 4. Run the inspection
// ========================================

inspectFirestore()
    .then(() => {
        console.log('Exiting...');
        process.exit(0);
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });