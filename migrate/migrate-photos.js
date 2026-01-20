// Filename: migrate-photos.js
// [GEMINI] v4 - แก้ไข Typo ทั้งหมด (m, T, _) และลบ LIMIT (พร้อมรันจริง)

const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// ========================================
// 1. Configuration
// ========================================

const CONFIG = {
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json',
    csvPath: './QC_Report_Escent_Nakhon_si__-_Master_Photos_Log__1_.csv',
    projectId: 'project-001',
    projectConfigId: 'project-001',
    mainCategory: 'งานโครงสร้าง',
    dryRun: false, // <-- ตั้งค่าเป็น false เพื่อทำงานจริง
    batchSize: 5,
    delayBetweenBatches: 2000,
    skipExisting: true, // <-- ตั้งค่าเป็น true เพื่อข้ามไฟล์ที่มีอยู่ (ถูกต้อง)
};

// ========================================
// 2. Initialize Firebase
// ========================================

if (!fs.existsSync(CONFIG.serviceAccountPath)) {
    console.error('❌ Error: serviceAccountKey.json not found!');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(CONFIG.serviceAccountPath),
    storageBucket: 'tts2004-smart-report-generate.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

console.log('✅ Firebase Admin initialized\n');

// ========================================
// 3. Helper Functions
// ========================================

// ⭐️ Hashing ID ที่ถูกต้อง (ตรงกับ pdf-generator.ts) ⭐️
function createStableQcId(projectId, category, topic, dynamicFields) {
    // Logic นี้คัดลอกมาจาก pdf-generator.ts (ใช้ key=value& และ |)
    const sortedFields = Object.keys(dynamicFields || {}).sort()
        .map(key => `${key}=${dynamicFields[key]}`)
        .join('&');
    const rawId = `${projectId}|${category}|${topic}|${sortedFields}`;
    return crypto.createHash('md5').update(rawId).digest('hex');
}

function convertDriveUrl(shareUrl) {
    const match = shareUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
        return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
    return null;
}

async function downloadImageFromDrive(driveUrl) {
    try {
        const downloadUrl = convertDriveUrl(driveUrl);
        if (!downloadUrl) throw new Error('Invalid Drive URL format');

        const response = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: 50 * 1024 * 1024,
        });

        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return Buffer.from(response.data);
    } catch (error) {
        throw new Error(`Download failed: ${error.message}`);
    }
}

