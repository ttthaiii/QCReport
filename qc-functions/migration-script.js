// Filename: qc-functions/migration-script.js

// NEW: Load environment variables from .env file
require('dotenv').config(); 

const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');

// --- ⚠️ START CONFIGURATION ⚠️ ---

// 1. (REMOVED) No need for serviceAccountKey.json file anymore!

// 2. ระบุชื่อโครงการที่จะสร้าง
const PROJECT_NAME = "Escent Nakhon Si";
const PROJECT_CODE = "ESC-NS";

// 3. ระบุตำแหน่งไฟล์ CSV ทั้งสอง
const CATEGORY_CONFIG_PATH = './Category_Config.csv';
const QC_TOPICS_PATH = './หัวข้อการตรวจ QC.csv';

// --- ⚠️ END CONFIGURATION ⚠️ ---

if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log('🌱 Detected FIRESTORE_EMULATOR_HOST, connecting to local emulator...');
    // ถ้าใช่ ให้เชื่อมต่อกับ Emulator โดยไม่ต้องใช้กุญแจ
    // ใช้ Project ID ที่คุณตั้งค่าไว้ใน Emulator
    admin.initializeApp({
        projectId: 'qcreport-54164',
    });
} else {
    // ถ้าไม่ใช่ (เป็นการรันกับของจริง) ให้มองหา .env ตามปกติ
    console.log('🚀 Connecting to production Firebase using .env credentials...');
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.GOOGLE_PROJECT_ID,
                clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
                privateKey: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
        });
    } catch (error) {
        console.error('❌ Firebase Admin SDK initialization failed.');
        console.error('   Please check if your .env file is correct and in the right location.');
        process.exit(1); // ออกจากสคริปต์ถ้า .env ผิดพลาด
    }
}

const db = admin.firestore();

// Helper function to read CSV files
function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

async function migrateData() {
  console.log('🚀 Starting migration script using .env credentials...');

  try {
    // --- Step 1: Create the main project ---
    console.log(`Creating project: "${PROJECT_NAME}"...`);
    const projectRef = await db.collection('projects').add({
      projectName: PROJECT_NAME,
      projectCode: PROJECT_CODE,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true
    });
    const projectId = projectRef.id;
    console.log(`✅ Project created with ID: ${projectId}`);


    // --- Step 2: Read data from CSV files ---
    console.log('Reading CSV files...');
    const categoryConfigs = await readCsv(CATEGORY_CONFIG_PATH);
    const qcTopics = await readCsv(QC_TOPICS_PATH);
    console.log(`Found ${categoryConfigs.length} categories and ${qcTopics.length} topics.`);


    // --- Step 3: Process and create project configuration ---
    const configRef = db.collection('projectConfig').doc(projectId);
    const categoriesRef = configRef.collection('categories');

    let categoryOrderIndex = 1;
    for (const config of categoryConfigs) {
      const categoryName = config['หมวดงาน'];
      if (!categoryName) continue;

      console.log(`\nProcessing category: "${categoryName}"`);

      // Create dynamicFields array from CSV columns
      const dynamicFields = [];
      if (config['field1_name']) dynamicFields.push({ fieldName: config['field1_name'], fieldType: 'combobox', isRequired: true });
      if (config['field2_name']) dynamicFields.push({ fieldName: config['field2_name'], fieldType: 'combobox', isRequired: true });
      if (config['field3_name']) dynamicFields.push({ fieldName: config['field3_name'], fieldType: 'combobox', isRequired: false });
      if (config['field4_name']) dynamicFields.push({ fieldName: config['field4_name'], fieldType: 'combobox', isRequired: false });
      
      // Create category document
      const categoryDocRef = await categoriesRef.add({
        categoryName: categoryName.trim(),
        orderIndex: categoryOrderIndex++,
        dynamicFields: dynamicFields
      });
      console.log(`  -> Created category document with ID: ${categoryDocRef.id}`);

      // Filter topics for the current category
      const topicsForCategory = qcTopics.filter(t => t['หมวดงาน'].trim() === categoryName.trim());
      const topicsRef = categoryDocRef.collection('topics');
      
      let topicOrderIndex = 1;
      for (const topic of topicsForCategory) {
        const topicName = topic['หัวข้อ'];
        if (topicName) {
           await topicsRef.add({
             topicName: topicName.trim(),
             orderIndex: topicOrderIndex++
           });
        }
      }
      console.log(`  -> Added ${topicsForCategory.length} topics to this category.`);
    }

    console.log('\n\n🎉 Migration completed successfully!');
    console.log('Please check your Firestore database to verify the data.');

  } catch (error) {
    console.error('❌ An error occurred during migration:', error);
  }
}

// Run the script
migrateData();