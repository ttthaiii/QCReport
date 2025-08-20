const { getSheetsClient: createSheetsClient } = require('../services/google-auth');

const SHEETS_ID = '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';

// Export getSheetsClient function
function getSheetsClient() {
  return createSheetsClient();
}

// สร้าง Unique ID
function generateUniqueId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${random}`;
}

// 🔥 NEW: อ่านข้อมูลหัวข้อการตรวจ QC แบบโครงสร้างใหม่ (3 columns)
async function getQCTopics() {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'หัวข้อการตรวจ QC!A:C', // 🔥 เปลี่ยนจาก A:B เป็น A:C
    });
    
    const rows = response.data.values || [];
    const topics = {};
    
    // จัดกลุ่มตาม mainCategory -> subCategory -> topics
    rows.slice(1).forEach(row => { // skip header
      if (row[0] && row[1] && row[2]) {
        const mainCategory = row[0].trim();     // Column A: หมวดหลัก
        const subCategory = row[1].trim();      // Column B: หมวดงาน  
        const topic = row[2].trim();            // Column C: หัวข้อ
        
        if (!topics[mainCategory]) {
          topics[mainCategory] = {};
        }
        
        if (!topics[mainCategory][subCategory]) {
          topics[mainCategory][subCategory] = [];
        }
        
        topics[mainCategory][subCategory].push(topic);
      }
    });
    
    console.log('🔥 NEW QC Topics structure:', Object.keys(topics));
    return topics;
  } catch (error) {
    console.error('Error reading QC topics:', error);
    
    // 🔥 Fallback: ถ้ายังเป็นโครงสร้างเก่า ให้อ่านแบบเก่าและแปลง
    try {
      console.log('📦 Fallback: trying old structure...');
      return await getQCTopicsLegacy();
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      throw error;
    }
  }
}

// 🔥 NEW: Fallback สำหรับอ่านข้อมูลแบบโครงสร้างเก่า (2 columns)
async function getQCTopicsLegacy() {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'หัวข้อการตรวจ QC!A:B',
    });
    
    const rows = response.data.values || [];
    const legacyTopics = {};
    
    // อ่านแบบเก่า (2 columns)
    rows.slice(1).forEach(row => {
      if (row[0] && row[1]) {
        const category = row[0].trim();
        const topic = row[1].trim();
        
        if (!legacyTopics[category]) {
          legacyTopics[category] = [];
        }
        legacyTopics[category].push(topic);
      }
    });
    
    // แปลงเป็นโครงสร้างใหม่ (สมมติว่าทั้งหมดเป็น "โครงสร้าง")
    const newStructure = {
      'โครงสร้าง': legacyTopics
    };
    
    console.log('📦 Converted legacy structure to new structure');
    return newStructure;
  } catch (error) {
    console.error('Error reading legacy QC topics:', error);
    throw error;
  }
}

// 🔥 NEW: ดึงรายการหมวดหลักทั้งหมด
async function getMainCategories() {
  try {
    const topics = await getQCTopics();
    const mainCategories = Object.keys(topics);
    
    console.log(`📊 Found ${mainCategories.length} main categories:`, mainCategories);
    return mainCategories;
  } catch (error) {
    console.error('Error getting main categories:', error);
    return ['โครงสร้าง']; // fallback
  }
}

// 🔥 NEW: ดึงรายการหมวดงานตามหมวดหลัก
async function getSubCategories(mainCategory) {
  try {
    const topics = await getQCTopics();
    
    if (!topics[mainCategory]) {
      console.log(`⚠️ Main category "${mainCategory}" not found`);
      return [];
    }
    
    const subCategories = Object.keys(topics[mainCategory]);
    
    console.log(`📊 Found ${subCategories.length} sub categories for "${mainCategory}":`, subCategories);
    return subCategories;
  } catch (error) {
    console.error(`Error getting sub categories for "${mainCategory}":`, error);
    return [];
  }
}

// 🔥 NEW: ดึงรายการหัวข้อตามหมวดหลักและหมวดงาน
async function getTopicsForCategory(mainCategory, subCategory) {
  try {
    const topics = await getQCTopics();
    
    if (!topics[mainCategory] || !topics[mainCategory][subCategory]) {
      console.log(`⚠️ Category "${mainCategory}/${subCategory}" not found`);
      return [];
    }
    
    const categoryTopics = topics[mainCategory][subCategory];
    
    console.log(`📊 Found ${categoryTopics.length} topics for "${mainCategory}/${subCategory}"`);
    return categoryTopics;
  } catch (error) {
    console.error(`Error getting topics for "${mainCategory}/${subCategory}":`, error);
    return [];
  }
}

async function getMasterData() {
  try {
    const sheets = getSheetsClient();
    
    // ดึงข้อมูลจาก Master_Buildings_Foundations sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Buildings_Foundations!A:B', // A=อาคาร, B=ฐานราก
    });
    
    const rows = response.data.values || [];
    const masterData = {
      buildings: new Set(),
      foundations: new Set(),
      combinations: [] // เก็บ combination ที่มีอยู่แล้ว
    };
    
    // ประมวลผลข้อมูล (skip header row)
    rows.slice(1).forEach(row => {
      if (row[0] && row[1]) {
        const building = row[0].trim();
        const foundation = row[1].trim();
        
        masterData.buildings.add(building);
        masterData.foundations.add(foundation);
        masterData.combinations.push({ building, foundation });
      }
    });
    
    return {
      buildings: Array.from(masterData.buildings).sort(),
      foundations: Array.from(masterData.foundations).sort(),
      combinations: masterData.combinations
    };
    
  } catch (error) {
    console.error('Error reading master data:', error);
    
    // ถ้า sheet ยังไม่มี ให้สร้างใหม่
    if (error.message.includes('Unable to parse range')) {
      console.log('Master_Buildings_Foundations sheet not found, creating...');
      await createMasterDataSheet();
      return { buildings: [], foundations: [], combinations: [] };
    }
    
    throw error;
  }
}

// 🔥 สร้าง Master Data Sheet (ครั้งแรก)
async function createMasterDataSheet() {
  try {
    const sheets = getSheetsClient();
    
    // เพิ่ม sheet ใหม่
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEETS_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: 'Master_Buildings_Foundations',
              gridProperties: {
                rowCount: 1000,
                columnCount: 10
              }
            }
          }
        }]
      }
    });
    
    // เพิ่ม header
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Buildings_Foundations!A1:C1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['อาคาร', 'ฐานราก', 'วันที่สร้าง']]
      }
    });
    
    console.log('Master_Buildings_Foundations sheet created successfully');
    
  } catch (error) {
    console.error('Error creating master data sheet:', error);
    throw error;
  }
}

// 🔥 เพิ่มข้อมูลอาคาร + ฐานรากใหม่
async function addMasterData(building, foundation) {
  try {
    const sheets = getSheetsClient();
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    // ตรวจสอบว่ามี combination นี้อยู่แล้วหรือไม่
    const existingData = await getMasterData();
    const exists = existingData.combinations.some(
      combo => combo.building === building && combo.foundation === foundation
    );
    
    if (exists) {
      console.log(`Combination ${building}-${foundation} already exists`);
      return { success: true, message: 'Data already exists', duplicate: true };
    }
    
    // เพิ่มข้อมูลใหม่
    const values = [[building, foundation, timestamp]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Buildings_Foundations!A:C',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    
    console.log(`Added new master data: ${building}-${foundation}`);
    
    return { 
      success: true, 
      message: 'Data added successfully',
      duplicate: false,
      timestamp 
    };
    
  } catch (error) {
    console.error('Error adding master data:', error);
    throw error;
  }
}

// 🔥 UPDATED: ดึงรายการรูปที่ถ่ายแล้ว (สำหรับ progress tracking) - รองรับโครงสร้างใหม่
async function getCompletedTopics(criteria) {
  try {
    const sheets = getSheetsClient();
    const { building, foundation, mainCategory, subCategory } = criteria;
    
    // ดึงข้อมูลจาก Master_Photos_Log
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:K' // 🔥 เพิ่ม column K สำหรับ mainCategory
    });
    
    const rows = response.data.values || [];
    const completedTopics = new Set();
    
    // กรองข้อมูลตามเงื่อนไข (skip header row)
    rows.slice(1).forEach(row => {
      if (row.length >= 6) {
        const [id, timestamp, rowBuilding, rowFoundation, rowSubCategory, topic, filename, driveUrl, location, dynamicFieldsJSON, rowMainCategory] = row;
        
        // 🔥 เช็คทั้ง mainCategory และ subCategory
        const categoryMatch = rowMainCategory 
          ? (rowMainCategory === mainCategory && rowSubCategory === subCategory) // โครงสร้างใหม่
          : (rowSubCategory === subCategory); // backward compatibility กับข้อมูลเก่า
        
        if (rowBuilding === building && 
            rowFoundation === foundation && 
            categoryMatch &&
            topic) {
          completedTopics.add(topic.trim());
        }
      }
    });
    
    return {
      success: true,
      data: {
        completedTopics: Array.from(completedTopics),
        criteria
      }
    };
    
  } catch (error) {
    console.error('Error getting completed topics:', error);
    return {
      success: false,
      data: { completedTopics: [] }
    };
  }
}


// 🔥 UPDATED: ฟังก์ชันเปรียบเทียบแบบ Full Match - รองรับโครงสร้างใหม่
function isFullMatch(searchCriteria, rowData) {
  const { building, foundation, mainCategory, subCategory, dynamicFields } = searchCriteria;
  const { building: rowBuilding, foundation: rowFoundation, mainCategory: rowMainCategory, subCategory: rowSubCategory, dynamicFieldsJSON } = rowData;
  
  // ตรวจสอบ basic fields ก่อน
  if (building !== rowBuilding || foundation !== rowFoundation) {
    return false;
  }
  
  // 🔥 ตรวจสอบ category แบบใหม่
  const categoryMatch = rowMainCategory 
    ? (rowMainCategory === mainCategory && rowSubCategory === subCategory) // โครงสร้างใหม่
    : (rowSubCategory === subCategory); // backward compatibility
  
  if (!categoryMatch) {
    return false;
  }
  
  // ถ้าไม่มี dynamic fields (legacy mode) ให้ match basic fields อย่างเดียว
  if (!dynamicFields || Object.keys(dynamicFields).length === 0) {
    return true;
  }
  
  // ถ้ามี dynamic fields ให้เปรียบเทียบทุก field ที่มีค่า
  try {
    const rowDynamicFields = dynamicFieldsJSON ? JSON.parse(dynamicFieldsJSON) : {};
    
    // เปรียบเทียบทุก field ใน dynamicFields ที่มีค่า
    for (const [fieldName, fieldValue] of Object.entries(dynamicFields)) {
      if (fieldValue && fieldValue.trim()) { // เฉพาะ field ที่มีค่า
        const rowFieldValue = rowDynamicFields[fieldName];
        if (!rowFieldValue || rowFieldValue.trim() !== fieldValue.trim()) {
          return false;
        }
      }
    }
    
    return true;
    
  } catch (parseError) {
    console.log('Error parsing dynamic fields JSON, using basic match');
    return true; // fallback เป็น basic match
  }
}

// 🔥 UPDATED: ดึงรายการรูปที่ถ่ายแล้วแบบ Full Match - รองรับโครงสร้างใหม่
async function getCompletedTopicsFullMatch(criteria) {
  try {
    const sheets = getSheetsClient();
    const { building, foundation, mainCategory, subCategory, dynamicFields } = criteria;
    
    console.log('🔍 Full Match search criteria:', {
      mainCategory,
      subCategory,
      dynamicFields
    });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:K' // 🔥 เพิ่ม column K
    });
    
    const rows = response.data.values || [];
    const completedTopics = new Set();
    
    rows.slice(1).forEach(row => {
      if (row.length >= 6) {
        const [id, timestamp, rowBuilding, rowFoundation, rowSubCategory, topic, filename, driveUrl, location, dynamicFieldsJSON, rowMainCategory] = row;
        
        // ✅ เช็ค category ก่อน (รองรับทั้งโครงสร้างใหม่และเก่า)
        const categoryMatch = rowMainCategory 
          ? (rowMainCategory === mainCategory && rowSubCategory === subCategory)
          : (rowSubCategory === subCategory);
        
        if (!categoryMatch) return;
        
        // ✅ ถ้าไม่มี dynamic fields ใน row (ข้อมูลเก่า) ให้ skip
        if (!dynamicFieldsJSON) return;
        
        try {
          const rowDynamicFields = JSON.parse(dynamicFieldsJSON);
          
          // ✅ Full Match: ตรวจสอบทุก field ที่มีค่า
          let isMatch = true;
          for (const [fieldName, fieldValue] of Object.entries(dynamicFields)) {
            if (fieldValue && fieldValue.trim()) {
              const rowFieldValue = rowDynamicFields[fieldName];
              if (!rowFieldValue || rowFieldValue.trim() !== fieldValue.trim()) {
                isMatch = false;
                break;
              }
            }
          }
          
          if (isMatch) {
            completedTopics.add(topic.trim());
            console.log(`✅ Full Match found: ${topic} with fields:`, rowDynamicFields);
          }
          
        } catch (parseError) {
          console.log('⚠️ Cannot parse dynamic fields, skipping row');
        }
      }
    });
    
    console.log(`📊 Full Match result: ${completedTopics.size} completed topics`);
    
    return {
      success: true,
      data: {
        completedTopics: Array.from(completedTopics),
        criteria
      }
    };
    
  } catch (error) {
    console.error('Error in getCompletedTopicsFullMatch:', error);
    return {
      success: false,
      data: { completedTopics: [] }
    };
  }
}

// 🔥 UPDATED: บันทึกข้อมูลรูปถ่าย พร้อม Dynamic Fields JSON และ MainCategory
async function logPhoto(photoData) {
  try {
    const sheets = getSheetsClient();
    
    // สร้าง Unique ID
    const uniqueId = generateUniqueId();
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    // 🔥 NEW: แปลง dynamic fields เป็น JSON string
    const dynamicFieldsJSON = photoData.dynamicFields ? JSON.stringify(photoData.dynamicFields) : '';

    const values = [[
      uniqueId,                           // A: ID
      timestamp,                          // B: วันเวลา
      photoData.building,                 // C: อาคาร
      photoData.foundation,               // D: ฐานราก/เสาเบอร์/ชั้น
      photoData.subCategory,              // E: หมวดงาน (เก่า: category)
      photoData.topic,                    // F: หัวข้อ
      photoData.filename,                 // G: ไฟล์
      photoData.driveUrl || '',           // H: URL
      photoData.location || '',           // I: สถานที่
      dynamicFieldsJSON,                  // J: Dynamic Fields JSON
      photoData.mainCategory || ''        // K: หมวดหลัก 🔥 NEW
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:K',     // 🔥 เปลี่ยนจาก J เป็น K
      valueInputOption: 'RAW',
      requestBody: { values }
    });

    // 🔥 NEW: เพิ่ม field values สำหรับ datalist
    if (photoData.dynamicFields) {
      await addFieldValuesFromPhoto(photoData.dynamicFields, photoData.subCategory);
    }
    
    return { success: true, timestamp, uniqueId };
    
  } catch (error) {
    console.error('Error logging photo:', error);
    throw error;
  }
}

// 🔥 NEW: เพิ่ม field values จากการถ่ายรูป
async function addFieldValuesFromPhoto(dynamicFields, subCategory) {
  if (!dynamicFields || typeof dynamicFields !== 'object') return;
  
  try {
    for (const [fieldName, fieldValue] of Object.entries(dynamicFields)) {
      if (fieldValue && fieldValue.trim()) {
        await addFieldValue(fieldName, fieldValue.trim(), subCategory);
      }
    }
  } catch (error) {
    console.error('Error adding field values from photo:', error);
    // ไม่ throw เพื่อไม่ให้กระทบการทำงานหลัก
  }
}

// 🔥 NEW: สร้าง Master_Field_Values Sheet
async function createFieldValuesSheet() {
  try {
    const sheets = getSheetsClient();
    
    console.log('Creating Master_Field_Values sheet for datalist...');
    
    // เพิ่ม sheet ใหม่
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEETS_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: 'Master_Field_Values',
              gridProperties: {
                rowCount: 1000,
                columnCount: 6
              }
            }
          }
        }]
      }
    });
    
    // เพิ่ม header
    const values = [
      ['field_name', 'field_value', 'sub_category', 'count', 'last_used', 'created_date']
    ];
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Field_Values!A1:F1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    
    console.log('Master_Field_Values sheet created successfully');
    
  } catch (error) {
    console.error('Error creating field values sheet:', error);
    throw error;
  }
}

// 🔥 UPDATED: เพิ่ม/อัปเดต field value สำหรับ datalist - รองรับ subCategory
async function addFieldValue(fieldName, fieldValue, subCategory) {
  if (!fieldValue || !fieldValue.trim()) return;
  
  const sheets = getSheetsClient();
  const trimmedValue = fieldValue.trim();
  const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Field_Values!A:F',
    });
    
    const rows = response.data.values || [];
    let existingRowIndex = -1;
    let existingCount = 0;
    
    // หาแถวที่มีค่าซ้ำ (field_name + field_value + sub_category)
    for (let i = 1; i < rows.length; i++) {
      const [rowFieldName, rowFieldValue, rowSubCategory] = rows[i];
      if (rowFieldName === fieldName && rowFieldValue === trimmedValue && rowSubCategory === subCategory) {
        existingRowIndex = i + 1;
        existingCount = parseInt(rows[i][3] || 1);
        break;
      }
    }
    
    if (existingRowIndex > 0) {
      // อัปเดตค่าที่มีอยู่ (เพิ่ม count)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEETS_ID,
        range: `Master_Field_Values!A${existingRowIndex}:F${existingRowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[fieldName, trimmedValue, subCategory, existingCount + 1, timestamp, rows[existingRowIndex - 1][5]]]
        }
      });
    } else {
      // เพิ่มค่าใหม่
      const values = [[fieldName, trimmedValue, subCategory, 1, timestamp, timestamp]];
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEETS_ID,
        range: 'Master_Field_Values!A:F',
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }
  } catch (sheetError) {
    if (sheetError.message.includes('Unable to parse range')) {
      await createFieldValuesSheet();
      await addFieldValue(fieldName, fieldValue, subCategory); // เรียกซ้ำ
    }
  }
}

