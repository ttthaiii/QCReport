const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();

// Security and optimization middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow Firebase hosting
}));

app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

app.use(cors({
  origin: [
    'https://qcreport-54164.web.app',
    'https://qcreport-54164.firebaseapp.com',
    'http://localhost:3000' // For development
  ],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});

app.use('/api', limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(50000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/topics', require('./routes/topics'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    timezone: 'Asia/Bangkok',
    environment: 'Firebase Functions',
    region: 'asia-southeast1',
    memory: process.env.FUNCTION_MEMORY_MB || '1024'
  });
});

// Root endpoint redirect
app.get('/', (req, res) => {
  res.json({
    message: 'QC Photo & Report API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      topics: '/api/topics',
      photos: '/api/photos',
      reports: '/api/reports',
      dashboard: '/api/dashboard'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Function Error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

module.exports = app;