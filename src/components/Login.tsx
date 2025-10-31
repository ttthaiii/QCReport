// Filename: src/components/Login.tsx (REFACTORED for UI)

import React, { useState } from 'react';
import { auth } from '../firebase'; 
import { signInWithEmailAndPassword } from 'firebase/auth';

// ✅ [ใหม่] 1. Import CSS Module
import styles from './Auth.module.css'; 

interface LoginProps {
  onSwitchToRegister: () => void;
}

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
      await signInWithEmailAndPassword(auth, email, password);
      // (ถ้าสำเร็จ... onAuthStateChanged ใน App.tsx จะทำงาน)
    } catch (err) {
      setError('Log-in ล้มเหลว: ' + (err as Error).message);
      setIsLoading(false);
    }
  };

  // ✅ [แก้ไข] 2. ลบ inline styles ทั้งหมด และใช้ className
  return (
    <div className={styles.authPage}>
      <div className={styles.authContainer}>
        <h1 className={styles.title}>QC Report - Log In</h1>
        <form onSubmit={handleLogin}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="email">Email:</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="password">Password:</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <button type="submit" disabled={isLoading} className={styles.buttonPrimary}>
            {isLoading ? 'กำลัง Log-in...' : 'Log In'}
          </button>
          
          {error && <p className={styles.errorText}>{error}</p>}
        </form>
        
        <hr className={styles.separator} />
        
        <button onClick={onSwitchToRegister} className={styles.buttonSecondary}>
          ยังไม่มีบัญชี? สมัครสมาชิกที่นี่
        </button>      
      </div>
    </div>
  );
};

export default Login;