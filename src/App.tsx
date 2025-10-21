// Filename: src/App.tsx (REPLACED)

import React, { useState, useEffect, useCallback } from 'react';
import { api, Project, ProjectConfig } from './utils/api';
import Camera from './components/Camera';
import Reports from './components/Reports';
import './App.css'; // เราจะใช้ CSS ที่อัปเดตใหม่

// ใช้ Emoji ธรรมดาเป็นไอคอนแทนการติดตั้ง lib เพิ่ม
const ICONS = {
  PROJECTS: '🏗️',
  CAMERA: '📷',
  REPORTS: '📊',
};

type View = 'projects' | 'camera' | 'reports';

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // View เริ่มต้นสำหรับ User ที่เข้ามา (ถ้ามี Project ค้างไว้)
  // เราจะสมมติว่าเริ่มที่ 'projects' ก่อนเสมอเพื่อง่ายต่อการเลือก
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
      // หลังจากโหลด Config สำเร็จ, ให้เด้งไปหน้า Camera อัตโนมัติ
      setView('camera'); 
    } else {
      setError(response.error || 'เกิดข้อผิดพลาดในการโหลด Config โครงการ');
    }
    setIsLoading(false);
  }, [selectedProject]);

  // โหลดรายชื่อโครงการตอนเปิดแอปครั้งแรก
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // เมื่อมีการเลือกโครงการ ให้โหลด Config
  useEffect(() => {
    if (selectedProject) {
      fetchProjectConfig();
    }
  }, [selectedProject, fetchProjectConfig]);

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setProjectConfig(null); // ล้าง Config เก่า
  };

  const handleBackToProjects = () => {
    setSelectedProject(null);
    setProjectConfig(null);
    setView('projects');
  };

  // --- Render Logic ---

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

  // View 1: หน้าเลือกโครงการ (Default View)
  if (!selectedProject) {
    return (
      <div className="project-list-container">
        <h1>เลือกโครงการ</h1>
        {projects.map((project) => (
          <div
            key={project.id}
            className="project-card"
            onClick={() => handleSelectProject(project)}
          >
            {project.projectName}
          </div>
        ))}
      </div>
    );
  }

  // View 2: หน้าแอปหลัก (หลังจากเลือกโครงการแล้ว)
  return (
    <div className="App">
      {/* 1. Top Header (ส่วนหัว) */}
      <header className="app-header">
        <button className="app-header-back-button" onClick={handleBackToProjects} title="เปลี่ยนโครงการ"> {/* <-- เพิ่ม title */}
          🏗️ 
        </button>
        <div className="app-header-title" title={selectedProject.projectName}>
          {selectedProject.projectName}
        </div>
        <div style={{ width: '40px' }}></div> {/* Spacer */}
      </header>

      {/* 2. Content Area (ส่วนเนื้อหา) */}
      <main className={view === 'camera' ? 'content-area-full' : 'content-area'}>
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
      </main>

      {/* 3. Bottom Tab Navigation (เมนูด้านล่าง) */}
      <nav className="bottom-nav">
        <button
          className={`nav-button ${view === 'camera' ? 'active' : ''}`}
          onClick={() => setView('camera')}
        >
          <span className="icon">{ICONS.CAMERA}</span>
          ถ่ายรูป
        </button>
        <button
          className={`nav-button ${view === 'reports' ? 'active' : ''}`}
          onClick={() => setView('reports')}
        >
          <span className="icon">{ICONS.REPORTS}</span>
          รายงาน
        </button>
      </nav>
    </div>
  );
}

export default App;