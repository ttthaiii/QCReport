// Filename: qc-functions/test-connection.js

require('dotenv').config();
const admin = require('firebase-admin');

console.log('🚀 Starting Firestore connection test...');
console.log(`-  Project ID from .env: ${process.env.GOOGLE_PROJECT_ID}`);

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.GOOGLE_PROJECT_ID,
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
      privateKey: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  console.log('✅ Firebase Admin SDK initialized successfully.');
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization failed.');
  console.error('   Please check if your .env file is correct and in the right location.');
  process.exit(1);
}

const db = admin.firestore();

async function runTest() {
  try {
    console.log('\nAttempting to write to Firestore...');
    const docRef = db.collection('test-connection').doc('hello-world');

    await docRef.set({
      status: 'success',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('🎉 SUCCESS! Data written to Firestore successfully.');
    console.log('   Please check the "test-connection" collection in your Firestore database.');
  } catch (error) {
    console.error('\n❌ An error occurred while writing to Firestore:');
    console.error(`   Error Code: ${error.code}`);
    console.error(`   Error Details: ${error.details}`);
    console.error('\nThis confirms the issue is with the project setup or permissions, not the script logic.');
  }
}

runTest();