async function uploadToFirebaseStorage(imageBuffer, metadata, projectId) {
    const { category, topic } = metadata;
    const sanitizedCategory = category.replace(/\s*>\s*/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedTopic = topic.replace(/[\/\\]/g, '-');
    const filename = `${sanitizedCategory}-${sanitizedTopic}-${timestamp}.jpg`;
    const filePath = `projects/${projectId}/${sanitizedCategory}/${filename}`;
    const file = bucket.file(filePath);
    const token = uuidv4();
    
    await file.save(imageBuffer, {
        metadata: {
            contentType: 'image/jpeg',
            metadata: { firebaseStorageDownloadTokens: token }
        },
        public: true,
        validation: 'md5'
    });
    
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath)}`;
    return { publicUrl, filePath, filename };
}

// Helper function to parse Thai Buddhist calendar date
function parseThaiDate(dateString) {
    try {
        if (!dateString || dateString === '-') return null;
        
        // Format: "21/8/2568 08:50:36" (Thai Buddhist year)
        const match = dateString.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)/);
        if (!match) return null;
        
        const [_, day, month, buddhistYear, hour, minute, second] = match;
        const gregorianYear = parseInt(buddysYear) - 543; // แปลง พ.ศ. เป็น ค.ศ.
        
        // สร้าง Date object
        const date = new Date(
            gregorianYear,
            parseInt(month) - 1, // เดือนใน JS เริ่มจาก 0
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
        );
        
        // ตรวจสอบว่า date ถูกต้อง
        if (isNaN(date.getTime())) return null;
        
        return date;
    } catch (error) {
        return null;
    }
}

async function saveToFirestore(photoData) {
    // แปลง timestamp
    let createdAt = admin.firestore.FieldValue.serverTimestamp();
    
    if (photoData.timestamp) {
        const parsedDate = parseThaiDate(photoData.timestamp);
        if (parsedDate) {
            createdAt = admin.firestore.Timestamp.fromDate(parsedDate);
        }
    }
    
    const docData = {
        projectId: photoData.projectId,
        reportType: 'QC',
        category: photoData.category,
        topic: photoData.topic,
        dynamicFields: photoData.dynamicFields || {},
        filename: photoData.filename,
        driveUrl: photoData.publicUrl,
        filePath: photoData.filePath,
        location: photoData.location || '',
        createdAt: createdAt
    };
    
    const qcPhotoRef = await db.collection('qcPhotos').add(docData);
    
    // Hashing ID ที่ถูกต้องจะถูกใช้ตรงนี้
    const stableId = createStableQcId(
        photoData.projectId,
        photoData.category,
        photoData.topic,
        photoData.dynamicFields || {}
    );
    
    await db.collection('latestQcPhotos').doc(stableId).set({
        ...docData,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { qcPhotoId: qcPhotoRef.id, stableId };
}

async function loadDynamicFieldsMapping() {
    console.log('📥 Loading dynamic fields configuration...\n');
    const mapping = {};
    
    try {
        const subCategoriesSnapshot = await db
            .collection('projectConfig')
            .doc(CONFIG.projectConfigId)
            .collection('subCategories')
            .get();
        
        subCategoriesSnapshot.forEach(doc => {
            const data = doc.data();
            mapping[data.name] = {
                dynamicFields: data.dynamicFields || [],
                subCategoryId: doc.id
            };
        });
        
        console.log(`✅ Loaded ${Object.keys(mapping).length} sub-categories:\n`);
        Object.entries(mapping).forEach(([name, config]) => {
            console.log(`   • ${name}: ${JSON.stringify(config.dynamicFields)}`);
        });
        console.log('');
        
        return mapping;
    } catch (error) {
        console.error('❌ Error loading config:', error.message);
        throw error;
    }
}

function transformDynamicFields(mainCategory, subCategory, parsedFields, allowedFields) {
    // 🎯 [ใหม่] ตรวจสอบ Category พิเศษที่เราต้องแก้ไข
    const isColumnCategory = (mainCategory === 'งานโครงสร้าง' && subCategory === 'งานเสา');
    const isCoreWallCategory = (subCategory === 'กำแพงลิฟต์และผนังบันได CORE ST-1');
    const isPtsCategory = (subCategory === 'งานพื้นคอนกรีตอัดแรง [PTS]');

    const newFields = {};

    // ⭐️ [ใหม่] Logic แก้ปัญหาข้อ 1 (งานเสา):
    // ดึงค่า Gridline ดิบจาก CSV มาดูก่อน
    const rawCsvGridline = parsedFields.Gridline || null;
    let gridlineIsActuallyFloorData = false;

    if (isColumnCategory && rawCsvGridline) {
        // ตรวจสอบว่าค่า Gridline นี้ เป็นข้อมูล "ชั้น" ที่ใส่ผิดที่หรือไม่
        if (rawCsvGridline.startsWith('ชั้น') || rawCsvGridline.includes('โซน')) {
            gridlineIsActuallyFloorData = true;
        }
    }

    // --- เริ่มวนลูป Field ที่ระบบอนุญาต ---
    allowedFields.forEach(allowedField => {
        let valueToProcess = null;

        // 1. หาค่า (จากชื่อใหม่ หรือชื่อเก่าที่ Mapping ไว้)
        const fieldNameMapping = {
            'ชั้น/Floor': 'ชั้น',
            'เสาเบอร์': 'เสาเบอร์',
            'ฐานรากเบอร์': 'ฐานรากเบอร์',
            'Zone': 'Zone',
            'Gridline': 'Gridline'
        };

        if (parsedFields[allowedField]) {
            valueToProcess = parsedFields[allowedField];
        } else {
            const oldFieldName = Object.keys(fieldNameMapping).find(
                key => fieldNameMapping[key] === allowedField
            );
            if (oldFieldName && parsedFields[oldFieldName]) {
                valueToProcess = parsedFields[oldFieldName];
            }
        }

        // ⭐️ [ใหม่] Logic แก้ปัญหา (แทรกแซงการดึงค่า) ⭐️

        // --- ปัญหาข้อ 1 (งานเสา) ---
        if (isColumnCategory && gridlineIsActuallyFloorData) {
            // ถ้า Gridline เป็นข้อมูล "ชั้น" จริงๆ
            if (allowedField === 'ชั้น') {
                // ถ้ากำลังหา "ชั้น" ให้ดึงค่าจาก Gridline มาใช้
                valueToProcess = rawCsvGridline;
                console.log(`      Found legacy Column 'Gridline' data: "${valueToProcess}"`);
            } else if (allowedField === 'Gridline') {
                // ถ้ากำลังหา "Gridline" ให้ตั้งเป็นค่าว่าง (เพราะมันไม่ใช่ Gridline)
                valueToProcess = null;
            }
        }

        // --- ปัญหาข้อ 2 (กำแพงลิฟต์) ---
        if (isCoreWallCategory && allowedField === 'ชั้น' && valueToProcess == null) {
            // ถ้าหา "ชั้น" ไม่เจอ ให้ไปหาจาก Key ที่ผิดแทน
            valueToProcess = parsedFields['กำแพงลิฟต์และผนังบันได CORE ST-1เบอร์'] || null;
            if (valueToProcess) console.log(`      Found legacy CoreWall 'เบอร์' data: "${valueToProcess}"`);
        }
        
        // --- ปัญหาข้อ 4 (งานพื้น PTS) ---
        if (isPtsCategory && allowedField === 'ชั้น' && valueToProcess == null) {
            // ถ้าหา "ชั้น" ไม่เจอ ให้ไปหาจาก Key ที่ผิดแทน
            valueToProcess = parsedFields['งานพื้นคอนกรีตอัดแรง [PTS]เบอร์'] || null;
            if (valueToProcess) console.log(`      Found legacy PTS 'เบอร์' data: "${valueToProcess}"`);
        }

        // ---------------------------------
        // 2. ทำความสะอาดและ Normalize ค่า
        // ---------------------------------
        if (valueToProcess == null || String(valueToProcess).trim() === '') {
            return; // ข้าม Field นี้ไป (ไม่บันทึก)
        }

        let finalValue = String(valueToProcess).trim().toLowerCase();

        // ⭐️ [ใหม่] ปรับปรุง: ให้ Normalize "ชั้น" ทุก Category
        if (allowedField === 'ชั้น' && finalValue) {
             // ใช้ฟังก์ชัน normalizeFloorValue (ที่มีอยู่แล้ว)
            finalValue = normalizeFloorValue(finalValue);
        }
        
        // 3. บันทึกค่าที่สะอาดแล้ว
        if (finalValue) {
            newFields[allowedField] = finalValue;
        }
    });

    return newFields;
}
async function photoExists(projectId, category, topic, dynamicFields) {
    const stableId = createStableQcId(projectId, category, topic, dynamicFields);
    const doc = await db.collection('latestQcPhotos').doc(stableId).get();
    return doc.exists;
}

// [GEMINI EDIT] ⭐️⭐️⭐️ แก้ไข Logic การ LIMIT (อีกครั้ง) โดยใช้ .unpipe() และ .end() ⭐️⭐️⭐️
// [GEMINI EDIT 2] ⭐️⭐️⭐️ ลบ LIMIT (ตั้งค่าเป็น null) เพื่อรันไฟล์ทั้งหมด ⭐️⭐️⭐️
async function parseCSV(csvPath) {
    return new Promise((resolve, reject) => {
        const results = [];
        const LIMIT = null; // <-- ปิดการจำกัด
        
        // 1. สร้าง stream ต้นทาง (ตัวอ่านไฟล์)
        const fileStream = fs.createReadStream(csvPath);
        
        // 2. สร้าง stream ปลายทาง (ตัวแปลง CSV)
        const csvStream = csv(); 

        // 3. ตั้งค่า "ปลายทาง" (csvStream) ก่อน
        csvStream
            .on('data', (row) => {
                // 3.1. ตรวจสอบว่ามีข้อมูลที่ต้องการ
                if (row['หมวดงาน'] && row['หัวข้อ'] && row['URL']) {
                    results.push({
                        id: row['ID'],
                        timestamp: row['Timestamp'],
                        subCategory: row['หมวดงาน'].trim(),
                        topic: row['หัวข้อ'].trim(),
                        driveUrl: row['URL'].trim(),
                        location: row['สถานที่'] || '',
                        dynamicFieldsRaw: row['Dynamic Fields'] || '{}',
                    });
                }

                // 3.2. ถ้าถึง LIMIT แล้ว (ต้องเช็คว่า LIMIT ไม่ใช่ null)
                if (LIMIT && results.length >= LIMIT) {
                    fileStream.unpipe(csvStream); // หยุดส่งข้อมูล
                    csvStream.end();              // บอก csv-parser ว่าจบแล้ว
                }
            })
            .on('end', () => {
                // 3.3. 'end' จะถูกเรียกไม่ว่าจะจบแบบปกติ หรือ .end()
                console.log(`📊 Parsed ${results.length} photos from CSV (limited/ended)\n`);
                resolve(results); // <--- Promise ถูก resolve
            })
            .on('error', (error) => {
                reject(error); // ดักจับ Error จาก csv-parser
            });

        // 4. ดักจับ Error จาก "ต้นทาง" (ตัวอ่านไฟล์)
        fileStream.on('error', (error) => {
            reject(error);
        });
        
        // 5. เชื่อมท่อ (Pipe) เพื่อเริ่มกระบวนการ
        fileStream.pipe(csvStream);
    });
}

// ========================================
// 4. Migration Process
// ========================================

async function migratePhotos() {
    console.log('🚀 Starting Photo Migration...\n');
    console.log(`Config: Project=${CONFIG.projectId}, DryRun=${CONFIG.dryRun}, Skip=${CONFIG.skipExisting}\n`);
    
    const dynamicFieldsMapping = await loadDynamicFieldsMapping();
    const csvData = await parseCSV(CONFIG.csvPath);
    
    if (csvData.length === 0) {
        console.log('❌ No photos found in CSV');
        return;
    }
    
    const stats = { total: csvData.length, success: 0, skipped: 0, failed: 0, errors: [] };
    
    console.log('='.repeat(60));
    console.log('📤 Starting Migration');
    console.log('='.repeat(60));
    
    for (let i = 0; i < csvData.length; i += CONFIG.batchSize) {
        const batch = csvData.slice(i, i + CONFIG.batchSize);
        const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
        const totalBatches = Math.ceil(csvData.length / CONFIG.batchSize);
        
        console.log(`\n📦 Batch ${batchNum}/${totalBatches}`);
        console.log('-'.repeat(60));
        
        // [GEMINI EDIT] ⭐️⭐️⭐️ ลบ _ ที่เป็น Typo ⭐️⭐️⭐️
        
        for (const [index, row] of batch.entries()) {
            const photoNum = i + index + 1;
            const category = `${CONFIG.mainCategory} > ${row.subCategory}`;
            
            console.log(`\n[${photoNum}/${stats.total}] ${row.topic}`);
            console.log(`   SubCategory: ${row.subCategory}`);
            
        try {
                // [ใหม่] 1. ค้นหา Config ของ SubCategory นี้
                const subCategoryConfig = dynamicFieldsMapping[row.subCategory];
                const allowedFieldsArray = subCategoryConfig ? subCategoryConfig.dynamicFields : [];

                // [ใหม่] 2. แปลง JSON string (row.dynamicFieldsRaw) ให้เป็น Object
                let parsedFields = {};
                try {
                    parsedFields = JSON.parse(row.dynamicFieldsRaw);
                } catch (e) {
                    console.log(`   ⚠️  Warning: Could not parse Dynamic Fields JSON: ${e.message}`);
                    // (ทำงานต่อแม้จะ parse ไม่ได้, จะได้ Fields: {} ที่ถูกต้อง)
                }

                // [แก้ไข] 3. เรียกฟังก์ชันด้วยตัวแปรที่ "ถูกต้อง" และ "เรียงลำดับถูกต้อง"
                const transformedFields = transformDynamicFields(
                    CONFIG.mainCategory,  // <-- 1. mainCategory
                    row.subCategory,       // <-- 2. subCategory
                    parsedFields,          // <-- 3. parsedFields (Object ที่แปลงแล้ว)
                    allowedFieldsArray    // <-- 4. allowedFields (Array ที่ถูกต้อง)
                );
                
                console.log(`   Fields: ${JSON.stringify(transformedFields)}`);
                
                if (CONFIG.skipExisting) {
                    const exists = await photoExists(CONFIG.projectId, category, row.topic, transformedFields);
                    if (exists) {
                        console.log(`   ⏭️  Skipped (exists)`);
                        stats.skipped++;
                        continue;
                    }
                }
                
                // [GEMINI EDIT] ⭐️⭐️⭐️ ลบ m ที่เป็น Typo ⭐️⭐️⭐️
                
                if (CONFIG.dryRun) {
                    console.log(`   🔍 DRY RUN - OK`);
                    stats.success++;
                    continue;
                }
                
                console.log(`   📥 Downloading...`);
                const imageBuffer = await downloadImageFromDrive(row.driveUrl);
                console.log(`   ✅ Downloaded (${(imageBuffer.length / 1024).toFixed(2)} KB)`);
                
                // [GEMINI EDIT] ⭐️⭐️⭐️ ลบ T ที่เป็น Typo ⭐️⭐️⭐️
                
                console.log(`   📤 Uploading...`);
                const { publicUrl, filePath, filename } = await uploadToFirebaseStorage(
                    imageBuffer,
                    { category, topic: row.topic },
                    CONFIG.projectId
                );
                console.log(`   ✅ Uploaded`);
                
                console.log(`   💾 Saving...`);
                const { qcPhotoId, stableId } = await saveToFirestore({
                    projectId: CONFIG.projectId,
                    category,
                    topic: row.topic,
                    dynamicFields: transformedFields,
                    filename,
                    publicUrl,
                    filePath,
                    location: row.location,
                    timestamp: row.timestamp
                });
                
                console.log(`   ✅ Saved (${stableId.substring(0, 8)}...)`);
                stats.success++;
                
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                stats.failed++;
                stats.errors.push({
                    photo: row.topic,
                    subCategory: row.subCategory,
                    error: error.message
                });
            }
        }
        
        if (i + CONFIG.batchSize < csvData.length) {
            console.log(`\n⏳ Waiting ${CONFIG.delayBetweenBatches}ms...`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenBatches));
        }
    }
    
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total:    ${stats.total}`);
    console.log(`Success:  ${stats.success}`);
    console.log(`Skipped:  ${stats.skipped}`);
    console.log(`Failed:   ${stats.failed}`);
    console.log('');
    
    if (stats.errors.length > 0) {
        console.log('❌ Errors:');
        stats.errors.forEach((err, i) => {
            console.log(`   ${i + 1}. ${err.subCategory} / ${err.photo}`);
            // [GEMINI EDIT] แก้ไขการแสดงผล error (ลบ &nbsp;)
            console.log(`      ${err.error}`);
        });
    }
    
    console.log('\n✅ Migration Complete!\n');
}

function normalizeFloorValue(value) {
    if (typeof value !== 'string') return value;
    // "ชั้น .1" -> "ชั้น 1", "ชั้น.1" -> "ชั้น 1", "ชั้น  1" -> "ชั้น 1"
    // "3b-4" -> "3b-4" (ไม่เปลี่ยนแปลง)
    return value.replace(/ชั้น\s*\.\s*(\d+)/g, 'ชั้น $1') // "ชั้น .1" -> "ชั้น 1"
                .replace(/ชั้น\s*(\d+)/g, 'ชั้น $1');      // "ชั้น1" -> "ชั้น 1" (เผื่อไว้)
}

// ========================================
// 5. Run
// ========================================

migratePhotos()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n💥 Fatal Error:', error);
        process.exit(1);
    });
