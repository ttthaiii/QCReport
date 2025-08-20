import React, { useState, useRef, useEffect } from 'react';
import { addWatermark, formatThaiDateTime } from '../utils/watermark';
import { api } from '../utils/api';

const Camera = () => {
  // Form States - 3-level structure: mainCategory > subCategory > topics
  const [qcTopics, setQcTopics] = useState({}); // 🔥 3-level nested object
  const [masterData, setMasterData] = useState({
    buildings: [],
    foundations: [],
    combinations: []
  });
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(false);
  const [formData, setFormData] = useState({
    mainCategory: '',      // หมวดหลัก (โครงสร้าง/สถาปัตย์)
    subCategory: ''        // หมวดงาน (ฐานราก/เสา/ผนัง ฯลฯ)
  });

  // Dynamic Fields States
  const [categoryFields, setCategoryFields] = useState([]);
  const [dynamicFields, setDynamicFields] = useState({});
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  // Native Camera States
  const [selectedTopic, setSelectedTopic] = useState('');
  const [captureMode, setCaptureMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
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

  // Load field values when workType, category, or fields change
  useEffect(() => {
    if (formData.mainCategory && formData.subCategory && categoryFields.length > 0) {
      loadFieldValues(formData.subCategory, categoryFields);
    }
  }, [formData.mainCategory, formData.subCategory, categoryFields]);

  // Load data on mount
  useEffect(() => {
    loadQCTopics();
    loadMasterData();
    getCurrentLocation();
  }, []);

  // Load category fields when workType AND category change
  useEffect(() => {
    if (formData.subCategory) {
      loadCategoryFields(formData.subCategory);
    } else {
      setCategoryFields([]);
      setDynamicFields({});
    }
  }, [formData.subCategory]);

  // Load progress when dynamic fields and both workType & category are ready
  useEffect(() => {
    if (formData.mainCategory && formData.subCategory && isFieldsComplete()) {
      loadProgress();
    }
  }, [formData.mainCategory, formData.subCategory, dynamicFields]);

  const loadFieldValues = async (subCategory, fields) => {
    try {
      console.log(`📋 Loading field values for sub category: ${subCategory}`);
      const newFieldValues = {};
      
      for (const field of fields) {
        const values = await api.getFieldValues(field.name, subCategory);
        newFieldValues[field.name] = values;
        console.log(`✅ Loaded ${values.length} values for ${field.name} in ${subCategory}`);
      }
      
      setFieldValues(newFieldValues);
    } catch (error) {
      console.error('❌ Error loading field values:', error);
    }
  };

  // 🔥 NEW: Load dynamic fields for selected category
  const loadCategoryFields = async (subCategory) => {
    setIsLoadingFields(true);
    try {
      console.log(`📋 Loading fields for sub category: ${subCategory}`);
      
      const response = await api.getDynamicFields(subCategory);
      if (response.success) {
        setCategoryFields(response.data.fields || []);
        
        // Reset dynamic fields when subCategory changes
        const newDynamicFields = {};
        response.data.fields.forEach(field => {
          newDynamicFields[field.name] = '';
        });
        setDynamicFields(newDynamicFields);
        
        console.log(`✅ Loaded ${response.data.fields.length} fields for ${subCategory}:`, 
                   response.data.fields.map(f => f.name));
      }
    } catch (error) {
      console.error('❌ Error loading category fields:', error);
      // Fallback: create default fields
      setCategoryFields([
        { name: 'อาคาร', type: 'combobox', required: true, placeholder: 'เลือกหรือพิมพ์อาคาร' },
        { name: `${subCategory}เบอร์`, type: 'combobox', required: true, placeholder: `เลือกหรือพิมพ์เลข${subCategory}` }
      ]);
      setDynamicFields({ 'อาคาร': '', [`${subCategory}เบอร์`]: '' });
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
    if (!formData.mainCategory || !formData.subCategory || categoryFields.length === 0) return false;
    
    // Check that all required fields have values
    return categoryFields.every(field => {
      if (field.required) {
        const value = dynamicFields[field.name];
        return value && value.trim();
      }
      return true;
    });
  };

  // 🔥 NEW: Get field options from master data
  const getFieldOptions = (fieldName) => {
    // Use field values loaded from backend
    if (fieldValues[fieldName]) {
      return fieldValues[fieldName];
    }
    
    // Fallback: use master data
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
      const masterDataFields = convertDynamicFieldsToMasterData(formData.category, dynamicFields);
      
      console.log(`Auto-adding master data:`, masterDataFields);
      
      const response = await api.addMasterData(
        masterDataFields.building, 
        masterDataFields.foundation
      );
      
      if (response.success && !response.data.duplicate) {
        await loadMasterData();
        console.log(`Auto-added: ${masterDataFields.building}-${masterDataFields.foundation}`);
      }
    } catch (error) {
      console.error('Auto-add error:', error);
    }
  };

  // 🔥 NEW: Convert dynamic fields to master data format
  const convertDynamicFieldsToMasterData = (subCategory, fields) => {
    if (subCategory === 'ฐานราก') {
      return {
        building: fields['อาคาร'] || '',
        foundation: fields['ฐานรากเบอร์'] || ''
      };
    }
    
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
      console.log('📊 Loading QC topics with 3-level structure...');
      const response = await api.getQCTopics();
      if (response.success) {
        setQcTopics(response.data);
        
        // Set default selections from first available options (3-level)
        const mainCategories = Object.keys(response.data);
        if (mainCategories.length > 0) {
          const firstMainCategory = mainCategories[0];
          const subCategories = Object.keys(response.data[firstMainCategory] || {});
          
          setFormData({
            mainCategory: firstMainCategory,      // หมวดหลัก
            subCategory: subCategories.length > 0 ? subCategories[0] : ''  // หมวดงาน
          });
          
          console.log(`✅ Set default: ${firstMainCategory} > ${subCategories[0] || 'none'}`);
        }
      }
    } catch (error) {
      console.error('❌ Error loading QC topics:', error);
      alert('ไม่สามารถโหลดหัวข้อการตรวจ QC ได้');
    }
  };

  const loadProgress = async () => {
    if (!formData.mainCategory || !formData.subCategory || !isFieldsComplete()) {
      setCompletedTopics(new Set());
      return;
    }
    
    setIsLoadingProgress(true);
    try {
      console.log(`📊 Loading progress for: ${formData.mainCategory} > ${formData.subCategory}`);
      const masterDataFields = convertDynamicFieldsToMasterData(formData.subCategory, dynamicFields);
      
      const response = await api.getCompletedTopicsFullMatch({
        building: masterDataFields.building,
        foundation: masterDataFields.foundation,
        mainCategory: formData.mainCategory,     // หมวดหลัก
        subCategory: formData.subCategory,       // หมวดงาน
        dynamicFields: dynamicFields
      });
      
      if (response.success) {
        const completedTopicsArray = response.data.completedTopics || [];
        setCompletedTopics(new Set(completedTopicsArray));
        console.log(`✅ Progress loaded: ${completedTopicsArray.length} completed topics`);
      } else {
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
    if (!formData.mainCategory || !formData.subCategory || !isFieldsComplete()) {
      alert('กรุณาเลือกหมวดหลัก หมวดงาน และกรอกข้อมูลให้ครบถ้วน');
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
        `หมวด: ${formData.mainCategory} > ${formData.subCategory}\n` +
        `${photoCount > 0 ? `มีรูปอยู่แล้ว: ${photoCount} รูป` : 'มีข้อมูลในระบบแล้ว'}${serverStatus}\n\n` +
        `❓ ต้องการถ่ายรูปใหม่หรือไม่?\n\n` +
        `✅ ตกลง = ถ่ายใหม่ (รูปใหม่จะใช้ในรายงาน)\n` +
        `❌ ยกเลิก = ไม่ถ่าย`
      );
      
      if (!confirmed) {
        console.log(`User cancelled duplicate photo for topic: ${topic}`);
        return; // ยกเลิกการถ่าย
      }
      
      console.log(`User confirmed duplicate photo for topic: ${topic}`);
    }

    console.log(`Selected topic: ${topic} in ${formData.mainCategory} > ${formData.subCategory}`, dynamicFields);
    
    // Auto-add ข้อมูลใหม่ (ถ้ามี) ก่อนถ่ายรูป
    await autoAddNewData();
    
    setSelectedTopic(topic);
    setCaptureMode(true);
    
    // Trigger native camera input
    setTimeout(() => {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      }
    }, 100);
  };

  // Handle native camera file selection
  const handleCameraInput = async (event) => {
    const file = event.target.files[0];
    if (!file || !selectedTopic) {
      console.log('No file selected or no topic selected');
      return;
    }

    console.log('File selected:', {
      name: file.name,
      size: file.size,
      type: file.type,
      topic: selectedTopic
    });

    setIsProcessing(true);

    try {
      // Process image: resize + crop + watermark
      const processedBlob = await processImageForQC(file);
      
      const masterDataFields = convertDynamicFieldsToMasterData(formData.subCategory, dynamicFields);
      
      const photoData = {
        id: Date.now() + Math.random(),
        blob: processedBlob,
        url: URL.createObjectURL(processedBlob),
        building: masterDataFields.building,
        foundation: masterDataFields.foundation,
        mainCategory: formData.mainCategory,    // หมวดหลัก
        subCategory: formData.subCategory,      // หมวดงาน
        topic: selectedTopic,
        location: currentLocation,
        timestamp: new Date().toISOString(),
        dimensions: '1600x1200',
        dynamicFields: { ...dynamicFields }
      };

      // 🔥 เก็บรูปทุกรูป (ไม่แทนที่) เพื่อให้มี history
      setCapturedPhotos(prev => [...prev, photoData]);
      
      // Update completed topics
      setCompletedTopics(prev => new Set([...prev, selectedTopic]));
      
      console.log(`Photo added for topic: ${selectedTopic}`);
      
      // Reset camera state
      resetCameraState();
      
      // 🔥 แก้ไขข้อความแจ้งเตือน - แสดงจำนวนหัวข้อที่ไม่ซ้ำ
      const currentUniqueTopics = new Set([...capturedPhotos.map(p => p.topic), selectedTopic]).size;
      const currentTotalPhotos = capturedPhotos.length + 1;
      
      alert(
        `✅ ถ่ายรูป "${selectedTopic}" เรียบร้อย!\n` +
        `📏 ขนาด: 1600×1200\n` +
        `📷 หัวข้อที่ถ่ายแล้ว: ${currentUniqueTopics} หัวข้อ\n` +
        `🔢 รูปทั้งหมด: ${currentTotalPhotos} รูป`
      );

    } catch (error) {
      console.error('Error processing image:', error);
      alert('เกิดข้อผิดพลาดในการประมวลผลรูป: ' + error.message);
      resetCameraState();
    } finally {
      setIsProcessing(false);
    }
  };


  // Process image for QC (resize + crop + watermark)
  const processImageForQC = async (imageFile) => {
    console.log('Starting image processing...');
    
    const resizedBlob = await resizeAndCropImage(imageFile, 1600, 1200);
    console.log('Image resized and cropped');
    
    const watermarkText = formatThaiDateTime();
    const location = currentLocation || 'ไม่สามารถระบุตำแหน่งได้';
    const watermarkedBlob = await addWatermark(resizedBlob, watermarkText, location);
    console.log('Watermark added');
    
    return watermarkedBlob;
  };

  // Resize and crop image to target dimensions (4:3 ratio)
  const resizeAndCropImage = (imageFile, targetWidth, targetHeight) => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        try {
          const targetRatio = targetWidth / targetHeight;
          const imageWidth = img.width;
          const imageHeight = img.height;
          const imageRatio = imageWidth / imageHeight;
          
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          
          let sourceX = 0, sourceY = 0, sourceWidth = imageWidth, sourceHeight = imageHeight;
          
          if (imageRatio > targetRatio) {
            sourceWidth = imageHeight * targetRatio;
            sourceX = (imageWidth - sourceWidth) / 2;
          } else {
            sourceHeight = imageWidth / targetRatio;
            sourceY = (imageHeight - sourceHeight) / 2;
          }
          
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          
          ctx.drawImage(
            img,
            sourceX, sourceY, sourceWidth, sourceHeight,
            0, 0, targetWidth, targetHeight
          );
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob from canvas'));
            }
          }, 'image/jpeg', 0.9);
          
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
    
    // Reset file input
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
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
            mainCategory: photo.mainCategory,    // หมวดหลัก
            subCategory: photo.subCategory,      // หมวดงาน  
            topic: photo.topic,
            location: photo.location,
            dynamicFields: photo.dynamicFields
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
    if (!formData.mainCategory || !formData.subCategory) {
      return { completed: 0, total: 0, percentage: 0 };
    }
    
    const currentTopics = qcTopics[formData.mainCategory]?.[formData.subCategory] || [];
    const completed = currentTopics.filter(topic => completedTopics.has(topic)).length;
    const total = currentTopics.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  };

  // ฟังก์ชันเรียงรูปตามลำดับหัวข้อสำหรับการแสดงผล
  const getSortedPhotosForDisplay = () => {
    if (!formData.mainCategory || !formData.subCategory || !qcTopics[formData.mainCategory]?.[formData.subCategory]) {
      return capturedPhotos;
    }
    
    const orderedTopics = qcTopics[formData.mainCategory][formData.subCategory];
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
          
          {/* Main Category Select */}
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              หมวดหลัก:
            </label>
            <select 
              value={formData.mainCategory}
              onChange={(e) => {
                const newMainCategory = e.target.value;
                setFormData(prev => ({ 
                  ...prev, 
                  mainCategory: newMainCategory,
                  subCategory: '' // Reset sub category when main category changes
                }));
              }}
              style={{ 
                width: '100%', 
                padding: '8px', 
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}
              disabled={captureMode}
            >
              <option value="">เลือกหมวดหลัก...</option>
              {Object.keys(qcTopics).map(mainCategory => (
                <option key={mainCategory} value={mainCategory}>{mainCategory}</option>
              ))}
            </select>
          </div>

          {/* Sub Category Select */}
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              หมวดงาน:
            </label>
            <select 
              value={formData.subCategory}
              onChange={(e) => setFormData(prev => ({ ...prev, subCategory: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '8px', 
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}
              disabled={captureMode || !formData.mainCategory}
            >
              <option value="">เลือกหมวดงาน...</option>
              {formData.mainCategory && qcTopics[formData.mainCategory] && 
                Object.keys(qcTopics[formData.mainCategory]).map(subCategory => (
                  <option key={subCategory} value={subCategory}>{subCategory}</option>
                ))
              }
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
            {`กำลังโหลด fields สำหรับ ${formData.mainCategory} > ${formData.subCategory}...`}
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
        onChange={handleCameraInput}
      />

      {/* Main Content: Topic Selection OR Processing */}
      {!captureMode ? (
        // Topic Selection Mode
        <>
          {formData.mainCategory && formData.subCategory && isFieldsComplete() && qcTopics[formData.mainCategory]?.[formData.subCategory] ? (
            <div style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              backgroundColor: '#ffffff', 
              borderRadius: '8px',
              border: '1px solid #dee2e6'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#495057' }}>
                🔍 เลือกหัวข้อที่ต้องการถ่าย (คลิก = เปิดกล้องมือถือ):
              </h3>
              
              <div style={{ 
                marginBottom: '10px', 
                fontSize: '14px', 
                color: '#666',
                fontWeight: 'bold'
              }}>
                📁 {formData.mainCategory} → 📂 {formData.subCategory}
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                gap: '10px' 
              }}>
                {qcTopics[formData.mainCategory][formData.subCategory].map((topic, index) => {
                  const isCompleted = completedTopics.has(topic);
                  const photosForThisTopic = sortedPhotosForDisplay.filter(p => p.topic === topic);
                  
                  // 🔥 ลดรูปแบบการแสดงผล - ไม่แสดงสถานะซ้ำ
                  let backgroundColor = isCompleted ? '#e8f5e8' : '#ffffff'; // เขียว = เสร็จ, ขาว = ยังไม่เสร็จ
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
                            {/* 🔥 ลบข้อความ "(ล่าสุดใช้ในรายงาน)" ออก */}
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
              ⚠️ กรุณาเลือกหมวดหลัก → หมวดงาน และกรอกข้อมูลให้ครบถ้วนเพื่อแสดงรายการหัวข้อ
              {!formData.mainCategory && <div style={{ fontSize: '12px', marginTop: '5px' }}>🔸 ยังไม่ได้เลือกหมวดหลัก</div>}
              {formData.mainCategory && !formData.subCategory && <div style={{ fontSize: '12px', marginTop: '5px' }}>🔸 ยังไม่ได้เลือกหมวดงาน</div>}
              {formData.mainCategory && formData.subCategory && !isFieldsComplete() && <div style={{ fontSize: '12px', marginTop: '5px' }}>🔸 ยังไม่ได้กรอกข้อมูลให้ครบ</div>}
            </div>
          )}
        </>
      ) : (
        // Camera Capture Mode
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
                Resize → Crop → Watermark
              </p>
              <div style={{ marginTop: '15px', fontSize: '12px', color: '#999' }}>
                กรุณารอสักครู่...
              </div>
            </div>
          ) : (
            // Waiting for Camera Input
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              backgroundColor: '#fff3cd',
              borderRadius: '8px',
              border: '1px solid #ffeaa7'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>📱</div>
              <h3 style={{ color: '#856404', marginBottom: '10px' }}>
                รอการถ่ายรูป "{selectedTopic}"
              </h3>
              <p style={{ color: '#856404', fontSize: '14px', marginBottom: '15px' }}>
                แอปกล้องควรเปิดขึ้นมาอัตโนมัติ
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
          )}
        </>
      )}

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
                    
                    // 🔥 UPDATED: แสดง dynamic fields และ 3-level structure ใน popup
                    const fieldsDisplay = Object.entries(photo.dynamicFields || {})
                      .filter(([key, value]) => value && value.trim())
                      .map(([key, value]) => `${key}: ${value}`)
                      .join('<br/>');
                    
                    newWindow.document.write(`
                      <html>
                        <head><title>${photo.topic}</title></head>
                        <body style="margin:0; padding:20px; text-align:center; background:#f5f5f5;">
                          <h3>${photo.displayOrder || 'N/A'}. ${photo.topic}</h3>
                          <img src="${photo.url}" style="max-width:100%; height:auto;" />
                          <p style="margin-top:10px; font-size:14px; color:#666;">
                            ${fieldsDisplay}<br/>
                            หมวดหลัก: ${photo.mainCategory || 'N/A'}<br/>
                            หมวดงาน: ${photo.subCategory || photo.category || 'N/A'}<br/>
                            ${new Date(photo.timestamp).toLocaleString('th-TH')}
                          </p>
                        </body>
                      </html>
                    `);
                  }}
                />
                <div style={{
                  padding: '8px',
                  fontSize: '11px',
                  textAlign: 'center',
                  backgroundColor: '#f8f9fa',
                  borderTop: '1px solid #ddd',
                  minHeight: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <strong>{photo.displayOrder || 'N/A'}.</strong> {photo.topic}
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