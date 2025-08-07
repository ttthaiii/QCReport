// backend/routes/auth.js
const express = require('express');
const router = express.Router();

// POST /api/auth/login - ล็อกอินด้วย Google (placeholder)
router.post('/login', async (req, res) => {
  try {
    const { token, email, name } = req.body;
    
    // TODO: Verify Google OAuth token
    // For now, just return success
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        email: email || 'demo@example.com',
        name: name || 'Demo User',
        authenticated: true
      },
      token: 'demo-jwt-token' // TODO: Generate real JWT
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: error.message
    });
  }
});

// POST /api/auth/logout - ล็อกเอาท์
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// GET /api/auth/verify - ใช้สำหรับ verify token
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'No token provided'
    });
  }

  // TODO: Verify JWT token
  res.json({
    success: true,
    user: {
      email: 'demo@example.com',
      name: 'Demo User',
      authenticated: true
    }
  });
});

module.exports = router;