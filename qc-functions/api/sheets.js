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
      range: 'Master_Photos_Log!A:I'
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

// บันทึกข้อมูลรูปถ่าย พร้อม Unique ID
async function logPhoto(photoData) {
  try {
    const sheets = getSheetsClient();
    
    // สร้าง Unique ID
    const uniqueId = generateUniqueId();
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    const values = [[
      uniqueId,                         // A: ID (ใหม่)
      timestamp,                        // B: วันเวลา
      photoData.building,               // C: อาคาร
      photoData.foundation,             // D: ฐานราก
      photoData.category,               // E: หมวดงาน
      photoData.topic,                  // F: หัวข้อ
      photoData.filename,               // G: ไฟล์
      photoData.driveUrl || '',         // H: URL
      photoData.location || '',         // I: สถานที่
      photoData.dynamicFields || '',    // J: 🔥 NEW: Dynamic Fields (JSON)
      photoData.combination || ''       // K: 🔥 NEW: Combination Description
    ]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:K', // 🔥 Extended range
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    
    return { 
      success: true, 
      timestamp,
      uniqueId 
    };
    
  } catch (error) {
    console.error('Error logging photo:', error);
    throw error;
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
      uniqueId,                           // A: ID (ใหม่)
      timestamp,                          // B: วันเวลา
      reportData.building,                // C: อาคาร
      reportData.foundation,              // D: ฐานราก
      reportData.category,                // E: หมวดงาน
      reportData.filename,                // F: ไฟล์
      reportData.driveUrl || '',          // G: URL
      reportData.photoCount || 0,         // H: จำนวนรูป
      reportData.dynamicFields || '',     // I: 🔥 NEW: Dynamic Fields (JSON)
      reportData.combination || ''        // J: 🔥 NEW: Combination Description
    ]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Final_Reports_Log!A:J', // 🔥 Extended range
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

async function getMasterDataByCategory(category) {
  try {
    const sheets = getSheetsClient();
    
    if (category === 'ฐานราก') {
      // 🔥 LEGACY PATH: Use existing getMasterData function
      return await getMasterData();
    } else {
      // 🔥 DYNAMIC PATH: Read from enhanced Master_Buildings_Foundations
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEETS_ID,
        range: 'Master_Buildings_Foundations!A:Z', // Extended range for dynamic fields
      });
      
      const rows = response.data.values || [];
      if (rows.length === 0) {
        return { uniqueValues: {}, combinations: [], fields: [], category };
      }
      
      const header = rows[0]; // [อาคาร, ฐานราก, วันที่สร้าง, หมวดงาน, field3, field4, ...]
      const uniqueValues = {};
      const combinations = [];
      
      // Find column indices for this category
      const categoryColumnIndex = header.indexOf('หมวดงาน');
      
      // Process rows for this specific category
      rows.slice(1).forEach(row => {
        if (row[categoryColumnIndex] === category) {
          const combination = {};
          
          // Extract all non-empty fields for this row
          header.forEach((fieldName, index) => {
            if (fieldName && row[index] && index !== 2 && index !== categoryColumnIndex) { // Skip วันที่สร้าง and หมวดงาน
              const value = row[index].trim();
              if (value) {
                combination[fieldName] = value;
                
                // Build unique values map
                if (!uniqueValues[fieldName]) {
                  uniqueValues[fieldName] = new Set();
                }
                uniqueValues[fieldName].add(value);
              }
            }
          });
          
          if (Object.keys(combination).length > 0) {
            combinations.push(combination);
          }
        }
      });
      
      // Convert Sets to Arrays
      Object.keys(uniqueValues).forEach(field => {
        uniqueValues[field] = Array.from(uniqueValues[field]).sort();
      });
      
      return {
        uniqueValues,
        combinations,
        fields: Object.keys(uniqueValues),
        category
      };
    }
  } catch (error) {
    console.error(`Error getting master data for category ${category}:`, error);
    return { uniqueValues: {}, combinations: [], fields: [], category };
  }
}

