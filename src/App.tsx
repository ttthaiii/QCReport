// Filename: src/App.tsx (REFACTORED for Pending Page UI)

import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase'; 
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, DocumentData } from 'firebase/firestore'; 
import { api, Project, ProjectConfig } from './utils/api';
import Camera from './components/Camera';
import Reports from './components/Reports';
import AdminConfig from './components/AdminConfig';
import styles from './App.module.css'; 

// ✅ [ใหม่] 1. Import CSS Module สำหรับหน้า Auth
import authStyles from './components/Auth.module.css'; 

import Login from './components/Login';
import Register from './components/Register';

import { 
  FiCamera,
  FiBarChart2,
  FiSettings,
  FiLogOut,
  FiHome
} from 'react-icons/fi';

type View = 'projects' | 'camera' | 'reports' | 'admin';

export interface UserProfile extends DocumentData {
  uid: string;
  email: string;
  displayName: string;
  assignedProjectId: string | null; 
  role: 'user' | 'admin' | 'god';
  status: 'pending' | 'approved' | 'rejected';
}

function App() {
  // --- (States ทั้งหมดเหมือนเดิม) ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true); 
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('projects');

  // --- (useEffect และ Callbacks ทั้งหมดเหมือนเดิม) ---
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

  const fetchProjects = useCallback(async () => {
    setIsLoading(true); 
    setError(null);
    const response = await api.getProjects();
    if (response.success && response.data) {
      setProjects(response.data);
    } else {
      setError(response.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลโครงการ');
    }
    setIsLoading(false); 
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

  const handleBackToProjects = () => {
    setSelectedProject(null);
    setProjectConfig(null);
    setView('projects');
  };
  
  const handleLogout = async () => {
    await signOut(auth);
  };

  // --- (ส่วน Render) ---

  if (isAuthLoading) {
    return <div className="loading-container">กำลังตรวจสอบสิทธิ์...</div>;
  }
  
  if (!currentUser) {
    if (authView === 'login') {
      return <Login onSwitchToRegister={() => setAuthView('register')} />;
    } else {
      return <Register onSwitchToLogin={() => setAuthView('login')} />;
    }
  }

  if (isProfileLoading) {
    return <div className="loading-container">กำลังโหลดข้อมูลผู้ใช้...</div>;
  }

  if (!userProfile) {
     return (<div className="error-container"><p>ไม่พบข้อมูล Profile</p><button onClick={handleLogout}>Log Out</button></div>);
  }
  if (userProfile.status === 'rejected') {
    return (<div className="error-container"><p>บัญชีของคุณถูกปฏิเสธ</p><button onClick={handleLogout}>Log Out</button></div>);
  }

  // ✅ [แก้ไข] 2. อัปเดต UI ของหน้า "รออนุมัติ"
  if (userProfile.status === 'pending') {
    return (
      <div className={authStyles.authPage}> {/* <-- ใช้พื้นหลังสีครีม */}
        {/* <-- ใช้กล่องสีขาวเหมือนหน้า Register Success --> */}
        <div className={authStyles.successContainer}> 
          <h2 style={{ color: '#856404' }}>⏳ รอการอนุมัติ</h2> {/* <-- [ใหม่] ใช้สีเหลือง/น้ำตาล */}
          <p>สวัสดี, {userProfile.displayName}!</p>
          <p>บัญชีของคุณกำลังรอการอนุมัติจาก Admin</p>
          {/* <-- ใช้ปุ่มสไตล์ Secondary ที่เราสร้างไว้ --> */}
          <button onClick={handleLogout} className={authStyles.buttonSecondary} style={{ marginTop: '20px' }}>
            Log Out
          </button>
        </div>
      </div>
    );
  }

  // (ส่วนที่เหลือของ Render เหมือนเดิม)
  if (isLoading && projects.length === 0) {
     return <div className="loading-container">กำลังโหลดโครงการ...</div>;
  }
  if (error) {
     return (<div className="error-container"><p>{error}</p><button onClick={handleLogout}>Log Out</button></div>);
  }
  
  if (userProfile.role === 'god') {
    if (!selectedProject) {
      return (
        <div className={styles.projectListContainer}>
          <h1>เลือกโครงการ (God Mode)</h1>
          {projects.map((project) => (
            <div
              key={project.id}
              className={styles.projectCard}
              onClick={() => setSelectedProject(project)} 
            >
              {project.projectName}
            </div>
          ))}
          <button onClick={handleLogout} style={{ marginTop: '30px' }}>Log Out</button>
        </div>
      );
    }
  } else {
    const userProject = projects.find(p => p.id === userProfile.assignedProjectId);
    if (!userProject) {
       return (<div className="error-container"><p>ไม่พบโครงการ ({userProfile.assignedProjectId}) ที่คุณสังกัดอยู่</p><button onClick={handleLogout}>Log Out</button></div>);
    }
    if (!selectedProject) {
       setSelectedProject(userProject);
       return <div className="loading-container">กำลังโหลดข้อมูลโครงการของคุณ...</div>;
    }
  }

  if (isLoading && selectedProject) {
     return <div className="loading-container">กำลังโหลด Config...</div>;
  }
  
  return (
    <div className={styles.App}>
      <header className={styles.appHeader}>
        {userProfile.role === 'god' ? (
          <button className={styles.appHeaderBackButton} onClick={handleBackToProjects} title="เปลี่ยนโครงการ">
            <FiHome /> 
          </button>
        ) : (
          <button className={styles.appHeaderBackButton} onClick={handleLogout} title="Log Out" style={{ fontSize: '1.2em' }}>
            <FiLogOut /> 
          </button>
        )}
        
        <div className={styles.appHeaderTitle} title={selectedProject.projectName}>
          {selectedProject.projectName}
        </div>
        <div style={{ width: '40px' }}></div>
      </header>

      <nav className={styles.bottomNav}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarProjectName} title={selectedProject.projectName}>
            {selectedProject.projectName}
          </div>
          <div style={{ padding: '5px 0', fontSize: '0.9em', color: '#ccc' }}>
             👤 {userProfile.displayName} ({userProfile.role})
          </div>
          
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

        <button
          className={`${styles.navButton} ${view === 'camera' ? styles.active : ''}`}
          onClick={() => setView('camera')}
        >
          <span className={styles.icon}><FiCamera /></span> 
          <span>ถ่ายรูป</span>
        </button>

        <button
          className={`${styles.navButton} ${view === 'reports' ? styles.active : ''}`}
          onClick={() => setView('reports')}
        >
          <span className={styles.icon}><FiBarChart2 /></span> 
          <span>รายงาน</span>
        </button>
        
        {(userProfile.role === 'admin' || userProfile.role === 'god') && (
          <button
            className={`${styles.navButton} ${view === 'admin' ? styles.active : ''}`}
            onClick={() => setView('admin')}
          >
            <span className={styles.icon}><FiSettings /></span> 
            <span>จัดการ</span>
          </button>
        )}
      </nav>

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

        {view === 'admin' && projectConfig && (userProfile.role === 'admin' || userProfile.role === 'god') && (
          <AdminConfig
            projectId={selectedProject.id}
            projectName={selectedProject.projectName}
            projectConfig={projectConfig}
            onConfigUpdated={() => fetchProjectConfig()}
            currentUserProfile={userProfile} 
          />
        )}
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