// src/components/Settings.js
import React, { useState } from 'react';
import { useApi } from '../context/ApiContext';
import { useAuth } from '../context/AuthContext';

const Settings = () => {
  const [apiStatus, setApiStatus] = useState(null);
  const { api } = useApi();
  const { user, logout } = useAuth();

  const testApiConnection = async () => {
    try {
      setApiStatus('testing');
      const response = await fetch('/api/health');
      const data = await response.json();
      
      if (response.ok) {
        setApiStatus('success');
      } else {
        setApiStatus('error');
      }
    } catch (error) {
      console.error('API test error:', error);
      setApiStatus('error');
    }
  };

  const clearCache = () => {
    localStorage.clear();
    sessionStorage.clear();
    alert('✅ ล้างแคชเรียบร้อย');
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h2>⚙️ ตั้งค่าระบบ</h2>
        <p>จัดการและตรวจสอบการทำงานของระบบ</p>
      </div>

      {/* User Info */}
      <div className="settings-section">
        <h3>👤 ข้อมูลผู้ใช้</h3>
        <div className="user-card">
          <img 
            src={user?.photoURL || '/default-avatar.png'} 
            alt="Profile" 
            className="profile-image"
          />
          <div className="user-info">
            <p><strong>ชื่อ:</strong> {user?.displayName}</p>
            <p><strong>อีเมล:</strong> {user?.email}</p>
            <p><strong>User ID:</strong> {user?.uid}</p>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="settings-section">
        <h3>🔧 สถานะระบบ</h3>
        <div className="system-checks">
          <div className="check-item">
            <span>🌐 API Connection:</span>
            <button onClick={testApiConnection}>
              {apiStatus === 'testing' ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
            </button>
            {apiStatus === 'success' && <span className="status-success">✅ ปกติ</span>}
            {apiStatus === 'error' && <span className="status-error">❌ ผิดพลาด</span>}
          </div>
          
          <div className="check-item">
            <span>📍 Geolocation:</span>
            <span className="status-success">
              {navigator.geolocation ? '✅ รองรับ' : '❌ ไม่รองรับ'}
            </span>
          </div>
          
          <div className="check-item">
            <span>📷 Camera:</span>
            <span className="status-success">
              {navigator.mediaDevices ? '✅ รองรับ' : '❌ ไม่รองรับ'}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="settings-section">
        <h3>🔨 การจัดการ</h3>
        <div className="actions-grid">
          <button className="action-btn" onClick={clearCache}>
            🧹 ล้างแคช
          </button>
          
          <button className="action-btn" onClick={() => window.location.reload()}>
            🔄 รีโหลดหน้า
          </button>
          
          <button className="action-btn danger" onClick={logout}>
            🚪 ออกจากระบบ
          </button>
        </div>
      </div>

      {/* App Info */}
      <div className="settings-section">
        <h3>ℹ️ ข้อมูลแอป</h3>
        <div className="app-info">
          <p><strong>เวอร์ชัน:</strong> 1.0.0</p>
          <p><strong>สร้างโดย:</strong> Central Pattana IT Team</p>
          <p><strong>อัปเดตล่าสุด:</strong> {new Date().toLocaleDateString('th-TH')}</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;