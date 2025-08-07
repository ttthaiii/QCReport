// src/context/AuthContext.js - With Session Persistence
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence 
} from 'firebase/auth';

// Firebase config (จากข้อมูลที่คุณให้มา)
const firebaseConfig = {
  apiKey: "AIzaSyBCKOeOYETnreaPypLQej73abkfeZ65X6U",
  authDomain: "qcreport-54164.firebaseapp.com",
  projectId: "qcreport-54164",
  storageBucket: "qcreport-54164.firebasestorage.app",
  messagingSenderId: "461069143501",
  appId: "1:461069143501:web:50c3883c4be6fdd459c884",
  measurementId: "G-6BQN4213Y1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Auth Context
const AuthContext = createContext();

// Auth reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case 'AUTH_LOADING':
      return { ...state, loading: true, error: null };
    case 'AUTH_SUCCESS':
      return { ...state, user: action.payload, loading: false, error: null };
    case 'AUTH_ERROR':
      return { ...state, user: null, loading: false, error: action.payload };
    case 'AUTH_LOGOUT':
      return { ...state, user: null, loading: false, error: null };
    default:
      return state;
  }
};

// Auth Provider
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    loading: true,
    error: null
  });

  // Initialize persistence
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        console.log('🔒 Firebase Auth persistence enabled');
      })
      .catch((error) => {
        console.error('❌ Auth persistence error:', error);
      });
  }, []);

  // Listen to auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Get Firebase ID token
          const idToken = await firebaseUser.getIdToken();
          
          // Call backend authentication (หรือใช้ mock สำหรับทดสอบ)
          try {
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                token: idToken,
                email: firebaseUser.email,
                name: firebaseUser.displayName,
                photoURL: firebaseUser.photoURL
              })
            });

            let backendToken = 'mock-token-' + Date.now();
            
            if (response.ok) {
              const data = await response.json();
              backendToken = data.token;
              console.log('✅ Backend authentication successful');
            } else {
              console.warn('⚠️ Backend auth failed, using mock token');
            }

            dispatch({
              type: 'AUTH_SUCCESS',
              payload: {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                photoURL: firebaseUser.photoURL,
                backendToken: backendToken,
                // เพิ่มข้อมูลสำหรับเก็บใน Sheets
                loginTime: new Date().toISOString(),
                isFirstLogin: !localStorage.getItem('hasLoggedIn')
              }
            });

            // Mark as logged in before
            localStorage.setItem('hasLoggedIn', 'true');

          } catch (backendError) {
            // Backend error - ใช้ mock token
            console.warn('⚠️ Backend unavailable, using mock authentication');
            dispatch({
              type: 'AUTH_SUCCESS',
              payload: {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                photoURL: firebaseUser.photoURL,
                backendToken: 'mock-token-' + Date.now(),
                loginTime: new Date().toISOString(),
                isFirstLogin: !localStorage.getItem('hasLoggedIn')
              }
            });
            localStorage.setItem('hasLoggedIn', 'true');
          }

        } catch (error) {
          console.error('❌ Auth error:', error);
          dispatch({ type: 'AUTH_ERROR', payload: error.message });
        }
      } else {
        dispatch({ type: 'AUTH_LOGOUT' });
      }
    });

    return unsubscribe;
  }, []);

  // Login function
  const login = async () => {
    dispatch({ type: 'AUTH_LOADING' });
    try {
      const result = await signInWithPopup(auth, provider);
      console.log('✅ Google Sign-in successful:', result.user.email);
      // onAuthStateChanged จะจัดการส่วนที่เหลือ
    } catch (error) {
      console.error('❌ Login error:', error);
      let errorMessage = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
      
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'ยกเลิกการเข้าสู่ระบบ';
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = 'เบราว์เซอร์บล็อก popup กรุณาอนุญาต popup';
      }
      
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('hasLoggedIn');
      console.log('✅ Logout successful');
      
      // Call backend logout (ถ้าต้องการ)
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (backendError) {
        // Ignore backend errors on logout
      }
      
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};