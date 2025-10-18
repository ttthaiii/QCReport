// Filename: qc-functions/migration-script.js (REPLACE ALL - FINAL VERSION)

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// --- CONFIGURATION ---
const PROJECTS_CSV_PATH = path.join(__dirname, 'Projects.csv');
const QC_TOPICS_CSV_PATH = path.join(__dirname, 'หัวข้อการตรวจ QC.csv');

// --- INITIALIZE FIREBASE ---
if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log('🌱 Detected FIRESTORE_EMULATOR_HOST, connecting to local emulator...');
    admin.initializeApp({ projectId: 'qcreport-54164' });
} else {
    // Production connection logic...
}
const db = admin.firestore();

// --- HELPER FUNCTION ---
function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .on('error', reject)
      .pipe(csv({ mapHeaders: ({ header }) => header.trim(), bom: true }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// --- MAIN SCRIPT ---
async function migrateData() {
  console.log('🚀 Starting 3-LEVEL migration script...');

  try {
    const projects = await readCsv(PROJECTS_CSV_PATH);
    const qcTopics = await readCsv(QC_TOPICS_CSV_PATH);
    console.log(`Found ${projects.length} projects and ${qcTopics.length} topic entries.`);

    for (const project of projects) {
      const { id: projectId, name: projectName, code: projectCode } = project;
      if (!projectId || !projectName) continue;

      console.log(`\n--- Processing Project: "${projectName}" (ID: ${projectId}) ---`);
      
      await db.collection('projects').doc(projectId).set({
        projectName, projectCode, isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Project document created/updated.`);

      const projectConfigData = {};
      const topicsForProject = qcTopics.filter(t => t.projectId === projectId);

      for (const topicRow of topicsForProject) {
          const { MainCategory, SubCategory, Topic } = topicRow;
          if (!MainCategory || !SubCategory || !Topic) continue;

          if (!projectConfigData[MainCategory]) projectConfigData[MainCategory] = {};
          if (!projectConfigData[MainCategory][SubCategory]) projectConfigData[MainCategory][SubCategory] = [];
          projectConfigData[MainCategory][SubCategory].push(Topic);
      }
      
      // Write the 3-level structure to Firestore
      for (const mainCategoryName in projectConfigData) {
        const mainCategoryRef = await db.collection("projectConfig").doc(projectId)
          .collection("mainCategories").add({ name: mainCategoryName });
        console.log(`  -> Main Category: ${mainCategoryName}`);

        const subCategories = projectConfigData[mainCategoryName];
        for (const subCategoryName in subCategories) {
          const subCategoryRef = await mainCategoryRef.collection("subCategories").add({ name: subCategoryName });
          console.log(`    -> Sub Category: ${subCategoryName}`);

          const topics = subCategories[subCategoryName];
          for (const topicName of topics) {
            await subCategoryRef.collection("topics").add({ name: topicName });
          }
          console.log(`      -> Added ${topics.length} topics.`);
        }
      }
    }
    console.log('\n\n🎉 3-LEVEL MULTI-PROJECT Migration completed successfully!');

  } catch (error) {
    console.error('❌ An error occurred during migration:', error);
  }
}

migrateData();