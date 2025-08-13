import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const Reports = () => {
  const [qcTopics, setQcTopics] = useState({});
  const [masterData, setMasterData] = useState({
    buildings: [],
    foundations: [],
    combinations: []
  });
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(false);
  
  const [formData, setFormData] = useState({
    building: '',
    foundation: '',
    category: ''
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);

  useEffect(() => {
    loadQCTopics();
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    setIsLoadingMasterData(true);
    try {
      console.log('Loading master data...');
      const response = await api.getMasterData();
      console.log('Master data response:', response);
      
      if (response.success) {
        setMasterData(response.data);
        console.log('Master data loaded:', {
          buildings: response.data.buildings,
          foundations: response.data.foundations,
          combinations: response.data.combinations?.length || 0
        });
        
        // ตั้งค่าเริ่มต้น
        if (response.data.buildings.length > 0) {
          setFormData(prev => ({
            ...prev,
            building: response.data.buildings[0]
          }));
          console.log('Default building set:', response.data.buildings[0]);
        }
        if (response.data.foundations.length > 0) {
          setFormData(prev => ({
            ...prev,
            foundation: response.data.foundations[0]
          }));
          console.log('Default foundation set:', response.data.foundations[0]);
        }
      } else {
        console.error('Master data response failed:', response);
      }
    } catch (error) {
      console.error('Error loading master data:', error);
      
      // แสดงข้อมูล error ที่ละเอียดกว่า
      if (error.message.includes('404')) {
        console.log('Master data sheet might not exist yet');
      } else if (error.message.includes('Failed to fetch')) {
        console.log('Network or API connection issue');
      }
      
      // ไม่แสดง alert เพราะอาจเป็นครั้งแรกที่ใช้งาน
      console.log('Will show empty dropdowns for now');
    } finally {
      setIsLoadingMasterData(false);
    }
  };

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
      
      {/* Debug API Status */}
      <div style={{ 
        padding: '10px', 
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        marginBottom: '20px',
        fontSize: '12px'
      }}>
        <strong>🔗 API Status:</strong>
        <div style={{ marginLeft: '10px', marginTop: '2px' }}>
          Buildings: {masterData.buildings.length} รายการ
        </div>
        <div style={{ marginLeft: '10px' }}>
          Foundations: {masterData.foundations.length} รายการ
        </div>
        <div style={{ marginLeft: '10px' }}>
          Categories: {Object.keys(qcTopics).length} รายการ
        </div>
        <button
          onClick={() => {
            console.log('Current master data state:', masterData);
            console.log('Current form data:', formData);
            console.log('QC Topics:', qcTopics);
            loadMasterData(); // โหลดใหม่
          }}
          style={{
            marginTop: '5px',
            padding: '4px 8px',
            fontSize: '10px',
            backgroundColor: '#ffc107',
            color: '#000',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer'
          }}
        >
          🔍 Debug & Reload
        </button>
      </div>
      
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
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
                borderRadius: '4px',
                backgroundColor: isLoadingMasterData ? '#f5f5f5' : 'white'
              }}
              disabled={isLoadingMasterData}
            >
              <option value="">เลือกอาคาร...</option>
              {masterData.buildings.map(building => (
                <option key={building} value={building}>{building}</option>
              ))}
            </select>
            {isLoadingMasterData && (
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                กำลังโหลด...
              </div>
            )}
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
              <option value="">เลือกหมวดงาน...</option>
              {Object.keys(qcTopics).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            {isLoadingMasterData && (
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                กำลังโหลด...
              </div>
            )}            
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
                borderRadius: '4px',
                backgroundColor: isLoadingMasterData ? '#f5f5f5' : 'white'
              }}
              disabled={isLoadingMasterData}
            >
              <option value="">เลือกฐานราก...</option>
              {masterData.foundations.map(foundation => (
                <option key={foundation} value={foundation}>{foundation}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading Master Data */}
        {isLoadingMasterData && (
          <div style={{ 
            marginBottom: '15px', 
            textAlign: 'center', 
            fontSize: '14px', 
            color: '#666',
            padding: '10px',
            backgroundColor: '#e9ecef',
            borderRadius: '4px'
          }}>
            กำลังโหลดข้อมูลอาคารและฐานราก...
          </div>
        )}

        {/* Data Summary */}
        {!isLoadingMasterData && masterData.buildings.length > 0 && (
          <div style={{ 
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#e3f2fd',
            borderRadius: '4px',
            fontSize: '14px',
            color: '#1565c0'
          }}>
            📊 ข้อมูลในระบบ: {masterData.buildings.length} อาคาร, {masterData.foundations.length} ฐานราก, {masterData.combinations.length} รายการ
          </div>
        )}

        {/* Validation Warning */}
        {(!formData.building || !formData.foundation || !formData.category) && (
          <div style={{
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#fff3cd',
            borderRadius: '4px',
            textAlign: 'center',
            fontSize: '14px',
            color: '#856404',
            border: '1px solid #ffeaa7'
          }}>
            ⚠️ กรุณาเลือกข้อมูลให้ครบถ้วน: อาคาร, ฐานราก, และหมวดงาน
          </div>
        )}

        {/* Generate Button */}
        <div style={{ textAlign: 'center' }}>
          <button 
            onClick={generateReport}
            disabled={isGenerating || !formData.building || !formData.foundation || !formData.category}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              backgroundColor: (isGenerating || !formData.building || !formData.foundation || !formData.category) ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (isGenerating || !formData.building || !formData.foundation || !formData.category) ? 'not-allowed' : 'pointer',
              opacity: (isGenerating || !formData.building || !formData.foundation || !formData.category) ? 0.6 : 1,
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
              border: '1px solid #dee2e6',
              maxHeight: '200px',
              overflowY: 'auto'
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
              <div style={{ 
                marginTop: '10px', 
                fontSize: '12px', 
                color: '#6c757d',
                fontStyle: 'italic'
              }}>
                รวม {qcTopics[formData.category].length} หัวข้อ
              </div>
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
          
          <div style={{ marginBottom: '15px' }}>
            <p><strong>ไฟล์:</strong> {generatedReport.filename}</p>
            <p><strong>อาคาร-ฐานราก:</strong> {formData.building}-{formData.foundation}</p>
            <p><strong>หมวดงาน:</strong> {formData.category}</p>
            <p><strong>จำนวนรูป:</strong> {generatedReport.photoCount} รูป</p>
            <p><strong>เวลาที่สร้าง:</strong> {generatedReport.sheetTimestamp?.timestamp}</p>
          </div>
          
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
                marginRight: '10px',
                marginBottom: '10px'
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
                borderRadius: '4px',
                marginBottom: '10px'
              }}
            >
              💾 ดาวน์โหลด PDF
            </a>
          </div>
        </div>
      )}

      {/* No Data Warning */}
      {!isLoadingMasterData && masterData.buildings.length === 0 && (
        <div style={{ 
          marginTop: '20px',
          padding: '20px',
          backgroundColor: '#f8d7da',
          borderRadius: '8px',
          border: '1px solid #f5c6cb',
          textAlign: 'center'
        }}>
          <h4 style={{ color: '#721c24', marginTop: 0 }}>⚠️ ไม่พบข้อมูลอาคารและฐานราก</h4>
          <p style={{ color: '#721c24', marginBottom: '15px' }}>
            กรุณาไปที่หน้า "ถ่ายรูป QC" เพื่อเพิ่มข้อมูลอาคารและฐานรากก่อน
          </p>
          <button
            onClick={loadMasterData}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🔄 โหลดข้อมูลใหม่
          </button>
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
        <ol style={{ color: '#856404', fontSize: '14px', lineHeight: '1.6', marginBottom: '10px' }}>
          <li>เลือก <strong>อาคาร</strong>, <strong>ฐานราก</strong>, และ <strong>หมวดงาน</strong> จาก dropdown</li>
          <li>ระบบจะแสดงหัวข้อทั้งหมดในหมวดงานที่เลือก</li>
          <li>กดปุ่ม <strong>"สร้างรายงาน PDF"</strong></li>
          <li>ระบบจะค้นหารูปทั้งหมดที่ตรงตามเงื่อนไข</li>
          <li>สร้าง PDF รายงานและอัปโหลดไป Google Drive</li>
          <li>คลิกลิงก์เพื่อดูหรือดาวน์โหลด PDF</li>
        </ol>
        
        <div style={{ 
          marginTop: '10px', 
          padding: '8px', 
          backgroundColor: '#e2e3e5', 
          borderRadius: '4px',
          fontSize: '13px'
        }}>
          <strong>💡 หมายเหตุ:</strong> ข้อมูลอาคารและฐานรากจะแสดงตามที่ได้บันทึกไว้ในระบบ หากไม่พบข้อมูล กรุณาไปเพิ่มในหน้า "ถ่ายรูป QC" ก่อน
        </div>
      </div>
    </div>
  );
};

export default Reports;