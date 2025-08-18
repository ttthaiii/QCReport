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

// อ่านข้อมูลหัวข้อการตรวจ QC
async function getQCTopics() {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'หัวข้อการตรวจ QC!A:B',
    });
    
    const rows = response.data.values || [];
    const topics = {};
    
    // กลุ่มตามหมวดงาน
    rows.slice(1).forEach(row => { // skip header
      if (row[0] && row[1]) {
        const category = row[0].trim();
        const topic = row[1].trim();
        
        if (!topics[category]) {
          topics[category] = [];
        }
        topics[category].push(topic);
      }
    });
    
    return topics;
  } catch (error) {
    console.error('Error reading QC topics:', error);
    throw error;
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

// 🔥 ดึงรายการรูปที่ถ่ายแล้ว (สำหรับ progress tracking)
async function getCompletedTopics(criteria) {
  try {
    const sheets = getSheetsClient();
    const { building, foundation, category } = criteria;
    
    // ดึงข้อมูลจาก Master_Photos_Log
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:J' // 🔥 เพิ่ม column J สำหรับ dynamic fields
    });
    
    const rows = response.data.values || [];
    const completedTopics = new Set();
    
    // กรองข้อมูลตามเงื่อนไข (skip header row)
    rows.slice(1).forEach(row => {
      if (row.length >= 6) {
        const [id, timestamp, rowBuilding, rowFoundation, rowCategory, topic] = row;
        
        if (rowBuilding === building && 
            rowFoundation === foundation && 
            rowCategory === category && 
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


// 🔥 NEW: ฟังก์ชันเปรียบเทียบแบบ Full Match
function isFullMatch(searchCriteria, rowData) {
  const { building, foundation, category, dynamicFields } = searchCriteria;
  const { building: rowBuilding, foundation: rowFoundation, category: rowCategory, dynamicFieldsJSON } = rowData;
  
  // ตรวจสอบ basic fields ก่อน
  if (building !== rowBuilding || foundation !== rowFoundation || category !== rowCategory) {
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

// 🔥 NEW: ดึงรายการรูปที่ถ่ายแล้วแบบ Full Match
async function getCompletedTopicsFullMatch(criteria) {
  const sheets = getSheetsClient();
  const { building, foundation, category, dynamicFields } = criteria;
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID,
    range: 'Master_Photos_Log!A:J'
  });
  
  const rows = response.data.values || [];
  const completedTopics = new Set();
  
  // กรองข้อมูลตามเงื่อนไข Full Match
  rows.slice(1).forEach(row => {
    if (row.length >= 6) {
      const [id, timestamp, rowBuilding, rowFoundation, rowCategory, topic, filename, driveUrl, location, dynamicFieldsJSON] = row;
      
      // ใช้ฟังก์ชัน isFullMatch
      if (isFullMatch(
        { building, foundation, category, dynamicFields },
        { building: rowBuilding, foundation: rowFoundation, category: rowCategory, dynamicFieldsJSON }
      )) {
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
}

// 🔥 UPDATED: บันทึกข้อมูลรูปถ่าย พร้อม Dynamic Fields JSON
async function logPhoto(photoData) {
  try {
    const sheets = getSheetsClient();
    
    // สร้าง Unique ID
    const uniqueId = generateUniqueId();
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    // 🔥 NEW: แปลง dynamic fields เป็น JSON string
    const dynamicFieldsJSON = photoData.dynamicFields ? JSON.stringify(photoData.dynamicFields) : '';

    const values = [[
      uniqueId,                    // A: ID
      timestamp,                   // B: วันเวลา
      photoData.building,          // C: อาคาร
      photoData.foundation,        // D: ฐานราก/เสาเบอร์/ชั้น
      photoData.category,          // E: หมวดงาน
      photoData.topic,             // F: หัวข้อ
      photoData.filename,          // G: ไฟล์
      photoData.driveUrl || '',    // H: URL
      photoData.location || '',    // I: สถานที่
      dynamicFieldsJSON            // J: Dynamic Fields JSON 🔥 NEW
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:J', // ✅ เปลี่ยนเป็น 10 columns
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });

    // 🔥 NEW: เพิ่ม field values สำหรับ datalist
    if (photoData.dynamicFields) {
      await addFieldValuesFromPhoto(photoData.dynamicFields, photoData.category);
    }
    
    return { success: true, timestamp, uniqueId };
    
  } catch (error) {
    console.error('Error logging photo:', error);
    throw error;
  }
}

// 🔥 NEW: เพิ่ม field values จากการถ่ายรูป
async function addFieldValuesFromPhoto(dynamicFields, category) {
  if (!dynamicFields || typeof dynamicFields !== 'object') return;
  
  try {
    for (const [fieldName, fieldValue] of Object.entries(dynamicFields)) {
      if (fieldValue && fieldValue.trim()) {
        await addFieldValue(fieldName, fieldValue.trim(), category);
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
      ['field_name', 'field_value', 'category', 'count', 'last_used', 'created_date']
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

// 🔥 NEW: เพิ่ม/อัปเดต field value สำหรับ datalist
async function addFieldValue(fieldName, fieldValue, category) {
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
    
    // หาแถวที่มีค่าซ้ำ
    for (let i = 1; i < rows.length; i++) {
      const [rowFieldName, rowFieldValue, rowCategory] = rows[i];
      if (rowFieldName === fieldName && rowFieldValue === trimmedValue && rowCategory === category) {
        existingRowIndex = i + 1;
        existingCount = parseInt(rows[i][3] || 1);
        break;
      }
    }
    
    if (existingRowIndex > 0) {
      // อัปเดตค่าที่มีอยู่ (เพิ่ม count และ last_used)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEETS_ID,
        range: `Master_Field_Values!A${existingRowIndex}:F${existingRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[fieldName, trimmedValue, category, existingCount + 1, timestamp, rows[existingRowIndex - 1][5]]]
        }
      });
    } else {
      // เพิ่มค่าใหม่
      const values = [[fieldName, trimmedValue, category, 1, timestamp, timestamp]];
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEETS_ID,
        range: 'Master_Field_Values!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
    }
  } catch (sheetError) {
    if (sheetError.message.includes('Unable to parse range')) {
      await createFieldValuesSheet();
      await addFieldValue(fieldName, fieldValue, category); // เรียกซ้ำ
    }
  }
}

// 🔥 NEW: ดึง field values สำหรับ datalist
async function getFieldValues(fieldName, category) {
  try {
    const sheets = getSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Field_Values!A:F',
    });
    
    const rows = response.data.values || [];
    const values = [];
    
    // กรองและเรียงข้อมูล
    rows.slice(1).forEach(row => {
      if (row.length >= 3) {
        const [rowFieldName, rowFieldValue, rowCategory, count, lastUsed] = row;
        
        if (rowFieldName === fieldName && 
            (rowCategory === category || fieldName === 'อาคาร')) { // อาคารใช้ร่วมกันได้
          values.push({
            value: rowFieldValue,
            count: parseInt(count || 1),
            lastUsed: lastUsed
          });
        }
      }
    });
    
    // เรียงตาม count (มากไปน้อย) แล้วตาม lastUsed (ใหม่ไปเก่า)
    values.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return new Date(b.lastUsed) - new Date(a.lastUsed);
    });
    
    return values.map(v => v.value);
    
  } catch (error) {
    console.error('Error getting field values:', error);
    return [];
  }
}

// บันทึกข้อมูลรายงาน พร้อม Unique ID
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
      reportData.category,           // E: หมวดงาน
      reportData.filename,           // F: ไฟล์
      reportData.driveUrl || '',     // G: URL
      reportData.photoCount || 0     // H: จำนวนรูป
    ]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Final_Reports_Log!A:H',
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
  getQCTopics,
  logPhoto,
  logReport,
  getMasterData,
  addMasterData,
  getCompletedTopics,
  // 🔥 NEW: Full Match Functions
  getCompletedTopicsFullMatch,
  isFullMatch,
  // 🔥 NEW: Field Values Functions  
  createFieldValuesSheet,
  addFieldValue,
  getFieldValues,
  addFieldValuesFromPhoto
};