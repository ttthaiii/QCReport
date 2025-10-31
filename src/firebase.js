import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getAuth, connectAuthEmulator } from "firebase/auth";

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
const auth = getAuth(app);

// Connect to emulators in development
// (ใช้ process.env.NODE_ENV ก็ได้ หรือ window.location.hostname ก็ได้)
if (process.env.NODE_ENV === 'development') {
  console.log("Connecting to local emulators...");
  
  // Connect to Functions emulator
  connectFunctionsEmulator(functions, 'localhost', 5001, { disableWarnings: true });

  // Connect to Firestore emulator 
  connectFirestoreEmulator(db, 'localhost', 8081, { disableWarnings: true });

  // Connect to Storage emulator 
  connectStorageEmulator(storage, 'localhost', 9199, { disableWarnings: true });
  
  // (สำหรับ Auth, { } จะเป็น Argument ที่สาม)
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
}

// Export ทุกบริการที่ต้องการใช้ในแอป
export { functions, db, storage, auth };