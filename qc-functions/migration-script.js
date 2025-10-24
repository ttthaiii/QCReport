// Filename: qc-functions/migration-script-v2.js
// (ปรับปรุงจาก migration-script.js เดิมของคุณ)

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
    console.log(`🌱 Connecting to Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}...`);
    admin.initializeApp({ projectId: 'qcreport-54164' }); // ใช้อันเดียวกับใน index.ts
} else {
    console.log('🚀 Connecting to PRODUCTION Firestore...');
    // (ใน Production คุณต้องใช้ Service Account)
    // const serviceAccount = require("./keys/YOUR-SERVICE-ACCOUNT-KEY.json");
    // admin.initializeApp({
    //   credential: admin.credential.cert(serviceAccount),
    //   storageBucket: "qcreport-54164.appspot.com"
    // });
}
const db = admin.firestore();

// --- [ใหม่] Helper Function สำหรับสร้าง ID ที่เสถียร ---
function slugify(text) {
  if (typeof text !== 'string') return '';
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\u0E00-\u0E7F\w-]+/g, '') // Remove all non-word chars except Thai
    .replace(/--+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath, { encoding: 'utf8' })
      .on('error', (err) => reject(`Error reading CSV file: ${filePath}. Details: ${err.message}`))
      .pipe(csv({ mapHeaders: ({ header }) => header.trim(), bom: true }))
      .on('data', (data) => results.push(data))
      .on('end', () => {
        console.log(`✅ Read ${results.length} rows from ${path.basename(filePath)}`);
        resolve(results);
      })
      .on('error', (err) => reject(`Error parsing CSV: ${filePath}. Details: ${err.message}`));
  });
}

