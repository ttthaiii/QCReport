// src/App.js - With Authentication
import React, { useState } from 'react';
import './App.css';
import Header from './components/Header';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import PhotoCapture from './components/PhotoCapture';
import ReportGenerator from './components/ReportGenerator';
import Settings from './components/Settings';
import Login from './components/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ApiProvider } from './context/ApiContext';
import { LoadingProvider } from './context/LoadingContext';

const AppContent = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const { user, loading } = useAuth();

  // Show loading screen while checking auth
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>กำลังตรวจสอบการเข้าสู่ระบบ...</p>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    return <Login />;
  }

  // Show welcome message for first-time users
  const showWelcome = user.isFirstLogin && currentView === 'dashboard';

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <>
            {showWelcome && (
              <div className="welcome-banner">
                <h3>🎉 ยินดีต้อนรับ {user.displayName}!</h3>
                <p>เข้าสู่ระบบครั้งแรก - พร้อมใช้งานระบบ QC Photo & Report</p>
              </div>
            )}
            <Dashboard />
          </>
        );
      case 'photo':
        return <PhotoCapture />;
      case 'report':
        return <ReportGenerator />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <Header user={user} />
      <Navigation 
        currentView={currentView} 
        onNavigate={setCurrentView} 
      />
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <ApiProvider>
        <LoadingProvider>
          <AppContent />
        </LoadingProvider>
      </ApiProvider>
    </AuthProvider>
  );
};

export default App;