// functions/config/google.js (Production Ready for Functions v2)
const admin = require('firebase-admin');
const { google } = require('googleapis');
const path = require('path');

// Load .env file in emulator mode only
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  try {
    require('dotenv').config();
  } catch (e) {
    console.log('dotenv not available in production');
  }
}

let auth, sheets, drive;

try {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    // Local testing - use service account key file
    console.log('🔧 Setting up Google API auth for emulator...');
    
    const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
    
    try {
      auth = new google.auth.GoogleAuth({
        keyFile: serviceAccountPath,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive.readonly'
        ]
      });
      
      sheets = google.sheets({ version: 'v4', auth });
      drive = google.drive({ version: 'v3', auth });
      
      console.log('✅ Google API auth configured with service account key');
    } catch (keyError) {
      console.log('⚠️ Service account key not found, trying environment variables...');
      
      if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            project_id: process.env.GOOGLE_PROJECT_ID,
          },
          scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.readonly'
          ]
        });
        
        sheets = google.sheets({ version: 'v4', auth });
        drive = google.drive({ version: 'v3', auth });
        
        console.log('✅ Google API auth configured with environment variables');
      } else {
        throw new Error('No Google credentials found');
      }
    }
  } else {
    // Production - use Application Default Credentials (ADC)
    console.log('🔧 Setting up Google API auth for production...');
    
    auth = new google.auth.GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.readonly'
      ]
    });
    
    sheets = google.sheets({ version: 'v4', auth });
    drive = google.drive({ version: 'v3', auth });
    
    console.log('✅ Google API auth configured for production with ADC');
  }
} catch (error) {
  console.error('❌ Google API auth setup failed:', error.message);
  console.log('📝 For production deployment:');
  console.log('1. Make sure your Firebase project has proper IAM roles');
  console.log('2. Enable Google Sheets API and Google Drive API');
  console.log('3. Grant service account necessary permissions');
  sheets = null;
  drive = null;
  auth = null;
}

// Configuration values with environment variable fallbacks
const SHEET_ID = process.env.SHEET_ID || '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';
const DRIVE_ROOT_ID = process.env.DRIVE_ROOT_ID || '1abU3Kp24IjOyu6wMxQ-TFcoPirhoum2o';
const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

console.log('🔧 Config loaded:');
console.log('- SHEET_ID:', SHEET_ID ? '✅' : '❌');
console.log('- DRIVE_ROOT_ID:', DRIVE_ROOT_ID ? '✅' : '❌');  
console.log('- MAPS_API_KEY:', MAPS_API_KEY ? '✅' : '❌');
console.log('- Google Sheets API:', sheets ? '✅' : '❌');
console.log('- Google Drive API:', drive ? '✅' : '❌');
console.log('- Environment:', process.env.FUNCTIONS_EMULATOR ? 'Emulator' : 'Production');

module.exports = {
  auth,
  sheets,
  drive,
  SHEET_ID,
  DRIVE_ROOT_ID,
  MAPS_API_KEY
};