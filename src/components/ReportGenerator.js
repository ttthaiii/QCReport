// src/components/ReportGenerator.js
import React, { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext';
import { useLoading } from '../context/LoadingContext';

const ReportGenerator = () => {
  const [selectedBuilding, setSelectedBuilding] = useState('A');
  const [selectedFoundation, setSelectedFoundation] = useState('F01');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [topics, setTopics] = useState({});
  const [topicStatus, setTopicStatus] = useState({});
  const [generatedReports, setGeneratedReports] = useState([]);
  const [reportPreview, setReportPreview] = useState(null);

  const { api } = useApi();
  const { setLoading } = useLoading();

  // Options
  const buildings = ['A', 'B', 'C'];
  const foundations = ['F01', 'F02', 'F03', 'F04', 'F05'];

  useEffect(() => {
    loadTopics();
  }, []);

  useEffect(() => {
    if (selectedBuilding && selectedFoundation && selectedCategory) {
      loadTopicStatus();
    }
  }, [selectedBuilding, selectedFoundation, selectedCategory]);

  const loadTopics = async () => {
    try {
      setLoading(true);
      const response = await api.get('/topics');
      if (response.success) {
        setTopics(response.data);
        // Auto-select first category
        const firstCategory = Object.keys(response.data)[0];
        if (firstCategory) {
          setSelectedCategory(firstCategory);
        }
      }
    } catch (error) {
      console.error('Error loading topics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTopicStatus = async () => {
    try {
      const response = await api.get('/topics/status', {
        building: selectedBuilding,
        foundation: selectedFoundation,
        category: selectedCategory
      });
      if (response.success) {
        setTopicStatus(response.data);
      }
    } catch (error) {
      console.error('Error loading topic status:', error);
    }
  };

  const generateReport = async () => {
    if (!selectedBuilding || !selectedFoundation || !selectedCategory) {
      alert('กรุณาเลือกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/reports/generate', {
        building: selectedBuilding,
        foundation: selectedFoundation,
        category: selectedCategory,
        userEmail: 'current-user@example.com' // TODO: Get from auth context
      });

      if (response.success) {
        setReportPreview(response.data);
        
        // Add to generated reports list
        setGeneratedReports(prev => [
          {
            id: Date.now(),
            ...response.data,
            generatedAt: new Date().toISOString()
          },
          ...prev
        ]);

        alert('🎉 สร้างรายงานเสร็จสิ้น!');
      } else {
        alert('❌ สร้างรายงานล้มเหลว: ' + response.message);
      }
    } catch (error) {
      console.error('Report generation error:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = (reportUrl, filename) => {
    const link = document.createElement('a');
    link.href = reportUrl;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const viewReport = (reportUrl) => {
    window.open(reportUrl, '_blank');
  };

  const getCompletionStats = () => {
    if (!topicStatus[selectedCategory]) return null;
    
    const categoryStatus = topicStatus[selectedCategory];
    const total = categoryStatus.length;
    const completed = categoryStatus.filter(t => t.completed).length;
    const missing = total - completed;
    
    return {
      total,
      completed,
      missing,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  };

  const getMissingTopics = () => {
    if (!topicStatus[selectedCategory]) return [];
    
    return topicStatus[selectedCategory]
      .filter(t => !t.completed)
      .map(t => t.topic);
  };

  const stats = getCompletionStats();
  const missingTopics = getMissingTopics();

  return (
    <div className="report-generator-container">
      <div className="report-header">
        <h2>📄 สร้างรายงาน QC</h2>
        <p>สร้างรายงาน PDF รูปประกอบการตรวจสอบ</p>
      </div>

      {/* Selection Form */}
      <div className="selection-form">
        <div className="form-row">
          <div className="form-group">
            <label>อาคาร:</label>
            <select 
              value={selectedBuilding} 
              onChange={(e) => setSelectedBuilding(e.target.value)}
            >
              {buildings.map(building => (
                <option key={building} value={building}>อาคาร {building}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>ฐานราก:</label>
            <select 
              value={selectedFoundation} 
              onChange={(e) => setSelectedFoundation(e.target.value)}
            >
              {foundations.map(foundation => (
                <option key={foundation} value={foundation}>{foundation}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>หมวดงาน:</label>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">-- เลือกหมวดงาน --</option>
              {Object.keys(topics).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Status Summary */}
      {stats && (
        <div className="status-summary">
          <h3>สรุปสถานะ</h3>
          <div className="stats-cards">
            <div className="stat-card total">
              <div className="stat-number">{stats.total}</div>
              <div className="stat-label">หัวข้อทั้งหมด</div>
            </div>
            <div className="stat-card completed">
              <div className="stat-number">{stats.completed}</div>
              <div className="stat-label">ถ่ายแล้ว</div>
            </div>
            <div className="stat-card missing">
              <div className="stat-number">{stats.missing}</div>
              <div className="stat-label">ยังขาด</div>
            </div>
            <div className="stat-card percentage">
              <div className="stat-number">{stats.percentage}%</div>
              <div className="stat-label">ความสมบูรณ์</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${stats.percentage}%`,
                backgroundColor: stats.percentage === 100 ? '#4CAF50' : '#FF9800'
              }}
            ></div>
            <span className="progress-text">{stats.percentage}% สมบูรณ์</span>
          </div>

          {/* Missing Topics Warning */}
          {missingTopics.length > 0 && (
            <div className="missing-topics-warning">
              <h4>⚠️ หัวข้อที่ยังขาด ({missingTopics.length})</h4>
              <div className="missing-list">
                {missingTopics.map((topic, index) => (
                  <span key={index} className="missing-topic">
                    {topic}
                  </span>
                ))}
              </div>
              <p className="warning-text">
                📝 หมายเหตุ: สามารถสร้างรายงานได้แม้ข้อมูลยังไม่ครบถ้วน 
                และสร้างรายงานใหม่เมื่อข้อมูลครบแล้วได้
              </p>
            </div>
          )}
        </div>
      )}

      {/* Generate Button */}
      <div className="generate-section">
        <button 
          className="generate-btn"
          onClick={generateReport}
          disabled={!selectedCategory || !stats}
        >
          📄 สร้างรายงาน PDF
        </button>
        <p className="generate-note">
          รายงานจะมีขนาด A4 และแสดงรูป 2 รูปต่อหน้า
        </p>
      </div>

      {/* Report Preview */}
      {reportPreview && (
        <div className="report-preview">
          <h3>✅ รายงานที่สร้างเสร็จแล้ว</h3>
          <div className="preview-card">
            <div className="preview-header">
              <h4>📄 {reportPreview.filename}</h4>
              <div className="preview-actions">
                <button 
                  className="view-btn"
                  onClick={() => viewReport(reportPreview.pdfUrl)}
                >
                  👀 ดูรายงาน
                </button>
                <button 
                  className="download-btn"
                  onClick={() => downloadReport(reportPreview.downloadUrl, reportPreview.filename)}
                >
                  💾 ดาวน์โหลด
                </button>
              </div>
            </div>
            
            <div className="preview-details">
              <p><strong>อาคาร:</strong> {reportPreview.summary.building}</p>
              <p><strong>ฐานราก:</strong> {reportPreview.summary.foundation}</p>
              <p><strong>หมวดงาน:</strong> {reportPreview.summary.category}</p>
              <p><strong>หัวข้อทั้งหมด:</strong> {reportPreview.summary.totalTopics}</p>
              <p><strong>หัวข้อที่มีรูป:</strong> {reportPreview.summary.completedTopics}</p>
              <p><strong>ความสมบูรณ์:</strong> {reportPreview.summary.completionPercentage}%</p>
            </div>

            {reportPreview.missingTopicsList.length > 0 && (
              <div className="missing-in-report">
                <p><strong>หัวข้อที่ขาดในรายงาน:</strong></p>
                <div className="missing-list">
                  {reportPreview.missingTopicsList.map((topic, index) => (
                    <span key={index} className="missing-topic">{topic}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generated Reports History */}
      {generatedReports.length > 0 && (
        <div className="reports-history">
          <h3>📋 รายงานที่สร้างไว้</h3>
          <div className="reports-list">
            {generatedReports.map((report) => (
              <div key={report.id} className="report-item">
                <div className="report-info">
                  <h4>{report.filename}</h4>
                  <p>
                    {report.summary.building}-{report.summary.foundation} | 
                    {report.summary.category} | 
                    {report.summary.completionPercentage}% สมบูรณ์
                  </p>
                  <p className="report-date">
                    สร้างเมื่อ: {new Date(report.generatedAt).toLocaleString('th-TH')}
                  </p>
                </div>
                <div className="report-actions">
                  <button 
                    className="view-btn small"
                    onClick={() => viewReport(report.pdfUrl)}
                  >
                    👀
                  </button>
                  <button 
                    className="download-btn small"
                    onClick={() => downloadReport(report.downloadUrl, report.filename)}
                  >
                    💾
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportGenerator;