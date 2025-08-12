import React, { useState } from 'react';
import Camera from './components/Camera';
import Reports from './components/Reports';

function App() {
  const [currentPage, setCurrentPage] = useState('camera'); // 'camera' หรือ 'reports'

  const renderPage = () => {
    switch(currentPage) {
      case 'reports':
        return <Reports />;
      case 'camera':
      default:
        return <Camera />;
    }
  };

  return (
    <div className="App">
      {/* Navigation */}
      <nav style={{
        backgroundColor: '#343a40',
        padding: '15px',
        marginBottom: '0',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ 
            color: 'white', 
            margin: 0,
            fontSize: '20px',
            fontWeight: 'bold'
          }}>
            🏗️ QC Photo Report System
          </h1>
          
          <div>
            <button
              onClick={() => setCurrentPage('camera')}
              style={{
                padding: '8px 16px',
                marginRight: '10px',
                backgroundColor: currentPage === 'camera' ? '#007bff' : 'transparent',
                color: 'white',
                border: '1px solid #007bff',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              📸 ถ่ายรูป QC
            </button>
            
            <button
              onClick={() => setCurrentPage('reports')}
              style={{
                padding: '8px 16px',
                backgroundColor: currentPage === 'reports' ? '#28a745' : 'transparent',
                color: 'white',
                border: '1px solid #28a745',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              📋 สร้างรายงาน
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
        <p>QC Photo Report System v1.0 | สร้างโดย Firebase + React</p>
      </footer>
    </div>
  );
}

export default App;