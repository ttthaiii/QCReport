import React, { useState, useRef, useEffect } from 'react';
import { addWatermark, formatThaiDateTime } from '../utils/watermark';
import { api } from '../utils/api';

const Camera = () => {
  // Form States
  const [qcTopics, setQcTopics] = useState({});
  const [masterData, setMasterData] = useState({
    buildings: [],
    foundations: [],
    combinations: []
  });
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(false);
  const [formData, setFormData] = useState({
    category: ''
  });

  // 🔥 NEW: Dynamic Fields States
  const [categoryFields, setCategoryFields] = useState([]);
  const [dynamicFields, setDynamicFields] = useState({});
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  // Native Camera States
  const [selectedTopic, setSelectedTopic] = useState('');
  const [captureMode, setCaptureMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [sourceType, setSourceType] = useState(null); // 'camera' or 'gallery'
  const [shouldAddWatermark, setShouldAddWatermark] = useState(true);
  const [showSourceSelection, setShowSourceSelection] = useState(false);

  // Multiple Photos System
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Progress Tracking
  const [completedTopics, setCompletedTopics] = useState(new Set());
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  
  // Geolocation states
  const [currentLocation, setCurrentLocation] = useState('กำลังหาตำแหน่ง...');
  const [cachedLocation, setCachedLocation] = useState(null);
  const [lastPosition, setLastPosition] = useState(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [fieldValues, setFieldValues] = useState({});

  // Native Camera Input Ref
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    if (formData.category && categoryFields.length > 0) {
      loadFieldValues(formData.category, categoryFields);
    }
  }, [formData.category, categoryFields]);  

  // Load data on mount
  useEffect(() => {
    loadQCTopics();
    loadMasterData();
    getCurrentLocation();
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

  // Load progress when dynamic fields and category are ready
  useEffect(() => {
    if (formData.category && isFieldsComplete()) {
      loadProgress();
    }
  }, [formData.category, dynamicFields]);

  const loadFieldValues = async (category, fields) => {
    try {
      const newFieldValues = {};
      
      for (const field of fields) {
        const values = await api.getFieldValues(field.name, category);
        newFieldValues[field.name] = values;
        console.log(`Loaded ${values.length} values for ${field.name}:`, values);
      }
      
      setFieldValues(newFieldValues);
    } catch (error) {
      console.error('Error loading field values:', error);
    }
  };

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
  };

  // 🔥 NEW: Check if required fields are complete
  const isFieldsComplete = () => {
    if (!formData.category || categoryFields.length === 0) return false;
    
    // ✅ เช็คทุก field ที่มี required: true
    return categoryFields.every(field => {
      if (field.required) {
        const value = dynamicFields[field.name];
        return value && value.trim();
      }
      return true; // field ที่ไม่ required ถือว่าผ่าน
    });
  };

  // 🔥 NEW: Get field options from master data
  const getFieldOptions = (fieldName) => {
    // ใช้ field values ที่โหลดมา
    if (fieldValues[fieldName]) {
      return fieldValues[fieldName];
    }
    
    // Fallback: ใช้ master data เดิม
    if (fieldName === 'อาคาร') {
      return masterData.buildings || [];
    }
    
    if (categoryFields.length >= 2 && fieldName === categoryFields[1].name) {
      return masterData.foundations || [];
    }
    
    return [];
  };

  // 🔥 NEW: Check if field value is new (not in master data)
  const isNewValue = (fieldName, value) => {
    if (!value || !value.trim()) return false;
    
    const options = getFieldOptions(fieldName);
    return !options.includes(value.trim());
  };

  // 🔥 NEW: Get data status for display
  const getDataStatus = () => {
    const fieldEntries = Object.entries(dynamicFields);
    const newFields = fieldEntries.filter(([name, value]) => isNewValue(name, value));
    
    if (newFields.length === 0) {
      const description = fieldEntries
        .filter(([name, value]) => value && value.trim())
        .map(([name, value]) => value)
        .join('-');
      
      return description ? {
        type: 'existing',
        message: `ใช้ข้อมูลที่มีอยู่: ${description}`
      } : null;
    }
    
    const newFieldsText = newFields.map(([name, value]) => `${name} "${value}"`).join(', ');
    return {
      type: 'new',
      message: `จะเพิ่มข้อมูลใหม่: ${newFieldsText}`
    };
  };

  // 🔥 NEW: Auto-add new data to master sheet
  const autoAddNewData = async () => {
    if (!isFieldsComplete()) return;
    
    try {
      // Convert dynamic fields to building+foundation for master data
      const masterDataFields = convertDynamicFieldsToMasterData(formData.category, dynamicFields);
      
      console.log(`Auto-adding master data:`, masterDataFields);
      
      const response = await api.addMasterData(
        masterDataFields.building, 
        masterDataFields.foundation
      );
      
      if (response.success && !response.data.duplicate) {
        // Reload master data เพื่อให้ dropdown อัปเดต
        await loadMasterData();
        console.log(`✅ Auto-added: ${masterDataFields.building}-${masterDataFields.foundation}`);
      }
    } catch (error) {
      console.error('Auto-add error:', error);
      // ไม่แสดง error ให้ user เพื่อไม่ให้รบกวนการทำงาน
    }
  };

  // 🔥 NEW: Convert dynamic fields to master data format
  const convertDynamicFieldsToMasterData = (category, fields) => {
    if (category === 'ฐานราก') {
      return {
        building: fields['อาคาร'] || '',
        foundation: fields['ฐานรากเบอร์'] || ''
      };
    }
    
    // สำหรับหมวดอื่น: field แรกเป็น building, field ที่ 2 เป็น foundation
    const fieldValues = Object.values(fields);
    return {
      building: fieldValues[0] || '',
      foundation: fieldValues[1] || ''
    };
  };

  // Load Functions
  const loadMasterData = async () => {
    setIsLoadingMasterData(true);
    try {
      const response = await api.getMasterData();
      if (response.success) {
        setMasterData(response.data);
      }
    } catch (error) {
      console.error('Error loading master data:', error);
    } finally {
      setIsLoadingMasterData(false);
    }
  };

  const loadQCTopics = async () => {
    try {
      const response = await api.getQCTopics();
      if (response.success) {
        setQcTopics(response.data);
        const categories = Object.keys(response.data);
        if (categories.length > 0) {
          setFormData(prev => ({ ...prev, category: categories[0] }));
        }
      }
    } catch (error) {
      console.error('Error loading QC topics:', error);
      alert('ไม่สามารถโหลดหัวข้อการตรวจ QC ได้');
    }
  };

  const loadProgress = async () => {
    if (!formData.category || !isFieldsComplete()) {
      setCompletedTopics(new Set());
      return;
    }
    
    setIsLoadingProgress(true);
    try {
      console.log(`📊 Loading progress for category: ${formData.category}`);
      console.log(`📊 Dynamic fields:`, dynamicFields);
      
      // 🔥 แก้ไข: ใช้ dynamic fields conversion แทน hardcode
      const masterDataFields = convertDynamicFieldsToMasterData(formData.category, dynamicFields);
      
      console.log(`📊 Converted to master data format:`, masterDataFields);
      
      const response = await api.getCompletedTopicsFullMatch({
        building: masterDataFields.building,
        foundation: masterDataFields.foundation,
        category: formData.category,
        dynamicFields: dynamicFields // ✅ ส่ง full dynamic fields สำหรับ Full Match
      });
      
      if (response.success) {
        const completedTopicsArray = response.data.completedTopics || [];
        setCompletedTopics(new Set(completedTopicsArray));
        
        console.log(`✅ Progress loaded: ${completedTopicsArray.length} completed topics`);
        console.log(`✅ Completed topics:`, completedTopicsArray);
      } else {
        console.log(`❌ Progress load failed:`, response);
        setCompletedTopics(new Set());
      }
    } catch (error) {
      console.error('❌ Error loading progress:', error);
      setCompletedTopics(new Set());
    } finally {
      setIsLoadingProgress(false);
    }
  };

  // 🔥 เพิ่มฟังก์ชัน debug สำหรับตรวจสอบ
  const debugProgress = async () => {
    console.log('=== DEBUG PROGRESS ===');
    console.log('Category:', formData.category);
    console.log('Dynamic Fields:', dynamicFields);
    console.log('Category Fields:', categoryFields);
    console.log('Is Fields Complete:', isFieldsComplete());
    
    if (isFieldsComplete()) {
      const masterDataFields = convertDynamicFieldsToMasterData(formData.category, dynamicFields);
      console.log('Master Data Fields:', masterDataFields);
      
      try {
        const response = await api.getCompletedTopicsFullMatch({
          building: masterDataFields.building,
          foundation: masterDataFields.foundation,
          category: formData.category,
          dynamicFields: dynamicFields
        });
        console.log('API Response:', response);
      } catch (error) {
        console.error('API Error:', error);
      }
    }
    console.log('=== END DEBUG ===');
  };


  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setCurrentLocation('อุปกรณ์ไม่รองรับ GPS');
      return;
    }

    setIsGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          if (lastPosition && cachedLocation) {
            const distance = calculateDistance(
              latitude, longitude, 
              lastPosition.lat, lastPosition.lng
            );
            
            if (distance < 0.1) {
              setCurrentLocation(cachedLocation);
              setIsGettingLocation(false);
              return;
            }
          }
          
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=th&zoom=18&addressdetails=1`,
            { headers: { 'User-Agent': 'QCReport-App/1.0' } }
          );
          
          const data = await response.json();
          
          if (data && data.address) {
            const addr = data.address;
            const addressParts = [
              addr.house_number,
              addr.road || addr.street,
              addr.suburb || addr.neighbourhood,
              addr.district || addr.city_district,
              addr.city || addr.town || addr.municipality,
              addr.state_district,
              addr.state || addr.province
            ].filter(Boolean);
            
            let fullAddress = addressParts.join(', ');
            
            if (addressParts.length < 3) {
              fullAddress = data.display_name
                .replace(/\d{5}/, '')
                .replace(/ประเทศไทย|Thailand/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            }
            
            setCachedLocation(fullAddress);
            setLastPosition({ lat: latitude, lng: longitude });
            setCurrentLocation(fullAddress);
          }
          
        } catch (error) {
          console.error('Error getting address:', error);
          setCurrentLocation('ไม่สามารถระบุสถานที่ได้');
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        setCurrentLocation('ไม่สามารถเข้าถึงตำแหน่งได้');
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000
      }
    );
  };

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // 🔥 UPDATED: One-Click Topic Selection with Auto-Add
  const selectTopicAndOpenCamera = async (topic) => {
    if (!formData.category || !isFieldsComplete()) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    // 🔥 เช็คว่าหัวข้อนี้ถ่ายไปแล้วหรือยัง
    const existingPhotos = capturedPhotos.filter(photo => photo.topic === topic);
    const isCompletedFromServer = completedTopics.has(topic);
    
    if (existingPhotos.length > 0 || isCompletedFromServer) {
      const photoCount = existingPhotos.length;
      const serverStatus = isCompletedFromServer ? '\n(พบข้อมูลในระบบด้วย)' : '';
      
      const confirmed = window.confirm(
        `⚠️ การถ่ายรูปซ้ำ\n\n` +
        `หัวข้อ: "${topic}"\n` +
        `${photoCount > 0 ? `มีรูปอยู่แล้ว: ${photoCount} รูป` : 'มีข้อมูลในระบบแล้ว'}${serverStatus}\n\n` +
        `❓ ต้องการถ่ายรูปใหม่หรือไม่?\n\n` +
        `✅ ตกลง = ถ่ายใหม่ (รูปใหม่จะใช้ในรายงาน)\n` +
        `❌ ยกเลิก = ไม่ถ่าย`
      );
      
      if (!confirmed) {
        console.log(`User cancelled duplicate photo for topic: ${topic}`);
        return;
      }
      
      console.log(`User confirmed duplicate photo for topic: ${topic}`);
    }

    console.log(`Selected topic: ${topic}, checking dynamic fields:`, dynamicFields);
    
    // Auto-add ข้อมูลใหม่ (ถ้ามี) ก่อนถ่ายรูป
    await autoAddNewData();
    
    console.log(`🔥 DEBUG 2: About to set states...`);
    
    setSelectedTopic(topic);
    setCaptureMode(true);
    setShowSourceSelection(true);
    setSourceType(null);
    
    console.log(`🔥 DEBUG 3: States set complete`);
    console.log(`🔥 DEBUG 4: showSourceSelection should be true now`);
  };

  const handleSourceSelection = (source) => {
    console.log(`Selected source: ${source} for topic: ${selectedTopic}`);
    
    setSourceType(source);
    setShowSourceSelection(false);
    setCaptureMode(true); // ✅ ย้ายมาไว้ที่เดียว
    
    if (source === 'camera') {
      // 🔥 Camera: ใส่ watermark อัตโนมัติ + เปิดกล้องทันที
      setShouldAddWatermark(true);
      
      setTimeout(() => {
        if (cameraInputRef.current) {
          cameraInputRef.current.click();
        }
      }, 100);
    } else if (source === 'gallery') {
      // 🔥 Gallery: ตั้งค่า default watermark เป็น false
      setShouldAddWatermark(false);
      // ไม่เปิด file picker ทันที - ให้ user เลือก watermark ก่อน
    }
  };

  const proceedWithFileSelection = () => {
    // เฉพาะ gallery เท่านั้นที่ต้องใช้ฟังก์ชันนี้
    if (sourceType === 'gallery') {
      setTimeout(() => {
        if (galleryInputRef.current) {
          galleryInputRef.current.click();
        }
      }, 100);
    }
  }; 
  
  // 🔥 NEW: Cancel Source Selection
  const cancelSourceSelection = () => {
    setShowSourceSelection(false);
    resetCameraState();
  };

  const handleFileInput = async (event, source) => {
    const file = event.target.files[0];
    if (!file || !selectedTopic) {
      console.log('No file selected or no topic selected');
      return;
    }

    console.log(`${source} file selected:`, {
      name: file.name,
      size: file.size,
      type: file.type,
      topic: selectedTopic,
      willAddWatermark: shouldAddWatermark
    });

    setIsProcessing(true);

    try {
      // Process image based on watermark choice
      const processedBlob = shouldAddWatermark ? 
        await processImageForQC(file) : 
        await processImageWithoutWatermark(file);
      
      const masterDataFields = convertDynamicFieldsToMasterData(formData.category, dynamicFields);
      
      const photoData = {
        id: Date.now() + Math.random(),
        blob: processedBlob,
        url: URL.createObjectURL(processedBlob),
        building: masterDataFields.building,
        foundation: masterDataFields.foundation,
        category: formData.category,
        topic: selectedTopic,
        location: shouldAddWatermark ? currentLocation : 
                  source === 'camera' ? currentLocation : 'แนบจากแกลลอรี',
        timestamp: new Date().toISOString(),
        dimensions: '1600x1200',
        dynamicFields: { ...dynamicFields },
        sourceType: source,
        hasWatermark: shouldAddWatermark
      };

      setCapturedPhotos(prev => [...prev, photoData]);
      setCompletedTopics(prev => new Set([...prev, selectedTopic]));
      
      resetCameraState();
      
      const currentUniqueTopics = new Set([...capturedPhotos.map(p => p.topic), selectedTopic]).size;
      const currentTotalPhotos = capturedPhotos.length + 1;
      
      const actionText = source === 'camera' ? 'ถ่ายรูป' : 'แนบรูป';
      alert(
        `✅ ${actionText} "${selectedTopic}" เรียบร้อย!\n` +
        `📏 ขนาด: 1600×1200\n` +
        `${shouldAddWatermark ? '🏷️ มี Watermark' : '📷 ไม่มี Watermark'}\n` +
        `📷 หัวข้อที่ถ่ายแล้ว: ${currentUniqueTopics} หัวข้อ\n` +
        `🔢 รูปทั้งหมด: ${currentTotalPhotos} รูป`
      );

    } catch (error) {
      console.error(`Error processing ${source} image:`, error);
      alert('เกิดข้อผิดพลาดในการประมวลผลรูป: ' + error.message);
      resetCameraState();
    } finally {
      setIsProcessing(false);
    }
  };  

  // Process image for QC (resize + crop + watermark)
  const processImageForQC = async (imageFile) => {
    console.log('Starting image processing...');
    
    // Step 1: Resize and crop to 1600x1200
    const resizedBlob = await resizeAndCropImage(imageFile, 1600, 1200);
    console.log('Image resized and cropped');
    
    // Step 2: Add watermark
    const watermarkText = formatThaiDateTime();
    const location = currentLocation || 'ไม่สามารถระบุตำแหน่งได้';
    const watermarkedBlob = await addWatermark(resizedBlob, watermarkText, location);
    console.log('Watermark added');
    
    return watermarkedBlob;
  };

  const processImageWithoutWatermark = async (imageFile) => {
    console.log('Processing image without watermark...');
    
    // แค่ resize และ crop เท่านั้น ไม่ใส่ watermark
    const resizedBlob = await resizeAndCropImage(imageFile, 1600, 1200);
    console.log('Image resized and cropped (no watermark)');
    
    return resizedBlob;
  };

  // Resize and crop image to target dimensions (4:3 ratio)
  const resizeAndCropImage = (imageFile, targetWidth, targetHeight) => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        try {
          const targetRatio = targetWidth / targetHeight; // 4:3
          const imageWidth = img.width;
          const imageHeight = img.height;
          const imageRatio = imageWidth / imageHeight;
          
          console.log(`Processing: ${imageWidth}x${imageHeight} → ${targetWidth}x${targetHeight}`);
          
          // Set canvas to target size
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          
          // Calculate crop area (center crop)
          let sourceX = 0, sourceY = 0, sourceWidth = imageWidth, sourceHeight = imageHeight;
          
          if (imageRatio > targetRatio) {
            // Image is wider - crop sides
            sourceWidth = imageHeight * targetRatio;
            sourceX = (imageWidth - sourceWidth) / 2;
          } else {
            // Image is taller - crop top/bottom
            sourceHeight = imageWidth / targetRatio;
            sourceY = (imageHeight - sourceHeight) / 2;
          }
          
          console.log(`Crop area: ${sourceX}, ${sourceY}, ${sourceWidth}, ${sourceHeight}`);
          
          // Fill with white background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          
          // Draw cropped and resized image
          ctx.drawImage(
            img,
            sourceX, sourceY, sourceWidth, sourceHeight,  // source (crop area)
            0, 0, targetWidth, targetHeight               // destination (canvas)
          );
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob from canvas'));
            }
          }, 'image/jpeg', 0.9); // High quality
          
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(imageFile);
    });
  };

  // Cancel capture
  const cancelCapture = () => {
    resetCameraState();
  };

  // Reset camera state
  const resetCameraState = () => {
    setSelectedTopic('');
    setCaptureMode(false);
    setIsProcessing(false);
    setShowSourceSelection(false); // 🔥 NEW
    setSourceType(null); // 🔥 NEW
    setShouldAddWatermark(true); // 🔥 NEW: reset เป็น default
    
    // Reset file inputs
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
    if (galleryInputRef.current) { // 🔥 NEW
      galleryInputRef.current.value = '';
    }
  };

  // Upload all photos
  const uploadAllPhotos = async () => {
    if (capturedPhotos.length === 0) {
      alert('ไม่มีรูปให้อัปโหลด');
      return;
    }
    
    setIsUploading(true);
    
    try {
      console.log(`Starting upload of ${capturedPhotos.length} photos...`);
      
      const results = [];
      
      for (let i = 0; i < capturedPhotos.length; i++) {
        const photo = capturedPhotos[i];
        console.log(`Uploading photo ${i + 1}/${capturedPhotos.length}: ${photo.topic}`);
        
        try {
          const result = await api.uploadPhoto(photo.blob, {
            building: photo.building,
            foundation: photo.foundation,
            category: photo.category,
            topic: photo.topic,
            location: photo.location,
            dynamicFields: photo.dynamicFields // 🔥 NEW: ส่ง dynamic fields ไปด้วย
          });
          
          if (result.success) {
            results.push({ success: true, topic: photo.topic, data: result.data });
            console.log(`✓ Photo ${i + 1} uploaded successfully`);
          } else {
            results.push({ success: false, topic: photo.topic, error: 'Upload failed' });
            console.log(`✗ Photo ${i + 1} upload failed`);
          }
        } catch (error) {
          results.push({ success: false, topic: photo.topic, error: error.message });
          console.log(`✗ Photo ${i + 1} upload error:`, error.message);
        }
      }
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (failed === 0) {
        alert(`🎉 อัปโหลดสำเร็จทั้งหมด ${successful} รูป!`);
        
        // เคลียร์รูปหลังอัปโหลดสำเร็จ
        setCapturedPhotos([]);
        await loadProgress();
      } else {
        alert(`อัปโหลดเสร็จสิ้น!\n✅ สำเร็จ: ${successful} รูป\n❌ ล้มเหลว: ${failed} รูป\n\nรูปที่ล้มเหลว:\n${results.filter(r => !r.success).map(r => `- ${r.topic}: ${r.error}`).join('\n')}`);
      }
      
    } catch (error) {
      console.error('Error uploading photos:', error);
      alert('เกิดข้อผิดพลาดในการอัปโหลด: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Clear all photos and other utility functions
  const clearAllPhotos = () => {
    if (capturedPhotos.length === 0) return;
    
    if (window.confirm(`ต้องการลบรูปทั้งหมด ${capturedPhotos.length} รูป?`)) {
      capturedPhotos.forEach(photo => {
        URL.revokeObjectURL(photo.url);
      });
      
      setCapturedPhotos([]);
      setCompletedTopics(new Set());
    }
  };

  const removePhoto = (photoId) => {
    setCapturedPhotos(prev => {
      const updated = prev.filter(photo => photo.id !== photoId);
      
      const photoToRemove = prev.find(photo => photo.id === photoId);
      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.url);
        
        const remainingTopics = updated.map(p => p.topic);
        setCompletedTopics(new Set(remainingTopics));
      }
      
      return updated;
    });
  };

  const refreshLocation = () => {
    setCachedLocation(null);
    setLastPosition(null);
    getCurrentLocation();
  };

  // Progress stats
  const getProgressStats = () => {
    const currentTopics = qcTopics[formData.category] || [];
    const completed = currentTopics.filter(topic => completedTopics.has(topic)).length;
    const total = currentTopics.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  };

  // ฟังก์ชันเรียงรูปตามลำดับหัวข้อสำหรับการแสดงผล
  const getSortedPhotosForDisplay = () => {
    if (!formData.category || !qcTopics[formData.category]) {
      return capturedPhotos;
    }
    
    const orderedTopics = qcTopics[formData.category];
    const photosByTopic = new Map();
    
    // จัดกลุ่มรูปตามหัวข้อ
    capturedPhotos.forEach(photo => {
      if (!photosByTopic.has(photo.topic)) {
        photosByTopic.set(photo.topic, []);
      }
      photosByTopic.get(photo.topic).push(photo);
    });
    
    // เรียงรูปตามลำดับหัวข้อที่กำหนด
    const sortedPhotos = [];
    orderedTopics.forEach((topic, index) => {
      const topicPhotos = photosByTopic.get(topic) || [];
      topicPhotos.forEach(photo => {
        photo.displayOrder = index + 1; // เพิ่มลำดับสำหรับแสดงผล
        sortedPhotos.push(photo);
      });
    });
    
    return sortedPhotos;
  };

  const progressStats = getProgressStats();
  const sortedPhotosForDisplay = getSortedPhotosForDisplay();
  const dataStatus = getDataStatus();

  // 🔥 NEW: Render Dynamic Form Fields
  const renderDynamicForm = () => {
    return (
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          
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
                padding: '8px', 
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}
              disabled={captureMode}
            >
              <option value="">เลือกหมวดงาน...</option>
              {Object.keys(qcTopics).map(category => (
                <option key={category} value={category}>{category}</option>
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
                list={`${field.name}-list`}
                value={dynamicFields[field.name] || ''}
                onChange={(e) => handleDynamicFieldChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  fontSize: '14px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
                disabled={captureMode || isLoadingFields}
              />
              <datalist id={`${field.name}-list`}>
                {getFieldOptions(field.name).map(option => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          ))}
        </div>
        
        {/* Loading Fields */}
        {isLoadingFields && (
          <div style={{ 
            marginTop: '15px', 
            textAlign: 'center', 
            fontSize: '14px', 
            color: '#666'
          }}>
            กำลังโหลด fields สำหรับ {formData.category}...
          </div>
        )}
        
        {/* Data Status Message */}
        {dataStatus && (
          <div style={{ 
            marginTop: '15px', 
            padding: '10px', 
            backgroundColor: dataStatus.type === 'new' ? '#d1ecf1' : '#d4edda', 
            borderRadius: '5px',
            border: `1px solid ${dataStatus.type === 'new' ? '#bee5eb' : '#c3e6cb'}`,
            fontSize: '14px',
            color: dataStatus.type === 'new' ? '#0c5460' : '#155724'
          }}>
            <span style={{ marginRight: '8px' }}>
              {dataStatus.type === 'new' ? '✨' : '✅'}
            </span>
            {dataStatus.message}
          </div>
        )}
        
        {/* Loading Master Data */}
        {isLoadingMasterData && (
          <div style={{ 
            marginTop: '10px', 
            textAlign: 'center', 
            fontSize: '14px', 
            color: '#666'
          }}>
            กำลังโหลดข้อมูลอาคารและฐานราก...
          </div>
        )}
      </div>
    );
  };

  const getUniqueTopicsCount = () => {
    const uniqueTopics = new Set(sortedPhotosForDisplay.map(p => p.topic));
    return uniqueTopics.size;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>📸 ถ่ายรูป QC </h1>
      
      {/* Progress Status */}
      <div style={{ 
        marginBottom: '15px', 
        padding: '12px', 
        backgroundColor: '#e3f2fd', 
        borderRadius: '6px',
        border: '1px solid #1976d2'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1565c0' }}>
            📊 ความครบถ้วน: {progressStats.completed}/{progressStats.total} ({progressStats.percentage}%)
            {/* 🔥 แก้ไข: นับเฉพาะหัวข้อที่ไม่ซ้ำ */}
            {sortedPhotosForDisplay.length > 0 && ` | 📷 ถ่ายแล้ว: ${getUniqueTopicsCount()} หัวข้อ`}
          </span>
          {isLoadingProgress && (
            <span style={{ fontSize: '12px', color: '#666' }}>กำลังโหลด...</span>
          )}
        </div>
        
        {progressStats.total > 0 && (
          <div style={{ 
            marginTop: '8px',
            height: '6px',
            backgroundColor: '#bbdefb',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${progressStats.percentage}%`,
              backgroundColor: progressStats.percentage === 100 ? '#4caf50' : '#2196f3',
              transition: 'width 0.3s ease'
            }} />
          </div>
        )}
      </div>

      
      {/* 🔥 NEW: Dynamic Form */}
      {renderDynamicForm()}

      {/* Native Camera Input (Hidden) */}
      <input 
        ref={cameraInputRef}
        type="file" 
        accept="image/*" 
        capture="camera"
        style={{ display: 'none' }}
        onChange={(e) => handleFileInput(e, 'camera')}
      />

      {/* 🔥 NEW: Gallery Input (Hidden) */}
      <input 
        ref={galleryInputRef}
        type="file" 
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFileInput(e, 'gallery')}
      />

      {/* 🔥 NEW: Source Selection Modal */}
          {showSourceSelection && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                maxWidth: '400px',
                width: '90%',
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
              }}>
                <h3 style={{ 
                  marginTop: 0, 
                  marginBottom: '15px', 
                  textAlign: 'center',
                  color: '#495057'
                }}>
                  📸 เลือกแหล่งรูปสำหรับ "{selectedTopic}"
                </h3>
                
                <div style={{ marginBottom: '20px' }}>
                  <button
                    onClick={() => handleSourceSelection('camera')}
                    style={{
                      width: '100%',
                      padding: '15px',
                      marginBottom: '10px',
                      fontSize: '16px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px'
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>📷</span>
                    ถ่ายรูปใหม่
                  </button>
                  
                  <button
                    onClick={() => handleSourceSelection('gallery')}
                    style={{
                      width: '100%',
                      padding: '15px',
                      fontSize: '16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px'
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>🖼️</span>
                    เลือกจากแกลลอรี
                  </button>
                </div>
                
                <button
                  onClick={cancelSourceSelection}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '14px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

      {/* Main Content: Topic Selection OR Processing */}
      {!showSourceSelection ? (
        !captureMode ? (
          // Topic Selection Mode (ไม่แสดงเมื่อมี modal)
          <>
            {formData.category && isFieldsComplete() && qcTopics[formData.category] ? (
              <div style={{ 
                marginBottom: '20px', 
                padding: '15px', 
                backgroundColor: '#ffffff', 
                borderRadius: '8px',
                border: '1px solid #dee2e6'
              }}>
                <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#495057' }}>
                  🔍 เลือกหัวข้อที่ต้องการถ่าย:
                </h3>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '10px' 
                }}>
                  {qcTopics[formData.category].map((topic, index) => {
                    const isCompleted = completedTopics.has(topic);
                    const photosForThisTopic = sortedPhotosForDisplay.filter(p => p.topic === topic);
                    
                    let backgroundColor = isCompleted ? '#e8f5e8' : '#ffffff';
                    let statusIcon = isCompleted ? '✅' : '📷';
                    let statusColor = isCompleted ? '#28a745' : '#007bff';
                    
                    return (
                      <button
                        key={topic}
                        onClick={() => selectTopicAndOpenCamera(topic)}
                        style={{
                          padding: '12px 15px',
                          fontSize: '14px',
                          textAlign: 'left',
                          border: '1px solid #dee2e6',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          backgroundColor: backgroundColor,
                          color: '#495057',
                          transition: 'all 0.2s ease',
                          position: 'relative',
                          minHeight: '50px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = isCompleted ? '#c8e6c9' : '#f8f9fa';
                          e.target.style.borderColor = '#007bff';
                          e.target.style.transform = 'translateY(-1px)';
                          e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = backgroundColor;
                          e.target.style.borderColor = '#dee2e6';
                          e.target.style.transform = 'translateY(0)';
                          e.target.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 'normal' }}>
                            {index + 1}. {topic}
                          </span>
                          {photosForThisTopic.length > 0 && (
                            <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                              📷 ถ่ายแล้ว {photosForThisTopic.length} รูป
                            </div>
                          )}
                        </div>
                        
                        <div style={{ marginLeft: '10px' }}>
                          <span style={{ fontSize: '16px', color: statusColor }}>
                            {statusIcon}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{
                marginBottom: '15px',
                padding: '10px',
                backgroundColor: '#fff3cd',
                borderRadius: '5px',
                textAlign: 'center',
                fontSize: '14px',
                color: '#856404',
                border: '1px solid #ffeaa7'
              }}>
                ⚠️ กรุณาเลือกหมวดงานและกรอกข้อมูลให้ครบถ้วนเพื่อแสดงรายการหัวข้อ
              </div>
            )}
          </>
        ) : (
          // Capture Mode (แสดงเฉพาะเมื่อไม่มี modal)
          <>
            {isProcessing ? (
              // Processing Animation
              <div style={{ 
                padding: '40px 20px',
                textAlign: 'center',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
              }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  border: '4px solid #e3f2fd',
                  borderTop: '4px solid #007bff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 20px'
                }} />
                <h3 style={{ color: '#007bff', marginBottom: '10px' }}>
                  📱 กำลังประมวลผลรูป "{selectedTopic}"
                </h3>
                <p style={{ color: '#666', fontSize: '14px' }}>
                  {sourceType === 'camera' ? 'Resize → Crop → Watermark' : 
                  shouldAddWatermark ? 'Resize → Crop → Watermark' : 'Resize → Crop'}
                </p>
                <div style={{ marginTop: '15px', fontSize: '12px', color: '#999' }}>
                  กรุณารอสักครู่...
                </div>
              </div>
            ) : sourceType === 'camera' ? (
              // 🔥 Camera: แสดงข้อความรอเปิดกล้อง (ไม่มีตัวเลือก watermark)
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                border: '1px solid #1976d2'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>📱</div>
                <h3 style={{ color: '#1565c0', marginBottom: '10px' }}>
                  รอการถ่ายรูป "{selectedTopic}"
                </h3>
                <p style={{ color: '#1565c0', fontSize: '14px', marginBottom: '15px' }}>
                  แอปกล้องควรเปิดขึ้นมาอัตโนมัติ<br/>
                  <strong>จะใส่ Watermark อัตโนมัติ</strong>
                </p>

                <button
                  onClick={cancelCapture}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ยกเลิก
                </button>
              </div>
            ) : sourceType === 'gallery' ? (
              // 🔥 Gallery: แสดงตัวเลือก watermark
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                backgroundColor: '#fff3cd',
                borderRadius: '8px',
                border: '1px solid #ffeaa7'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>🖼️</div>
                <h3 style={{ color: '#856404', marginBottom: '10px' }}>
                  รอการเลือกรูป "{selectedTopic}"
                </h3>

                {/* Watermark Control สำหรับ Gallery เท่านั้น */}
                <div style={{
                  marginBottom: '20px',
                  padding: '15px',
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  borderRadius: '8px',
                  border: '1px solid rgba(0,0,0,0.1)'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#495057',
                    marginBottom: '12px'
                  }}>
                    <input
                      type="checkbox"
                      checked={shouldAddWatermark}
                      onChange={(e) => setShouldAddWatermark(e.target.checked)}
                      style={{
                        marginRight: '8px',
                        transform: 'scale(1.2)'
                      }}
                    />
                    <span style={{ fontWeight: 'bold' }}>
                      เพิ่ม Watermark (วันเวลา + ตำแหน่ง)
                    </span>
                  </label>
                  
                  {/* ปุ่มดำเนินการต่อ */}
                  <button
                    onClick={proceedWithFileSelection}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>🖼️</span>
                    เลือกรูปจากแกลลอรี
                  </button>
                </div>

                <button
                  onClick={cancelCapture}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ยกเลิก
                </button>
              </div>
            ) : null}
          </>
        )
      ) : null}

      {/* Captured Photos Management - แสดงตามลำดับที่ถูกต้อง */}
      {sortedPhotosForDisplay.length > 0 && (
        <div style={{ 
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '15px'
          }}>
            <h3 style={{ margin: 0, color: '#495057' }}>
              {/* 🔥 แก้ไข: แสดงทั้งจำนวนหัวข้อไม่ซ้ำ และรูปทั้งหมด */}
              📋 รูปที่ถ่ายแล้ว ({getUniqueTopicsCount()} หัวข้อ, {sortedPhotosForDisplay.length} รูป)
            </h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={uploadAllPhotos}
                disabled={isUploading}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  opacity: isUploading ? 0.6 : 1,
                  fontWeight: 'bold'
                }}
              >
                {isUploading ? 'กำลังส่ง...' : `📤 บันทึกทั้งหมด`}
              </button>
              
              <button 
                onClick={clearAllPhotos}
                disabled={isUploading}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  opacity: isUploading ? 0.6 : 1
                }}
              >
                🗑️ ลบทั้งหมด
              </button>
            </div>
          </div>

          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
            gap: '12px' 
          }}>
            {sortedPhotosForDisplay.map((photo, index) => (
              <div key={photo.id} style={{
                border: '1px solid #ddd',
                borderRadius: '6px',
                overflow: 'hidden',
                backgroundColor: 'white',
                position: 'relative',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                <img 
                  src={photo.url}
                  alt={photo.topic}
                  style={{
                    width: '100%',
                    height: '90px',
                    objectFit: 'cover',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    const newWindow = window.open('', '_blank');
                    
                    // 🔥 NEW: แสดง dynamic fields ใน popup
                    const fieldsDisplay = Object.entries(photo.dynamicFields || {})
                      .filter(([key, value]) => value && value.trim())
                      .map(([key, value]) => `${key}: ${value}`)
                      .join('<br/>');
                    
                    // 🔥 NEW: แสดงข้อมูล source และ watermark
                    const sourceInfo = photo.sourceType === 'camera' ? 
                      '📷 ถ่ายรูปใหม่' : '🖼️ แนบจากแกลลอรี';
                    const watermarkInfo = photo.hasWatermark ? 
                      '🏷️ มี Watermark' : '📷 ไม่มี Watermark';
                    
                    newWindow.document.write(`
                      <html>
                        <head><title>${photo.topic}</title></head>
                        <body style="margin:0; padding:20px; text-align:center; background:#f5f5f5;">
                          <h3>${photo.displayOrder || 'N/A'}. ${photo.topic}</h3>
                          <img src="${photo.url}" style="max-width:100%; height:auto;" />
                          <p style="margin-top:10px; font-size:14px; color:#666;">
                            ${fieldsDisplay}<br/>
                            หมวดงาน: ${photo.category}<br/>
                            ${sourceInfo} | ${watermarkInfo}<br/>
                            ${new Date(photo.timestamp).toLocaleString('th-TH')}
                          </p>
                        </body>
                      </html>
                    `);
                  }}
                />
                <div style={{
                  padding: '6px',
                  fontSize: '11px',
                  textAlign: 'center',
                  backgroundColor: '#f8f9fa',
                  borderTop: '1px solid #ddd',
                  minHeight: '45px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px'
                }}>
                  <div style={{ fontWeight: 'bold' }}>
                    <strong>{photo.displayOrder || 'N/A'}.</strong> {photo.topic}
                  </div>
                  {/* 🔥 NEW: Source และ Watermark indicators */}
                  <div style={{ 
                    fontSize: '10px', 
                    color: '#666',
                    display: 'flex',
                    gap: '4px',
                    alignItems: 'center'
                  }}>
                    <span>{photo.sourceType === 'camera' ? '📷' : '🖼️'}</span>
                    <span>{photo.hasWatermark ? '🏷️' : '❌'}</span>
                  </div>
                </div>
                <button
                  onClick={() => removePhoto(photo.id)}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '22px',
                    height: '22px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Camera;