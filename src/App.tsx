// Filename: src/App.tsx (REPLACE ALL)

import React, { useState, useEffect, useCallback } from 'react';
import { api, Project, ProjectConfig } from './utils/api';
import Camera from './components/Camera';
import Reports from './components/Reports';
import './App.css';

type View = 'projects' | 'camera' | 'reports';

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
      setView('camera');
    } else {
      setError(response.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลตั้งค่าโครงการ');
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleProjectSelect = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setSelectedProject(project);
    }
  };

  useEffect(() => {
    if (selectedProject) {
      fetchProjectConfig();
    }
  }, [selectedProject, fetchProjectConfig]);

  const handleBackToProjects = () => {
    setView('projects');
    setSelectedProject(null);
    setProjectConfig(null);
  };

  // Project Selection View
  if (view === 'projects') {
    return (
      <div className="container">
        <h1>QC Report Application</h1>
        {isLoading ? (
          <p>Loading Projects...</p>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <div className="project-list">
            <h2>กรุณาเลือกโครงการ</h2>
            {projects.map(project => (
              <button key={project.id} onClick={() => handleProjectSelect(project.id)}>
                {project.projectName}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Main App View (Camera or Reports)
  if (selectedProject) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Navigation Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '15px 20px',
          backgroundColor: '#6c5ce7',
          color: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button
              onClick={handleBackToProjects}
              style={{
                padding: '8px 16px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ← เปลี่ยนโครงการ
            </button>
            <h2 style={{ margin: 0, fontSize: '18px' }}>
              📋 {selectedProject.projectName}
            </h2>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setView('camera')}
              style={{
                padding: '10px 20px',
                backgroundColor: view === 'camera' ? 'white' : 'rgba(255,255,255,0.2)',
                color: view === 'camera' ? '#6c5ce7' : 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: view === 'camera' ? 'bold' : 'normal'
              }}
            >
              📷 ถ่ายรูป
            </button>
            <button
              onClick={() => setView('reports')}
              style={{
                padding: '10px 20px',
                backgroundColor: view === 'reports' ? 'white' : 'rgba(255,255,255,0.2)',
                color: view === 'reports' ? '#6c5ce7' : 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: view === 'reports' ? 'bold' : 'normal'
              }}
            >
              📊 สร้างรายงาน
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {view === 'camera' && (
            <Camera
              qcTopics={projectConfig}
              projectId={selectedProject.id}
              projectName={selectedProject.projectName}
            />
          )}
          
          {view === 'reports' && (
            <Reports
              projectId={selectedProject.id}
              projectName={selectedProject.projectName}
              projectConfig={projectConfig}
            />
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default App;