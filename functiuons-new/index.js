const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Import the Express app
const app = require('../functions/app');

// Export the API as a Firebase Function
exports.api = functions
  .region('asia-southeast1') // Bangkok region for better performance
  .runWith({
    timeoutSeconds: 60,
    memory: '1GB', // Increased for image processing
    maxInstances: 10
  })
  .https
  .onRequest(app);