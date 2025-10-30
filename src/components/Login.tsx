// Filename: src/components/Login.tsx (ไฟล์ใหม่)

import React, { useState } from 'react';
import { auth } from '../firebase'; // Import auth ที่เราสร้าง
import { signInWithEmailAndPassword } from 'firebase/auth';

interface LoginProps {
  onSwitchToRegister: () => void;
}

// (ใช้ CSS Modules หรือ CSS ปกติก็ได้)
// import styles from './Login.module.css'; 

const Login: React.FC<LoginProps> = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      // 1. เรียกใช้ Firebase Auth
      await signInWithEmailAndPassword(auth, email, password);
      // (ถ้าสำเร็จ... onAuthStateChanged ใน App.tsx จะทำงาน
      //  และ App.tsx จะ re-render แสดงแอปหลักให้เอง)
    } catch (err) {
      setError('Log-in ล้มเหลว: ' + (err as Error).message);
      setIsLoading(false);
    }
  };

  return (
    // <div className={styles.loginContainer}>
    <div style={{ padding: '20px', maxWidth: '400px', margin: '50px auto' }}>
      <h1>QC Report - Log In</h1>
      <form onSubmit={handleLogin}>
        <div style={{ margin: '10px 0' }}>
          <label>Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ margin: '10px 0' }}>
          <label>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%' }}
          />
        </div>
        <button type="submit" disabled={isLoading} style={{ width: '100%' }}>
          {isLoading ? 'กำลัง Log-in...' : 'Log In'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
      
    <hr style={{ margin: '20px 0' }} />
    <button onClick={onSwitchToRegister} style={{ width: '100%', background: 'none', border: '1px solid #ccc' }}>
        ยังไม่มีบัญชี? สมัครสมาชิกที่นี่
    </button>      
    </div>
  );
};

export default Login;