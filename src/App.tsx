// Filename: src/App.tsx (REFACTORED for Wider Sidebar)

import React, { useState, useEffect, useCallback } from 'react';
import { api, Project, ProjectConfig } from './utils/api';
import Camera from './components/Camera';
import Reports from './components/Reports';
import AdminConfig from './components/AdminConfig';
import styles from './App.module.css'; 

const ICONS = {
  PROJECTS: '🏗️',
  CAMERA: '📷',
  REPORTS: '📊',
  ADMIN: '⚙️'
};
type View = 'projects' | 'camera' | 'reports' | 'admin';

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('projects');

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const response = await api.getProjects();
    if (response.success && response.data) {
      setProjects(response.data);
      if (response.data.length === 0) {
        setError('ไม่พบโครงการในระบบ กรุณาเพิ่มโครงการก่อน');
      }
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
    fetchProjects();
  }, [fetchProjects]);

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

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setProjectConfig(null);
  };

  const handleBackToProjects = () => {
    setSelectedProject(null);
    setProjectConfig(null);
    setView('projects');
  };

  if (isLoading && !selectedProject) {
    return <div className="loading-container">กำลังโหลดโครงการ...</div>;
  }

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button onClick={fetchProjects}>ลองใหม่</button>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <div className={styles.projectListContainer}>
        <h1>เลือกโครงการ</h1>
        {projects.map((project) => (
          <div
            key={project.id}
            className={styles.projectCard}
            onClick={() => handleSelectProject(project)}
          >
            {project.projectName}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.App}>
      {/* 1. Top Header (Mobile) / หรือ Header หลักของ Desktop */}
      {/* (เราจะซ่อน Header นี้เมื่อเป็น Sidebar layout) */}
      <header className={styles.appHeader}>
        <button className={styles.appHeaderBackButton} onClick={handleBackToProjects} title="เปลี่ยนโครงการ">
          🏗️
        </button>
        <div className={styles.appHeaderTitle} title={selectedProject.projectName}>
          {selectedProject.projectName}
        </div>
        <div style={{ width: '40px' }}></div> {/* Spacer */}
      </header>

      {/* 2. Sidebar (Desktop/Tablet) หรือ Bottom Nav (Mobile) */}
      <nav className={styles.bottomNav}>
        {/* --- [ใหม่] ส่วนหัวของ Sidebar (แสดงเฉพาะจอใหญ่) --- */}
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarProjectName} title={selectedProject.projectName}>
            {selectedProject.projectName}
          </div>
          {/* (อาจจะเพิ่ม User Info ตรงนี้ได้ ถ้าต้องการ) */}
          <button className={styles.sidebarBackButton} onClick={handleBackToProjects} title="เปลี่ยนโครงการ">
            (เปลี่ยน)
          </button>
        </div>
        {/* --- จบ ส่วนหัวของ Sidebar --- */}

        {/* --- เมนู Navigation (เหมือนเดิม) --- */}
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

        <button
          className={`${styles.navButton} ${view === 'admin' ? styles.active : ''}`}
          onClick={() => setView('admin')}
        >
          <span className={styles.icon}>{ICONS.ADMIN}</span>
          <span>จัดการ</span>
        </button>
      </nav>

      {/* 3. Content Area */}
      <main className={view === 'camera' ? styles.contentAreaFull : styles.contentArea}>
        {isLoading && <div className="loading-container">กำลังโหลด Config...</div>}

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

        {view === 'admin' && projectConfig && (
          <AdminConfig
            projectId={selectedProject.id}
            projectName={selectedProject.projectName}
            projectConfig={projectConfig}
            onConfigUpdated={() => fetchProjectConfig()}
          />
        )}
      </main>
    </div>
  );
}

export default App;