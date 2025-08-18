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

  // 🔥 NEW: Progress tracking for all categories
  const [categoryProgress, setCategoryProgress] = useState({});
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);

  useEffect(() => {
    loadQCTopics();
    loadMasterData();
  }, []);

  // 🔥 Load progress when building/foundation changes
  useEffect(() => {
    if (formData.building && formData.foundation && Object.keys(qcTopics).length > 0) {
      loadAllCategoryProgress();
    }
  }, [formData.building, formData.foundation, qcTopics]);

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
          }));
          console.log('Default building set:', response.data.buildings[0]);
        }
        if (response.data.foundations.length > 0) {
          setFormData(prev => ({
            ...prev,
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
          }));
        }
      }
    } catch (error) {
      console.error('Error loading QC topics:', error);
      alert('ไม่สามารถโหลดหัวข้อการตรวจ QC ได้');
    }
  };

  // 🔥 NEW: Load progress for all categories
  const loadAllCategoryProgress = async () => {
    if (!formData.building || !formData.foundation || Object.keys(qcTopics).length === 0) return;
    
    setIsLoadingProgress(true);
    setCategoryProgress({});
    
    try {
      console.log(`Loading progress for all categories: ${formData.building}-${formData.foundation}`);
      
      const progressPromises = Object.keys(qcTopics).map(async (category) => {
        try {
          const response = await api.getCompletedTopics({
            building: formData.building,
            foundation: formData.foundation,
            category: category
          });
          
          const completedTopics = response.success ? new Set(response.data.completedTopics || []) : new Set();
          const totalTopics = qcTopics[category] || [];
          const completed = totalTopics.filter(topic => completedTopics.has(topic)).length;
          const total = totalTopics.length;
          const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
          
          return {
            category,
            completed,
            total,
            percentage,
            completedTopics: Array.from(completedTopics),
            remainingTopics: totalTopics.filter(topic => !completedTopics.has(topic))
          };
        } catch (error) {
          console.error(`Error loading progress for ${category}:`, error);
          return {
            category,
            completed: 0,
            total: qcTopics[category]?.length || 0,
            percentage: 0,
            completedTopics: [],
            remainingTopics: qcTopics[category] || []
          };
        }
      });
      
      const results = await Promise.all(progressPromises);
      
      const progressMap = {};
      results.forEach(result => {
        progressMap[result.category] = result;
      });
      
      setCategoryProgress(progressMap);
      console.log('Category progress loaded:', progressMap);
      
    } catch (error) {
      console.error('Error loading category progress:', error);
    } finally {
      setIsLoadingProgress(false);
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

  // 🔥 Helper function to get progress summary
  const getOverallProgress = () => {
    const categories = Object.keys(categoryProgress);
    if (categories.length === 0) return { completed: 0, total: 0, percentage: 0 };
    
    const totalCompleted = categories.reduce((sum, cat) => sum + categoryProgress[cat].completed, 0);
    const totalTopics = categories.reduce((sum, cat) => sum + categoryProgress[cat].total, 0);
    const percentage = totalTopics > 0 ? Math.round((totalCompleted / totalTopics) * 100) : 0;
    
    return { completed: totalCompleted, total: totalTopics, percentage };
  };

  const overallProgress = getOverallProgress();

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
              {Object.keys(qcTopics).map(category => {
                const progress = categoryProgress[category];
                const progressText = progress ? ` (${progress.completed}/${progress.total})` : '';
                return (
                  <option key={category} value={category}>
                    {category}{progressText}
                  </option>
                );
              })}
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
            {isLoadingProgress && (
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                กำลังโหลดสถานะ...
              </div>
            )}            
          </div>
        </div>

        {/* 🔥 Overall Progress Summary */}
        {/*formData.building && formData.foundation && Object.keys(categoryProgress).length > 0 && (
          <div style={{ 
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#e3f2fd',
            borderRadius: '6px',
            border: '1px solid #1976d2'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '10px'
            }}>
              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#1565c0' }}>
                📊 สถานะรวม: {overallProgress.completed}/{overallProgress.total} หัวข้อ ({overallProgress.percentage}%)
              </span>
              <button
                onClick={loadAllCategoryProgress}
                disabled={isLoadingProgress}
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  backgroundColor: '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  opacity: isLoadingProgress ? 0.6 : 1
                }}
              >
                🔄 อัปเดต
              </button>
            </div>
            <div style={{ 
              height: '8px',
              backgroundColor: '#bbdefb',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${overallProgress.percentage}%`,
                backgroundColor: overallProgress.percentage === 100 ? '#4caf50' : '#2196f3',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {/* Loading Master Data */}
        {/*isLoadingMasterData && (
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
        {/*!isLoadingMasterData && masterData.buildings.length > 0 && (
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
      </div>

      {/* Topics Preview for Selected Category */}
      {formData.category && qcTopics[formData.category] && (
        <div style={{ 
          marginBottom: '20px',
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h4 style={{ color: '#495057', marginBottom: '15px', marginTop: 0 }}>
            📝 หัวข้อในหมวด "{formData.category}":
          </h4>
          
          {categoryProgress[formData.category] && (
            <div style={{ marginBottom: '15px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '5px'
              }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1565c0' }}>
                  ความครบถ้วน: {categoryProgress[formData.category].completed}/{categoryProgress[formData.category].total} ({categoryProgress[formData.category].percentage}%)
                </span>
              </div>
              <div style={{ 
                height: '6px',
                backgroundColor: '#bbdefb',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${categoryProgress[formData.category].percentage}%`,
                  backgroundColor: categoryProgress[formData.category].percentage === 100 ? '#4caf50' : '#2196f3',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}
          
          <div style={{ 
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '4px',
            border: '1px solid #dee2e6',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {qcTopics[formData.category].map((topic, index) => {
              const isCompleted = categoryProgress[formData.category]?.completedTopics.includes(topic);
              
              return (
                <div key={index} style={{ 
                  padding: '5px 0',
                  borderBottom: index < qcTopics[formData.category].length - 1 ? '1px solid #e9ecef' : 'none',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ 
                    color: isCompleted ? '#28a745' : '#6c757d',
                    fontSize: '12px',
                    minWidth: '16px'
                  }}>
                    {isCompleted ? '✅' : '⏳'}
                  </span>
                  <span style={{ 
                    color: isCompleted ? '#28a745' : '#495057',
                    fontWeight: isCompleted ? '500' : 'normal'
                  }}>
                    {index + 1}. {topic}
                  </span>
                </div>
              );
            })}
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
      {/*<div style={{ 
        marginTop: '30px',
        padding: '15px',
        backgroundColor: '#fff3cd',
        borderRadius: '6px',
        border: '1px solid #ffeaa7'
      }}>
        <h4 style={{ marginTop: 0, color: '#856404' }}>📝 วิธีการใช้งาน</h4>
        <ol style={{ color: '#856404', fontSize: '14px', lineHeight: '1.6', marginBottom: '10px' }}>
          <li>เลือก <strong>อาคาร</strong> และ <strong>ฐานราก</strong> → ระบบจะแสดงสถานะทุกหมวดงาน</li>
          <li>ดูสถานะความครบถ้วน: <strong>✅ ถ่ายครบ</strong> | <strong>🔄 ถ่ายบางส่วน</strong> | <strong>⚠️ ยังไม่ถ่าย</strong></li>
          <li>เลือก <strong>หมวดงาน</strong> ที่ต้องการสร้างรายงาน</li>
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
          <strong>💡 เคล็ดลับ:</strong> 
          <br />• <strong>สถานะรวม</strong> แสดงความครบถ้วนของทุกหมวดงานรวมกัน
          <br />• <strong>สถานะแต่ละหมวด</strong> แสดงรายละเอียดว่าหมวดไหนถ่ายครบ เหลือหัวข้อไหนบ้าง
          <br />• กด <strong>"🔄 อัปเดต"</strong> เพื่อโหลดสถานะล่าสุด
          <br />• ข้อมูลจะอัปเดตอัตโนมัติเมื่อเปลี่ยนอาคารหรือฐานราก
        </div>
      </div>*/}
    </div>
  );
};

export default Reports;