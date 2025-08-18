const { getSheetsClient } = require('../services/google-auth');

const SHEETS_ID = '1ez_Dox16jf9lr5TEsLL5BEOfKZDNGkVD31YSBtx3Qa8';

// 🔥 NEW: ดึง Dynamic Fields สำหรับหมวดงานใดๆ
async function getDynamicFields(category) {
  try {
    console.log(`Getting dynamic fields for category: ${category}`);
    
    // ถ้าเป็นฐานราก ให้ใช้ logic เดิม (Hybrid Approach)
    if (category === 'ฐานราก') {
      return {
        useExisting: true,
        category: 'ฐานราก',
        fields: [
          { 
            name: 'อาคาร', 
            type: 'combobox', 
            required: true,
            placeholder: 'เลือกหรือพิมพ์อาคาร เช่น A, B, C'
          },
          { 
            name: 'ฐานรากเบอร์', 
            type: 'combobox', 
            required: true,
            placeholder: 'เลือกหรือพิมพ์เลขฐานราก เช่น F01, F02'
          }
        ]
      };
    }
    
    // สำหรับหมวดอื่น: ดึงจาก Category_Config sheet
    const sheets = getSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'Category_Config!A:E', // A=หมวดงาน, B-E=field names
    });
    
    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      throw new Error('Category_Config sheet is empty');
    }
    
    // หาหมวดงานที่ต้องการ
    const targetRow = rows.find(row => row[0] && row[0].trim() === category);
    
    if (!targetRow) {
      console.warn(`Category "${category}" not found in Category_Config sheet`);
      // Fallback: สร้าง default fields
      return createDefaultFields(category);
    }
    
    // แปลง row เป็น field configuration
    const fields = [];
    
    // เริ่มจาก column B (index 1) เป็นต้นไป
    for (let i = 1; i < targetRow.length && i <= 4; i++) { // สูงสุด 4 fields
      const fieldName = targetRow[i];
      
      if (fieldName && fieldName.trim()) {
        const cleanFieldName = fieldName.trim();
        
        fields.push({
          name: cleanFieldName,
          type: 'combobox',
          required: true,
          placeholder: createPlaceholder(cleanFieldName)
        });
      }
    }
    
    if (fields.length === 0) {
      console.warn(`No fields configured for category "${category}"`);
      return createDefaultFields(category);
    }
    
    console.log(`Found ${fields.length} dynamic fields for category: ${category}`);
    console.log('Fields:', fields.map(f => f.name));
    
    return {
      useExisting: false,
      category: category,
      fields: fields
    };
    
  } catch (error) {
    console.error('Error getting dynamic fields:', error);
    
    // Graceful fallback: สร้าง default fields
    console.log(`Fallback: creating default fields for category "${category}"`);
    return createDefaultFields(category);
  }
}

// 🔥 NEW: สร้าง default fields เมื่อไม่พบใน sheet
function createDefaultFields(category) {
  return {
    useExisting: false,
    category: category,
    fields: [
      {
        name: 'อาคาร',
        type: 'combobox',
        required: true,
        placeholder: 'เลือกหรือพิมพ์อาคาร เช่น A, B, C'
      },
      {
        name: `${category}เบอร์`,
        type: 'combobox', 
        required: true,
        placeholder: `เลือกหรือพิมพ์เลข${category}`
      }
    ]
  };
}

// 🔥 NEW: สร้าง placeholder text ตาม field name
function createPlaceholder(fieldName) {
  const placeholders = {
    'อาคาร': 'เลือกหรือพิมพ์อาคาร เช่น A, B, C',
    'ฐานรากเบอร์': 'เลือกหรือพิมพ์เลขฐานราก เช่น F01, F02',
    'เสาเบอร์': 'เลือกหรือพิมพ์เลขเสา เช่น C01, C02',
    'Gridline': 'เลือกหรือพิมพ์ Gridline เช่น A1, B2',
    'WWTP.NO': 'เลือกหรือพิมพ์หมายเลข WWTP',
    'ชั้น': 'เลือกหรือพิมพ์ชั้น เช่น 1F, 2F, B1',
    'Zone': 'เลือกหรือพิมพ์ Zone เช่น A, B, C'
  };
  
  return placeholders[fieldName] || `เลือกหรือพิมพ์${fieldName}`;
}

