// Complete src/utils/api.js - รองรับโครงสร้างหมวดหลัก + หมวดงาน

// Simple fetch wrapper
async function apiCall(endpoint, options = {}) {
  const API_BASE = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5001/qcreport-54164/asia-southeast1/api'
    : 'https://asia-southeast1-qcreport-54164.cloudfunctions.net/api';
    
  const url = `${API_BASE}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`API Call failed: ${endpoint}`, error);
    throw error;
  }
}

// Upload photo with base64 (แก้ปัญหา multer)
async function uploadPhotoFile(photoBlob, photoData) {
  const API_BASE = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5001/qcreport-54164/asia-southeast1/api'
    : 'https://asia-southeast1-qcreport-54164.cloudfunctions.net/api';

  try {
    // Convert blob to base64
    const base64 = await blobToBase64(photoBlob);
    console.log('Converted to base64, length:', base64.length);

    const response = await fetch(`${API_BASE}/upload-photo-base64`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        photo: base64,
        building: photoData.building,
        foundation: photoData.foundation,
        mainCategory: photoData.mainCategory,     // 🔥 NEW
        subCategory: photoData.subCategory,       // 🔥 เปลี่ยนจาก category
        topic: photoData.topic,
        location: photoData.location || '',
        // 🔥 NEW: ส่ง dynamic fields ไปด้วย สำหรับ Full Match
        dynamicFields: photoData.dynamicFields || null
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload Error: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// Helper function to convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1]; // Remove data:image/jpeg;base64, prefix
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// API functions
export const api = {
  // 🔥 UPDATED: QC Topics (3-level structure: mainCategory > subCategory > topics)
  getQCTopics: () => apiCall('/qc-topics'),
  
  // 🔥 NEW: Main Categories APIs
  getMainCategories: () => apiCall('/main-categories'),
  getSubCategories: (mainCategory) => apiCall(`/sub-categories/${encodeURIComponent(mainCategory)}`),
  getTopicsForCategory: (mainCategory, subCategory) => 
    apiCall(`/topics/${encodeURIComponent(mainCategory)}/${encodeURIComponent(subCategory)}`),
  
  // 🔥 UPDATED: Dynamic Fields APIs (now with subCategory)
  getDynamicFields: async (subCategory) => {
    try {
      console.log(`API: Getting dynamic fields for sub category (หมวดงาน): ${subCategory}`);
      const result = await apiCall(`/dynamic-fields/${encodeURIComponent(subCategory)}`);
      console.log(`API: Dynamic fields result for ${subCategory}:`, result);
      return result;
    } catch (error) {
      console.error(`API: Error getting dynamic fields for ${subCategory}:`, error);
      
      // 🔥 Graceful fallback: return default structure for 3-level
      return {
        success: true,
        data: {
          useExisting: subCategory === 'ฐานราก',
          subCategory: subCategory,  // หมวดงาน
          fields: subCategory === 'ฐานราก' ? [
            { name: 'อาคาร', type: 'combobox', required: true, placeholder: 'เลือกหรือพิมพ์อาคาร เช่น A, B, C' },
            { name: 'ฐานรากเบอร์', type: 'combobox', required: true, placeholder: 'เลือกหรือพิมพ์เลขฐานราก เช่น F01, F02' }
          ] : [
            { name: 'อาคาร', type: 'combobox', required: true, placeholder: 'เลือกหรือพิมพ์อาคาร เช่น A, B, C' },
            { name: `${subCategory}เบอร์`, type: 'combobox', required: true, placeholder: `เลือกหรือพิมพ์เลข${subCategory}` }
          ]
        }
      };
    }
  },

  // 🔥 UPDATED: Validate dynamic fields (now with subCategory)
  validateDynamicFields: async (subCategory, dynamicFields) => {
    try {
      console.log(`API: Validating dynamic fields for sub category ${subCategory}:`, dynamicFields);
      const result = await apiCall('/validate-dynamic-fields', {
        method: 'POST',
        body: JSON.stringify({ subCategory, dynamicFields })
      });
      return result;
    } catch (error) {
      console.error('API: Error validating dynamic fields:', error);
      
      // Client-side fallback validation
      if (!dynamicFields || typeof dynamicFields !== 'object') {
        return { success: false, error: 'Dynamic fields is required' };
      }
      
      const fieldValues = Object.values(dynamicFields);
      if (!fieldValues[0] || !fieldValues[0].trim()) {
        return { success: false, error: 'กรุณากรอกอาคาร' };
      }
      
      if (!fieldValues[1] || !fieldValues[1].trim()) {
        const fieldNames = Object.keys(dynamicFields);
        const secondFieldName = fieldNames[1] || 'ข้อมูลที่ 2';
        return { success: false, error: `กรุณากรอก${secondFieldName}` };
      }
      
      return { success: true };
    }
  },

  // 🔥 Master Data Management
  getMasterData: () => apiCall('/master-data'),
  
  addMasterData: (building, foundation) => apiCall('/master-data', {
    method: 'POST',
    body: JSON.stringify({ building, foundation })
  }),

  // 🔥 UPDATED: Master Data with Dynamic Fields (now with subCategory)
  addMasterDataDynamic: async (subCategory, dynamicFields) => {
    try {
      console.log(`API: Adding master data for sub category ${subCategory}:`, dynamicFields);
      
      const result = await apiCall('/master-data-dynamic', {
        method: 'POST',
        body: JSON.stringify({ subCategory, dynamicFields })
      });
      
      return result;
    } catch (error) {
      console.error('API: Error adding dynamic master data:', error);
      
      // Fallback: convert to building+foundation and use legacy API
      try {
        const fieldValues = Object.values(dynamicFields);
        const building = fieldValues[0] || '';
        const foundation = fieldValues[1] || '';
        
        if (building && foundation) {
          console.log(`API: Fallback to legacy addMasterData: ${building}-${foundation}`);
          return await api.addMasterData(building, foundation);
        }
      } catch (fallbackError) {
        console.error('API: Fallback also failed:', fallbackError);
      }
      
      throw error;
    }
  },
  
  // 🔥 UPDATED: Progress Tracking (now with mainCategory + subCategory)
  getCompletedTopics: (criteria) => apiCall('/completed-topics', {
    method: 'POST',
    body: JSON.stringify(criteria)
  }),

  // 🔥 UPDATED: Progress with Dynamic Fields + Full Match (now with mainCategory + subCategory)
  getCompletedTopicsDynamic: async (mainCategory, subCategory, dynamicFields) => {
    try {
      console.log(`API: Getting completed topics with Full Match for ${mainCategory} > ${subCategory}:`, dynamicFields);
      
      const result = await apiCall('/completed-topics-dynamic', {
        method: 'POST',
        body: JSON.stringify({ mainCategory, subCategory, dynamicFields })
      });
      
      return result;
    } catch (error) {
      console.error('API: Error getting dynamic completed topics:', error);
      
      // Fallback: convert to building+foundation and use legacy API
      try {
        const fieldValues = Object.values(dynamicFields);
        const building = fieldValues[0] || '';
        const foundation = fieldValues[1] || '';
        
        if (building && foundation) {
          console.log(`API: Fallback to legacy for: ${mainCategory} > ${subCategory} (${building}-${foundation})`);
          return await api.getCompletedTopics({ building, foundation, mainCategory, subCategory });
        }
      } catch (fallbackError) {
        console.error('API: Fallback also failed:', fallbackError);
      }
      
      return { success: true, data: { completedTopics: [] } };
    }
  },

  // 🔥 UPDATED: Full Match completed topics (now with mainCategory + subCategory)
  getCompletedTopicsFullMatch: (criteria) => apiCall('/completed-topics-full-match', {
    method: 'POST',
    body: JSON.stringify(criteria)
  }),

  // 🔥 UPDATED: Get field values for datalist (now with subCategory)
  getFieldValues: async (fieldName, subCategory) => {
    try {
      console.log(`API: Getting field values for ${fieldName} in sub category ${subCategory}`);
      const result = await apiCall(`/field-values/${encodeURIComponent(fieldName)}/${encodeURIComponent(subCategory)}`);
      console.log(`API: Loaded ${result.data?.length || 0} values for ${fieldName}`);
      return result.data || [];
    } catch (error) {
      console.error(`API: Error getting field values for ${fieldName} in ${subCategory}:`, error);
      return [];
    }
  },
  
  // Upload photo to Drive + log to Sheets
  uploadPhoto: uploadPhotoFile,
  
  // 🔥 UPDATED: Generate PDF Report (now with mainCategory + subCategory + dynamic fields)
  generateReport: async (data) => {
    try {
      console.log('API: Generating report with 3-level structure:', {
        mainCategory: data.mainCategory,
        subCategory: data.subCategory,
        dynamicFields: data.dynamicFields ? Object.keys(data.dynamicFields).length : 0
      });
      
      const result = await apiCall('/generate-report', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      console.log('API: Report generated successfully:', result.success);
      return result;
    } catch (error) {
      console.error('API: Error generating report:', error);
      throw error;
    }
  },

  // 🔥 UPDATED: Generate Report with Dynamic Fields (Full Match) - now with mainCategory + subCategory
  generateReportDynamic: async (mainCategory, subCategory, dynamicFields) => {
    try {
      console.log(`API: Generating Full Match report for ${mainCategory} > ${subCategory}:`, dynamicFields);
      
      // Convert dynamic fields to legacy format for compatibility
      const fieldValues = Object.values(dynamicFields);
      const building = fieldValues[0] || '';
      const foundation = fieldValues[1] || '';
      
      const reportData = {
        mainCategory: mainCategory,      // หมวดหลัก (โครงสร้าง/สถาปัตย์)
        subCategory: subCategory,        // หมวดงาน (ฐานราก/เสา/ผนัง ฯลฯ)
        building: building,
        foundation: foundation,
        dynamicFields: dynamicFields // Include for PDF header + Full Match
      };
      
      return await api.generateReport(reportData);
    } catch (error) {
      console.error('API: Error generating dynamic report:', error);
      throw error;
    }
  },
  
  // Log photo (legacy)
  logPhoto: (data) => apiCall('/log-photo', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  // Log report
  logReport: (data) => apiCall('/log-report', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // 🔥 UPDATED: Utility Functions for Dynamic Fields

  // Convert dynamic fields to building+foundation format
  convertDynamicFieldsToMasterData: (subCategory, dynamicFields) => {
    if (!dynamicFields || typeof dynamicFields !== 'object') {
      return { building: '', foundation: '' };
    }
    
    if (subCategory === 'ฐานราก') {
      return {
        building: dynamicFields['อาคาร'] || '',
        foundation: dynamicFields['ฐานรากเบอร์'] || ''
      };
    }
    
    // สำหรับหมวดอื่น: field แรกเป็น building, field ที่ 2 เป็น foundation
    const fieldValues = Object.values(dynamicFields);
    return {
      building: fieldValues[0] || '',
      foundation: fieldValues[1] || ''
    };
  },

  // Convert building+foundation back to dynamic fields
  convertMasterDataToDynamicFields: (subCategory, building, foundation) => {
    if (subCategory === 'ฐานราก') {
      return {
        'อาคาร': building || '',
        'ฐานรากเบอร์': foundation || ''
      };
    }
    
    // สำหรับหมวดอื่น: ใช้ pattern เริ่มต้น
    return {
      'อาคาร': building || '',
      [`${subCategory}เบอร์`]: foundation || ''
    };
  },

  // Create description for logging/display
  createCombinationDescription: (subCategory, dynamicFields) => {
    if (!dynamicFields || typeof dynamicFields !== 'object') {
      return subCategory;
    }
    
    const values = Object.entries(dynamicFields)
      .filter(([key, value]) => value && value.trim())
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
      
    return values || subCategory;
  },

  // Check if field values are new (not in master data)
  isNewValue: (fieldName, value, masterData) => {
    if (!value || !value.trim()) return false;
    
    if (fieldName === 'อาคาร') {
      return !masterData.buildings?.includes(value.trim());
    }
    
    // สำหรับ field ที่ 2 (foundation equivalent)
    return !masterData.foundations?.includes(value.trim());
  },

  // Validate required fields completion
  isFieldsComplete: (subCategory, dynamicFields, categoryFields) => {
    if (!subCategory || !categoryFields || categoryFields.length === 0) return false;
    
    // ตรวจสอบ field ที่ required (อย่างน้อย 2 field แรก)
    const requiredFields = categoryFields.slice(0, 2);
    return requiredFields.every(field => {
      const value = dynamicFields[field.name];
      return value && value.trim();
    });
  },

  // 🔥 UPDATED: Load all field values for a sub category (Complete Datalist System)
  loadAllFieldValues: async (subCategory, categoryFields) => {
    try {
      console.log(`API: Loading all field values for sub category (หมวดงาน): ${subCategory}`);
      
      const fieldValues = {};
      
      // โหลด values สำหรับทุก field
      for (const field of categoryFields) {
        const values = await api.getFieldValues(field.name, subCategory);
        fieldValues[field.name] = values;
        console.log(`API: Field "${field.name}" in ${subCategory}: ${values.length} values`);
      }
      
      return fieldValues;
    } catch (error) {
      console.error('API: Error loading all field values:', error);
      return {};
    }
  },

  // 🔥 UPDATED: Get enhanced master data with field values
  getMasterDataWithFieldValues: async (subCategory, categoryFields) => {
    try {
      console.log(`API: Getting enhanced master data for sub category ${subCategory}`);
      
      // โหลด master data แบบเดิม
      const masterDataResponse = await api.getMasterData();
      
      // โหลด field values สำหรับ datalist
      const fieldValues = await api.loadAllFieldValues(subCategory, categoryFields);
      
      return {
        success: true,
        data: {
          ...masterDataResponse.data,
          fieldValues: fieldValues
        }
      };
    } catch (error) {
      console.error('API: Error getting enhanced master data:', error);
      
      // Fallback ไปใช้ master data เดิม
      return await api.getMasterData();
    }
  },

  // 🔥 NEW: Helper functions for working with new structure

  // Convert old topics structure to new structure
  convertLegacyTopicsToNewStructure: (legacyTopics, defaultMainCategory = 'โครงสร้าง') => {
    const newStructure = {};
    newStructure[defaultMainCategory] = legacyTopics;
    return newStructure;
  },

  // Get all topics for a main category (flattened)
  getAllTopicsForMainCategory: (topics, mainCategory) => {
    if (!topics[mainCategory]) return {};
    return topics[mainCategory];
  },

  // Get topic count for a main category
  getTopicCountForMainCategory: (topics, mainCategory) => {
    if (!topics[mainCategory]) return 0;
    
    let totalCount = 0;
    Object.values(topics[mainCategory]).forEach(subCategoryTopics => {
      totalCount += subCategoryTopics.length;
    });
    
    return totalCount;
  },

  // Get topic count for a sub category
  getTopicCountForSubCategory: (topics, mainCategory, subCategory) => {
    if (!topics[mainCategory] || !topics[mainCategory][subCategory]) return 0;
    return topics[mainCategory][subCategory].length;
  },

  // Check if main category exists
  hasMainCategory: (topics, mainCategory) => {
    return topics && topics[mainCategory] && Object.keys(topics[mainCategory]).length > 0;
  },

  // Check if sub category exists
  hasSubCategory: (topics, mainCategory, subCategory) => {
    return topics && topics[mainCategory] && topics[mainCategory][subCategory] && topics[mainCategory][subCategory].length > 0;
  },

  // Get breadcrumb for current selection
  getBreadcrumb: (mainCategory, subCategory, topic) => {
    const parts = [];
    if (mainCategory) parts.push(mainCategory);
    if (subCategory) parts.push(subCategory);
    if (topic) parts.push(topic);
    return parts.join(' > ');
  }
};