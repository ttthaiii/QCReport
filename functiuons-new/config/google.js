const admin = require('firebase-admin');
const { google } = require('googleapis');
const functions = require('firebase-functions');

// Use Firebase Admin's default credential
const auth = new google.auth.GoogleAuth({
  credentials: admin.credential.applicationDefault(),
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly'
  ]
});

// Initialize Google APIs
const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

// Get config from Firebase Functions config or environment
const getConfig = (key, defaultValue = null) => {
  const config = functions.config();
  return config[key] || process.env[key] || defaultValue;
};

module.exports = {
  auth,
  sheets,
  drive,
  SHEET_ID: getConfig('sheets.id') || '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8',
  DRIVE_ROOT_ID: getConfig('drive.root_id') || '1L7pHBfPF_LbpP54CpbRuapXXrM2AGMqw',
  MAPS_API_KEY: getConfig('maps.api_key')
};