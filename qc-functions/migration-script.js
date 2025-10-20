// Filename: qc-functions/migration-script.js (FINAL & ROBUST VERSION)

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// --- CONFIGURATION ---
const PROJECTS_CSV_PATH = path.join(__dirname, 'Projects.csv');
const QC_TOPICS_CSV_PATH = path.join(__dirname, 'หัวข้อการตรวจ QC.csv');
const DYNAMIC_FIELDS_CSV_PATH = path.join(__dirname, 'Category_Config.csv');

// --- INITIALIZE FIREBASE ---
if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log('🌱 Detected FIRESTORE_EMULATOR_HOST, connecting to local emulator...');
    admin.initializeApp({ projectId: 'qcreport-54164' });
} else {
    console.log('🚀 Connecting to PRODUCTION Firestore...');
}
const db = admin.firestore();

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .on('error', (err) => reject(`Error reading CSV file: ${filePath}. Details: ${err.message}`))
      .pipe(csv({ mapHeaders: ({ header }) => header.trim(), bom: true }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function migrateData() {
  console.log('🚀 Starting migration script...');

  try {
    const projects = await readCsv(PROJECTS_CSV_PATH);
    const qcTopics = await readCsv(QC_TOPICS_CSV_PATH);
    const dynamicFieldConfigs = await readCsv(DYNAMIC_FIELDS_CSV_PATH);
    console.log(`Found ${projects.length} projects, ${qcTopics.length} topic entries, and ${dynamicFieldConfigs.length} dynamic field configurations.`);

    const fieldConfigMap = new Map();
    for (const config of dynamicFieldConfigs) {
        // ✅ FIX: ค้นหา Header ที่ถูกต้อง แม้จะมี BOM Character ซ่อนอยู่
        const headers = Object.keys(config);
        const subCategoryHeader = headers.find(h => h.includes('หมวดงาน'));
        const projectIdHeader = headers.find(h => h.includes('projectId'));

        // ดึงข้อมูลโดยใช้ Header ที่ค้นเจอ
        const subCategoryFromCsv = config[subCategoryHeader];
        const projectIdFromCsv = config[projectIdHeader];

        if (!subCategoryFromCsv || !projectIdFromCsv) continue;
      
        const cleanedSubCategory = subCategoryFromCsv.trim();
        const key = `${projectIdFromCsv.trim()}|${cleanedSubCategory}`;
        
        const fields = [];
        for (let i = 1; i <= 4; i++) {
            const fieldKey = `field${i}_name`;
            if (config[fieldKey] && config[fieldKey].trim() !== "") {
                fields.push(config[fieldKey].trim());
            }
        }
        fieldConfigMap.set(key, fields);
    }
    
    for (const project of projects) {
        const { id: projectId, name: projectName, code: projectCode } = project;
        if (!projectId || !projectName) continue;

        console.log(`\n--- Processing Project: "${projectName}" (ID: ${projectId}) ---`);
        await db.collection('projects').doc(projectId).set({ projectName, projectCode, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`✅ Project document created/updated.`);

        const projectConfigData = {};
        const topicsForProject = qcTopics.filter(t => t.projectId === projectId);

        for (const topicRow of topicsForProject) {
            const { MainCategory, SubCategory, Topic } = topicRow;
            if (!MainCategory || !SubCategory || !Topic) continue;
            if (!projectConfigData[MainCategory]) projectConfigData[MainCategory] = {};
            if (!projectConfigData[MainCategory][SubCategory]) projectConfigData[MainCategory][SubCategory] = new Set();
            projectConfigData[MainCategory][SubCategory].add(Topic);
        }
        
        const projectConfigRef = db.collection("projectConfig").doc(projectId);

        for (const mainCategoryName in projectConfigData) {
            const mainCategoryRef = await projectConfigRef.collection("mainCategories").add({ name: mainCategoryName });
            console.log(`  -> Main Category: ${mainCategoryName}`);

            const subCategories = projectConfigData[mainCategoryName];
            for (const subCategoryName in subCategories) {
                const mapKey = `${projectId.trim()}|${subCategoryName.trim()}`;
                const dynamicFields = fieldConfigMap.get(mapKey) || [];

                const subCategoryRef = await mainCategoryRef.collection("subCategories").add({ name: subCategoryName, dynamicFields: dynamicFields });
                console.log(`    -> Sub Category: ${subCategoryName} with fields: [${dynamicFields.join(', ')}]`);

                const topics = Array.from(subCategories[subCategoryName]);
                for (const topicName of topics) {
                    await subCategoryRef.collection("topics").add({ name: topicName });
                }
                console.log(`      -> Added ${topics.length} topics.`);
            }
        }
    }
    console.log('\n\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ An error occurred during migration:', error);
  }
}

migrateData();