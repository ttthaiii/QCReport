import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const Reports = () => {
  const [qcTopics, setQcTopics] = useState({});
  const [formData, setFormData] = useState({
    building: 'A',
    foundation: 'F01',
    category: ''
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);

  useEffect(() => {
    loadQCTopics();
  }, []);

  const loadQCTopics = async () => {
    try {
      const response = await api.getQCTopics();
      if (response.success) {
        setQcTopics(response.data);
        // Set default category
        const categories = Object.keys(response.data);
        if (categories.length > 0) {
          setFormData(prev => ({
            ...prev,
            category: categories[0]
          }));
        }
      }
    } catch (error) {
      console.error('Error loading QC topics:', error);
      alert('ไม่สามารถโหลดหัวข้อการตรวจ QC ได้');
    }
  };

  const generateReport = async () => {
    if (!formData.building || !formData.foundation || !formData.category) {
      alert('กรุณาเลือกข้อมูลให้ครบถ้วน');
      return;
    }

    setIsGenerating(true);
    
    try {
      console.log('Generating report with data:', formData);
      
      const response = await api.generateReport(formData);
      
      if (response.success) {
        setGeneratedReport(response.data);
        alert(`สร้างรายงานสำเร็จ!\nไฟล์: ${response.data.filename}\nจำนวนรูป: ${response.data.photoCount} รูป`);
      } else {
        throw new Error('Failed to generate report');
      }
      
    } catch (error) {
      console.error('Error generating report:', error);
      alert('เกิดข้อผิดพลาดในการสร้างรายงาน: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>📋 สร้างรายงาน QC</h1>
      
      {/* Report Generation Form */}
      <div style={{ 
        marginBottom: '20px', 
        padding: '20px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        <h3 style={{ marginTop: 0, color: '#495057' }}>เลือกข้อมูลสำหรับสร้างรายงาน</h3>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '15px',
          marginBottom: '20px'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              อาคาร:
            </label>
            <select 
              value={formData.building}
              onChange={(e) => setFormData(prev => ({ ...prev, building: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}
            >
              <option value="A">อาคาร A</option>
              <option value="B">อาคาร B</option>
              <option value="C">อาคาร C</option>
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              ฐานราก:
            </label>
            <select 
              value={formData.foundation}
              onChange={(e) => setFormData(prev => ({ ...prev, foundation: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}
            >
              {['F01', 'F02', 'F03', 'F04', 'F05'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              หมวดงาน:
            </label>
            <select 
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}
            >
              {Object.keys(qcTopics).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Generate Button */}
        <div style={{ textAlign: 'center' }}>
          <button 
            onClick={generateReport}
            disabled={isGenerating}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              backgroundColor: isGenerating ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              opacity: isGenerating ? 0.6 : 1,
              minWidth: '200px'
            }}
          >
            {isGenerating ? '🔄 กำลังสร้างรายงาน...' : '📋 สร้างรายงาน PDF'}
          </button>
        </div>
        
        {/* Topics Preview */}
        {formData.category && qcTopics[formData.category] && (
          <div style={{ marginTop: '20px' }}>
            <h4 style={{ color: '#495057', marginBottom: '10px' }}>
              หัวข้อในหมวด "{formData.category}":
            </h4>
            <div style={{ 
              backgroundColor: 'white',
              padding: '15px',
              borderRadius: '4px',
              border: '1px solid #dee2e6'
            }}>
              {qcTopics[formData.category].map((topic, index) => (
                <div key={index} style={{ 
                  padding: '5px 0',
                  borderBottom: index < qcTopics[formData.category].length - 1 ? '1px solid #e9ecef' : 'none',
                  fontSize: '14px'
                }}>
                  {index + 1}. {topic}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Generated Report Info */}
      {generatedReport && (
        <div style={{ 
          marginTop: '20px',
          padding: '20px',
          backgroundColor: '#d4edda',
          borderRadius: '8px',
          border: '1px solid #c3e6cb'
        }}>
          <h3 style={{ marginTop: 0, color: '#155724' }}>✅ รายงานถูกสร้างเรียบร้อยแล้ว</h3>
          <p><strong>ไฟล์:</strong> {generatedReport.filename}</p>
          <p><strong>จำนวนรูป:</strong> {generatedReport.photoCount} รูป</p>
          <p><strong>เวลาที่สร้าง:</strong> {generatedReport.sheetTimestamp?.timestamp}</p>
          
          <div style={{ marginTop: '15px' }}>
            <a 
              href={generatedReport.viewLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: '#28a745',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '4px',
                marginRight: '10px'
              }}
            >
              📄 เปิดดู PDF
            </a>
            <a 
              href={generatedReport.downloadLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: '#17a2b8',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '4px'
              }}
            >
              💾 ดาวน์โหลด PDF
            </a>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ 
        marginTop: '30px',
        padding: '15px',
        backgroundColor: '#fff3cd',
        borderRadius: '6px',
        border: '1px solid #ffeaa7'
      }}>
        <h4 style={{ marginTop: 0, color: '#856404' }}>📝 วิธีการใช้งาน</h4>
        <ol style={{ color: '#856404', fontSize: '14px', lineHeight: '1.6' }}>
          <li>เลือก <strong>อาคาร</strong>, <strong>ฐานราก</strong>, และ <strong>หมวดงาน</strong></li>
          <li>ระบบจะแสดงหัวข้อทั้งหมดในหมวดงานที่เลือก</li>
          <li>กดปุ่ม <strong>"สร้างรายงาน PDF"</strong></li>
          <li>ระบบจะค้นหารูปทั้งหมดที่ตรงตามเงื่อนไข</li>
          <li>สร้าง PDF รายงานและอัปโหลดไป Google Drive</li>
          <li>คลิกลิงก์เพื่อดูหรือดาวน์โหลด PDF</li>
        </ol>
      </div>
    </div>
  );
};

export default Reports;