// Filename: src/components/Reports.tsx (REPLACED - V8 - Adds Daily Report)

import React, { useState, useEffect } from 'react';
import { api, ProjectConfig } from '../utils/api';
// [เพิ่ม] 1. Import Date Picker
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface ReportsProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
}

const Reports: React.FC<ReportsProps> = ({ projectId, projectName, projectConfig }) => {
  const [qcTopics, setQcTopics] = useState<ProjectConfig>(projectConfig || {});
  
  // [เพิ่ม] 2. State สำหรับเลือกประเภท
  const [reportType, setReportType] = useState<'QC' | 'Daily'>('QC');
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const [formData, setFormData] = useState({
    mainCategory: '',
    subCategory: ''
  });
  
  const [dynamicFields, setDynamicFields] = useState<{ [key: string]: string }>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);

  useEffect(() => {
    if (projectConfig) {
      setQcTopics(projectConfig);
      const mainCategories = Object.keys(projectConfig);
      if (mainCategories.length > 0) {
        setFormData(prev => ({ ...prev, mainCategory: mainCategories[0] }));
      }
    }
  }, [projectConfig]);

  useEffect(() => {
    if (reportType === 'QC' && formData.mainCategory && qcTopics[formData.mainCategory]) {
      const subCategories = Object.keys(qcTopics[formData.mainCategory]);
      if (subCategories.length > 0) {
        setDynamicFields({});
        setFormData(prev => ({ ...prev, subCategory: subCategories[0] }));
      }
    }
  }, [formData.mainCategory, qcTopics, reportType]);

  const handleDynamicFieldChange = (fieldName: string, value: string) => {
    setDynamicFields(prev => ({ ...prev, [fieldName]: value }));
  };

  const isFieldsComplete = () => {
    if (reportType === 'QC') {
      return formData.mainCategory && formData.subCategory;
    }
    if (reportType === 'Daily') {
      return selectedDate;
    }
    return false;
  };

  // [แก้ไข] 3. อัปเดตฟังก์ชัน Generate Report
  const generateReport = async () => {
    if (!isFieldsComplete()) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    setIsGenerating(true);
    setGeneratedReport(null); // ล้างรายงานเก่า
    
    try {
      let reportData: any;
      
      if (reportType === 'QC') {
        reportData = {
          reportType: 'QC',
          projectId,
          projectName,
          mainCategory: formData.mainCategory,
          subCategory: formData.subCategory,
          dynamicFields
        };
      } else {
        // สำหรับ Daily Report
        reportData = {
          reportType: 'Daily',
          projectId,
          projectName,
          date: selectedDate!.toISOString().split('T')[0] // ส่งวันที่ในรูปแบบ YYYY-MM-DD
        };
      }
      
      const response = await api.generateReport(reportData);
      
      if (response.success && response.data) {
        setGeneratedReport(response.data);
        alert(`✅ สร้างรายงานสำเร็จ!\nไฟล์: ${response.data.filename}`);
      } else {
        throw new Error(response.error || 'Failed to generate report');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('เกิดข้อผิดพลาดในการสร้างรายงาน: ' + (error as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const mainCategories = Object.keys(qcTopics);
  
  const subCategories = formData.mainCategory && qcTopics[formData.mainCategory] 
    ? Object.keys(qcTopics[formData.mainCategory]) 
    : [];

  const topics = formData.mainCategory && formData.subCategory && qcTopics[formData.mainCategory]?.[formData.subCategory]
    ? qcTopics[formData.mainCategory][formData.subCategory].topics
    : [];
    
  const requiredDynamicFields = formData.mainCategory && formData.subCategory && qcTopics[formData.mainCategory]?.[formData.subCategory]
    ? qcTopics[formData.mainCategory][formData.subCategory].dynamicFields
    : [];

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>📋 สร้างรายงาน</h1>
      
      <div style={{ 
        marginBottom: '20px', 
        padding: '20px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        <h3 style={{ marginTop: 0, color: '#495057' }}>เลือกข้อมูลสำหรับสร้างรายงาน</h3>
        
        {/* [เพิ่ม] 4. ปุ่มเลือกประเภทรายงาน */}
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setReportType('QC')}
            style={{
              padding: '10px 15px',
              fontSize: '14px',
              fontWeight: reportType === 'QC' ? 'bold' : 'normal',
              border: '1px solid',
              borderColor: reportType === 'QC' ? '#007bff' : '#ced4da',
              backgroundColor: reportType === 'QC' ? '#007bff' : 'white',
              color: reportType === 'QC' ? 'white' : '#495057',
              borderRadius: '6px',
              cursor: 'pointer',
              flex: 1
            }}
          >
            📋 รายงาน QC (ตามหัวข้อ)
          </button>
          <button
            onClick={() => setReportType('Daily')}
            style={{
              padding: '10px 15px',
              fontSize: '14px',
              fontWeight: reportType === 'Daily' ? 'bold' : 'normal',
              border: '1px solid',
              borderColor: reportType === 'Daily' ? '#28a745' : '#ced4da',
              backgroundColor: reportType === 'Daily' ? '#28a745' : 'white',
              color: reportType === 'Daily' ? 'white' : '#495057',
              borderRadius: '6px',
              cursor: 'pointer',
              flex: 1
            }}
          >
            ☀️ รายงานประจำวัน (Daily)
          </button>
        </div>

        {/* [แก้ไข] 5. แสดงฟอร์มตามประเภทที่เลือก */}
        
        {/* --- ฟอร์ม QC (แบบเดิม) --- */}
        {reportType === 'QC' && (
          <div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '15px',
              marginBottom: '20px'
            }}>
              {/* Main Category */}
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  หมวดงานหลัก:
                </label>
                <select 
                  value={formData.mainCategory}
                  onChange={(e) => setFormData(prev => ({ subCategory: '', mainCategory: e.target.value }))}
                  style={{ 
                    width: '100%', 
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px'
                  }}
                >
                  {mainCategories.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sub Category */}
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  หมวดงานย่อย:
                </label>
                <select 
                  value={formData.subCategory}
                  onChange={(e) => {
                    setDynamicFields({});
                    setFormData(prev => ({ ...prev, subCategory: e.target.value }));
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px'
                  }}
                  disabled={subCategories.length === 0}
                >
                  {subCategories.map(subcategory => (
                    <option key={subcategory} value={subcategory}>
                      {subcategory}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic Fields */}
            {requiredDynamicFields.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginTop: 0, marginBottom: '10px', color: '#495057' }}>
                  ข้อมูลเพิ่มเติม (ไม่บังคับ):
                </h4>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                  gap: '10px'
                }}>
                  {requiredDynamicFields.map((fieldName: string) => (
                    <div key={fieldName}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
                        {fieldName}:
                      </label>
                      <input
                        type="text"
                        value={dynamicFields[fieldName] || ''}
                        onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
                        placeholder={`ระบุ${fieldName}...`}
                        style={{ 
                          width: '100%', 
                          padding: '8px 12px',
                          fontSize: '14px',
                          border: '1px solid #ced4da',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* --- [เพิ่ม] ฟอร์ม Daily --- */}
        {reportType === 'Daily' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              เลือกวันที่:
            </label>
        <DatePicker
          selected={selectedDate}
          onChange={(date: Date | null) => setSelectedDate(date)}
          dateFormat="dd/MM/yyyy"
          className="daily-datepicker" // <-- เหลือไว้แค่ className
        />
          </div>
        )}

        {/* Generate Button */}
        <div style={{ textAlign: 'center' }}>
          <button 
            onClick={generateReport}
            disabled={isGenerating || !isFieldsComplete()}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              backgroundColor: (isGenerating || !isFieldsComplete()) ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (isGenerating || !isFieldsComplete()) ? 'not-allowed' : 'pointer',
              opacity: (isGenerating || !isFieldsComplete()) ? 0.6 : 1,
              minWidth: '200px'
            }}
          >
            {isGenerating ? '🔄 กำลังสร้างรายงาน...' : '📋 สร้างรายงาน PDF'}
          </button>
        </div>
      </div>

      {/* --- Preview Topics (เฉพาะ QC) --- */}
      {reportType === 'QC' && topics.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
            <h4 style={{ color: '#495057', marginBottom: '15px', marginTop: 0 }}>📝 หัวข้อในรายงาน ({topics.length} หัวข้อ):</h4>
            <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '4px', border: '1px solid #dee2e6', maxHeight: '300px', overflowY: 'auto' }}>
            {topics.map((topic: string, index: number) => (
                <div key={index} style={{ padding: '8px 0', borderBottom: index < topics.length - 1 ? '1px solid #e9ecef' : 'none', fontSize: '14px' }}>
                <span style={{ color: '#495057' }}>{index + 1}. {topic}</span>
                </div>
            ))}
            </div>
        </div>
      )}
      
      {/* --- Generated Report Info --- */}
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
            {reportType === 'QC' ? (
              <>
                <p><strong>หมวดงาน:</strong> {formData.mainCategory} &gt; {formData.subCategory}</p>
                <p><strong>จำนวนหัวข้อ:</strong> {generatedReport.totalTopics}</p>
                <p><strong>รูปภาพที่พบ:</strong> {generatedReport.photosFound}/{generatedReport.totalTopics}</p>
              </>
            ) : (
              <>
                <p><strong>วันที่:</strong> {selectedDate ? selectedDate.toLocaleDateString('th-TH') : 'N/A'}</p>
                <p><strong>รูปภาพที่พบ:</strong> {generatedReport.photosFound}</p>
              </>
            )}
          </div>
          <div style={{ marginTop: '15px' }}>
            <a 
              href={generatedReport.publicUrl}
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
              href={generatedReport.publicUrl}
              download={generatedReport.filename}
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
    </div>
  );
};

export default Reports;