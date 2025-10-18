// Filename: src/App.tsx (REPLACE ALL)

import React, { useState, useEffect, useCallback } from 'react';
import { api, Project, ProjectConfig } from './utils/api';
import Camera from './components/Camera';
import './App.css';

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'projects' | 'camera'>('projects');

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
      setView('camera'); // Switch to camera view after config is loaded
    } else {
      setError(response.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลตั้งค่าโครงการ');
      setIsLoading(false); // Stop loading on error
    }
    // setIsLoading(false) is handled by the camera view now
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

  if (view === 'camera' && selectedProject) {
    return (
      <Camera
        qcTopics={projectConfig}
        projectId={selectedProject.id}
        projectName={selectedProject.projectName}
      />
    );
  }

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

export default App;