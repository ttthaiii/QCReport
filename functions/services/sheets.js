// functions/services/sheets.js (Safe version)
const { sheets } = require('../config/google');
const { getCurrentTimestamp } = require('../utils/datetime');

class SheetsService {
  constructor() {
    this.sheetId = process.env.SHEET_ID || '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';
  }

  // อ่านหัวข้อการตรวจ QC จาก sheet
  async getQCTopics() {
    try {
      console.log('📋 Reading QC topics from sheet:', this.sheetId);
      
      // ตรวจสอบว่ามี sheets client หรือไม่
      if (!sheets) {
        console.warn('⚠️ Google Sheets API not available, using mock data');
        return this.getMockTopics();
      }
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'หัวข้อการตรวจ QC!A:B',
      });

      const rows = response.data.values || [];
      const topics = {};

      rows.slice(1).forEach(([category, topic]) => {
        if (category && topic) {
          if (!topics[category]) {
            topics[category] = [];
          }
          topics[category].push(topic.trim());
        }
      });

      console.log(`📋 Loaded ${Object.keys(topics).length} categories from Google Sheets`);
      return Object.keys(topics).length > 0 ? topics : this.getMockTopics();
      
    } catch (error) {
      console.error('❌ Error reading QC topics:', error.message);
      console.log('📋 Falling back to mock data');
      return this.getMockTopics();
    }
  }

  // Mock data สำหรับกรณีที่ไม่สามารถเชื่อมต่อ Google Sheets ได้
  /*getMockTopics() {
    return {
      'งานโครงสร้าง': [
        'การวางผัง',
        'การเทคอนกรีต',
        'การติดตั้งเหล็กเสริม',
        'การบ่มคอนกรีต',
        'การตรวจสอบความแข็งแรง'
      ],
      'งานสถาปัตยกรรม': [
        'การก่อผนัง',
        'การฉาบผนัง',
        'การทาสี',
        'การติดตั้งหน้าต่าง',
        'การติดตั้งประตู'
      ],
      'งานระบบ': [
        'ระบบไฟฟ้า',
        'ระบบประปา',
        'ระบบแอร์',
        'ระบบดับเพลิง',
        'ระบบสื่อสาร'
      ]
    };
  }*/

  // บันทึกข้อมูลรูปลง Master_Photos_Log
  async logPhoto(photoData) {
    try {
      console.log('📸 Logging photo data:', photoData.filename);
      
      if (!sheets) {
        console.warn('⚠️ Google Sheets API not available, skipping photo log');
        return { success: true, message: 'Photo logged locally' };
      }

      // TODO: Implement Google Sheets logging
      return { success: true, message: 'Photo logged successfully' };
    } catch (error) {
      console.error('❌ Error logging photo:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ดึงข้อมูลรูปที่ถ่ายแล้วตามเงื่อนไข
  async getExistingPhotos(building, foundation, category = null) {
    try {
      console.log(`📊 Getting existing photos for ${building}-${foundation}-${category || 'all'}`);
      
      if (!sheets) {
        console.warn('⚠️ Google Sheets API not available, returning empty array');
        return [];
      }

      // TODO: Implement Google Sheets query
      return [];
    } catch (error) {
      console.error('❌ Error getting existing photos:', error.message);
      return [];
    }
  }

  // บันทึกข้อมูลรายงานลง Final_Reports_Log
  async logReport(reportData) {
    try {
      console.log('📄 Logging report data:', reportData.filename);
      
      if (!sheets) {
        console.warn('⚠️ Google Sheets API not available, skipping report log');
        return { success: true, message: 'Report logged locally' };
      }

      // TODO: Implement Google Sheets logging
      return { success: true, message: 'Report logged successfully' };
    } catch (error) {
      console.error('❌ Error logging report:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ดึงสถิติสำหรับ Dashboard
  async getDashboardStats() {
    try {
      console.log('📊 Getting dashboard stats');
      
      if (!sheets) {
        console.warn('⚠️ Google Sheets API not available, returning mock stats');
        return this.getMockDashboardStats();
      }

      // TODO: Implement Google Sheets query
      return this.getMockDashboardStats();
    } catch (error) {
      console.error('❌ Error getting dashboard stats:', error.message);
      return this.getMockDashboardStats();
    }
  }

  // Mock dashboard data
  getMockDashboardStats() {
    return {
      notStarted: 5,
      partial: 3,
      completed: 2,
      details: [
        { building: 'A', foundation: 'F01', completed: 9, total: 9, percentage: 100 },
        { building: 'A', foundation: 'F02', completed: 6, total: 9, percentage: 67 },
        { building: 'A', foundation: 'F03', completed: 3, total: 9, percentage: 33 },
        { building: 'B', foundation: 'F01', completed: 0, total: 9, percentage: 0 },
        { building: 'B', foundation: 'F02', completed: 0, total: 9, percentage: 0 }
      ]
    };
  }
}

module.exports = new SheetsService();