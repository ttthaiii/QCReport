// แทนที่ไฟล์ src/utils/api.js ทั้งหมด

// Simple fetch wrapper
async function apiCall(endpoint, options = {}) {
  const API_BASE = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5001/qcreport-54164/asia-southeast1/api'
    : 'https://asia-southeast1-qcreport-54164.cloudfunctions.net/api';
    
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  
  return response.json();
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
        location: photoData.location || ''
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

// 🔥 NEW: Upload photo with dynamic fields
async function uploadPhotoDynamic(photoBlob, photoData) {
  const API_BASE = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5001/qcreport-54164/asia-southeast1/api'
    : 'https://asia-southeast1-qcreport-54164.cloudfunctions.net/api';

  try {
    // Convert blob to base64
    const base64 = await blobToBase64(photoBlob);
    console.log('Converted to base64, length:', base64.length);

    const response = await fetch(`${API_BASE}/upload-photo-dynamic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        photo: base64,
        category: photoData.category,
        dynamicFields: photoData.dynamicFields,
        topic: photoData.topic,
        location: photoData.location || ''
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dynamic Upload Error: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Dynamic upload error:', error);
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
  
  // 🔥 NEW: Dynamic Category Configuration
  getCategories: () => apiCall('/categories'),
  getCategoryConfig: (category) => apiCall(`/category-config/${category}`),
  
  // 🔥 Enhanced Master Data Management
  getMasterData: (category = null) => {
    if (category) {
      // Encode category name for URL safety
      const encodedCategory = encodeURIComponent(category);
      return apiCall(`/master-data/${encodedCategory}`);
    } else {
      return apiCall('/master-data');
    }
  },
  
  getMasterDataByCategory: (category) => {
    const encodedCategory = encodeURIComponent(category);
    return apiCall(`/master-data/${encodedCategory}`);
  },
  
  addMasterData: (building, foundation) => apiCall('/master-data', {
    method: 'POST',
    body: JSON.stringify({ building, foundation })
  }),
  
  // 🔥 NEW: Dynamic Master Data
  addDynamicMasterData: (category, dynamicFields) => apiCall('/master-data-dynamic', {
    method: 'POST',
    body: JSON.stringify({ category, dynamicFields })
  }),
  
  // 🔥 Hybrid Master Data Function
  addMasterDataHybrid: (category, data) => {
    if (category === 'ฐานราก') {
      // Use legacy function
      return apiCall('/master-data', {
        method: 'POST',
        body: JSON.stringify({ 
          building: data.building, 
          foundation: data.foundation 
        })
      });
    } else {
      // Use dynamic function
      return apiCall('/master-data-dynamic', {
        method: 'POST',
        body: JSON.stringify({ 
          category, 
          dynamicFields: data 
        })
      });
    }
  },
  
  // 🔥 Progress Tracking
  getCompletedTopics: (criteria) => apiCall('/completed-topics', {
    method: 'POST',
    body: JSON.stringify(criteria)
  }),
  
  // Upload photo to Drive + log to Sheets (Legacy)
  uploadPhoto: uploadPhotoFile,
  
  // 🔥 NEW: Upload photo with dynamic fields
  uploadPhotoDynamic: uploadPhotoDynamic,
  
  // Generate PDF Report (Enhanced for dynamic fields)
  generateReport: (data) => apiCall('/generate-report', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  // Log photo (legacy)
  logPhoto: (data) => apiCall('/log-photo', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  // Log report
  logReport: (data) => apiCall('/log-report', {
    method: 'POST',
    body: JSON.stringify(data)
  })
};