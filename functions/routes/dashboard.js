const express = require('express');
const router = express.Router();
const sheetsService = require('../services/sheets');

// GET /api/dashboard - ข้อมูลสำหรับ Dashboard
router.get('/', async (req, res) => {
  try {
    const stats = await sheetsService.getDashboardStats();
    
    res.json({
      success: true,
      data: {
        summary: {
          notStarted: stats.notStarted,
          partial: stats.partial,
          completed: stats.completed,
          total: stats.notStarted + stats.partial + stats.completed
        },
        foundations: stats.details.sort((a, b) => b.percentage - a.percentage)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load dashboard data',
      message: error.message
    });
  }
});

// GET /api/dashboard/foundation/:building/:foundation - รายละเอียดฐานราก
router.get('/foundation/:building/:foundation', async (req, res) => {
  try {
    const { building, foundation } = req.params;
    
    const [allTopics, existingPhotos] = await Promise.all([
      sheetsService.getQCTopics(),
      sheetsService.getExistingPhotos(building, foundation)
    ]);

    const completedTopics = new Set(
      existingPhotos.map(photo => `${photo.category}:${photo.topic}`)
    );

    const details = {};
    Object.entries(allTopics).forEach(([category, topics]) => {
      details[category] = topics.map(topic => ({
        topic,
        completed: completedTopics.has(`${category}:${topic}`),
        photo: existingPhotos.find(p => p.category === category && p.topic === topic) || null
      }));
    });

    res.json({
      success: true,
      data: {
        building,
        foundation,
        categories: details,
        summary: {
          totalTopics: Object.values(allTopics).reduce((sum, arr) => sum + arr.length, 0),
          completedTopics: existingPhotos.length,
          missingTopics: Object.values(allTopics).reduce((sum, arr) => sum + arr.length, 0) - existingPhotos.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load foundation details',
      message: error.message
    });
  }
});

module.exports = router;