// ดึง configuration ของหมวดงาน (เดิม - สำหรับ backward compatibility)
async function getCategoryConfig(category) {
  return await getDynamicFields(category);
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
      ['ฐานราก', 'อาคาร', 'ฐานรากเบอร์', '', ''],
      ['เสา', 'อาคาร', 'เสาเบอร์', 'Gridline', ''],
      ['บอบบิ้งค์น้ำเสีย', 'อาคาร', 'WWTP.NO', 'Gridline', ''],
      ['พื้นคอนกรีตอิดแรง', 'อาคาร', 'ชั้น', 'Zone', 'Gridline']
    ];
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID,
      range: 'Category_Config!A1:E5',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    
    console.log('Category_Config sheet created successfully with sample data');
    
  } catch (error) {
    console.error('Error creating Category_Config sheet:', error);
    throw error;
  }
}

// 🔥 NEW: ตรวจสอบว่าหมวดงานใช้ dynamic fields หรือไม่
function isDynamicCategory(category) {
  return category !== 'ฐานราก';
}

// 🔥 NEW: แปลง dynamic fields เป็น building/foundation สำหรับ Master data
function convertDynamicFieldsToMasterData(category, dynamicFields) {
  if (!dynamicFields || typeof dynamicFields !== 'object') {
    return { building: '', foundation: '' };
  }
  
  // สำหรับฐานราก ใช้ mapping ตรงๆ
  if (category === 'ฐานราก') {
    return {
      building: dynamicFields['อาคาร'] || '',
      foundation: dynamicFields['ฐานรากเบอร์'] || ''
    };
  }
  
  // สำหรับหมวดอื่นๆ ใช้ field แรกเป็น building, field ที่ 2 เป็น foundation
  const fieldValues = Object.values(dynamicFields);
  return {
    building: fieldValues[0] || '', // field แรก (ส่วนใหญ่เป็น อาคาร)
    foundation: fieldValues[1] || '' // field ที่ 2 (เช่น เสาเบอร์, WWTP.NO)
  };
}

// 🔥 NEW: แปลง building/foundation กลับเป็น dynamic fields
function convertMasterDataToDynamicFields(category, building, foundation) {
  if (category === 'ฐานราก') {
    return {
      'อาคาร': building || '',
      'ฐานรากเบอร์': foundation || ''
    };
  }
  
  // สำหรับหมวดอื่นๆ ต้องดึง field names จาก config
  // ตอนนี้ return ค่าเริ่มต้น (จะต้องเรียก getDynamicFields เพื่อได้ field names จริง)
  return {
    'อาคาร': building || '',
    [`${category}เบอร์`]: foundation || ''
  };
}

// 🔥 NEW: สร้างคำอธิบายสำหรับ combination (สำหรับ logging/display)
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

// 🔥 NEW: ตรวจสอบว่า field values มีความถูกต้องหรือไม่
function validateDynamicFields(category, dynamicFields) {
  if (!dynamicFields || typeof dynamicFields !== 'object') {
    return { valid: false, error: 'Dynamic fields is required' };
  }
  
  // ตรวจสอบว่ามี field ครบตาม config หรือไม่
  const requiredFieldCount = category === 'ฐานราก' ? 2 : Object.keys(dynamicFields).length;
  const actualFieldCount = Object.values(dynamicFields).filter(value => value && value.trim()).length;
  
  if (actualFieldCount === 0) {
    return { valid: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
  }
  
  // ต้องมีอย่างน้อย field แรก (อาคาร) และ field ที่ 2
  const fieldValues = Object.values(dynamicFields);
  if (!fieldValues[0] || !fieldValues[0].trim()) {
    return { valid: false, error: 'กรุณากรอกอาคาร' };
  }
  
  if (!fieldValues[1] || !fieldValues[1].trim()) {
    const fieldNames = Object.keys(dynamicFields);
    const secondFieldName = fieldNames[1] || 'ข้อมูลที่ 2';
    return { valid: false, error: `กรุณากรอก${secondFieldName}` };
  }
  
  return { valid: true };
}

module.exports = {
  // 🔥 NEW APIs
  getDynamicFields,
  validateDynamicFields,
  convertDynamicFieldsToMasterData,
  convertMasterDataToDynamicFields,
  createCombinationDescription,
  
  // Existing APIs (for backward compatibility)
  getCategoryConfig,
  getAllCategories,
  createCategoryConfigSheet,
  isDynamicCategory,
  
  // Legacy APIs (deprecated but kept for compatibility)
  convertDynamicFieldsToLegacy: convertDynamicFieldsToMasterData,
  convertLegacyToDynamicFields: convertMasterDataToDynamicFields
};