const express = require('express');
const router = express.Router();
const sheetsService = require('../../functions/services/sheets');
const driveService = require('../../functions/services/drive');
const { formatDateForFile } = require('../../functions/utils/datetime');

// POST /api/reports/generate - สร้างรายงาน QC
router.post('/generate', async (req, res) => {
  try {
    const { building, foundation, category, userEmail } = req.body;
    
    if (!building || !foundation || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: building, foundation, category'
      });
    }

    console.log(`📄 Generating report for ${building}-${foundation}-${category}`);

    // 1. ดึงข้อมูลหัวข้อทั้งหมดและรูปที่มีอยู่
    const [allTopics, existingPhotos] = await Promise.all([
      sheetsService.getQCTopics(),
      sheetsService.getExistingPhotos(building, foundation, category)
    ]);

    const categoryTopics = allTopics[category] || [];
    const totalTopics = categoryTopics.length;
    const completedTopics = existingPhotos.length;
    
    const completedTopicNames = new Set(existingPhotos.map(p => p.topic));
    const missingTopics = categoryTopics.filter(topic => !completedTopicNames.has(topic));

    // 2. สร้าง PDF (placeholder - จะทำจริงในขั้นตอนต่อไป)
    const filename = `รูปประกอบการตรวจสอบ ${building}-${foundation}.pdf`;
    const mockPdfBuffer = Buffer.from('Mock PDF content for now'); // TODO: Generate real PDF

    // 3. อัปโหลด PDF ไป Google Drive
    console.log(`📤 Uploading report to Google Drive: ${filename}`);
    const driveResult = await driveService.uploadReport({
      buffer: mockPdfBuffer,
      filename,
      building,
      foundation
    });

    // 4. บันทึกข้อมูลรายงานลง Google Sheets
    console.log(`📝 Logging report to sheets`);
    await sheetsService.logReport({
      building,
      foundation,
      category,
      totalTopics,
      completedTopics,
      missingTopics,
      pdfUrl: driveResult.viewUrl,
      filename,
      status: completedTopics === totalTopics ? 'Complete' : 'Partial',
      userEmail: userEmail || 'anonymous'
    });

    res.json({
      success: true,
      message: 'Report generated successfully',
      data: {
        filename,
        pdfUrl: driveResult.viewUrl,
        downloadUrl: driveResult.downloadUrl,
        summary: {
          building,
          foundation,
          category,
          totalTopics,
          completedTopics,
          missingTopics: missingTopics.length,
          completionPercentage: Math.round((completedTopics / totalTopics) * 100)
        },
        missingTopicsList: missingTopics,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Report generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report',
      message: error.message
    });
  }
});

// GET /api/reports/list - ดึงรายการรายงานที่สร้างแล้ว
router.get('/list', async (req, res) => {
  try {
    const { building, foundation } = req.query;
    
    // TODO: Implement list reports from sheets
    res.json({
      success: true,
      data: [],
      message: 'Report list endpoint - To be implemented'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to list reports',
      message: error.message
    });
  }
});

module.exports = router;