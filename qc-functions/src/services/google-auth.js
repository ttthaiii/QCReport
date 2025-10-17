const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

// สร้าง Google Auth Client
function createAuthClient() {
  const credentials = {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_EMAIL,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  };

  return google.auth.fromJSON(credentials);
}

// สร้าง Google Sheets API client
function getSheetsClient() {
  const auth = createAuthClient();
  auth.scopes = SCOPES;
  return google.sheets({ version: 'v4', auth });
}

// สร้าง Google Drive API client
function getDriveClient() {
  const auth = createAuthClient();
  auth.scopes = SCOPES;
  return google.drive({ version: 'v3', auth });
}

module.exports = {
  getSheetsClient,
  getDriveClient
};