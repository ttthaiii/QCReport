// functions/app.js (Simplified for Firebase Functions v2)
const express = require('express');
const cors = require('cors');

const app = express();

// Basic middleware
app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint (must be first)
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: 'Firebase Functions v2',
    memory: process.env.FUNCTION_MEMORY_MB || '512'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  console.log('Root endpoint requested');
  res.json({
    message: 'QC Photo & Report API',
    version: '1.0.0',
    status: 'Running',
    endpoints: {
      health: '/health',
      topics: '/topics',
      photos: '/photos',
      reports: '/reports',
      dashboard: '/dashboard'
    }
  });
});

// Simple test endpoints
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Test endpoint working',
    timestamp: new Date().toISOString()
  });
});

// Try to load routes with error handling
try {
  console.log('Loading API routes...');
  
  // Load routes one by one with error catching
  try {
    const authRoutes = require('./routes/auth');
    app.use('/auth', authRoutes);
    console.log('✅ Auth routes loaded');
  } catch (error) {
    console.error('❌ Error loading auth routes:', error.message);
  }

  try {
    const topicsRoutes = require('./routes/topics');
    app.use('/topics', topicsRoutes);
    console.log('✅ Topics routes loaded');
  } catch (error) {
    console.error('❌ Error loading topics routes:', error.message);
  }

  try {
    const photosRoutes = require('./routes/photos');
    app.use('/photos', photosRoutes);
    console.log('✅ Photos routes loaded');
  } catch (error) {
    console.error('❌ Error loading photos routes:', error.message);
  }

  try {
    const reportsRoutes = require('./routes/reports');
    app.use('/reports', reportsRoutes);
    console.log('✅ Reports routes loaded');
  } catch (error) {
    console.error('❌ Error loading reports routes:', error.message);
  }

  try {
    const dashboardRoutes = require('./routes/dashboard');
    app.use('/dashboard', dashboardRoutes);
    console.log('✅ Dashboard routes loaded');
  } catch (error) {
    console.error('❌ Error loading dashboard routes:', error.message);
  }

} catch (error) {
  console.error('❌ Error during routes initialization:', error.message);
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Handle 404 - must be last
app.use('*', (req, res) => {
  console.log(`404 - Path not found: ${req.originalUrl}`);
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: ['/health', '/test', '/topics', '/photos', '/reports', '/dashboard']
  });
});

console.log('🚀 Express app configured');

module.exports = app;