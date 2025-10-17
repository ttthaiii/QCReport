import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
const functions = getFunctions(app, 'asia-southeast1');
const db = getFirestore(app); // <-- เพิ่ม Firestore
const storage = getStorage(app); // <-- เพิ่ม Storage

// Connect to emulators in development
// (ใช้ process.env.NODE_ENV ก็ได้ หรือ window.location.hostname ก็ได้)
if (process.env.NODE_ENV === 'development') {
  console.log("Connecting to local emulators...");
  
  // Connect to Functions emulator
  connectFunctionsEmulator(functions, 'localhost', 5001);

  // Connect to Firestore emulator <-- เพิ่มส่วนนี้
  connectFirestoreEmulator(db, 'localhost', 8080);

  // Connect to Storage emulator <-- เพิ่มส่วนนี้
  connectStorageEmulator(storage, 'localhost', 9199);
}

// Export ทุกบริการที่ต้องการใช้ในแอป
export { functions, db, storage };