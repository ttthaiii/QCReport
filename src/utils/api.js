// แทนที่ไฟล์ src/utils/api.js ทั้งหมด

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
        category: photoData.category,
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
  // Get QC topics
  getQCTopics: () => apiCall('/qc-topics'),
  
  // 🔥 NEW: Dynamic Fields APIs
  getDynamicFields: async (category) => {
    try {
      console.log(`API: Getting dynamic fields for category: ${category}`);
      const result = await apiCall(`/dynamic-fields/${encodeURIComponent(category)}`);
      console.log(`API: Dynamic fields result:`, result);
      return result;
    } catch (error) {
      console.error(`API: Error getting dynamic fields for ${category}:`, error);
      
      // 🔥 Graceful fallback: return default structure
      return {
        success: true,
        data: {
          useExisting: category === 'ฐานราก',
          category: category,
          fields: category === 'ฐานราก' ? [
            { name: 'อาคาร', type: 'combobox', required: true, placeholder: 'เลือกหรือพิมพ์อาคาร เช่น A, B, C' },
            { name: 'ฐานรากเบอร์', type: 'combobox', required: true, placeholder: 'เลือกหรือพิมพ์เลขฐานราก เช่น F01, F02' }
          ] : [
            { name: 'อาคาร', type: 'combobox', required: true, placeholder: 'เลือกหรือพิมพ์อาคาร เช่น A, B, C' },
            { name: `${category}เบอร์`, type: 'combobox', required: true, placeholder: `เลือกหรือพิมพ์เลข${category}` }
          ]
        }
      };
    }
  },

  // 🔥 NEW: Get field values for datalist (Complete Datalist System)
  getFieldValues: async (fieldName, category) => {
    try {
      console.log(`API: Getting field values for ${fieldName} in ${category}`);
      const result = await apiCall(`/field-values/${encodeURIComponent(fieldName)}/${encodeURIComponent(category)}`);
      console.log(`API: Found ${result.data?.length || 0} values for ${fieldName}`);
      return result.data || [];
    } catch (error) {
      console.error(`API: Error getting field values for ${fieldName}:`, error);
      return [];
    }
  },

  // 🔥 NEW: Validate dynamic fields
  validateDynamicFields: async (category, dynamicFields) => {
    try {
      console.log(`API: Validating dynamic fields for ${category}:`, dynamicFields);
      const result = await apiCall('/validate-dynamic-fields', {
        method: 'POST',
        body: JSON.stringify({ category, dynamicFields })
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

  // 🔥 NEW: Master Data with Dynamic Fields
  addMasterDataDynamic: async (category, dynamicFields) => {
    try {
      console.log(`API: Adding master data for ${category}:`, dynamicFields);
      
      const result = await apiCall('/master-data-dynamic', {
        method: 'POST',
        body: JSON.stringify({ category, dynamicFields })
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
  
  // 🔥 Progress Tracking
  getCompletedTopics: (criteria) => apiCall('/completed-topics', {
    method: 'POST',
    body: JSON.stringify(criteria)
  }),

  // 🔥 NEW: Progress with Dynamic Fields + Full Match
  getCompletedTopicsDynamic: async (category, dynamicFields) => {
    try {
      console.log(`API: Getting completed topics with Full Match for ${category}:`, dynamicFields);
      
      const result = await apiCall('/completed-topics-dynamic', {
        method: 'POST',
        body: JSON.stringify({ category, dynamicFields })
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
          console.log(`API: Fallback to legacy getCompletedTopics: ${building}-${foundation}-${category}`);
          return await api.getCompletedTopics({ building, foundation, category });
        }
      } catch (fallbackError) {
        console.error('API: Fallback also failed:', fallbackError);
      }
      
      return { success: true, data: { completedTopics: [] } };
    }
  },
  
  // Upload photo to Drive + log to Sheets
  uploadPhoto: uploadPhotoFile,
  
  // 🔥 Generate PDF Report (Updated to support Full Match + dynamic fields)
  generateReport: async (data) => {
    try {
      console.log('API: Generating report with Full Match support:', data);
      
      const result = await apiCall('/generate-report', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      console.log('API: Generate report result:', result);
      return result;
    } catch (error) {
      console.error('API: Error generating report:', error);
      throw error;
    }
  },

  // 🔥 NEW: Generate Report with Dynamic Fields (Full Match)
  generateReportDynamic: async (category, dynamicFields) => {
    try {
      console.log(`API: Generating Full Match report for ${category}:`, dynamicFields);
      
      // Convert dynamic fields to legacy format for compatibility
      const fieldValues = Object.values(dynamicFields);
      const building = fieldValues[0] || '';
      const foundation = fieldValues[1] || '';
      
      const reportData = {
        category: category,
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

  // 🔥 NEW: Utility Functions for Dynamic Fields
  
  // Convert dynamic fields to building+foundation format
  convertDynamicFieldsToMasterData: (category, dynamicFields) => {
    if (!dynamicFields || typeof dynamicFields !== 'object') {
      return { building: '', foundation: '' };
    }
    
    if (category === 'ฐานราก') {
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
  convertMasterDataToDynamicFields: (category, building, foundation) => {
    if (category === 'ฐานราก') {
      return {
        'อาคาร': building || '',
        'ฐานรากเบอร์': foundation || ''
      };
    }
    
    // สำหรับหมวดอื่น: ใช้ pattern เริ่มต้น
    return {
      'อาคาร': building || '',
      [`${category}เบอร์`]: foundation || ''
    };
  },

  // Create description for logging/display
  createCombinationDescription: (category, dynamicFields) => {
    if (!dynamicFields || typeof dynamicFields !== 'object') {
      return category;
    }
    
    const values = Object.entries(dynamicFields)
      .filter(([key, value]) => value && value.trim())
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
      
    return values || category;
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
  isFieldsComplete: (category, dynamicFields, categoryFields) => {
    if (!category || !categoryFields || categoryFields.length === 0) return false;
    
    // ตรวจสอบ field ที่ required (อย่างน้อย 2 field แรก)
    const requiredFields = categoryFields.slice(0, 2);
    return requiredFields.every(field => {
      const value = dynamicFields[field.name];
      return value && value.trim();
    });
  },

  // 🔥 NEW: Load all field values for a category (Complete Datalist System)
  loadAllFieldValues: async (category, categoryFields) => {
    try {
      console.log(`API: Loading all field values for category: ${category}`);
      
      const fieldValues = {};
      
      // โหลด values สำหรับทุก field
      for (const field of categoryFields) {
        const values = await api.getFieldValues(field.name, category);
        fieldValues[field.name] = values;
        console.log(`API: Field "${field.name}": ${values.length} values`);
      }
      
      return fieldValues;
    } catch (error) {
      console.error('API: Error loading all field values:', error);
      return {};
    }
  },

  // 🔥 NEW: Get enhanced master data with field values
  getMasterDataWithFieldValues: async (category, categoryFields) => {
    try {
      console.log(`API: Getting enhanced master data for ${category}`);
      
      // โหลด master data แบบเดิม
      const masterDataResponse = await api.getMasterData();
      
      // โหลด field values สำหรับ datalist
      const fieldValues = await api.loadAllFieldValues(category, categoryFields);
      
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
  }
};// แทนที่ไฟล์ src/utils/api.js ทั้งหมด

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
        category: photoData.category,
        topic: photoData.topic,
        location: photoData.location || '',
        // 🔥 NEW: ส่ง dynamic fields ไปด้วย (optional)
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

