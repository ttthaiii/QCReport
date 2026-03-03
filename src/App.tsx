// Filename: src/App.tsx (FIXED - Remove Duplicate useEffect)

import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, DocumentData } from 'firebase/firestore';
import { api, Project, ProjectConfig } from './utils/api';
import Camera from './components/Camera';
import Reports from './components/Reports';
import AdminConfig from './components/AdminConfig';
import styles from './App.module.css';
import authStyles from './components/Auth.module.css';
import { useDialog } from './contexts/DialogContext';

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
  const [newProjectName, setNewProjectName] = useState('');
  const [searchTerm, setSearchTerm] = useState(''); // ✅ [ใหม่] Search Term
  const { showAlert } = useDialog();
  const [activeJobCount, setActiveJobCount] = useState(0); // ✅ [ใหม่] Active Job Badge

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
      if (!user) {
        setUserProfile(null);
        setSelectedProject(null);
        setProjectConfig(null);
        setView('projects');
        setActiveJobCount(0);
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

  // ✅ [ใหม่] Fetch Active Jobs Status (Periodic or on Focus)
  const fetchActiveJobsCount = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const response = await api.getSharedJobs(selectedProject.id);
      if (response.success && response.data) {
        // Count jobs that are 'pending' (waiting to be reports)
        const pendingCount = response.data.filter(job => job.status === 'pending').length;
        setActiveJobCount(pendingCount);
      }
    } catch (error) {
      console.error("Failed to fetch active job count", error);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      fetchActiveJobsCount();
      // Optional: Set up an interval or refresh mechanism
      const interval = setInterval(fetchActiveJobsCount, 30000); // Check every 30 sec
      return () => clearInterval(interval);
    }
  }, [selectedProject, fetchActiveJobsCount]);

  useEffect(() => {
    // Refresh count when switching views
    if (view === 'projects' || view === 'camera' || view === 'reports') {
      if (selectedProject) fetchActiveJobsCount();
    }
  }, [view, selectedProject, fetchActiveJobsCount]);


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

  // ✅ [แก้ไข] ใช้ inline function แทนการสร้าง fetchProjects แยก
  useEffect(() => {
    if (userProfile && userProfile.status === 'approved') {
      const fetchProjectsOnce = async () => {
        setIsLoading(true);
        setError(null);
        const response = await api.getProjects();
        if (response.success && response.data) {
          setProjects(response.data);
        } else {
          setError(response.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลโครงการ');
        }
        setIsLoading(false);
      };

      fetchProjectsOnce();
    }
  }, [userProfile?.status, fetchProjects]); // ✅ เช็คแค่ status

  // ✅ [แก้ไข] ใช้ useCallback สำหรับ fetchProjectConfig
  const fetchProjectConfig = useCallback(async () => {
    if (!selectedProject) return;
    setIsLoading(true);
    setError(null);
    const response = await api.getProjectConfig(selectedProject.id);
    if (response.success && response.data) {
      setProjectConfig(response.data);
    } else {
      if (response.error && (response.error.includes("Config not found") || response.error.includes("empty") || response.error.includes("404"))) {
        // นี่คือโปรเจกต์ใหม่ที่ยังไม่มี Config
        console.warn("Config is empty, loading admin panel.");
        setProjectConfig(null);
        setError(null); // ✅ [สำคัญ] ลบ Error ทิ้ง

        // alert("ไม่พบการตั้งค่าโครงการ กรุณาติดต่อ Admin หรือตั้งค่าหัวข้อการตรวจ (Project Config not found, please contact Admin or setup topics)");

        if (userProfile?.role === 'admin' || userProfile?.role === 'god') {
          setView('admin');
        }
      } else {
        // Error อื่นๆ
        setError(response.error || 'เกิดข้อผิดพลาดในการโหลด Config โครงการ');
      }
    }
    setIsLoading(false);
  }, [selectedProject]);

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

  const handleAddNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || isLoading) return;

    setIsLoading(true); // ใช้ loading state เดิม
    const response = await api.addProject(newProjectName);

    if (response.success) {
      setNewProjectName(''); // Clear input
      fetchProjects(); // Refresh project list
      await showAlert('สร้างโครงการสำเร็จ!', 'สำเร็จ'); // <--- CHANGED
    } else {
      setError(response.error || 'ไม่สามารถสร้างโครงการได้');
    }
    setIsLoading(false);
  };

  // --- Render Logic (เหมือนเดิม) ---

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

  if (userProfile.status === 'pending') {
    return (
      <div className={authStyles.authPage}>
        <div className={authStyles.successContainer}>
          <h2 style={{ color: '#856404' }}>⏳ รอการอนุมัติ</h2>
          <p>สวัสดี, {userProfile.displayName}!</p>
          <p>บัญชีของคุณกำลังรอการอนุมัติจาก Admin</p>
          <button onClick={handleLogout} className={authStyles.buttonSecondary} style={{ marginTop: '20px' }}>
            Log Out
          </button>
        </div>
      </div>
    );
  }

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

          <form onSubmit={handleAddNewProject} className={styles.projectCard} style={{ backgroundColor: '#f8f9fa', borderColor: 'var(--primary-color)' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.2rem', color: 'var(--text-color)' }}>สร้างโครงการใหม่</h2>
            <input
              type="text"
              placeholder="ป้อนชื่อโครงการใหม่..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onClick={(e) => e.stopPropagation()} // ป้องกัน card click
              style={{ width: '100%', padding: '10px', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
              required
            />
            <button type="submit" disabled={isLoading} style={{ marginTop: '10px', padding: '10px 15px', fontSize: '1rem', cursor: 'pointer', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px' }}>
              {isLoading && !newProjectName ? '...' : (isLoading ? 'กำลังสร้าง...' : 'สร้างโครงการ')}
            </button>
          </form>

          {/* ✅ [ใหม่] Search Box */}
          <input
            type="text"
            placeholder="🔍 ค้นหาโครงการ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '90%',
              maxWidth: '400px',
              padding: '12px',
              marginBottom: '20px',
              fontSize: '1rem',
              border: '1px solid #ddd',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
          />

          {projects
            .filter(p => p.projectName.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((project) => (
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
        {/* Case: View is Camera but No Config -> Show Error/Instruction */}
        {view === 'camera' && !projectConfig && (
          <div className="error-container" style={{ margin: '20px', textAlign: 'center' }}>
            <h3>ไม่พบการตั้งค่าโครงการ (Project Config Not Found)</h3>
            <p>กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งค่าหัวข้อการตรวจ</p>
            {(userProfile.role === 'admin' || userProfile.role === 'god') && (
              <button onClick={() => setView('admin')} style={{ marginTop: '10px' }}>
                ไปที่หน้าจัดการ (Admin)
              </button>
            )}
          </div>
        )}

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

        {view === 'admin' && (userProfile.role === 'admin' || userProfile.role === 'god') && (
          <AdminConfig
            projectId={selectedProject.id}
            projectName={selectedProject.projectName}
            projectConfig={projectConfig} // ✅ ส่ง projectConfig (ซึ่งอาจจะเป็น null)
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