// --- [ใหม่] ตรรกะการ Migrate หลัก ---
async function migrateDataV2() {
  try {
    console.log('--- Starting Data Migration (V2 - ID Based) ---');

    // 1. อ่านข้อมูล CSV ทั้งหมด
    const projectsData = await readCsv(PROJECTS_CSV_PATH);
    const dynamicFieldsData = await readCsv(DYNAMIC_FIELDS_CSV_PATH);
    const qcTopicsData = await readCsv(QC_TOPICS_CSV_PATH);

    // 2. ประมวลผล Projects (Collection: projects)
    console.log('\n--- Processing Projects ---');
    const projectBatch = db.batch();
    
    // ✅ [ใหม่] กำหนดค่า Default Settings ที่นี่
    const defaultReportSettings = {
        layoutType: "default",
        photosPerPage: 6, // <-- ค่าเริ่มต้น 6 รูป
        customHeaderText: "",
        customFooterText: "",
        projectLogoUrl: ""
    };

    for (const project of projectsData) {
      const projectId = project.id ? project.id.trim() : null;
      if (!projectId) {
        console.warn('Skipping project with missing ID:', project);
        continue;
      }
      const projectRef = db.collection('projects').doc(projectId);

      // ✅ [แก้ไข] เพิ่ม reportSettings เข้าไปตอน set ข้อมูล
      projectBatch.set(projectRef, {
        projectName: project.name || 'Unnamed Project',
        projectCode: project.code || '',
        isActive: true,
        reportSettings: defaultReportSettings // <-- เพิ่มบรรทัดนี้
      });
      console.log(`  -> Preparing Project: ${projectId} (${project.name})`);
    }
    await projectBatch.commit();
    console.log(`  -> Committed ${projectsData.length} projects.`);

    
    // 3. ประมวลผล Dynamic Fields (เก็บใน Map)
    const fieldConfigMap = new Map();
    for (const config of dynamicFieldsData) {
        // ใช้ "หมวดงาน" (ซึ่งคือ SubCategory) เป็น Key
        const mapKey = `${config.projectId.trim()}|${config.หมวดงาน.trim()}`;
        const fields = [
            config.field1_name, 
            config.field2_name, 
            config.field3_name, 
            config.field4_name
        ].filter(Boolean); // กรองค่าว่าง/null ออก
        
        fieldConfigMap.set(mapKey, fields);
    }
    console.log(`\n--- Processed ${fieldConfigMap.size} Dynamic Field configs ---`);

    
    // 4. [ใหม่] ประมวลผล QC Topics เพื่อสร้าง Maps ของ Config
    console.log('\n--- Processing QC Topics into Maps ---');
    const projectConfigs = new Map();

    for (const row of qcTopicsData) {
      const projectId = row.projectId ? row.projectId.trim() : null;
      const mainName = row.MainCategory ? row.MainCategory.trim() : null;
      const subName = row.SubCategory ? row.SubCategory.trim() : null;
      const topicName = row.Topic ? row.Topic.trim() : null;

      if (!projectId || !mainName || !subName || !topicName) {
        console.warn(`  [!] Skipping row with missing data:`, row);
        continue;
      }
      
      // หา Config ของ Project นี้ หรือสร้างใหม่
      if (!projectConfigs.has(projectId)) {
          projectConfigs.set(projectId, {
              mainCategories: new Map(),
              subCategories: new Map(),
              topics: []
          });
      }
      const config = projectConfigs.get(projectId);

      // สร้าง ID ที่เสถียร
      const mainId = slugify(mainName);
      const subId = slugify(`${mainName}-${subName}`); // สร้าง ID เฉพาะตัว (เผื่อชื่อซ้ำข้ามหมวด)
      const topicId = slugify(`${mainName}-${subName}-${topicName}`);
      
      // เพิ่ม Main Category (ถ้ายังไม่มี)
      if (!config.mainCategories.has(mainId)) {
          config.mainCategories.set(mainId, {
              name: mainName,
              isArchived: false
          });
      }

      // เพิ่ม Sub Category (ถ้ายังไม่มี)
      if (!config.subCategories.has(subId)) {
          // ดึง Dynamic Fields จาก Map
          const fieldMapKey = `${projectId}|${subName}`;
          const dynamicFields = fieldConfigMap.get(fieldMapKey) || [];

          config.subCategories.set(subId, {
              name: subName,
              mainCategoryId: mainId, // อ้างอิง ID ของ Main
              dynamicFields: dynamicFields,
              isArchived: false
          });
      }
      
      // เพิ่ม Topic (เป็น Array)
      config.topics.push({
          id: topicId,
          name: topicName,
          subCategoryId: subId, // อ้างอิง ID ของ Sub
          isArchived: false
      });
    }

    // 5. [ใหม่] บันทึก Config ลง Firestore (แบบ Flat)
    console.log('\n--- Writing Project Configs to Emulator ---');
    
    for (const [projectId, config] of projectConfigs.entries()) {
        console.log(`  -> Writing config for Project: ${projectId}`);
        const projectConfigRef = db.collection('projectConfig').doc(projectId);
        const batch = db.batch();

        // 5.1 เขียน Main Categories
        for (const [mainId, data] of config.mainCategories.entries()) {
            const docRef = projectConfigRef.collection('mainCategories').doc(mainId);
            batch.set(docRef, data);
        }
        console.log(`    -> Queued ${config.mainCategories.size} Main Categories`);
        
        // 5.2 เขียน Sub Categories
        for (const [subId, data] of config.subCategories.entries()) {
            const docRef = projectConfigRef.collection('subCategories').doc(subId);
            batch.set(docRef, data);
        }
        console.log(`    -> Queued ${config.subCategories.size} Sub Categories`);

        // 5.3 เขียน Topics
        // (เราใช้ Batch ไม่ได้ถ้า topics เยอะมากๆ แต่สำหรับตอนนี้ Batch สะดวกกว่า)
        // (ถ้ามี Topics > 500 รายการต่อ Project ให้เปลี่ยนไปใช้ .add() วนลูปแทน)
        for (const topicData of config.topics) {
            const docRef = projectConfigRef.collection('topics').doc(topicData.id);
            // แยก id ออกจาก data
            const { id, ...data } = topicData;
            batch.set(docRef, data);
        }
        console.log(`    -> Queued ${config.topics.length} Topics`);

        // 5.4 Commit!
        await batch.commit();
        console.log(`  -> Committed config for ${projectId}`);
    }

    console.log('\n\n🎉 Migration (V2) completed successfully!');

  } catch (error) {
    console.error('❌ An error occurred during migration (V2):', error);
  }
}

// Run the new migration
migrateDataV2();