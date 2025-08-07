const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Set global options for Functions v2
setGlobalOptions({
  region: 'asia-southeast1',
  maxInstances: 10,
  minInstances: 0
});

// Import the Express app
const app = require('./app');

// สำคัญ: ต้องห่อ Express app ด้วย function สำหรับ Firebase Functions v2
const wrappedApp = (req, res) => {
  // Set headers for CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // Call the Express app
  return app(req, res);
};

// Export the API as a Firebase Function v2
exports.api = onRequest(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
    minInstances: 0,
    maxInstances: 10
  },
  wrappedApp
);