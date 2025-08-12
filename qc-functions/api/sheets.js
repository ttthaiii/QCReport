const { getSheetsClient } = require('../services/google-auth');

const SHEETS_ID = '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';

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
      range: 'Master_Photos_Log!A:I', // เปลี่ยนจาก A:H เป็น A:I
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
      range: 'Final_Reports_Log!A:H', // เปลี่ยนจาก A:G เป็น A:H
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
  getQCTopics,
  logPhoto,
  logReport
};