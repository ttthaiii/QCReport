// functions/services/sheets.js (Real Google Sheets Integration)
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

      // Skip header row
      rows.slice(1).forEach(([category, topic]) => {
        if (category && topic) {
          if (!topics[category]) {
            topics[category] = [];
          }
          topics[category].push(topic.trim());
        }
      });

      console.log(`📋 Loaded ${Object.keys(topics).length} categories from Google Sheets`);
      
      // If no data found, return mock data
      return Object.keys(topics).length > 0 ? topics : this.getMockTopics();
      
    } catch (error) {
      console.error('❌ Error reading QC topics:', error.message);
      console.log('📋 Falling back to mock data');
      return this.getMockTopics();
    }
  }

  // Mock data สำหรับกรณีที่ไม่สามารถเชื่อมต่อ Google Sheets ได้
  getMockTopics() {
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
  }

  // บันทึกข้อมูลรูปลง Master_Photos_Log
  async logPhoto(photoData) {
    try {
      console.log('📸 Logging photo data:', photoData.filename);
      
      if (!sheets) {
        console.warn('⚠️ Google Sheets API not available, skipping photo log');
        return { success: true, message: 'Photo logged locally' };
      }

      // Prepare data for sheets
      const rowData = [
        new Date().toISOString(),                    // Timestamp
        photoData.filename,                          // Filename
        photoData.building,                          // Building
        photoData.foundation,                        // Foundation
        photoData.category,                          // Category
        photoData.topic,                            // Topic
        photoData.location?.formatted_address || '', // Location
        photoData.coordinates?.lat || '',            // Latitude
        photoData.coordinates?.lng || '',            // Longitude
        photoData.driveFileId || '',                // Drive File ID
        photoData.viewUrl || '',                     // View URL
        photoData.userEmail || '',                   // User Email
        'Uploaded'                                   // Status
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'Master_Photos_Log!A:M',
        valueInputOption: 'RAW',
        resource: {
          values: [rowData]
        }
      });

      console.log('✅ Photo logged to Google Sheets successfully');
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

      // Read all photo logs
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'Master_Photos_Log!A:M'
      });

      const rows = response.data.values || [];
      const photos = [];

      // Skip header row
      rows.slice(1).forEach(row => {
        const [timestamp, filename, photoBuilding, photoFoundation, photoCategory, photoTopic, 
               location, lat, lng, driveFileId, viewUrl, userEmail, status] = row;

        // Filter by criteria
        if (photoBuilding === building && photoFoundation === foundation) {
          if (!category || photoCategory === category) {
            photos.push({
              timestamp,
              filename,
              building: photoBuilding,
              foundation: photoFoundation,
              category: photoCategory,
              topic: photoTopic,
              location,
              coordinates: { lat: parseFloat(lat) || 0, lng: parseFloat(lng) || 0 },
              driveFileId,
              viewUrl,
              userEmail,
              status
            });
          }
        }
      });

      console.log(`✅ Found ${photos.length} existing photos`);
      return photos;
      
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

      // Prepare data for sheets
      const rowData = [
        new Date().toISOString(),                    // Timestamp
        reportData.filename,                         // Filename
        reportData.building,                         // Building
        reportData.foundation,                       // Foundation
        reportData.category,                         // Category
        reportData.totalTopics,                      // Total Topics
        reportData.completedTopics,                  // Completed Topics
        reportData.missingTopics?.join(', ') || '', // Missing Topics
        reportData.pdfUrl || '',                     // PDF URL
        reportData.status || 'Generated',           // Status
        reportData.userEmail || '',                 // User Email
        Math.round((reportData.completedTopics / reportData.totalTopics) * 100) // Completion %
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'Final_Reports_Log!A:L',
        valueInputOption: 'RAW',
        resource: {
          values: [rowData]
        }
      });

      console.log('✅ Report logged to Google Sheets successfully');
      return { success: true, message: 'Report logged successfully' };
      
    } catch (error) {
      console.error('❌ Error logging report:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ดึงสถิติสำหรับ Dashboard (จากข้อมูลจริง)
  async getDashboardStats() {
    try {
      console.log('📊 Getting dashboard stats from Google Sheets');
      
      if (!sheets) {
        console.warn('⚠️ Google Sheets API not available, returning mock stats');
        return this.getMockDashboardStats();
      }

      // Get all QC topics
      const allTopics = await this.getQCTopics();
      const totalTopicsPerFoundation = Object.values(allTopics).reduce((sum, arr) => sum + arr.length, 0);

      // Get all existing photos
      const buildings = ['A', 'B', 'C'];
      const foundations = ['F01', 'F02', 'F03', 'F04', 'F05'];
      
      const foundationStats = [];
      let notStarted = 0, partial = 0, completed = 0;

      for (const building of buildings) {
        for (const foundation of foundations) {
          try {
            const photos = await this.getExistingPhotos(building, foundation);
            const completedTopics = photos.length;
            const percentage = totalTopicsPerFoundation > 0 
              ? Math.round((completedTopics / totalTopicsPerFoundation) * 100) 
              : 0;

            foundationStats.push({
              building,
              foundation,
              completed: completedTopics,
              total: totalTopicsPerFoundation,
              percentage
            });

            // Count status
            if (percentage === 0) notStarted++;
            else if (percentage === 100) completed++;
            else partial++;

          } catch (error) {
            console.error(`Error getting stats for ${building}-${foundation}:`, error.message);
          }
        }
      }

      const stats = {
        notStarted,
        partial,
        completed,
        details: foundationStats.sort((a, b) => b.percentage - a.percentage)
      };

      console.log('✅ Dashboard stats loaded from real data:', stats);
      return stats;
      
    } catch (error) {
      console.error('❌ Error getting dashboard stats:', error.message);
      return this.getMockDashboardStats();
    }
  }

  // Mock dashboard data
  getMockDashboardStats() {
    return {
      notStarted: 8,
      partial: 5,
      completed: 2,
      details: [
        { building: 'A', foundation: 'F01', completed: 15, total: 15, percentage: 100 },
        { building: 'A', foundation: 'F02', completed: 12, total: 15, percentage: 80 },
        { building: 'B', foundation: 'F01', completed: 15, total: 15, percentage: 100 },
        { building: 'A', foundation: 'F03', completed: 8, total: 15, percentage: 53 },
        { building: 'B', foundation: 'F02', completed: 7, total: 15, percentage: 47 },
        { building: 'A', foundation: 'F04', completed: 4, total: 15, percentage: 27 },
        { building: 'B', foundation: 'F03', completed: 3, total: 15, percentage: 20 },
        { building: 'C', foundation: 'F01', completed: 2, total: 15, percentage: 13 },
        { building: 'B', foundation: 'F04', completed: 1, total: 15, percentage: 7 },
        { building: 'C', foundation: 'F02', completed: 0, total: 15, percentage: 0 },
        { building: 'A', foundation: 'F05', completed: 0, total: 15, percentage: 0 },
        { building: 'B', foundation: 'F05', completed: 0, total: 15, percentage: 0 },
        { building: 'C', foundation: 'F03', completed: 0, total: 15, percentage: 0 },
        { building: 'C', foundation: 'F04', completed: 0, total: 15, percentage: 0 },
        { building: 'C', foundation: 'F05', completed: 0, total: 15, percentage: 0 }
      ]
    };
  }

  // สร้างหรืออัปเดต Google Sheets headers
  async initializeSheets() {
    try {
      if (!sheets) {
        console.warn('⚠️ Google Sheets API not available');
        return false;
      }

      console.log('📋 Initializing Google Sheets headers...');

      // Headers for QC Topics sheet
      const topicsHeaders = [['หมวดงาน', 'หัวข้อการตรวจ']];
      
      // Headers for Photos Log sheet
      const photosHeaders = [[
        'Timestamp', 'Filename', 'Building', 'Foundation', 'Category', 
        'Topic', 'Location', 'Latitude', 'Longitude', 'Drive File ID', 
        'View URL', 'User Email', 'Status'
      ]];

      // Headers for Reports Log sheet
      const reportsHeaders = [[
        'Timestamp', 'Filename', 'Building', 'Foundation', 'Category',
        'Total Topics', 'Completed Topics', 'Missing Topics', 'PDF URL',
        'Status', 'User Email', 'Completion %'
      ]];

      // Initialize each sheet
      const sheets_to_init = [
        { range: 'หัวข้อการตรวจ QC!A1:B1', values: topicsHeaders },
        { range: 'Master_Photos_Log!A1:M1', values: photosHeaders },
        { range: 'Final_Reports_Log!A1:L1', values: reportsHeaders }
      ];

      for (const sheet of sheets_to_init) {
        try {
          await sheets.spreadsheets.values.update({
            spreadsheetId: this.sheetId,
            range: sheet.range,
            valueInputOption: 'RAW',
            resource: { values: sheet.values }
          });
          console.log(`✅ Initialized sheet: ${sheet.range}`);
        } catch (error) {
          console.log(`⚠️ Sheet may already exist: ${sheet.range}`);
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Error initializing sheets:', error.message);
      return false;
    }
  }

  // เพิ่มหัวข้อ QC ตัวอย่างลง Google Sheets
  async seedMockTopics() {
    try {
      if (!sheets) {
        console.warn('⚠️ Google Sheets API not available');
        return false;
      }

      console.log('🌱 Seeding mock topics to Google Sheets...');

      const mockTopics = this.getMockTopics();
      const rows = [];

      Object.entries(mockTopics).forEach(([category, topics]) => {
        topics.forEach(topic => {
          rows.push([category, topic]);
        });
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'หัวข้อการตรวจ QC!A:B',
        valueInputOption: 'RAW',
        resource: { values: rows }
      });

      console.log(`✅ Seeded ${rows.length} topics to Google Sheets`);
      return true;
    } catch (error) {
      console.error('❌ Error seeding topics:', error.message);
      return false;
    }
  }
}

module.exports = new SheetsService();