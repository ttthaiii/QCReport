// Filename: src/components/Register.tsx (สร้างไฟล์ใหม่)

import React, { useState, useEffect } from 'react';
// [ใหม่] Import auth และ db
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
// [ใหม่] Import สิ่งที่ต้องใช้จาก Firestore
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
// [ใหม่] Import api utility และ type
import { api, Project } from '../utils/api'; 

// [ใหม่] สร้าง Props interface เพื่อรับฟังก์ชันสลับหน้า
interface RegisterProps {
  onSwitchToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onSwitchToLogin }) => {
  // --- States for Form ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedProject, setSelectedProject] = useState('');

  // --- States for Projects Dropdown ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  // --- States for UI ---
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // [ใหม่] 1. โหลดรายชื่อโครงการ (Projects) เมื่อเปิดหน้านี้
  useEffect(() => {
    const fetchProjects = async () => {
      setIsLoadingProjects(true);
      const response = await api.getProjects(); // <-- เรียก API ที่มีอยู่
      if (response.success && response.data) {
        setProjects(response.data);
        // ตั้งค่า Default project อันแรก (ถ้ามี)
        if (response.data.length > 0) {
          setSelectedProject(response.data[0].id);
        }
      } else {
        setError('ไม่สามารถโหลดรายการโครงการได้');
      }
      setIsLoadingProjects(false);
    };
    fetchProjects();
  }, []); // ทำงานครั้งเดียว

  // [ใหม่] 2. Logic การสมัครสมาชิก
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) {
      setError('กรุณาเลือกโครงการ');
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      // 2.1 สร้าง User ใน Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      console.log('User created in Auth:', user.uid);

      // 2.2 [สำคัญ] สร้างเอกสาร User ใน Firestore
      // เราใช้ user.uid เป็น ID ของเอกสาร
      const userDocRef = doc(db, 'users', user.uid); 
      
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: displayName || email.split('@')[0], // ใช้ชื่อที่กรอก หรือส่วนหน้าของ Email
        assignedProjectId: selectedProject,
        role: 'user', // Role เริ่มต้น
        status: 'pending', // สถานะเริ่มต้น "รออนุมัติ"
        requestedAt: serverTimestamp(), // เวลาที่สมัคร
        approvedBy: null,
        approvedAt: null
      });

      console.log('User document created in Firestore');
      setIsSuccess(true); // แสดงข้อความสำเร็จ

    } catch (err) {
      setError('สมัครล้มเหลว: ' + (err as Error).message);
    }
    setIsLoading(false);
  };

  // --- แสดงผลฟอร์ม ---

  // ถ้าสมัครสำเร็จ
  if (isSuccess) {
    return (
      <div style={{ padding: '20px', maxWidth: '400px', margin: '50px auto', textAlign: 'center' }}>
        <h2>✅ สมัครสมาชิกสำเร็จ!</h2>
        <p>บัญชีของคุณถูกสร้างแล้ว และกำลังรอการอนุมัติจาก Admin</p>
        <p>กรุณาติดต่อ Admin ของโครงการ ({projects.find(p => p.id === selectedProject)?.projectName}) เพื่อขออนุมัติ</p>
        <button onClick={onSwitchToLogin} style={{ marginTop: '20px' }}>
          กลับไปหน้า Log In
        </button>
      </div>
    );
  }

  // ฟอร์มสมัคร
  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '50px auto' }}>
      <h1>QC Report - สมัครสมาชิก</h1>
      <form onSubmit={handleRegister}>
        <div style={{ margin: '10px 0' }}>
          <label>Email:</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%' }} />
        </div>
        <div style={{ margin: '10px 0' }}>
          <label>Password (อย่างน้อย 6 ตัวอักษร):</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%' }} />
        </div>
        <div style={{ margin: '10px 0' }}>
          <label>ชื่อ-นามสกุล (สำหรับแสดงผล):</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required style={{ width: '100%' }} />
        </div>
        <div style={{ margin: '10px 0' }}>
          <label>เลือกโครงการของคุณ:</label>
          <select 
            value={selectedProject} 
            onChange={(e) => setSelectedProject(e.target.value)} 
            required 
            style={{ width: '100%' }}
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
        
        <button type="submit" disabled={isLoading || isLoadingProjects} style={{ width: '100%' }}>
          {isLoading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>

      <hr style={{ margin: '20px 0' }} />
      <button onClick={onSwitchToLogin} style={{ width: '100%', background: 'none', border: '1px solid #ccc' }}>
        มีบัญชีแล้ว? กลับไปหน้า Log In
      </button>
    </div>
  );
};

export default Register;