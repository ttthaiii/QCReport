import React, { useState, useEffect } from 'react';
import Camera from './components/Camera';
import Reports from './components/Reports';

function App() {
  const [currentPage, setCurrentPage] = useState('camera'); // 'camera' หรือ 'reports'
  const [isMobile, setIsMobile] = useState(false);

  const renderPage = () => {
    switch(currentPage) {
      case 'reports':
        return <Reports />;
      case 'camera':
      default:
        return <Camera />;
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);  

  const MobileNav = ({ currentPage, setCurrentPage }) => (
    <div className="mobile-bottom-nav">
      <button 
        className={`nav-btn ${currentPage === 'camera' ? 'active' : ''}`}
        onClick={() => setCurrentPage('camera')}
      >
        <span className="nav-icon">📸</span>
        <span className="nav-text">ถ่ายรูป</span>
      </button>
      
      <button 
        className={`nav-btn ${currentPage === 'reports' ? 'active' : ''}`}
        onClick={() => setCurrentPage('reports')}
      >
        <span className="nav-icon">📋</span>
        <span className="nav-text">รายงาน</span>
      </button>
    </div>
  );

  return (
    <div className="App">
      {/* Navigation */}
      <nav className={`header-nav ${isMobile ? 'mobile' : 'desktop'}`}>
        <div className="nav-container">
          <h1 className="nav-title">
            🏗️ {isMobile ? 'QC Photo Report System' : 'QC Photo Report System'}
          </h1>
          
          {/* แสดง Navigation ทั้ง Mobile และ Desktop */}
          <div className={`nav-buttons ${isMobile ? 'mobile-tabs' : 'desktop-nav'}`}>
            <button 
              className={`nav-btn ${currentPage === 'camera' ? 'active' : ''}`}
              onClick={() => setCurrentPage('camera')}
            >
              📸 {isMobile ? 'ถ่าย' : 'ถ่ายรูป QC'}
            </button>
            <button 
              className={`nav-btn ${currentPage === 'reports' ? 'active' : ''}`}
              onClick={() => setCurrentPage('reports')}
            >
              📋 {isMobile ? 'รายงาน' : 'สร้างรายงาน'}
            </button>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main>
        {renderPage()}
      </main>

      {/* Footer */}
      <footer style={{
        marginTop: '50px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        textAlign: 'center',
        color: '#6c757d',
        fontSize: '14px'
      }}>
        <p>QC Photo Report System </p>
      </footer>
    </div>
  );
}

export default App;