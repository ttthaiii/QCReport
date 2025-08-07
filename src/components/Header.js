// src/components/Header.js
import React from 'react';
import { useAuth } from '../context/AuthContext';

const Header = ({ user }) => {
  const { logout } = useAuth();

  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-left">
          <h1>📷 ระบบ QC Photo & Report</h1>
          <p>Central Pattana - Quality Control System</p>
        </div>
        
        <div className="header-right">
          <div className="user-info">
            <img 
              src={user.photoURL || '/default-avatar.png'} 
              alt="User Avatar" 
              className="user-avatar"
            />
            <div className="user-details">
              <span className="user-name">{user.displayName}</span>
              <span className="user-email">{user.email}</span>
            </div>
          </div>
          
          <button className="logout-btn" onClick={logout}>
            🚪 ออกจากระบบ
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;