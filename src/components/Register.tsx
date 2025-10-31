// Filename: src/components/Register.tsx (REFACTORED for UI)

import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { api, Project } from '../utils/api'; 

// ✅ [ใหม่] 1. Import CSS Module (ใช้ไฟล์เดียวกับ Login)
import styles from './Auth.module.css'; 

interface RegisterProps {
  onSwitchToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onSwitchToLogin }) => {
  // (States ทั้งหมดเหมือนเดิม)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      setIsLoadingProjects(true);
      const response = await api.getProjects(); 
      if (response.success && response.data) {
        setProjects(response.data);
        if (response.data.length > 0) {
          setSelectedProject(response.data[0].id);
        }
      } else {
        setError('ไม่สามารถโหลดรายการโครงการได้');
      }
      setIsLoadingProjects(false);
    };
    fetchProjects();
  }, []); 

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) {
      setError('กรุณาเลือกโครงการ');
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      const userDocRef = doc(db, 'users', user.uid); 
      
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: displayName || email.split('@')[0], 
        assignedProjectId: selectedProject,
        role: 'user', 
        status: 'pending', 
        requestedAt: serverTimestamp(), 
        approvedBy: null,
        approvedAt: null
      });

      setIsSuccess(true); 

    } catch (err) {
      setError('สมัครล้มเหลว: ' + (err as Error).message);
    }
    setIsLoading(false);
  };

  // ✅ [แก้ไข] 2. ใช้ className สำหรับหน้า Success
  if (isSuccess) {
    return (
      <div className={styles.authPage}>
        <div className={styles.successContainer}>
          <h2>✅ สมัครสมาชิกสำเร็จ!</h2>
          <p>บัญชีของคุณถูกสร้างแล้ว และกำลังรอการอนุมัติจาก Admin</p>
          <p>กรุณาติดต่อ Admin ของโครงการ ({projects.find(p => p.id === selectedProject)?.projectName}) เพื่อขออนุมัติ</p>
          <button onClick={onSwitchToLogin} className={styles.buttonPrimary}>
            กลับไปหน้า Log In
          </button>
        </div>
      </div>
    );
  }

  // ✅ [แก้ไข] 3. ใช้ className สำหรับฟอร์มสมัคร
  return (
    <div className={styles.authPage}>
      <div className={styles.authContainer}>
        <h1 className={styles.title}>QC Report - สมัครสมาชิก</h1>
        <form onSubmit={handleRegister}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="email">Email:</label>
            <input id="email" type="email" className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="password">Password (อย่างน้อย 6 ตัวอักษร):</label>
            <input id="password" type="password" className={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="displayName">ชื่อ-นามสกุล (สำหรับแสดงผล):</label>
            <input id="displayName" type="text" className={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="project">เลือกโครงการของคุณ:</label>
            <select 
              id="project"
              value={selectedProject} 
              onChange={(e) => setSelectedProject(e.target.value)} 
              required 
              className={styles.input} // <-- ใช้สไตล์ .input เดียวกันได้
              disabled={isLoadingProjects || projects.length === 0}
            >
              {isLoadingProjects && <option>กำลังโหลดโครงการ...</option>}
              {!isLoadingProjects && projects.length === 0 && <option>ไม่พบโครงการ</option>}
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.projectName}
                </option>
              ))}
            </select>
          </div>
          
          <button type="submit" disabled={isLoading || isLoadingProjects} className={styles.buttonPrimary}>
            {isLoading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
          </button>
          
          {error && <p className={styles.errorText}>{error}</p>}
        </form>

        <hr className={styles.separator} />
        
        <button onClick={onSwitchToLogin} className={styles.buttonSecondary}>
          มีบัญชีแล้ว? กลับไปหน้า Log In
        </button>
      </div>
    </div>
  );
};

export default Register;