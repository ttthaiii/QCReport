// Filename: src/components/Reports.tsx (FINAL CORRECTED VERSION)

import React, { useState, useEffect } from 'react';
import { api, ProjectConfig } from '../utils/api';

interface ReportsProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
}

const Reports: React.FC<ReportsProps> = ({ projectId, projectName, projectConfig }) => {
  const [qcTopics, setQcTopics] = useState<ProjectConfig>(projectConfig || {});
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
    if (formData.mainCategory && qcTopics[formData.mainCategory]) {
      const subCategories = Object.keys(qcTopics[formData.mainCategory]);
      if (subCategories.length > 0) {
        // Also clear old dynamic field values when main category changes
        setDynamicFields({});
        setFormData(prev => ({ ...prev, subCategory: subCategories[0] }));
      }
    }
  }, [formData.mainCategory, qcTopics]);

  const handleDynamicFieldChange = (fieldName: string, value: string) => {
    setDynamicFields(prev => ({ ...prev, [fieldName]: value }));
  };

  const isFieldsComplete = () => {
    return formData.mainCategory && formData.subCategory;
  };

  const generateReport = async () => {
    if (!isFieldsComplete()) {
      alert('กรุณาเลือกหมวดงานให้ครบถ้วน');
      return;
    }
    setIsGenerating(true);
    try {
      const reportData = {
        projectId,
        projectName,
        mainCategory: formData.mainCategory,
        subCategory: formData.subCategory,
        dynamicFields
      };
      
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
    
  // ✅ HERE IS THE FIX (Part 1): Get the dynamicFields array
  const requiredDynamicFields = formData.mainCategory && formData.subCategory && qcTopics[formData.mainCategory]?.[formData.subCategory]
    ? qcTopics[formData.mainCategory][formData.subCategory].dynamicFields
    : [];

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>📋 สร้างรายงาน QC</h1>
      
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
                setDynamicFields({}); // Clear values on change
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

        {/* ✅ HERE IS THE FIX (Part 2): Dynamically render the fields */}
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
              {requiredDynamicFields.map((fieldName) => (
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

      {/* Topics Preview and Generated Report Info... (rest of the file is the same) */}
      {formData.mainCategory && formData.subCategory && topics.length > 0 && (
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
            <p><strong>หมวดงาน:</strong> {formData.mainCategory} &gt; {formData.subCategory}</p>
            <p><strong>จำนวนหัวข้อ:</strong> {generatedReport.totalTopics}</p>
            <p><strong>รูปภาพที่พบ:</strong> {generatedReport.photosFound}/{generatedReport.totalTopics}</p>
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