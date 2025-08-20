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

// 🔥 UPDATED: อ่านข้อมูลหัวข้อการตรวจ QC แบบ 3 columns (MainCategory -> SubCategory -> Topics)
async function getQCTopics() {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'หัวข้อการตรวจ QC!A:C', // 🔥 3 columns: A=หมวดหลัก, B=หมวดงาน, C=หัวข้อ
    });
    
    const rows = response.data.values || [];
    const topics = {};
    
    console.log(`📊 Processing ${rows.length} rows from QC Topics sheet...`);
    
    // จัดกลุ่มตาม mainCategory -> subCategory -> topics
    rows.slice(1).forEach((row, index) => { // skip header
      if (row.length >= 3 && row[0] && row[1] && row[2]) {
        const mainCategory = row[0].trim();     // Column A: หมวดหลัก (โครงสร้าง/สถาปัตย์)
        const subCategory = row[1].trim();      // Column B: หมวดงาน (ฐานราก/เสา/ผนัง ฯลฯ)
        const topic = row[2].trim();            // Column C: หัวข้อการตรวจ
        
        // สร้าง nested structure
        if (!topics[mainCategory]) {
          topics[mainCategory] = {};
          console.log(`📁 Created main category: ${mainCategory}`);
        }
        
        if (!topics[mainCategory][subCategory]) {
          topics[mainCategory][subCategory] = [];
          console.log(`📂 Created sub category: ${mainCategory} > ${subCategory}`);
        }
        
        topics[mainCategory][subCategory].push(topic);
        console.log(`📄 Added topic ${index}: ${mainCategory} > ${subCategory} > ${topic}`);
      } else {
        console.log(`⚠️ Skipped incomplete row ${index + 2}:`, row);
      }
    });
    
    // แสดงสรุปโครงสร้าง
    console.log('🔥 QC Topics structure summary:');
    Object.entries(topics).forEach(([mainCat, subCats]) => {
      console.log(`  📁 ${mainCat}:`);
      Object.entries(subCats).forEach(([subCat, topicList]) => {
        console.log(`    📂 ${subCat}: ${topicList.length} topics`);
      });
    });
    
    return topics;
  } catch (error) {
    console.error('❌ Error reading QC topics:', error);
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

// 🔥 UPDATED: ดึงรายการรูปที่ถ่ายแล้ว (รองรับ mainCategory + subCategory)
async function getCompletedTopics(criteria) {
  try {
    const sheets = getSheetsClient();
    const { building, foundation, mainCategory, subCategory } = criteria;
    
    console.log(`🔍 Getting completed topics for: ${mainCategory} > ${subCategory} (${building}-${foundation})`);
    
    // ดึงข้อมูลจาก Master_Photos_Log
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:K' // Column K สำหรับ mainCategory
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

// 🔥 UPDATED: ดึงรายการรูปที่ถ่ายแล้วแบบ Full Match (รองรับ mainCategory + subCategory)
async function getCompletedTopicsFullMatch(criteria) {
  try {
    const sheets = getSheetsClient();
    const { building, foundation, mainCategory, subCategory, dynamicFields } = criteria;
    
    console.log('🔍 Full Match search criteria (3-level):', {
      mainCategory,
      subCategory,
      dynamicFields
    });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:K'
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
    
    console.log(`📝 Logging photo: ${photoData.mainCategory} > ${photoData.subCategory} > ${photoData.topic}`);
    
    // สร้าง Unique ID
    const uniqueId = generateUniqueId();
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    // 🔥 แปลง dynamic fields เป็น JSON string
    const dynamicFieldsJSON = photoData.dynamicFields ? JSON.stringify(photoData.dynamicFields) : '';

    const values = [[
      uniqueId,                           // A: ID
      timestamp,                          // B: วันเวลา
      photoData.building,                 // C: อาคาร
      photoData.foundation,               // D: ฐานราก/เสาเบอร์/ชั้น
      photoData.subCategory,              // E: หมวดงาน (ฐานราก/เสา/ผนัง)
      photoData.topic,                    // F: หัวข้อการตรวจ
      photoData.filename,                 // G: ไฟล์
      photoData.driveUrl || '',           // H: URL
      photoData.location || '',           // I: สถานที่
      dynamicFieldsJSON,                  // J: Dynamic Fields JSON
      photoData.mainCategory || ''        // K: หมวดหลัก (โครงสร้าง/สถาปัตย์)
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:K',
      valueInputOption: 'RAW',
      requestBody: { values }
    });

    // 🔥 เพิ่ม field values สำหรับ datalist
    if (photoData.dynamicFields) {
      await addFieldValuesFromPhoto(photoData.dynamicFields, photoData.subCategory);
    }
    
    return { success: true, timestamp, uniqueId };
    
  } catch (error) {
    console.error('Error logging photo:', error);
    throw error;
  }
}

// 🔥 เพิ่ม field values จากการถ่ายรูป
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

// 🔥 สร้าง Master_Field_Values Sheet
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

// 🔥 เพิ่ม/อัปเดต field value สำหรับ datalist
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

// 🔥 ดึง field values สำหรับ datalist
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
            subCategory: rowSubCategory
          });
        }
      }
    });
    
    // เรียงตาม count (มากไปน้อย) แล้วตาม lastUsed (ใหม่ไปเก่า)
    values.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return new Date(b.lastUsed) - new Date(a.lastUsed);
    });

    // Deduplicate แต่รักษาลำดับตาม count/usage
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
    
    console.log(`📊 Logging report: ${reportData.mainCategory} > ${reportData.subCategory}`);
    
    // สร้าง Unique ID
    const uniqueId = generateUniqueId();
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    const values = [[
      uniqueId,                      // A: ID
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
      range: 'Final_Reports_Log!A:I',
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

module.exports = {
  getSheetsClient,
  generateUniqueId,
  
  // 🔥 UPDATED: Enhanced QC Topics Functions
  getQCTopics,
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
  
  // Field Values Functions  
  createFieldValuesSheet,
  addFieldValue,
  getFieldValues,
  
  // Report Functions
  logReport
};