// Filename: qc-functions/migration-script.js (REPLACE ALL - FINAL PATH FIX VERSION)

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path'); // ✅ ADDED: Import the 'path' module

// --- ⚠️ CONFIGURATION ⚠️ ---
// ✅ FIXED: Use path.join to create correct, absolute paths to the CSV files
const PROJECTS_CSV_PATH = path.join(__dirname, 'Projects.csv');
const QC_TOPICS_CSV_PATH = path.join(__dirname, 'หัวข้อการตรวจ QC.csv');
const CATEGORY_CONFIG_PATH = path.join(__dirname, 'Category_Config.csv');
// --- ⚠️ END CONFIGURATION ⚠️ ---

if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log('🌱 Detected FIRESTORE_EMULATOR_HOST, connecting to local emulator...');
    admin.initializeApp({ projectId: 'qcreport-54164' });
} else {
    // Production connection logic...
}
const db = admin.firestore();

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .on('error', reject) // Handle file not found error early
      .pipe(csv({
          mapHeaders: ({ header }) => header.trim(),
          bom: true
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function migrateData() {
  console.log('🚀 Starting FINAL ROBUST migration script...');

  try {
    const projects = await readCsv(PROJECTS_CSV_PATH);
    const qcTopics = await readCsv(QC_TOPICS_CSV_PATH);
    const categoryConfigs = await readCsv(CATEGORY_CONFIG_PATH);

    console.log(`Found ${projects.length} projects, ${qcTopics.length} topics, and ${categoryConfigs.length} category configs.`);

    for (const project of projects) {
      const projectId = project['id'];
      const projectName = project['name'];
      const projectCode = project['code'];
      
      if (!projectId || !projectName) {
        console.warn('⚠️ Skipping a row in Projects.csv due to missing id or name.');
        continue;
      }

      console.log(`\n--- Processing Project: "${projectName}" (ID: ${projectId}) ---`);
      
      await db.collection('projects').doc(projectId).set({
        projectName, projectCode, isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Project document created/updated.`);

      // Your existing logic for creating projectConfig
      const configsForProject = categoryConfigs.filter(c => c.projectId === projectId);
      const categoriesRef = db.collection('projectConfig').doc(projectId).collection('categories');
      
      let categoryOrderIndex = 1;
      for (const config of configsForProject) {
        const categoryName = config['หมวดงาน'];
        if (!categoryName) continue;

        console.log(`  -> Processing category: "${categoryName}"`);
        const categoryDocRef = await categoriesRef.add({
            categoryName: categoryName.trim(),
            orderIndex: categoryOrderIndex++,
            // dynamicFields logic can be added here if needed
        });

        const topicsForCategory = qcTopics.filter(t => t['MainCategory'] === categoryName.trim() && t['projectId'] === projectId);
        const topicsRef = categoryDocRef.collection('topics');
        
        let topicOrderIndex = 1;
        for (const topic of topicsForCategory) {
            const topicName = topic['Topic'];
            if (topicName) {
               await topicsRef.add({
                 topicName: topicName.trim(),
                 orderIndex: topicOrderIndex++
               });
            }
        }
        console.log(`    -> Added ${topicsForCategory.length} topics.`);
      }
    }
    console.log('\n\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ An error occurred during migration:', error);
  }
}

migrateData();