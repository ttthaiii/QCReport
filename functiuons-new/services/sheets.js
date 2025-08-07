const { sheets } = require('../../functiuons-new/config/google');
const { getCurrentTimestamp } = require('../utils/datetime');
const functions = require('firebase-functions');

class SheetsService {
  constructor() {
    const config = functions.config();
    this.sheetId = config.sheets?.id || process.env.SHEET_ID || '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';
  }

  // อ่านหัวข้อการตรวจ QC จาก sheet
  async getQCTopics() {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'หัวข้อการตรวจ QC!A:B',
      });

      const rows = response.data.values || [];
      const topics = {};

      // Skip header row, group by หมวดงาน
      rows.slice(1).forEach(([category, topic]) => {
        if (category && topic) {
          if (!topics[category]) {
            topics[category] = [];
          }
          topics[category].push(topic.trim());
        }
      });

      console.log(`📋 Loaded ${Object.keys(topics).length} categories with topics`);
      return topics;
    } catch (error) {
      console.error('❌ Error reading QC topics:', error.message);
      throw new functions.https.HttpsError('internal', 'Failed to read QC topics', error.message);
    }
  }

  // บันทึกข้อมูลรูปลง Master_Photos_Log
  async logPhoto(photoData) {
    try {
      const {
        building,
        foundation,
        category,
        topic,
        topicId,
        location,
        lat,
        lng,
        driveFileId,
        driveViewUrl,
        driveDownloadUrl,
        filename,
        userEmail
      } = photoData;

      const timestamp = getCurrentTimestamp();
      
      const values = [[
        timestamp,
        building,
        foundation,
        category,
        topic,
        topicId || '',
        location,
        `${lat},${lng}`,
        driveFileId,
        driveViewUrl,
        driveDownloadUrl,
        filename,
        userEmail
      ]];

      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'Master_Photos_Log!A:M',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values }
      });

      console.log(`📸 Logged photo: ${filename} to Master_Photos_Log`);
      return response.data;
    } catch (error) {
      console.error('❌ Error logging photo:', error.message);
      throw new functions.https.HttpsError('internal', 'Failed to log photo', error.message);
    }
  }

  // ดึงข้อมูลรูปที่ถ่ายแล้วตามเงื่อนไข
  async getExistingPhotos(building, foundation, category = null) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'Master_Photos_Log!A:M',
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) return [];

      const photos = rows.slice(1)
        .filter(row => {
          const [timestamp, b, f, c] = row;
          if (!timestamp || !b || !f) return false;
          
          const matchBuilding = b === building;
          const matchFoundation = f === foundation;
          const matchCategory = category ? c === category : true;
          
          return matchBuilding && matchFoundation && matchCategory;
        })
        .map(row => ({
          timestamp: row[0],
          building: row[1],
          foundation: row[2],
          category: row[3],
          topic: row[4],
          topicId: row[5],
          location: row[6],
          coordinates: row[7],
          driveFileId: row[8],
          driveViewUrl: row[9],
          driveDownloadUrl: row[10],
          filename: row[11],
          userEmail: row[12]
        }));

      console.log(`📊 Found ${photos.length} existing photos for ${building}-${foundation}${category ? `-${category}` : ''}`);
      return photos;
    } catch (error) {
      console.error('❌ Error getting existing photos:', error.message);
      throw new functions.https.HttpsError('internal', 'Failed to get existing photos', error.message);
    }
  }

  // บันทึกข้อมูลรายงานลง Final_Reports_Log
  async logReport(reportData) {
    try {
      const {
        building,
        foundation,
        category,
        totalTopics,
        completedTopics,
        missingTopics,
        pdfUrl,
        filename,
        status,
        userEmail
      } = reportData;

      const timestamp = getCurrentTimestamp();
      
      const values = [[
        timestamp,
        building,
        foundation,
        category,
        totalTopics,
        completedTopics,
        missingTopics.join(', '),
        pdfUrl,
        filename,
        status,
        userEmail
      ]];

      await sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'Final_Reports_Log!A:K',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values }
      });

      console.log(`📄 Logged report: ${filename} to Final_Reports_Log`);
    } catch (error) {
      console.error('❌ Error logging report:', error.message);
      throw new functions.https.HttpsError('internal', 'Failed to log report', error.message);
    }
  }
}

module.exports = new SheetsService();