// 🔥 NEW: Add dynamic master data
async function addDynamicMasterData(category, dynamicFields) {
  try {
    const sheets = getSheetsClient();
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    // Check if combination already exists
    const existingData = await getMasterDataByCategory(category);
    const exists = existingData.combinations.some(combo => {
      return Object.keys(dynamicFields).every(field => 
        combo[field] === dynamicFields[field]
      );
    });
    
    if (exists) {
      console.log(`Dynamic combination already exists for ${category}`);
      return { success: true, message: 'Data already exists', duplicate: true };
    }
    
    // Prepare row data - ensure proper column mapping
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Buildings_Foundations!1:1', // Get header
    });
    
    const header = response.data.values?.[0] || [];
    const newRow = new Array(header.length).fill('');
    
    // Map dynamic fields to columns
    Object.entries(dynamicFields).forEach(([fieldName, fieldValue]) => {
      const columnIndex = header.indexOf(fieldName);
      if (columnIndex >= 0) {
        newRow[columnIndex] = fieldValue;
      }
    });
    
    // Set required columns
    const timestampIndex = header.indexOf('วันที่สร้าง');
    const categoryIndex = header.indexOf('หมวดงาน');
    
    if (timestampIndex >= 0) newRow[timestampIndex] = timestamp;
    if (categoryIndex >= 0) newRow[categoryIndex] = category;
    
    // Add the row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Buildings_Foundations!A:Z',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] }
    });
    
    console.log(`Added new dynamic master data for ${category}:`, dynamicFields);
    
    return { 
      success: true, 
      message: 'Data added successfully',
      duplicate: false,
      timestamp 
    };
    
  } catch (error) {
    console.error('Error adding dynamic master data:', error);
    throw error;
  }
}

async function createDynamicMasterDataSheet() {
  try {
    const sheets = getSheetsClient();
    
    // Check if sheet exists and has proper structure
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Buildings_Foundations!1:1',
    });
    
    const existingHeader = response.data.values?.[0] || [];
    
    // Expected header with dynamic field support
    const requiredHeader = [
      'อาคาร',        // A
      'ฐานราก',       // B (or second field for dynamic categories)
      'วันที่สร้าง',   // C
      'หมวดงาน',      // D
      'field3',      // E (for เสาเบอร์, คานเบอร์, etc.)
      'field4',      // F (for Gridline, ชั้น, etc.)
      'field5',      // G (additional fields)
      'field6',      // H
      'field7'       // I
    ];
    
    // Update header if needed
    if (!existingHeader.length || existingHeader.length < requiredHeader.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEETS_ID,
        range: 'Master_Buildings_Foundations!A1:I1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [requiredHeader]
        }
      });
      
      console.log('Dynamic master data sheet structure updated');
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Error creating dynamic master data sheet:', error);
    throw error;
  }
}

async function addDynamicMasterData(category, dynamicFields) {
  try {
    console.log(`Adding dynamic master data for ${category}:`, dynamicFields);
    
    // Convert dynamic fields to building/foundation format
    const fieldValues = Object.values(dynamicFields);
    const building = fieldValues[0] || '';
    const foundation = fieldValues[1] || '';
    
    if (!building || !foundation) {
      throw new Error('Missing building or foundation data');
    }
    
    // ใช้ฟังก์ชันเดิมเพื่อให้ทำงานได้ก่อน
    return await addMasterData(building, foundation);
    
  } catch (error) {
    console.error(`Error adding dynamic master data for ${category}:`, error);
    throw error;
  }
}

module.exports = {
  getSheetsClient,
  getQCTopics,
  logPhoto,
  logReport,
  getMasterData,        // Existing
  addMasterData,        // Existing
  getCompletedTopics,   // Existing
  // 🔥 NEW FUNCTIONS:
  getMasterDataByCategory,
  addDynamicMasterData,
  createDynamicMasterDataSheet,
  getMasterDataEnhanced: getMasterDataByCategory  // Alias
};