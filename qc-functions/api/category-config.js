const { getSheetsClient } = require('../services/google-auth');

const SHEETS_ID = '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';

// ดึง configuration ของหมวดงาน
async function getCategoryConfig(category) {
  try {
    console.log(`Getting category config for: ${category}`);
    
    // ถ้าเป็นฐานราก ให้ใช้ logic เดิม
    if (category === 'ฐานราก') {
      return {
        useExisting: true,
        category: 'ฐานราก',
        fields: [
          { name: 'อาคาร', type: 'text', required: true },
          { name: 'ฐานราก', type: 'text', required: true }
        ]
      };
    }
    
    const sheets = getSheetsClient();
    
    // อ่านข้อมูลจาก Category_Config sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Category_Config!A:Z', // อ่านทุก column
    });
    
    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      throw new Error('Category_Config sheet is empty');
    }
    
    // หาหมวดงานที่ต้องการ
    const targetRow = rows.find(row => row[0] && row[0].trim() === category);
    
    if (!targetRow) {
      throw new Error(`Category "${category}" not found in configuration`);
    }
    
    // แปลง row เป็น field configuration
    const fields = [];
    
    // เริ่มจาก column B (index 1) เป็นต้นไป
    for (let i = 1; i < targetRow.length; i++) {
      const fieldName = targetRow[i];
      
      if (fieldName && fieldName.trim()) {
        fields.push({
          name: fieldName.trim(),
          type: 'text', // ตอนนี้ใช้ text ทั้งหมด
          required: true,
          placeholder: `เลือกหรือพิมพ์${fieldName.trim()}`
        });
      }
    }
    
    if (fields.length === 0) {
      throw new Error(`No fields configured for category "${category}"`);
    }
    
    console.log(`Found ${fields.length} fields for category: ${category}`);
    
    return {
      useExisting: false,
      category: category,
      fields: fields
    };
    
  } catch (error) {
    console.error('Error getting category config:', error);
    throw error;
  }
}

// ดึงรายการหมวดงานทั้งหมดที่มี config
async function getAllCategories() {
  try {
    console.log('Getting all configured categories');
    
    const sheets = getSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Category_Config!A:A', // เอาแค่ column A (หมวดงาน)
    });
    
    const rows = response.data.values || [];
    const categories = [];
    
    // skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
      const category = rows[i][0];
      if (category && category.trim()) {
        categories.push(category.trim());
      }
    }
    
    console.log(`Found ${categories.length} configured categories:`, categories);
    
    return categories;
    
  } catch (error) {
    console.error('Error getting all categories:', error);
    
    // ถ้า sheet ยังไม่มี ให้สร้างใหม่
    if (error.message.includes('Unable to parse range') || 
        error.message.includes('not found')) {
      console.log('Category_Config sheet not found, creating...');
      await createCategoryConfigSheet();
      return ['ฐานราก']; // return default
    }
    
    throw error;
  }
}

// สร้าง Category_Config sheet (ครั้งแรก)
async function createCategoryConfigSheet() {
  try {
    const sheets = getSheetsClient();
    
    console.log('Creating Category_Config sheet...');
    
    // เพิ่ม sheet ใหม่
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEETS_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: 'Category_Config',
              gridProperties: {
                rowCount: 100,
                columnCount: 10
              }
            }
          }
        }]
      }
    });
    
    // เพิ่ม header และข้อมูลเริ่มต้น
    const values = [
      // Header row
      ['หมวดงาน', 'field1_name', 'field2_name', 'field3_name', 'field4_name'],
      // Default data
      ['ฐานราก', 'อาคาร', 'ฐานราก', '', ''],
      ['เสา', 'อาคาร', 'เสาเบอร์', 'Gridline', ''],
      ['คาน', 'อาคาร', 'คานเบอร์', 'ชั้น', '']
    ];
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID,
      range: 'Category_Config!A1:E4',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    
    console.log('Category_Config sheet created successfully with default data');
    
  } catch (error) {
    console.error('Error creating Category_Config sheet:', error);
    throw error;
  }
}

// ตรวจสอบว่าหมวดงานมี dynamic fields หรือไม่
function isDynamicCategory(category) {
  return category !== 'ฐานราก';
}

// แปลง dynamic fields กลับเป็น building/foundation สำหรับ backward compatibility
function convertDynamicFieldsToLegacy(category, dynamicFields) {
  if (!dynamicFields || typeof dynamicFields !== 'object') {
    return { building: '', foundation: '' };
  }
  
  // สำหรับฐานราก ใช้ mapping ตรงๆ
  if (category === 'ฐานราก') {
    return {
      building: dynamicFields['อาคาร'] || '',
      foundation: dynamicFields['ฐานราก'] || ''
    };
  }
  
  // สำหรับหมวดอื่นๆ ใช้ field แรกเป็น building, field ที่ 2 เป็น foundation
  const fieldValues = Object.values(dynamicFields);
  return {
    building: fieldValues[0] || '',
    foundation: fieldValues[1] || ''
  };
}

// แปลง building/foundation กลับเป็น dynamic fields
function convertLegacyToDynamicFields(category, building, foundation) {
  if (category === 'ฐานราก') {
    return {
      'อาคาร': building || '',
      'ฐานราก': foundation || ''
    };
  }
  
  // สำหรับหมวดอื่นๆ ต้องดึง field names จาก config
  // ตอนนี้ return ค่าเริ่มต้น
  return {
    'อาคาร': building || ''
  };
}

// สร้างคำอธิบายสำหรับ combination
function createCombinationDescription(category, dynamicFields) {
  if (!dynamicFields || typeof dynamicFields !== 'object') {
    return category;
  }
  
  const values = Object.entries(dynamicFields)
    .filter(([key, value]) => value && value.trim())
    .map(([key, value]) => `${key}:${value}`)
    .join(', ');
    
  return values || category;
}

module.exports = {
  getCategoryConfig,
  getAllCategories,
  createCategoryConfigSheet,
  isDynamicCategory,
  convertDynamicFieldsToLegacy,
  convertLegacyToDynamicFields,
  createCombinationDescription
};