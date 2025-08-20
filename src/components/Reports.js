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
    mainCategory: '',
    subCategory: ''
  });
  
  // 🔥 NEW: Dynamic Fields States
  const [categoryFields, setCategoryFields] = useState([]);
  const [dynamicFields, setDynamicFields] = useState({});
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);

  // 🔥 NEW: Progress tracking for all categories
  const [fieldValues, setFieldValues] = useState({});
  const [currentCategoryProgress, setCurrentCategoryProgress] = useState({
    completed: 0,
    total: 0,
    percentage: 0,
    completedTopics: []
  });
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const [dataStatusMessage, setDataStatusMessage] = useState(null);

  useEffect(() => {
    loadQCTopics();
    loadMasterData();
  }, []);

  // 🔥 NEW: Load category fields when category changes
  useEffect(() => {
    if (formData.category) {
      loadCategoryFields(formData.category);
    } else {
      setCategoryFields([]);
      setDynamicFields({});
    }
  }, [formData.category]);

  // 🔥 Load progress when dynamic fields and category are ready
  useEffect(() => {
    if (formData.category && isFieldsComplete() && Object.keys(qcTopics).length > 0) {
      loadCurrentCategoryProgress();
    }
  }, [formData.category, dynamicFields, qcTopics]);

  useEffect(() => {
    if (formData.category && categoryFields.length > 0) {
      loadFieldValues(formData.category, categoryFields);
    }
  }, [formData.category, categoryFields]);

  // 🔥 NEW: Load dynamic fields for selected category
  const loadCategoryFields = async (category) => {
    setIsLoadingFields(true);
    try {
      console.log(`Loading fields for category: ${category}`);
      
      const response = await api.getDynamicFields(category);
      if (response.success) {
        setCategoryFields(response.data.fields || []);
        
        // Reset dynamic fields when category changes
        const newDynamicFields = {};
        response.data.fields.forEach(field => {
          newDynamicFields[field.name] = '';
        });
        setDynamicFields(newDynamicFields);
        
        console.log(`Loaded ${response.data.fields.length} fields for ${category}:`, 
                   response.data.fields.map(f => f.name));
      }
    } catch (error) {
      console.error('Error loading category fields:', error);
      // Fallback: create default fields
      setCategoryFields([
        { name: 'อาคาร', type: 'combobox', required: true, placeholder: 'เลือกหรือพิมพ์อาคาร' },
        { name: `${category}เบอร์`, type: 'combobox', required: true, placeholder: `เลือกหรือพิมพ์เลข${category}` }
      ]);
      setDynamicFields({ 'อาคาร': '', [`${category}เบอร์`]: '' });
      setFieldValues({});
    } finally {
      setIsLoadingFields(false);
    }
  };

  // 🔥 NEW: Handle dynamic field changes
  const handleDynamicFieldChange = (fieldName, value) => {
    setDynamicFields(prev => ({
      ...prev,
      [fieldName]: value
    }));
    
    // Clear status message เมื่อ user เปลี่ยน field
    setDataStatusMessage(null);
  };

  const loadFieldValues = async (category, fields) => {
    try {
      console.log(`📋 Loading field values for ${category}...`);
      const newFieldValues = {};
      
      for (const field of fields) {
        const values = await api.getFieldValues(field.name, category);
        newFieldValues[field.name] = values;
        console.log(`✅ Field "${field.name}": ${values.length} values loaded`);
      }
      
      setFieldValues(newFieldValues);
    } catch (error) {
      console.error('❌ Error loading field values:', error);
      setFieldValues({});
    }
  };

  // 🔥 NEW: Check if required fields are complete
  const isFieldsComplete = () => {
    if (!formData.category || categoryFields.length === 0) return false;
    
    // ✅ เช็คทุก field ที่ configured ไม่ใช่แค่ 2 field แรก
    return categoryFields.every(field => {
      const value = dynamicFields[field.name];
      return value && value.trim(); // ต้องมีค่าทุก field
    });
  };

  // 🔥 NEW: Get field options from master data
  const getFieldOptions = (fieldName) => {
    // 🔥 ใช้ field values ที่โหลดมาจาก Complete Datalist
    if (fieldValues[fieldName]) {
      return fieldValues[fieldName];
    }
    
    // Fallback: ใช้ master data เดิม (สำหรับ backward compatibility)
    if (fieldName === 'อาคาร') {
      return masterData.buildings || [];
    }
    
    if (categoryFields.length >= 2 && fieldName === categoryFields[1].name) {
      return masterData.foundations || [];
    }
    
    return [];
  };

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

  // 🔥 NEW: Load progress สำหรับหมวดปัจจุบันเท่านั้น
  const loadCurrentCategoryProgress = async () => {
    if (!formData.workType || !formData.category || !isFieldsComplete()) {
      setCurrentCategoryProgress({ completed: 0, total: 0, percentage: 0, completedTopics: [] });
      return;
    }

    setIsLoadingProgress(true);
    try {
      const response = await api.getCompletedTopicsFullMatch({
        building: dynamicFields['อาคาร'] || '',
        foundation: Object.values(dynamicFields)[1] || '',
        workType: formData.workType,        // เพิ่ม workType
        category: formData.category,
        dynamicFields: dynamicFields
      });
      
      if (response.success) {
        const completedTopics = new Set(response.data.completedTopics || []);
        const totalTopics = qcTopics[formData.workType]?.[formData.category] || [];
        const completed = totalTopics.filter(topic => completedTopics.has(topic)).length;
        const total = totalTopics.length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        setCurrentCategoryProgress({
          completed,
          total,
          percentage,
          completedTopics: Array.from(completedTopics)
        });
      }
    } catch (error) {
      console.error('Error loading progress:', error);
      setCurrentCategoryProgress({ completed: 0, total: 0, percentage: 0, completedTopics: [] });
    } finally {
      setIsLoadingProgress(false);
    }
  };

  const generateReport = async () => {
    if (!formData.workType || !formData.category || !isFieldsComplete()) {
      alert('กรุณาเลือกประเภทงาน หมวดงาน และกรอกข้อมูลให้ครบถ้วน');
      return;
    }

    setIsGenerating(true);
    
    try {
      const reportData = {
        workType: formData.workType,           // เพิ่ม workType
        category: formData.category,
        building: dynamicFields['อาคาร'] || '',
        foundation: Object.values(dynamicFields)[1] || '',
        dynamicFields: dynamicFields,
        useFullMatch: true
      };
      
      const response = await api.generateReport(reportData);
      
      if (response.success) {
        setGeneratedReport(response.data);
        
        const fieldsDisplay = Object.entries(dynamicFields)
          .filter(([key, value]) => value && value.trim())
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        
        alert(`สร้างรายงาน 3-level สำเร็จ!\nไฟล์: ${response.data.filename}\nข้อมูล: ${formData.workType} > ${formData.category}\n${fieldsDisplay}`);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('เกิดข้อผิดพลาดในการสร้างรายงาน: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 🔥 NEW: Render Dynamic Form Fields
  const renderDynamicForm = () => {
    return (
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
        gap: '15px',
        marginBottom: '20px'
      }}>
        {/* Category Select */}
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
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>            
        </div>

        {/* Dynamic Fields */}
        {categoryFields.map((field, index) => (
          <div key={field.name}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              {field.name}:
            </label>
            <input
              list={`reports-${field.name}-list`}
              value={dynamicFields[field.name] || ''}
              onChange={(e) => handleDynamicFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              style={{ 
                width: '100%', 
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                backgroundColor: isLoadingMasterData ? '#f5f5f5' : 'white'
              }}
              disabled={isLoadingMasterData || isLoadingFields}
            />
            <datalist id={`reports-${field.name}-list`}>
              {getFieldOptions(field.name).map(option => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
        ))}
      </div>
    );
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
        
        {/* 🔥 NEW: Dynamic Form */}
        {renderDynamicForm()}

        {/* 🔥 Loading Fields */}
        {isLoadingFields && (
          <div style={{ 
            marginBottom: '15px', 
            textAlign: 'center', 
            fontSize: '14px', 
            color: '#666',
            padding: '10px',
            backgroundColor: '#e9ecef',
            borderRadius: '4px'
          }}>
            กำลังโหลด fields สำหรับ {formData.category}...
          </div>
        )}

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
        {/*{!isLoadingMasterData && masterData.buildings.length > 0 && (
          <div style={{ 
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#e3f2fd',
            borderRadius: '4px',
            fontSize: '14px',
            color: '#1565c0'
          }}>
            📊 ข้อมูลในระบบ: {masterData.buildings.length} อาคาร, {masterData.foundations.length} รายการ, {masterData.combinations.length} รายการรวม
          </div>
        )}*/}

        {/* Validation Warning */}
        {(!formData.category || !isFieldsComplete()) && (
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
            ⚠️ กรุณาเลือกหมวดงานและกรอกข้อมูลให้ครบถ้วน
          </div>
        )}

        {/* Generate Button */}
        <div style={{ textAlign: 'center' }}>
          <button 
            onClick={generateReport}
            disabled={isGenerating || !formData.category || !isFieldsComplete() || currentCategoryProgress.completed === 0}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              backgroundColor: (isGenerating || !formData.category || !isFieldsComplete() || currentCategoryProgress.completed === 0) ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (isGenerating || !formData.category || !isFieldsComplete() || currentCategoryProgress.completed === 0) ? 'not-allowed' : 'pointer',
              opacity: (isGenerating || !formData.category || !isFieldsComplete() || currentCategoryProgress.completed === 0) ? 0.6 : 1,
              minWidth: '200px'
            }}
          >
            {isGenerating ? '🔄 กำลังสร้างรายงาน...' : 
            currentCategoryProgress.completed === 0 && currentCategoryProgress.total > 0 ? '📋 ไม่มีข้อมูลสำหรับสร้างรายงาน' :
            '📋 สร้างรายงาน PDF'}
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

          {/* 🔥 NEW: Data Status Message */}
          {dataStatusMessage && (
            <div style={{ 
              marginBottom: '15px',
              padding: '12px',
              backgroundColor: '#fff3cd',
              borderRadius: '6px',
              border: '1px solid #ffeaa7',
              fontSize: '14px',
              color: '#856404',
              textAlign: 'center'
            }}>
              <span style={{ marginRight: '8px' }}>⚠️</span>
              {dataStatusMessage}
              <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                💡 ลองตรวจสอบข้อมูลที่กรอก หรือถ่ายรูปสำหรับข้อมูลชุดนี้
              </div>
            </div>
          )}

          {currentCategoryProgress.total > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '5px'
              }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1565c0' }}>
                ความครบถ้วน: {currentCategoryProgress.completed}/{currentCategoryProgress.total} ({currentCategoryProgress.percentage}%)
                {isLoadingProgress && <span style={{ marginLeft: '8px', fontSize: '12px' }}>กำลังโหลด...</span>}
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
                  width: `${currentCategoryProgress.percentage}%`,
                  backgroundColor: currentCategoryProgress.percentage === 100 ? '#4caf50' : '#2196f3',
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
              const isCompleted = currentCategoryProgress.completedTopics.includes(topic);
              
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
            
            {/* 🔥 NEW: แสดง dynamic fields */}
            {Object.keys(dynamicFields).length > 0 && (
              <p><strong>ข้อมูล:</strong> {
                Object.entries(dynamicFields)
                  .filter(([key, value]) => value && value.trim())
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(', ')
              }</p>
            )}
            
            <p><strong>หมวดงาน:</strong> {formData.category}</p>
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
    </div>
  );
};

export default Reports;