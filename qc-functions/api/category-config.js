// qc-functions/api/category-config.js - ยังไม่มีไฟล์นี้!

const { getSheetsClient } = require('../services/google-auth');

const SHEETS_ID = '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';

// 🔥 MISSING: Dynamic category configuration functions
async function getCategoryConfig(category) {
  try {
    const sheets = getSheetsClient();
    
    // Read from Category_Config sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Category_Config!A:D', // หมวดงาน, field1_name, field2_name, field3_name
    });
    
    const rows = response.data.values || [];
    const header = rows[0] || ['หมวดงาน', 'field1_name', 'field2_name', 'field3_name'];
    
    // Find row for specific category
    const categoryRow = rows.slice(1).find(row => row[0] === category);
    
    if (!categoryRow) {
      throw new Error(`Category ${category} not found in configuration`);
    }
    
    // Parse fields configuration
    const fields = [];
    for (let i = 1; i < header.length; i++) {
      const fieldName = categoryRow[i];
      if (fieldName && fieldName.trim()) {
        fields.push({
          name: fieldName.trim(),
          type: 'text',
          required: true,
          placeholder: `เลือกหรือพิมพ์${fieldName.trim()}`
        });
      }
    }
    
    return {
      category: category,
      useExisting: category === 'ฐานราก', // Special case for legacy
      fields: fields
    };
    
  } catch (error) {
    console.error(`Error getting category config for ${category}:`, error);
    
    // 🔥 FALLBACK: Return default configuration
    if (category === 'ฐานราก') {
      return {
        category: 'ฐานราก',
        useExisting: true,
        fields: [
          { name: 'อาคาร', type: 'text', required: true, placeholder: 'เลือกหรือพิมพ์อาคาร' },
          { name: 'ฐานราก', type: 'text', required: true, placeholder: 'เลือกหรือพิมพ์ฐานราก' }
        ]
      };
    } else {
      // Default dynamic configuration
      return {
        category: category,
        useExisting: false,
        fields: [
          { name: 'อาคาร', type: 'text', required: true, placeholder: `เลือกหรือพิมพ์อาคาร` },
          { name: `${category}เบอร์`, type: 'text', required: true, placeholder: `เลือกหรือพิมพ์${category}เบอร์` },
          { name: 'Gridline', type: 'text', required: false, placeholder: 'เลือกหรือพิมพ์ Gridline' }
        ]
      };
    }
  }
}

async function getAllCategories() {
  try {
    const sheets = getSheetsClient();
    
    // Read all categories from Category_Config sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Category_Config!A:A',
    });
    
    const rows = response.data.values || [];
    const categories = rows.slice(1).map(row => row[0]).filter(Boolean);
    
    return categories.length > 0 ? categories : ['ฐานราก']; // Fallback
    
  } catch (error) {
    console.error('Error getting all categories:', error);
    // 🔥 FALLBACK: Return default categories
    return ['ฐานราก', 'เสา', 'คาน'];
  }
}

// 🔥 MISSING: Helper functions for dynamic field processing
function isDynamicCategory(category) {
  return category !== 'ฐานราก';
}

function convertDynamicFieldsToLegacy(category, dynamicFields) {
  const fieldValues = Object.values(dynamicFields);
  return {
    building: fieldValues[0] || '',
    foundation: fieldValues[1] || ''
  };
}

function convertLegacyToDynamicFields(building, foundation) {
  return {
    'อาคาร': building,
    'ฐานราก': foundation
  };
}

function createCombinationDescription(category, dynamicFields) {
  if (category === 'ฐานราก') {
    return `${dynamicFields['อาคาร']}-${dynamicFields['ฐานราก']}`;
  } else {
    // For dynamic categories, create more descriptive combination
    const values = Object.values(dynamicFields).filter(Boolean);
    return values.join('-');
  }
}

module.exports = {
  getCategoryConfig,
  getAllCategories,
  isDynamicCategory,
  convertDynamicFieldsToLegacy,
  convertLegacyToDynamicFields,
  createCombinationDescription
};