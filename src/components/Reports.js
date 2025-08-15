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
  
  // 🔥 NEW: Dynamic Categories State
  const [categories, setCategories] = useState([]);
  const [categoryConfigs, setCategoryConfigs] = useState({});
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  
  const [formData, setFormData] = useState({
    building: '',
    foundation: '',
    category: ''
  });
  
  // 🔥 NEW: Dynamic Fields State
  const [dynamicFields, setDynamicFields] = useState({});
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);

  // 🔥 NEW: Progress tracking for all categories
  const [categoryProgress, setCategoryProgress] = useState({});
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);

  useEffect(() => {
    loadQCTopics();
    loadCategories(); // 🔥 NEW
  }, []);

  // 🔥 Load master data when category changes
  useEffect(() => {
    if (formData.category) {
      loadMasterDataForCategory(formData.category);
    }
  }, [formData.category]);

  // 🔥 Load category config when category changes
  useEffect(() => {
    if (formData.category) {
      loadCategoryConfig(formData.category);
    }
  }, [formData.category]);

  // 🔥 Load progress when form data changes
  useEffect(() => {
    if (formData.category && isFormValid() && Object.keys(qcTopics).length > 0) {
      loadAllCategoryProgress();
    }
  }, [formData.category, dynamicFields, qcTopics]);

  // 🔥 NEW: Load categories and configs
  const loadCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const response = await api.getCategories();
      if (response.success) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const loadCategoryConfig = async (category) => {
    if (categoryConfigs[category]) return; // Already loaded
    
    try {
      const response = await api.getCategoryConfig(category);
      if (response.success) {
        setCategoryConfigs(prev => ({
          ...prev,
          [category]: response.data
        }));
        
        // Initialize dynamic fields for this category
        if (!response.data.useExisting) {
          const initialFields = {};
          response.data.fields.forEach(field => {
            initialFields[field.name] = '';
          });
          setDynamicFields(initialFields);
        } else {
          // Reset dynamic fields for legacy categories
          setDynamicFields({});
        }
      }
    } catch (error) {
      console.error(`Error loading config for ${category}:`, error);
    }
  };

  // 🔥 NEW: Check if current category is dynamic
  const isDynamicCategory = () => {
    const config = categoryConfigs[formData.category];
    return config && !config.useExisting;
  };

  // 🔥 NEW: Check if form is valid
  const isFormValid = () => {
    if (!formData.category) return false;
    
    if (isDynamicCategory()) {
      const config = categoryConfigs[formData.category];
      if (!config) return false;
      
      // Check if all required dynamic fields are filled
      return config.fields.every(field => {
        const value = dynamicFields[field.name];
        return !field.required || (value && value.trim());
      });
    } else {
      // Legacy validation (ฐานราก)
      return formData.building && formData.foundation;
    }
  };

  // 🔥 NEW: Get current data for reports
  const getCurrentData = () => {
    if (isDynamicCategory()) {
      return {
        category: formData.category,
        dynamicFields: { ...dynamicFields },
        // For compatibility with legacy systems
        building: Object.values(dynamicFields)[0] || '',
        foundation: Object.values(dynamicFields)[1] || ''
      };
    } else {
      return {
        category: formData.category,
        building: formData.building,
        foundation: formData.foundation
      };
    }
  };

  // 🔥 NEW: Get options for dynamic field (similar to Camera.js)
  const getOptionsForField = (fieldName, category) => {
    // ถ้าเป็น category ฐานราก ใช้ masterData เดิม
    if (category === 'ฐานราก') {
      if (fieldName === 'อาคาร') return masterData.buildings || [];
      if (fieldName === 'ฐานราก') return masterData.foundations || [];
    }
    
    // สำหรับ dynamic categories ใช้ข้อมูลที่โหลดมาจาก Dynamic_Master_Data
    if (masterData.uniqueValues && masterData.uniqueValues[fieldName]) {
      return masterData.uniqueValues[fieldName];
    }
    
    // ถ้าไม่มีข้อมูล ให้ array ว่าง (user สามารถพิมพ์ใหม่ได้)
    return [];
  };

  // 🔥 NEW: Load master data by category (similar to Camera.js)
  const loadMasterDataForCategory = async (category) => {
    if (!category) return;
    
    setIsLoadingMasterData(true);
    try {
      const response = await api.getMasterDataByCategory(category);
      if (response.success) {
        if (category === 'ฐานราก') {
          // Legacy format - ใช้ตรงๆ
          setMasterData(response.data);
        } else {
          // Dynamic format - เก็บทั้ง legacy format และ dynamic structure
          const dynamicMasterData = {
            // Legacy compatibility
            buildings: response.data.uniqueValues ? 
              (response.data.uniqueValues[Object.keys(response.data.uniqueValues)[0]] || []) : [],
            foundations: response.data.uniqueValues ? 
              (response.data.uniqueValues[Object.keys(response.data.uniqueValues)[1]] || []) : [],
            combinations: response.data.combinations || [],
            // 🔥 NEW: Dynamic structure
            uniqueValues: response.data.uniqueValues || {},
            fields: response.data.fields || [],
            category: response.data.category
          };
          
          setMasterData(dynamicMasterData);
        }
      }
    } catch (error) {
      console.error(`Error loading master data for ${category}:`, error);
      // Set empty data structure
      setMasterData({
        buildings: [],
        foundations: [],
        combinations: [],
        uniqueValues: {},
        fields: [],
        category: category
      });
    } finally {
      setIsLoadingMasterData(false);
    }
  };

  const loadQCTopics = async () => {
    try {
      const response = await api.getQCTopics();
      if (response.success) {
        setQcTopics(response.data);
      }
    } catch (error) {
      console.error('Error loading QC topics:', error);
      alert('ไม่สามารถโหลดหัวข้อการตรวจ QC ได้');
    }
  };

  // 🔥 UPDATED: Load progress for all categories with dynamic support
  const loadAllCategoryProgress = async () => {
    const currentData = getCurrentData();
    
    if (!currentData.building || !currentData.foundation || Object.keys(qcTopics).length === 0) return;
    
    setIsLoadingProgress(true);
    setCategoryProgress({});
    
    try {
      console.log(`Loading progress for all categories: ${currentData.building}-${currentData.foundation}`);
      
      const progressPromises = Object.keys(qcTopics).map(async (category) => {
        try {
          const response = await api.getCompletedTopics({
            building: currentData.building,
            foundation: currentData.foundation,
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

  // 🔥 UPDATED: Generate report with dynamic fields support
  const generateReport = async () => {
    if (!isFormValid()) {
      alert('กรุณาเลือกข้อมูลให้ครบถ้วน');
      return;
    }

    setIsGenerating(true);
    
    try {
      const currentData = getCurrentData();
      console.log('Generating report with data:', currentData);
      
      const response = await api.generateReport(currentData);
      
      if (response.success) {
        setGeneratedReport(response.data);
        
        // Enhanced success message
        const combination = response.data.combination || `${currentData.building}-${currentData.foundation}`;
        alert(`สร้างรายงานสำเร็จ!\nไฟล์: ${response.data.filename}\nข้อมูล: ${combination}\nจำนวนรูป: ${response.data.photoCount} รูป`);
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

  // 🔥 NEW: Render form based on category type
  const renderForm = () => {
    if (!formData.category) {
      return null; // Will show category selector first
    }

    const config = categoryConfigs[formData.category];
    if (!config && !isLoadingCategories) {
      return (
        <div style={{
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: '#f8d7da',
          borderRadius: '5px',
          textAlign: 'center',
          fontSize: '14px',
          color: '#721c24',
          border: '1px solid #f5c6cb'
        }}>
          ❌ ไม่พบการตั้งค่าสำหรับหมวดงาน "{formData.category}"
        </div>
      );
    }

    if (config && config.useExisting) {
      // 🔥 LEGACY FORM: ฐานราก (NO CHANGES)
      return renderLegacyForm();
    } else if (config) {
      // 🔥 DYNAMIC FORM: เสา, คาน, etc.
      return renderDynamicForm(config);
    }

    return (
      <div style={{
        marginBottom: '15px',
        padding: '10px',
        backgroundColor: '#e2e3e5',
        borderRadius: '5px',
        textAlign: 'center',
        fontSize: '14px',
        color: '#495057'
      }}>
        กำลังโหลดการตั้งค่า...
      </div>
    );
  };

  // 🔥 LEGACY FORM: ฐานราก (เหมือนเดิม 100%)
  const renderLegacyForm = () => {
    return (
      <>
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
      </>
    );
  };

  // 🔥 DYNAMIC FORM: เสา, คาน, etc. (ใช้ Combobox เหมือน Legacy)
  const renderDynamicForm = (config) => {
    return (
      <>
        {config.fields.map((field, index) => (
          <div key={field.name}>
            <select 
              value={dynamicFields[field.name] || ''}
              onChange={(e) => setDynamicFields(prev => ({
                ...prev,
                [field.name]: e.target.value
              }))}
            >
              <option value="">เลือก{field.name}...</option>
              {getOptionsForField(field.name, config.category).map(option =>
                <option key={option} value={option}>{option}</option>
              )}
            </select>
          </div>
        ))}
      </>
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
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: '15px',
          marginBottom: '20px'
        }}>
          {/* Category Selection - Always first */}
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              หมวดงาน:
            </label>
            <select 
              value={formData.category}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, category: e.target.value }));
                setDynamicFields({}); // Reset dynamic fields
              }}
              style={{ 
                width: '100%', 
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}
              disabled={isLoadingCategories}
            >
              <option value="">เลือกหมวดงาน...</option>
              {categories.map(category => {
                const progress = categoryProgress[category];
                const progressText = progress ? ` (${progress.completed}/${progress.total})` : '';
                return (
                  <option key={category} value={category}>
                    {category}{progressText}
                  </option>
                );
              })}
            </select>
            {isLoadingCategories && (
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                กำลังโหลดหมวดงาน...
              </div>
            )}
          </div>

          {/* 🔥 HYBRID FORM: Conditional rendering */}
          {renderForm()}
        </div>

        {/* 🔥 Category Type Status */}
        {formData.category && categoryConfigs[formData.category] && (
          <div style={{ 
            marginBottom: '20px',
            padding: '10px',
            backgroundColor: categoryConfigs[formData.category].useExisting ? '#d4edda' : '#d1ecf1',
            borderRadius: '5px',
            border: `1px solid ${categoryConfigs[formData.category].useExisting ? '#c3e6cb' : '#bee5eb'}`,
            fontSize: '14px',
            color: categoryConfigs[formData.category].useExisting ? '#155724' : '#0c5460'
          }}>
            <span style={{ marginRight: '8px' }}>
              {categoryConfigs[formData.category].useExisting ? '✅' : '✨'}
            </span>
            {categoryConfigs[formData.category].useExisting ? 
              `ใช้ระบบเดิมสำหรับหมวดงาน "${formData.category}"` :
              `ใช้ระบบใหม่สำหรับหมวดงาน "${formData.category}" (${categoryConfigs[formData.category].fields?.length || 0} ฟิลด์)`
            }
          </div>
        )}

        {/* 🔥 Overall Progress Summary */}
        {isFormValid() && Object.keys(categoryProgress).length > 0 && (
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
        {!isLoadingMasterData && masterData.buildings.length > 0 && !isDynamicCategory() && (
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
        {!isFormValid() && (
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
            ⚠️ กรุณากรอกข้อมูลให้ครบถ้วน
          </div>
        )}

        {/* Generate Button */}
        <div style={{ textAlign: 'center' }}>
          <button 
            onClick={generateReport}
            disabled={isGenerating || !isFormValid()}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              backgroundColor: (isGenerating || !isFormValid()) ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (isGenerating || !isFormValid()) ? 'not-allowed' : 'pointer',
              opacity: (isGenerating || !isFormValid()) ? 0.6 : 1,
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
            {generatedReport.combination ? (
              <p><strong>ข้อมูล:</strong> {generatedReport.combination}</p>
            ) : (
              <p><strong>อาคาร-ฐานราก:</strong> {getCurrentData().building}-{getCurrentData().foundation}</p>
            )}
            <p><strong>หมวดงาน:</strong> {formData.category}</p>
            <p><strong>จำนวนรูป:</strong> {generatedReport.photoCount} รูป</p>
            <p><strong>เวลาที่สร้าง:</strong> {generatedReport.sheetTimestamp?.timestamp}</p>
            {generatedReport.generatedWith && (
              <p><strong>เครื่องมือ:</strong> {generatedReport.generatedWith}</p>
            )}
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
      {!isLoadingMasterData && masterData.buildings.length === 0 && !isDynamicCategory() && (
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
            onClick={() => loadMasterDataForCategory(formData.category)}  // ✅ ใช้ฟังก์ชันที่มีอยู่
            disabled={!formData.category}  // ✅ เพิ่ม disabled เมื่อไม่มี category
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: !formData.category ? 'not-allowed' : 'pointer',
              opacity: !formData.category ? 0.6 : 1
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
        <h4 style={{ marginTop: 0, color: '#856404' }}>📝 วิธีการใช้งาน (รองรับ Dynamic Categories)</h4>
        <ol style={{ color: '#856404', fontSize: '14px', lineHeight: '1.6', marginBottom: '10px' }}>
          <li>เลือก <strong>หมวดงาน</strong> → ระบบจะแสดงฟอร์มที่เหมาะสม</li>
          <li><strong>ฐานราก:</strong> เลือกอาคารและฐานราก (ระบบเดิม)</li>
          <li><strong>เสา/คาน:</strong> กรอกข้อมูลตามฟิลด์ที่กำหนด (ระบบใหม่)</li>
          <li>ดูสถานะความครบถ้วน: <strong>✅ ถ่ายครบ</strong> | <strong>🔄 ถ่ายบางส่วน</strong> | <strong>⚠️ ยังไม่ถ่าย</strong></li>
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
          <strong>🔥 ใหม่! Dynamic Categories:</strong> 
          <br />• <strong>Backward Compatible</strong> - ฐานรากใช้งานเหมือนเดิม 100%
          <br />• <strong>Dynamic Fields</strong> - เสา, คาน ใช้ฟิลด์ตามการตั้งค่า
          <br />• <strong>Auto Configuration</strong> - อ่านค่าจาก Google Sheets อัตโนมัติ
          <br />• <strong>Smart Progress</strong> - แสดงสถานะแยกตามหมวดงาน
          <br />• <strong>Enhanced PDF</strong> - รายงานรองรับข้อมูลแบบใหม่
        </div>
      </div>
    </div>
  );
};

export default Reports;