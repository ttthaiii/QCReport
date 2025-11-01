// Filename: qc-functions/migration-script.js
// (ฉบับแก้ไขสมบูรณ์ - แก้ไข Logic การ Parse CSV ให้ตรงกับไฟล์จริง)

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// --- CONFIGURATION ---
// (อ้างอิงจากไฟล์ที่คุณอัปโหลด)
const PROJECTS_CSV_PATH = path.join(__dirname, 'Projects.csv');
const QC_TOPICS_CSV_PATH = path.join(__dirname, 'หัวข้อการตรวจ QC.csv');
const DYNAMIC_FIELDS_CSV_PATH = path.join(__dirname, 'Category_Config.csv');

// --- INITIALIZE FIREBASE ---
if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`🌱 Connecting to Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}...`);
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'; // Auth Emu
    admin.initializeApp({ projectId: 'qcreport-54164' });
} else {
    console.log('🚀 Connecting to PRODUCTION Firestore...');
    // (โค้ด Production)
admin.initializeApp(); 
}

const db = admin.firestore();
const auth = admin.auth(); // Auth service

// --- [ฟังก์ชันที่ 1] สร้าง God User (ส่วนนี้ทำงานถูกต้อง) ---
async function createGodUser(db, auth) {
  console.log('\n--- 1. Creating God User ---');
  
  const GOD_UID = 'god-admin-001';
  const GOD_EMAIL = 'god@admin.com';
  const GOD_PASS = 'password123';
  const GOD_DISPLAY_NAME = 'God Admin';
  const ASSIGNED_PROJECT_ID = null; // God ไม่มีโครงการสังกัด

  try {
    await auth.createUser({
      uid: GOD_UID, email: GOD_EMAIL, password: GOD_PASS,
      displayName: GOD_DISPLAY_NAME, emailVerified: true, disabled: false
    });
    console.log(`  -> Auth user created: ${GOD_EMAIL}`);
  } catch (error) {
    if (error.code === 'auth/uid-already-exists' || error.code === 'auth/email-already-exists') {
      console.log(`  -> Auth user ${GOD_EMAIL} already exists. Skipping creation.`);
    } else {
      console.error(`  -> Error creating auth user:`, error.message); return; 
    }
  }
  
  await auth.setCustomUserClaims(GOD_UID, { role: 'god' });
  console.log(`  -> Custom claim 'role: god' set for ${GOD_EMAIL}.`);

  const userDocRef = db.collection('users').doc(GOD_UID);
  try {
    await userDocRef.set({
      uid: GOD_UID, email: GOD_EMAIL, displayName: GOD_DISPLAY_NAME,
      assignedProjectId: ASSIGNED_PROJECT_ID, role: 'god', status: 'approved',
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: 'system-script',
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  -> Firestore profile created for 'god' (no project assignment).`);
  } catch (error) {
    console.error(`  -> Error creating firestore profile:`, error.message);
  }
  console.log('--- God User setup complete ---');
}


// --- [ฟังก์ชันที่ 2 - แก้ไข] อ่าน Projects.csv ---
// (แก้ไขให้ตรงกับ Header 'id' และ 'name')
async function parseProjects(filePath) {
    console.log('\n--- 2. Processing Projects.csv ---');
    const projects = new Map();
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
            .on('data', (row) => {
                // [แก้ไข] ใช้ 'id' และ 'name' จากไฟล์ Projects.csv
                const projectId = row['id'] ? row['id'].trim() : null;
                const projectName = row['name'] ? row['name'].trim() : null;
                
                if (projectId && projectName) {
                    projects.set(projectId, { 
                        id: projectId, 
                        projectName: projectName,
                        isActive: true
                    });
                }
            })
            .on('end', () => {
                console.log(`  -> Found ${projects.size} projects.`);
                resolve(projects);
            })
            .on('error', reject);
    });
}

// --- [ฟังก์ชันที่ 3 - แก้ไข] อ่าน Configs (CSV 2 ไฟล์) ---
// (แก้ไข Logic ทั้งหมดให้ตรงกับ Header 'หมวดงาน', 'MainCategory', 'SubCategory', 'Topic')
async function parseConfigs(qcTopicsPath, dynamicFieldsPath) {
    console.log('\n--- 3. Processing Config CSVs ---');
    
    const topicsData = []; // เก็บข้อมูลดิบจาก QC.csv
    const dynamicFieldsMap = new Map(); // Map(SubCategoryName -> [Fields])

    // 3.1 อ่าน Category_Config.csv (ไฟล์ Dynamic Fields)
    const fieldsPromise = new Promise((resolve, reject) => {
        fs.createReadStream(dynamicFieldsPath)
            .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
            .on('data', (row) => {
                // [แก้ไข] ใช้ 'หมวดงาน' เป็น Key (ซึ่งคือ SubCategory Name)
                const subCatName = row['หมวดงาน'] ? row['หมวดงาน'].trim() : null; 
                if (subCatName) {
                    // [แก้ไข] ใช้ 'field1_name', 'field2_name', ...
                    const fields = Object.keys(row)
                        .filter(key => key.startsWith('field') && key.endsWith('_name') && row[key])
                        .map(key => row[key].trim());
                    
                    dynamicFieldsMap.set(subCatName, fields);
                }
            })
            .on('end', () => {
                console.log(`  -> Processed ${dynamicFieldsMap.size} Dynamic Field configs.`);
                resolve();
            })
            .on('error', reject);
    });

    // 3.2 อ่าน หัวข้อการตรวจ QC.csv (ไฟล์โครงสร้างหลัก)
    const topicsPromise = new Promise((resolve, reject) => {
        fs.createReadStream(qcTopicsPath)
            .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
            .on('data', (row) => {
                // [แก้ไข] อ่าน 'MainCategory', 'SubCategory', 'Topic'
                const mainCatName = row['MainCategory'] ? row['MainCategory'].trim() : null;
                const subCatName = row['SubCategory'] ? row['SubCategory'].trim() : null;
                const topicName = row['Topic'] ? row['Topic'].trim() : null; // [แก้ไข] ใช้ 'Topic'
                
                if (mainCatName && subCatName && topicName) {
                    topicsData.push({ mainCatName, subCatName, topicName });
                }
            })
            .on('end', () => {
                console.log(`  -> Read ${topicsData.length} topics from ${path.basename(qcTopicsPath)}.`);
                resolve();
            })
            .on('error', reject);
    });

    await Promise.all([fieldsPromise, topicsPromise]);
    
    // 3.3 ส่งข้อมูลดิบและ Map ไปประมวลผล
    return { topicsData, dynamicFieldsMap };
}

// --- [ฟังก์ชันที่ 4 - แก้ไข] สร้างโครงสร้าง Config ---
// (ฟังก์ชันนี้จะแปลงข้อมูลดิบจาก parseConfigs ให้เป็นโครงสร้าง Firestore)
function createConfigStructure(topicsData, dynamicFieldsMap) {
    console.log('\n--- 4. Creating Config Structure ---');

    const mainCategoriesMap = new Map(); // Key: MainCatName, Value: { id, data }
    const subCategoriesMap = new Map(); // Key: SubCatName, Value: { id, data }
    const topicsList = [];

    // Helper (V2 เดิม)
    function slugifyThai(text) {
        if (typeof text !== 'string') return '';
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\uE00-\uE7F\w-]+/g, '') // Keep Thai
            .replace(/--+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    // [แก้ไข] ใช้ topicsData (จาก QC.csv) เป็นตัวหลักในการสร้างโครงสร้าง
    for (const { mainCatName, subCatName, topicName } of topicsData) {
        
        // 4.1 สร้าง Main Category (ถ้ายังไม่มี)
        if (!mainCategoriesMap.has(mainCatName)) {
            const mainCatId = slugifyThai(mainCatName) || `main-${mainCategoriesMap.size}`;
            mainCategoriesMap.set(mainCatName, {
                id: mainCatId,
                data: { name: mainCatName, isArchived: false }
            });
        }
        const mainCatId = mainCategoriesMap.get(mainCatName).id;

        // 4.2 สร้าง Sub Category (ถ้ายังไม่มี)
        if (!subCategoriesMap.has(subCatName)) {
            const subCatId = slugifyThai(`${mainCatName}-${subCatName}`) || `sub-${subCategoriesMap.size}`;
            subCategoriesMap.set(subCatName, {
                id: subCatId,
                data: {
                    name: subCatName,
                    mainCategoryId: mainCatId,
                    // [แก้ไข] ดึง Dynamic Fields จาก Map โดยใช้ SubCategoryName ('หมวดงาน')
                    dynamicFields: dynamicFieldsMap.get(subCatName) || [], 
                    isArchived: false
                }
            });
        }
        const subCatId = subCategoriesMap.get(subCatName).id;

        // 4.3 สร้าง Topic
        const topicId = slugifyThai(`${subCatName}-${topicName}`) || `topic-${topicsList.length}`;
        topicsList.push({
            id: topicId,
            data: {
                name: topicName,
                subCategoryId: subCatId,
                dynamicFields: [], // Fields อยู่ที่ SubCategory
                isArchived: false
            }
        });
    }
    
    console.log(`  -> Processed ${mainCategoriesMap.size} Main Categories`);
    console.log(`  -> Processed ${subCategoriesMap.size} Sub Categories`);
    console.log(`  -> Processed ${topicsList.length} Topics`);

    // 5. ประกอบร่าง Config
    // (V2 นี้ ทุก Project ใช้ Config เดียวกัน)
    const sharedConfig = {
        mainCategories: mainCategoriesMap, // Map(MainName -> {id, data})
        subCategories: subCategoriesMap, // Map(SubName -> {id, data})
        topics: topicsList // Array [{id, data}]
    };

    return sharedConfig;
}


// --- [ฟังก์ชันที่ 5] เขียน Projects ลง Firestore (V2 เดิม - ไม่ต้องแก้) ---
async function writeProjectsToFirestore(db, projects) {
    console.log('\n--- 5. Writing Projects to Firestore ---');
    const batch = db.batch();
    
    for (const [projectId, projectData] of projects.entries()) {
        const projectRef = db.collection('projects').doc(projectId);
        batch.set(projectRef, projectData, { merge: true });
        console.log(`  -> Queued Project: ${projectId} (${projectData.projectName})`);

        const dummyReportRef = projectRef.collection('generatedReports').doc('--init--');
        batch.set(dummyReportRef, { initialized: true });

        const dummyJobsRef = projectRef.collection('sharedJobs').doc('--init--');
        batch.set(dummyJobsRef, { initialized: true });
    }
    
    await batch.commit();
    console.log(`  -> Committed ${projects.size} projects.`);
}

// --- [ฟังก์ชันที่ 6 - แก้ไข] เขียน Config ลง Firestore ---
// (แก้ไขให้รับโครงสร้าง Config ใหม่)
async function writeConfigToFirestore(db, allProjects, sharedConfig) {
    console.log('\n--- 6. Writing Project Configs to Emulator ---');

    // (V2 นี้ ทุก Project ใช้ Config เดียวกัน)
    for (const projectId of allProjects.keys()) {
        console.log(`  -> Writing config for Project: ${projectId}`);
        const projectConfigRef = db.collection('projectConfig').doc(projectId);
        const batch = db.batch();

        // 6.1 เขียน Main Categories
        for (const { id, data } of sharedConfig.mainCategories.values()) {
            const docRef = projectConfigRef.collection('mainCategories').doc(id);
            batch.set(docRef, data);
        }
        console.log(`    -> Queued ${sharedConfig.mainCategories.size} Main Categories`);
        
        // 6.2 เขียน Sub Categories
        for (const { id, data } of sharedConfig.subCategories.values()) {
            const docRef = projectConfigRef.collection('subCategories').doc(id);
            batch.set(docRef, data);
        }
        console.log(`    -> Queued ${sharedConfig.subCategories.size} Sub Categories`);

        // 6.3 เขียน Topics
        for (const { id, data } of sharedConfig.topics) {
            const docRef = projectConfigRef.collection('topics').doc(id);
            batch.set(docRef, data);
        }
        console.log(`    -> Queued ${sharedConfig.topics.length} Topics`);

        // 6.4 Commit!
        await batch.commit();
        console.log(`  -> Committed config for ${projectId}`);
    }
}


// --- [ฟังก์ชันหลัก] MAIN (IIFE - โครงสร้าง V2 เดิม) ---
(async () => {
    console.log('--- Starting Data Migration (V2 - Corrected Parsing) ---');

    try {
        // 1. สร้าง God User
        await createGodUser(db, auth);

        // 2. อ่าน Projects (ใช้ฟังก์ชันที่แก้ไขแล้ว)
        const allProjects = await parseProjects(PROJECTS_CSV_PATH);
        if (allProjects.size === 0) {
            console.warn("⚠️ Warning: No projects found. Check PROJECTS_CSV_PATH & CSV Headers (id, name, code).");
        }

        // 3. อ่าน Configs (ใช้ฟังก์ชันที่แก้ไขแล้ว)
        const { topicsData, dynamicFieldsMap } = await parseConfigs(QC_TOPICS_CSV_PATH, DYNAMIC_FIELDS_CSV_PATH);
        
        // 4. ประมวลผล Config (ใช้ฟังก์ชันที่แก้ไขแล้ว)
        const sharedConfig = createConfigStructure(topicsData, dynamicFieldsMap);
        
        // 5. เขียน Projects (V2 เดิม)
        await writeProjectsToFirestore(db, allProjects);

        // 6. เขียน Configs (ใช้ฟังก์ชันที่แก้ไขแล้ว)
        await writeConfigToFirestore(db, allProjects, sharedConfig);
        
        console.log('\n\n🎉 Migration (V2) completed successfully!');

    } catch (error) {
        console.error('Migration failed:', error);
    }
})();