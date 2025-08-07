// src/components/Dashboard.js
import React, { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext';
import { useLoading } from '../context/LoadingContext';

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedFoundation, setSelectedFoundation] = useState(null);
  const [foundationDetails, setFoundationDetails] = useState(null);
  
  const { api } = useApi();
  const { setLoading } = useLoading();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/dashboard');
      if (response.success) {
        setDashboardData(response.data);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFoundationDetails = async (building, foundation) => {
    try {
      setLoading(true);
      const response = await api.get(`/dashboard/foundation/${building}/${foundation}`);
      if (response.success) {
        setFoundationDetails(response.data);
        setSelectedFoundation({ building, foundation });
      }
    } catch (error) {
      console.error('Error loading foundation details:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (percentage) => {
    if (percentage === 100) return '#4CAF50'; // Green
    if (percentage >= 50) return '#FF9800';   // Orange  
    if (percentage > 0) return '#FFC107';     // Yellow
    return '#757575';                         // Grey
  };

  const getStatusText = (percentage) => {
    if (percentage === 100) return 'ครบถ้วน';
    if (percentage > 0) return 'ถ่ายบางส่วน';
    return 'ยังไม่เริ่ม';
  };

  if (!dashboardData) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>📊 Dashboard - สรุปความคืบหน้า</h2>
        <button 
          className="refresh-btn"
          onClick={loadDashboardData}
        >
          🔄 รีเฟรช
        </button>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card completed">
          <div className="card-icon">✅</div>
          <div className="card-content">
            <h3>{dashboardData.summary.completed}</h3>
            <p>ฐานรากครบถ้วน</p>
          </div>
        </div>

        <div className="summary-card partial">
          <div className="card-icon">🔄</div>
          <div className="card-content">
            <h3>{dashboardData.summary.partial}</h3>
            <p>ถ่ายบางส่วน</p>
          </div>
        </div>

        <div className="summary-card not-started">
          <div className="card-icon">⭕</div>
          <div className="card-content">
            <h3>{dashboardData.summary.notStarted}</h3>
            <p>ยังไม่เริ่ม</p>
          </div>
        </div>

        <div className="summary-card total">
          <div className="card-icon">📋</div>
          <div className="card-content">
            <h3>{dashboardData.summary.total}</h3>
            <p>ฐานรากทั้งหมด</p>
          </div>
        </div>
      </div>

      {/* Foundation List */}
      <div className="foundations-section">
        <h3>รายละเอียดฐานราก</h3>
        <div className="foundations-grid">
          {dashboardData.foundations.map((foundation, index) => (
            <div 
              key={index}
              className="foundation-card"
              onClick={() => loadFoundationDetails(foundation.building, foundation.foundation)}
              style={{ cursor: 'pointer' }}
            >
              <div className="foundation-header">
                <h4>{foundation.building}-{foundation.foundation}</h4>
                <div 
                  className="progress-circle"
                  style={{ 
                    background: `conic-gradient(${getStatusColor(foundation.percentage)} ${foundation.percentage * 3.6}deg, #e0e0e0 0deg)`
                  }}
                >
                  <span>{foundation.percentage}%</span>
                </div>
              </div>
              
              <div className="foundation-details">
                <p>
                  <span className="detail-label">ความคืบหน้า:</span>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(foundation.percentage) }}
                  >
                    {getStatusText(foundation.percentage)}
                  </span>
                </p>
                <p>
                  <span className="detail-label">หัวข้อ:</span>
                  {foundation.completed}/{foundation.total}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Foundation Details Modal */}
      {selectedFoundation && foundationDetails && (
        <div className="modal-overlay" onClick={() => setSelectedFoundation(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                รายละเอียด {foundationDetails.building}-{foundationDetails.foundation}
              </h3>
              <button 
                className="close-btn"
                onClick={() => setSelectedFoundation(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="summary-section">
                <h4>สรุป</h4>
                <div className="summary-stats">
                  <div className="stat-item">
                    <span className="stat-number">{foundationDetails.summary.totalTopics}</span>
                    <span className="stat-label">หัวข้อทั้งหมด</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-number">{foundationDetails.summary.completedTopics}</span>
                    <span className="stat-label">ถ่ายแล้ว</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-number">{foundationDetails.summary.missingTopics}</span>
                    <span className="stat-label">ยังขาด</span>
                  </div>
                </div>
              </div>

              <div className="categories-section">
                <h4>รายละเอียดตามหมวดงาน</h4>
                {Object.entries(foundationDetails.categories).map(([category, topics]) => (
                  <div key={category} className="category-group">
                    <h5>{category}</h5>
                    <div className="topics-list">
                      {topics.map((topic, index) => (
                        <div 
                          key={index}
                          className={`topic-item ${topic.completed ? 'completed' : 'pending'}`}
                        >
                          <span className="topic-status">
                            {topic.completed ? '✅' : '⭕'}
                          </span>
                          <span className="topic-name">{topic.topic}</span>
                          {topic.completed && topic.photo && (
                            <span className="photo-info">
                              📷 {new Date(topic.photo.timestamp).toLocaleDateString('th-TH')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;