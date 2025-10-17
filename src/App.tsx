// Filename: src/App.tsx (แก้ไขแล้ว)

import React, { useState, useEffect } from 'react';
import Camera from './components/Camera.tsx';
import Reports from './components/Reports.tsx';
// NEW: Import the interfaces from our api file
import { api, Project, ProjectConfig } from './utils/api.ts'; // ✅  เพิ่ม .ts
import './App.css'; // ✅ เพิ่ม .css

const App: React.FC = () => {
  // --- กำหนด Type ให้กับ State ---
  const [view, setView] = useState<'camera' | 'reports'>('camera');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // --- Step 1: Fetch all projects on initial load ---
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const response = await api.getProjects();
        if (response.success && response.data.length > 0) {
          setProjects(response.data);
          // ตั้งค่าโครงการแรกเป็นค่าเริ่มต้น
          setSelectedProjectId(response.data[0].id);
        } else if (response.data.length === 0) {
          setError("ไม่พบโครงการในระบบ กรุณาเพิ่มโครงการก่อน");
        } else {
          setError(response.error || "เกิดข้อผิดพลาดในการดึงข้อมูลโครงการ");
        }
      } catch (err) {
        console.error("Failed to fetch projects:", err);
        setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์เพื่อดึงข้อมูลโครงการได้");
      }
    };
    fetchProjects();
  }, []);

  // --- Step 2: Fetch project config whenever a new project is selected ---
  useEffect(() => {
    const fetchProjectConfig = async () => {
      if (!selectedProjectId) return;
      try {
        setError(null);
        setIsLoading(true);
        console.log(`Fetching config for project: ${selectedProjectId}`);
        const response = await api.getProjectConfig(selectedProjectId);
        if (response.success) {
          setProjectConfig(response.data);
        } else {
          setError(response.error || `ไม่พบข้อมูลการตั้งค่าสำหรับโครงการนี้`);
        }
      } catch (err) {
        console.error("Failed to fetch project config:", err);
        setError("เกิดข้อผิดพลาดในการดึงข้อมูลหมวดงานและหัวข้อ");
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjectConfig();
  }, [selectedProjectId]);

  // --- Event Handlers with Types ---
  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedProjectId(e.target.value);
    setProjectConfig(null); // ล้างค่า config เก่าขณะกำลังโหลดค่าใหม่
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // --- Render Logic ---

  if (error) {
    return <div className="container error-container"><h1>เกิดข้อผิดพลาด</h1><p>{error}</p></div>;
  }

  if (isLoading && !projectConfig) {
    return <div className="container loading-container"><h1>กำลังโหลดข้อมูล...</h1></div>;
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-left">
          <h1>QC Report</h1>
          <select className="project-selector" value={selectedProjectId} onChange={handleProjectChange} disabled={projects.length === 0}>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.projectName} ({project.projectCode})
              </option>
            ))}
          </select>
        </div>
        <nav>
          <button onClick={() => setView('camera')} className={view === 'camera' ? 'active' : ''}>
            📷 Camera
          </button>
          <button onClick={() => setView('reports')} className={view === 'reports' ? 'active' : ''}>
            📄 Reports
          </button>
        </nav>
      </header>
      <main className="container">
        {view === 'camera' && projectConfig && ( // ✅ Added a check for projectConfig
          <Camera
            qcTopics={projectConfig}
            projectId={selectedProjectId}
            projectName={selectedProject?.projectName}
          />
        )}
        {view === 'reports' && <Reports />}
      </main>
    </div>
  );
}

export default App;