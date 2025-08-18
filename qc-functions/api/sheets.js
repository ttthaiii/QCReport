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
      uniqueId,                    // A: ID (ใหม่)
      timestamp,                   // B: วันเวลา
      photoData.building,          // C: อาคาร
      photoData.foundation,        // D: ฐานราก
      photoData.category,          // E: หมวดงาน
      photoData.topic,             // F: หัวข้อ
      photoData.filename,          // G: ไฟล์
      photoData.driveUrl || '',    // H: URL
      photoData.location || ''     // I: สถานที่
    ]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: 'Master_Photos_Log!A:I',
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
  getMasterData,      // 🔥 ใหม่
  addMasterData,      // 🔥 ใหม่
  getCompletedTopics  // 🔥 ใหม่
};