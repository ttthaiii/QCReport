// src/components/Navigation.js
import React from 'react';

const Navigation = ({ currentView, onNavigate }) => {
  const navItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', description: 'ภาพรวมความคืบหน้า' },
    { id: 'photo', icon: '📷', label: 'ถ่ายรูป QC', description: 'ถ่ายและอัปโหลดรูป' },
    { id: 'report', icon: '📄', label: 'สร้างรายงาน', description: 'สร้างรายงาน PDF' },
    { id: 'settings', icon: '⚙️', label: 'ตั้งค่า', description: 'จัดการระบบ' }
  ];

  return (
    <nav className="app-navigation">
      <div className="nav-container">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${currentView === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <div className="nav-icon">{item.icon}</div>
            <div className="nav-content">
              <div className="nav-label">{item.label}</div>
              <div className="nav-description">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default Navigation;