// Filename: src/App.tsx (REFACTORED for God Mode)

import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase'; 
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, DocumentData } from 'firebase/firestore'; 
import { api, Project, ProjectConfig } from './utils/api';
import Camera from './components/Camera';
import Reports from './components/Reports';
import AdminConfig from './components/AdminConfig';
import styles from './App.module.css'; 
import Login from './components/Login';
import Register from './components/Register';

const ICONS = {
  PROJECTS: '🏗️',
  CAMERA: '📷',
  REPORTS: '📊',
  ADMIN: '⚙️'
};
type View = 'projects' | 'camera' | 'reports' | 'admin';

export interface UserProfile extends DocumentData {
  uid: string;
  email: string;
  displayName: string;
  assignedProjectId: string | null; // [แก้ไข] อนุญาตให้เป็น null
  role: 'user' | 'admin' | 'god';
  status: 'pending' | 'approved' | 'rejected';
}

function App() {
  // --- Auth States ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  // --- App States (เดิม) ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true); // ใช้สำหรับโหลด Projects/Config
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('projects');

  // --- Auth useEffect (เหมือนเดิม) ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
      if (!user) {
        setUserProfile(null);
        setSelectedProject(null);
        setProjectConfig(null);
        setView('projects'); 
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Profile useEffect (เหมือนเดิม) ---
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (currentUser) {
        setIsProfileLoading(true);
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUserProfile(userDocSnap.data() as UserProfile);
        } else {
          console.error('Error: ไม่พบข้อมูลผู้ใช้ใน Firestore!');
          signOut(auth);
        }
        setIsProfileLoading(false);
      }
    };
    fetchUserProfile();
  }, [currentUser]);

  // --- Data Fetching Callbacks (เหมือนเดิม) ---
  const fetchProjects = useCallback(async () => {
    setIsLoading(true); // <-- [แก้ไข] ใช้ isLoading ที่นี่
    setError(null);
    const response = await api.getProjects();
    if (response.success && response.data) {
      setProjects(response.data);
    } else {
      setError(response.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลโครงการ');
    }
    setIsLoading(false); // <-- [แก้ไข] โหลดเสร็จ
  }, []);

  const fetchProjectConfig = useCallback(async () => {
    if (!selectedProject) return;
    setIsLoading(true); 
    setError(null);
    const response = await api.getProjectConfig(selectedProject.id);
    if (response.success && response.data) {
      setProjectConfig(response.data);
    } else {
      setError(response.error || 'เกิดข้อผิดพลาดในการโหลด Config โครงการ');
    }
    setIsLoading(false);
  }, [selectedProject]);

  // --- Data Fetching useEffects (เหมือนเดิม) ---
  useEffect(() => {
    if (userProfile && userProfile.status === 'approved') {
      fetchProjects();
    }
  }, [userProfile, fetchProjects]);

  useEffect(() => {
    if (selectedProject) {
      fetchProjectConfig();
    }
  }, [selectedProject, fetchProjectConfig]);

  useEffect(() => {
    if (projectConfig && view === 'projects') {
      setView('camera');
    }
  }, [projectConfig, view]);

  // --- Handlers (แก้ไข) ---
  const handleBackToProjects = () => {
    // ฟังก์ชันนี้จะถูกใช้โดย "God" เท่านั้น
    setSelectedProject(null);
    setProjectConfig(null);
    setView('projects');
  };
  
  const handleLogout = async () => {
    await signOut(auth);
  };

  // ========== [แก้ไข] ส่วนการ RENDER หลัก ==========

  // 1. กำลังโหลด Auth
  if (isAuthLoading) {
    return <div className="loading-container">กำลังตรวจสอบสิทธิ์...</div>;
  }
  
  // 2. ยังไม่ Log-in
  if (!currentUser) {
    if (authView === 'login') {
      return <Login onSwitchToRegister={() => setAuthView('register')} />;
    } else {
      return <Register onSwitchToLogin={() => setAuthView('login')} />;
    }
  }

  // 3. กำลังโหลด Profile
  if (isProfileLoading) {
    return <div className="loading-container">กำลังโหลดข้อมูลผู้ใช้...</div>;
  }

  // 4. มี Profile แต่ Status ไม่ถูกต้อง
  if (!userProfile) {
     return (<div className="error-container"><p>ไม่พบข้อมูล Profile</p><button onClick={handleLogout}>Log Out</button></div>);
  }
  if (userProfile.status === 'rejected') {
    return (<div className="error-container"><p>บัญชีของคุณถูกปฏิเสธ</p><button onClick={handleLogout}>Log Out</button></div>);
  }
  if (userProfile.status === 'pending') {
    return (<div className="error-container" style={{ textAlign: 'center' }}><h2>รอการอนุมัติ</h2><p>สวัสดี, {userProfile.displayName}!</p><p>บัญชีของคุณกำลังรอการอนุมัติ</p><button onClick={handleLogout} style={{ marginTop: '20px' }}>Log Out</button></div>);
  }

  // 5. [สำเร็จ!] User Log-in แล้ว และ Status "approved"
  
  // 5.1 ตรวจสอบ Error หรือ Loading (Projects)
  if (isLoading && projects.length === 0) {
     return <div className="loading-container">กำลังโหลดโครงการ...</div>;
  }
  if (error) {
     return (<div className="error-container"><p>{error}</p><button onClick={handleLogout}>Log Out</button></div>);
  }

  // ========== [!!!] 5.2 FORK LOGIC ตาม ROLE [!!!] ==========
  
  if (userProfile.role === 'god') {
    // --- GOD USER FLOW ---
    // God จะเห็นหน้าเลือกโครงการ ถ้ายังไม่ได้เลือก

    if (!selectedProject) {
      // (นี่คือโค้ดจาก App.tsx เดิมของคุณ ที่ใช้แสดงหน้าเลือกโครงการ)
      return (
        <div className={styles.projectListContainer}>
          <h1>เลือกโครงการ (God Mode)</h1>
          {projects.map((project) => (
            <div
              key={project.id}
              className={styles.projectCard}
              onClick={() => setSelectedProject(project)} // <-- God เลือกโครงการ
            >
              {project.projectName}
            </div>
          ))}
          <button onClick={handleLogout} style={{ marginTop: '30px' }}>Log Out</button>
        </div>
      );
    }
    // ถ้า God เลือก Project แล้ว (selectedProject != null)
    // โค้ดจะข้ามไป Render แอปหลัก (ข้อ 6)

  } else {
    // --- USER / ADMIN FLOW ---
    // บังคับเข้าโครงการที่สังกัด

    const userProject = projects.find(p => p.id === userProfile.assignedProjectId);

    if (!userProject) {
       return (<div className="error-container"><p>ไม่พบโครงการ ({userProfile.assignedProjectId}) ที่คุณสังกัดอยู่</p><button onClick={handleLogout}>Log Out</button></div>);
    }

    if (!selectedProject) {
       setSelectedProject(userProject);
       // (จะ re-render และไปดึง Config)
       return <div className="loading-container">กำลังโหลดข้อมูลโครงการของคุณ...</div>;
    }
  }

  // 5.3 ตรวจสอบ Loading (Config)
  // (จะทำงานหลังจาก User/Admin ถูกบังคับเลือก หรือ God เลือกเอง)
  if (isLoading && selectedProject) {
     return <div className="loading-container">กำลังโหลด Config...</div>;
  }

  // ========== 6. RENDER หน้าแอปหลัก (เมื่อทุกอย่างพร้อม) ==========
  
  return (
    <div className={styles.App}>
      {/* 1. Top Header (Mobile) */}
      <header className={styles.appHeader}>
        {/* [แก้ไข] ปุ่มซ้ายสุดจะต่างกันตาม Role */}
        {userProfile.role === 'god' ? (
          <button className={styles.appHeaderBackButton} onClick={handleBackToProjects} title="เปลี่ยนโครงการ">
            🏗️
          </button>
        ) : (
          <button className={styles.appHeaderBackButton} onClick={handleLogout} title="Log Out" style={{ fontSize: '1.2em' }}>
            🚪
          </button>
        )}
        
        <div className={styles.appHeaderTitle} title={selectedProject.projectName}>
          {selectedProject.projectName}
        </div>
        <div style={{ width: '40px' }}></div>
      </header>

      {/* 2. Sidebar (Desktop) */}
      <nav className={styles.bottomNav}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarProjectName} title={selectedProject.projectName}>
            {selectedProject.projectName}
          </div>
          <div style={{ padding: '5px 0', fontSize: '0.9em', color: '#ccc' }}>
             👤 {userProfile.displayName} ({userProfile.role})
          </div>
          
          {/* [แก้ไข] ปุ่มเปลี่ยนโครงการ/Logout ใน Sidebar */}
          {userProfile.role === 'god' ? (
            <button className={styles.sidebarBackButton} onClick={handleBackToProjects} title="เปลี่ยนโครงการ">
              (เปลี่ยนโครงการ)
            </button>
          ) : (
            <button className={styles.sidebarBackButton} onClick={handleLogout} title="Log Out">
              (Log Out)
            </button>
          )}
        </div>

        {/* --- เมนู Navigation --- */}
        <button
          className={`${styles.navButton} ${view === 'camera' ? styles.active : ''}`}
          onClick={() => setView('camera')}
        >
          <span className={styles.icon}>{ICONS.CAMERA}</span>
          <span>ถ่ายรูป</span>
        </button>

        <button
          className={`${styles.navButton} ${view === 'reports' ? styles.active : ''}`}
          onClick={() => setView('reports')}
        >
          <span className={styles.icon}>{ICONS.REPORTS}</span>
          <span>รายงาน</span>
        </button>
        
        {/* [ใหม่] ซ่อนปุ่ม Admin ถ้าเป็น 'user' ธรรมดา */}
        {(userProfile.role === 'admin' || userProfile.role === 'god') && (
          <button
            className={`${styles.navButton} ${view === 'admin' ? styles.active : ''}`}
            onClick={() => setView('admin')}
          >
            <span className={styles.icon}>{ICONS.ADMIN}</span>
            <span>จัดการ</span>
          </button>
        )}
      </nav>

      {/* 3. Content Area */}
      <main className={view === 'camera' ? styles.contentAreaFull : styles.contentArea}>
        {view === 'camera' && projectConfig && (
          <Camera
            qcTopics={projectConfig}
            projectId={selectedProject.id}
            projectName={selectedProject.projectName}
          />
        )}

        {view === 'reports' && projectConfig && (
          <Reports
            projectId={selectedProject.id}
            projectName={selectedProject.projectName}
            projectConfig={projectConfig}
          />
        )}

        {/* [ใหม่] ป้องกันไม่ให้ User ธรรมดาเข้าหน้า Admin */}
        {view === 'admin' && projectConfig && (userProfile.role === 'admin' || userProfile.role === 'god') && (
          <AdminConfig
            projectId={selectedProject.id}
            projectName={selectedProject.projectName}
            projectConfig={projectConfig}
            onConfigUpdated={() => fetchProjectConfig()}
            currentUserProfile={userProfile} // <-- [ใหม่] ส่ง Profile ไปด้วย
          />
        )}
        {/* [ใหม่] แสดงข้อความถ้า User ธรรมดาพยายามเข้า */}
         {view === 'admin' && (userProfile.role === 'user') && (
          <div style={{ padding: '20px' }}>
            <h2>Access Denied</h2>
            <p>คุณไม่มีสิทธิ์เข้าถึงส่วน "จัดการ"</p>
          </div>
         )}

      </main>
    </div>
  );
}

export default App;