// 🔥 UPDATED: ดึง field values สำหรับ datalist - รองรับ subCategory
async function getFieldValues(fieldName, subCategory) {
  try {
    const sheets = getSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Field_Values!A:F',
    });
    
    const rows = response.data.values || [];
    const values = [];
    
    console.log(`🔍 Getting field values for: fieldName="${fieldName}", subCategory="${subCategory}"`);
    
    // กรองและเรียงข้อมูล
    rows.slice(1).forEach(row => {
      if (row.length >= 3) {
        const [rowFieldName, rowFieldValue, rowSubCategory, count, lastUsed] = row;
        
        console.log(`📋 Checking row: field="${rowFieldName}", value="${rowFieldValue}", subCategory="${rowSubCategory}"`);
        
        // 🔥 แก้ไขเงื่อนไขการกรอง
        let shouldInclude = false;
        
        if (rowFieldName === fieldName) {
          if (fieldName === 'อาคาร') {
            // อาคารใช้ร่วมกันได้ทุก subCategory (ไม่กรอง subCategory)
            shouldInclude = true;
            console.log(`✅ Including "${rowFieldValue}" - อาคารใช้ร่วมกัน`);
          } else {
            // Field อื่นต้องตรง subCategory เท่านั้น
            if (rowSubCategory === subCategory) {
              shouldInclude = true;
              console.log(`✅ Including "${rowFieldValue}" - subCategory match: ${subCategory}`);
            } else {
              console.log(`❌ Excluding "${rowFieldValue}" - subCategory mismatch: ${rowSubCategory} vs ${subCategory}`);
            }
          }
        }
        
        if (shouldInclude && rowFieldValue && rowFieldValue.trim()) {
          values.push({
            value: rowFieldValue.trim(),
            count: parseInt(count || 1),
            lastUsed: lastUsed,
            subCategory: rowSubCategory // เก็บไว้เพื่อ debug
          });
        }
      }
    });
    
    // เรียงตาม count (มากไปน้อย) แล้วตาม lastUsed (ใหม่ไปเก่า)
    values.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return new Date(b.lastUsed) - new Date(a.lastUsed);
    });

    // ✅ Deduplicate แต่รักษาลำดับตาม count/usage
    const seen = new Set();
    const uniqueValues = values.filter(v => {
      if (seen.has(v.value)) return false;
      seen.add(v.value);
      return true;
    });

    const result = uniqueValues.map(v => v.value);
    
    console.log(`📊 Final result for ${fieldName} in ${subCategory}:`, result);
    console.log(`📈 Total values: ${result.length}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error getting field values:', error);
    return [];
  }
}

// 🔥 UPDATED: บันทึกข้อมูลรายงาน พร้อม Unique ID และ MainCategory
async function logReport(reportData) {
  try {
    const sheets = getSheetsClient();
    
    // สร้าง Unique ID
    const uniqueId = generateUniqueId();
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    const values = [[
      uniqueId,                      // A: ID (ใหม่)
      timestamp,                     // B: วันเวลา
      reportData.building,           // C: อาคาร
      reportData.foundation,         // D: ฐานราก
      reportData.subCategory,        // E: หมวดงาน
      reportData.filename,           // F: ไฟล์
      reportData.driveUrl || '',     // G: URL
      reportData.photoCount || 0,    // H: จำนวนรูป
      reportData.mainCategory || ''  // I: หมวดหลัก 🔥 NEW
    ]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Final_Reports_Log!A:I', // 🔥 เปลี่ยนจาก H เป็น I
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    
    return { 
      success: true, 
      timestamp,
      uniqueId 
    };
    
  } catch (error) {
    console.error('Error logging report:', error);
    throw error;
  }
}

// 🔥 NEW: Data Migration Functions

// Migrate QC Topics sheet from 2-column to 3-column structure
async function migrateQCTopicsSheet() {
  try {
    const sheets = getSheetsClient();
    
    console.log('🔧 Starting QC Topics sheet migration...');
    
    // 1. อ่านข้อมูลเก่า (2 columns)
    const oldResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'หัวข้อการตรวจ QC!A:B',
    });
    
    const oldRows = oldResponse.data.values || [];
    
    if (oldRows.length <= 1) {
      console.log('⚠️ No data to migrate');
      return { success: true, message: 'No data to migrate' };
    }
    
    console.log(`📊 Found ${oldRows.length - 1} rows to migrate`);
    
    // 2. สร้างข้อมูลใหม่ (3 columns) - สมมติว่าทั้งหมดเป็น "โครงสร้าง"
    const newRows = [
      ['หมวดหลัก', 'หมวดงาน', 'หัวข้อ'] // header ใหม่
    ];
    
    // แปลงข้อมูลเก่า
    oldRows.slice(1).forEach(row => {
      if (row[0] && row[1]) {
        const oldCategory = row[0].trim();  // หมวดงานเก่า (จะเป็น หมวดงานใหม่)
        const topic = row[1].trim();        // หัวข้อ
        const mainCategory = 'โครงสร้าง';    // สมมติว่าทั้งหมดเป็นโครงสร้าง
        
        newRows.push([mainCategory, oldCategory, topic]);
      }
    });
    
    console.log(`✅ Created ${newRows.length - 1} new rows`);
    
    // 3. เคลียร์ข้อมูลเก่าและใส่ข้อมูลใหม่
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEETS_ID,
      range: 'หัวข้อการตรวจ QC!A:Z'
    });
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID,
      range: 'หัวข้อการตรวจ QC!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: newRows }
    });
    
    console.log('✅ QC Topics migration completed successfully');
    
    return {
      success: true,
      message: `Migrated ${newRows.length - 1} rows to new structure`,
      migratedRows: newRows.length - 1
    };
    
  } catch (error) {
    console.error('❌ Error migrating QC Topics sheet:', error);
    throw error;
  }
}

// Migrate Master_Photos_Log to include MainCategory column
async function migrateMasterPhotosLog() {
  try {
    const sheets = getSheetsClient();
    
    console.log('🔧 Starting Master_Photos_Log migration...');
    
    // 1. อ่านข้อมูลเก่า
    const oldResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:J', // อ่านจนถึง column J (เก่า)
    });
    
    const oldRows = oldResponse.data.values || [];
    
    if (oldRows.length <= 1) {
      console.log('⚠️ No Master_Photos_Log data to migrate');
      return { success: true, message: 'No data to migrate' };
    }
    
    console.log(`📊 Found ${oldRows.length - 1} photo log rows to migrate`);
    
    // 2. เพิ่ม column K (MainCategory) ให้ข้อมูลเก่า
    const migratedRows = [];
    
    // Header row
    if (oldRows[0]) {
      const headerRow = [...oldRows[0]];
      // เพิ่ม column K ใน header ถ้ายังไม่มี
      if (headerRow.length < 11) {
        headerRow[10] = 'หมวดหลัก'; // Column K
      }
      migratedRows.push(headerRow);
    }
    
    // Data rows
    oldRows.slice(1).forEach(row => {
      const newRow = [...row];
      
      // เพิ่ม MainCategory = "โครงสร้าง" สำหรับข้อมูลเก่า
      if (newRow.length < 11) {
        newRow[10] = 'โครงสร้าง'; // Column K
      }
      
      migratedRows.push(newRow);
    });
    
    // 3. อัปเดตข้อมูลใหม่
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:Z'
    });
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A1',
      valueInputOption: 'RAW',
      requestBody: { values: migratedRows }
    });
    
    console.log('✅ Master_Photos_Log migration completed successfully');
    
    return {
      success: true,
      message: `Migrated ${migratedRows.length - 1} photo log rows`,
      migratedRows: migratedRows.length - 1
    };
    
  } catch (error) {
    console.error('❌ Error migrating Master_Photos_Log:', error);
    throw error;
  }
}

// Run complete migration
async function runCompleteMigration() {
  try {
    console.log('🚀 Starting complete system migration...');
    
    const results = {
      qcTopics: null,
      photosLog: null,
      errors: []
    };
    
    // 1. Migrate QC Topics
    try {
      results.qcTopics = await migrateQCTopicsSheet();
      console.log('✅ QC Topics migration: SUCCESS');
    } catch (error) {
      console.error('❌ QC Topics migration: FAILED', error);
      results.errors.push('QC Topics migration failed: ' + error.message);
    }
    
    // 2. Migrate Photos Log
    try {
      results.photosLog = await migrateMasterPhotosLog();
      console.log('✅ Photos Log migration: SUCCESS');
    } catch (error) {
      console.error('❌ Photos Log migration: FAILED', error);
      results.errors.push('Photos Log migration failed: ' + error.message);
    }
    
    console.log('🎉 Complete migration finished');
    console.log('📊 Results:', results);
    
    return {
      success: results.errors.length === 0,
      message: results.errors.length === 0 ? 'All migrations completed successfully' : 'Some migrations failed',
      results: results,
      errors: results.errors
    };
    
  } catch (error) {
    console.error('❌ Complete migration failed:', error);
    throw error;
  }
}

module.exports = {
  getSheetsClient,
  generateUniqueId,
  
  // 🔥 NEW: Enhanced QC Topics Functions
  getQCTopics,
  getQCTopicsLegacy,
  getMainCategories,
  getSubCategories,
  getTopicsForCategory,
  
  // Master Data Functions
  getMasterData,
  addMasterData,
  createMasterDataSheet,
  
  // Photo Logging Functions
  logPhoto,
  addFieldValuesFromPhoto,
  
  // Progress Tracking Functions
  getCompletedTopics,
  getCompletedTopicsFullMatch,
  isFullMatch,
  
  // Field Values Functions  
  createFieldValuesSheet,
  addFieldValue,
  getFieldValues,
  
  // Report Functions
  logReport,
  
  // 🔥 NEW: Migration Functions
  migrateQCTopicsSheet,
  migrateMasterPhotosLog,
  runCompleteMigration
};