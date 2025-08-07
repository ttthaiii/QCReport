const express = require('express');
const router = express.Router();
const sheetsService = require('../../functions/services/sheets'); // ✅ Fixed: Remove ../../backend/

// GET /api/topics - ดึงหัวข้อการตรวจ QC ทั้งหมด
router.get('/', async (req, res) => {
  try {
    const topics = await sheetsService.getQCTopics();
    res.json({
      success: true,
      data: topics,
      totalCategories: Object.keys(topics).length,
      totalTopics: Object.values(topics).reduce((sum, arr) => sum + arr.length, 0)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load topics',
      message: error.message
    });
  }
});

// GET /api/topics/status - เช็คสถานะหัวข้อที่ถ่ายแล้ว
router.get('/status', async (req, res) => {
  try {
    const { building, foundation, category } = req.query;
    
    if (!building || !foundation) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: building, foundation'
      });
    }

    const [allTopics, existingPhotos] = await Promise.all([
      sheetsService.getQCTopics(),
      sheetsService.getExistingPhotos(building, foundation, category)
    ]);

    // สร้าง mapping ของหัวข้อที่ถ่ายแล้ว
    const completedTopics = new Set(
      existingPhotos.map(photo => `${photo.category}:${photo.topic}`)
    );

    const status = {};
    Object.entries(allTopics).forEach(([cat, topics]) => {
      if (!category || cat === category) {
        status[cat] = topics.map(topic => ({
          topic,
          completed: completedTopics.has(`${cat}:${topic}`),
          photo: existingPhotos.find(p => p.category === cat && p.topic === topic) || null
        }));
      }
    });

    res.json({
      success: true,
      data: status,
      summary: {
        building,
        foundation,
        category: category || 'all',
        totalTopics: Object.values(status).reduce((sum, arr) => sum + arr.length, 0),
        completedTopics: Object.values(status).reduce((sum, arr) => 
          sum + arr.filter(t => t.completed).length, 0
        )
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get topic status',
      message: error.message
    });
  }
});

module.exports = router;