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
  
  // 🔥 NEW: Dynamic Categories State
  const [categories, setCategories] = useState([]);
  const [categoryConfigs, setCategoryConfigs] = useState({});
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  
  const [formData, setFormData] = useState({
    building: '',
    foundation: '',
    category: ''
  });

  // 🔥 NEW: Dynamic Fields State (แทน inputValues)
  const [dynamicFields, setDynamicFields] = useState({});

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
  
  // Native Camera Input Ref
  const cameraInputRef = useRef(null);

  // Load data on mount
  useEffect(() => {
    loadQCTopics();
    loadCategories(); // 🔥 NEW
    getCurrentLocation();
  }, []);

  // 🔥 Load master data when category changes
  useEffect(() => {
    if (formData.category) {
      loadMasterDataForCategory(formData.category);
    }
  }, [formData.category]);

  // Load category config when category changes
  useEffect(() => {
    if (formData.category) {
      loadCategoryConfig(formData.category);
    }
  }, [formData.category]);

  // Load progress when form data changes
  useEffect(() => {
    if (formData.category && isFormValid()) {
      loadProgress();
    }
  }, [formData.category, dynamicFields]);

  // 🔥 NEW: Load categories and configs
  const loadCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const response = await api.getCategories();
      if (response.success) {
        setCategories(response.data);
        // Set default category
        if (response.data.length > 0) {
          setFormData(prev => ({ ...prev, category: response.data[0] }));
        }
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

  // 🔥 UPDATED: Check if form is valid (support both legacy and dynamic)
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
      // Legacy validation (ฐานราก) - ใช้ formData.building และ formData.foundation
      return formData.building && formData.foundation;
    }
  };

  // 🔥 NEW: Get current data for upload/progress
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

  // Load Functions
  // 🔥 NEW: Get options for dynamic field (จาก masterData หรือ existing values)
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

  // 🔥 NEW: Load master data by category (แก้ไขให้รองรับ dynamic structure)
  const loadMasterDataForCategory = async (category) => {
    console.log('🔍 DEBUG: loadMasterDataForCategory called with:', category);
    
    if (!category) {
      console.log('🔍 DEBUG: No category provided, returning');
      return;
    }
    
    setIsLoadingMasterData(true);
    try {
      console.log('🔍 DEBUG: About to call api.getMasterDataByCategory');
      const response = await api.getMasterDataByCategory(category);
      console.log('🔍 DEBUG: API response:', response);
      
      if (response.success) {
        if (category === 'ฐานราก') {
          // Legacy format - ใช้ตรงๆ
          console.log('🔍 DEBUG: Using legacy format for ฐานราก');
          setMasterData(response.data);
        } else {
          // Dynamic format - เก็บทั้ง legacy format และ dynamic structure
          console.log('🔍 DEBUG: Processing dynamic format for category:', category);
          
          const dynamicMasterData = {
            // Legacy compatibility (สำหรับ UI ที่ยังใช้ buildings/foundations)
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
          
          console.log('🔍 DEBUG: Processed dynamic master data:', dynamicMasterData);
          setMasterData(dynamicMasterData);
        }
      }
    } catch (error) {
      console.error(`🔍 DEBUG: Error loading master data for ${category}:`, error);
      // Set empty data structure to allow user input
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

  const loadProgress = async () => {
    const currentData = getCurrentData();
    
    setIsLoadingProgress(true);
    try {
      const response = await api.getCompletedTopics({
        building: currentData.building,
        foundation: currentData.foundation,
        category: currentData.category
      });
      
      if (response.success) {
        setCompletedTopics(new Set(response.data.completedTopics || []));
      }
    } catch (error) {
      console.error('Error loading progress:', error);
    } finally {
      setIsLoadingProgress(false);
    }
  };

  // 🔥 UPDATED: Auto-add master data with hybrid approach (enhanced debugging)
  const autoAddNewData = async (currentData) => {
    console.log('🔍 CAMERA DEBUG: autoAddNewData called with:', currentData);
    console.log('🔍 CAMERA DEBUG: masterData state:', masterData);
    
    try {
      if (currentData.category === 'ฐานราก') {
        // Legacy approach
        console.log('🔍 CAMERA DEBUG: Using legacy path for ฐานราก');
        
        const isNewBuilding = currentData.building && !masterData.buildings.includes(currentData.building.trim());
        const isNewFoundation = currentData.foundation && !masterData.foundations.includes(currentData.foundation.trim());
        
        console.log('🔍 CAMERA DEBUG: isNewBuilding:', isNewBuilding, 'isNewFoundation:', isNewFoundation);
        console.log('🔍 CAMERA DEBUG: masterData.buildings:', masterData.buildings);
        console.log('🔍 CAMERA DEBUG: masterData.foundations:', masterData.foundations);
        console.log('🔍 CAMERA DEBUG: currentData.building:', currentData.building);
        console.log('🔍 CAMERA DEBUG: currentData.foundation:', currentData.foundation);
        
        if (isNewBuilding || isNewFoundation) {
          console.log(`🔍 CAMERA DEBUG: Auto-adding legacy: ${currentData.building}-${currentData.foundation}`);
          
          const response = await api.addMasterData(currentData.building.trim(), currentData.foundation.trim());
          console.log('🔍 CAMERA DEBUG: addMasterData response:', response);
          
          if (response.success && !response.data.duplicate) {
            console.log('🔍 CAMERA DEBUG: Reloading master data for category:', currentData.category);
            await loadMasterDataForCategory(currentData.category);
            console.log(`✅ Auto-added legacy: ${currentData.building}-${currentData.foundation}`);
          } else {
            console.log('🔍 CAMERA DEBUG: Data was duplicate or failed:', response);
          }
        } else {
          console.log('🔍 CAMERA DEBUG: No new data to add for legacy category');
        }
      } else if (currentData.dynamicFields) {
        // Dynamic approach - เช็คว่ามีข้อมูลใหม่หรือไม่
        console.log('🔍 CAMERA DEBUG: Using dynamic path for:', currentData.category);
        console.log('🔍 CAMERA DEBUG: dynamicFields:', currentData.dynamicFields);
        
        // Check if any field has new values
        const hasNewData = Object.entries(currentData.dynamicFields).some(([fieldName, fieldValue]) => {
          const existingValues = masterData.uniqueValues[fieldName] || [];
          const isNew = fieldValue && fieldValue.trim() && !existingValues.includes(fieldValue.trim());
          console.log(`🔍 CAMERA DEBUG: Field ${fieldName}: ${fieldValue} - isNew: ${isNew}`);
          return isNew;
        });
        
        console.log('🔍 CAMERA DEBUG: hasNewData:', hasNewData);
        
        if (hasNewData) {
          const response = await api.addDynamicMasterData(currentData.category, currentData.dynamicFields);
          console.log('🔍 CAMERA DEBUG: addDynamicMasterData response:', response);
          
          if (response.success && !response.data.duplicate) {
            await loadMasterDataForCategory(currentData.category);
            console.log(`✅ Auto-added dynamic for ${currentData.category}:`, currentData.dynamicFields);
          } else {
            console.log('🔍 CAMERA DEBUG: Dynamic data was duplicate or failed:', response);
          }
        } else {
          console.log('🔍 CAMERA DEBUG: No new dynamic data to add');
        }
      } else {
        console.log('🔍 CAMERA DEBUG: No dynamic fields provided for dynamic category');
      }
    } catch (error) {
      console.error('🔍 CAMERA DEBUG: Auto-add error:', error);
      // ไม่แสดง error ให้ user เพื่อไม่ให้รบกวนการทำงาน
    }
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

  // 🔥 UPDATED: Topic selection with hybrid auto-add
  const selectTopicAndOpenCamera = async (topic) => {
    if (!isFormValid()) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    const currentData = getCurrentData();
    console.log(`Selected topic: ${topic}`, currentData);
    
    // Auto-add with hybrid approach
    await autoAddNewData(currentData);
    
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
      
      // Get current data
      const currentData = getCurrentData();
      
      // Add directly to captured photos
      const photoData = {
        id: Date.now() + Math.random(),
        blob: processedBlob,
        url: URL.createObjectURL(processedBlob),
        ...currentData,
        topic: selectedTopic,
        location: currentLocation,
        timestamp: new Date().toISOString(),
        dimensions: '1600x1200'
      };

      // Add to captured photos array
      setCapturedPhotos(prev => [...prev, photoData]);
      
      // Update completed topics
      setCompletedTopics(prev => new Set([...prev, selectedTopic]));
      
      console.log(`Photo added directly for topic: ${selectedTopic}`);
      
      // Reset camera state
      resetCameraState();
      
      alert(`✅ ถ่ายรูป "${selectedTopic}" เรียบร้อย!\n📏 ขนาด: 1600×1200\n📷 รูปทั้งหมด: ${capturedPhotos.length + 1} รูป`);

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
    
    // Reset file input
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  // 🔥 UPDATED: Upload all photos with hybrid system
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
          let result;
          
          if (photo.dynamicFields) {
            // 🔥 Use dynamic upload for dynamic categories
            result = await api.uploadPhotoDynamic(photo.blob, {
              category: photo.category,
              dynamicFields: photo.dynamicFields,
              topic: photo.topic,
              location: photo.location
            });
          } else {
            // Use legacy upload for ฐานราก
            result = await api.uploadPhoto(photo.blob, {
              building: photo.building,
              foundation: photo.foundation,
              category: photo.category,
              topic: photo.topic,
              location: photo.location
            });
          }
          
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

  const progressStats = getProgressStats();

  // 🔥 NEW: Render form based on category type
  const renderForm = () => {
    if (!formData.category) {
      return (
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
          ⚠️ กรุณาเลือกหมวดงานก่อน
        </div>
      );
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
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          
          {/* Building Combobox */}
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              อาคาร:
            </label>
            <input
              list="buildings-list"
              value={formData.building || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, building: e.target.value }))}
              placeholder="เลือกหรือพิมพ์ชื่ออาคาร เช่น A, B, C"
              style={{ 
                width: '100%', 
                padding: '8px', 
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                backgroundColor: 'white'
              }}
              disabled={captureMode}
            />
            <datalist id="buildings-list">
              {masterData.buildings.map(building => (
                <option key={building} value={building} />
              ))}
            </datalist>
          </div>

          {/* Foundation Input */}
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              ฐานราก:
            </label>
            <input
              list="foundations-list"
              value={formData.foundation || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, foundation: e.target.value }))}
              placeholder="เลือกหรือพิมพ์เลขฐานราก เช่น F01, F02"
              style={{ 
                width: '100%', 
                padding: '8px', 
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                backgroundColor: 'white'
              }}
              disabled={captureMode}
            />
            <datalist id="foundations-list">
              {masterData.foundations.map(foundation => (
                <option key={foundation} value={foundation} />
              ))}
            </datalist>
          </div>
        </div>
        
        {/* Legacy Status Message */}
        <div style={{ 
          marginTop: '15px', 
          padding: '10px', 
          backgroundColor: '#d4edda', 
          borderRadius: '5px',
          border: '1px solid #c3e6cb',
          fontSize: '14px',
          color: '#155724'
        }}>
          <span style={{ marginRight: '8px' }}>✅</span>
          ใช้ระบบเดิมสำหรับหมวดงาน "ฐานราก"
        </div>
      </div>
    );
  };

  // 🔥 DYNAMIC FORM: เสา, คาน, etc.
  const renderDynamicForm = (config) => {
    return (
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          
          {config.fields.map((field, index) => (
            <div key={field.name}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                {field.name}:
                {field.required && <span style={{ color: 'red' }}> *</span>}
              </label>
              <input
                type={field.type}
                value={dynamicFields[field.name] || ''}
                onChange={(e) => setDynamicFields(prev => ({
                  ...prev,
                  [field.name]: e.target.value
                }))}
                placeholder={field.placeholder}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  fontSize: '14px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
                disabled={captureMode}
              />
            </div>
          ))}
        </div>
        
        {/* Dynamic Status Message */}
        <div style={{ 
          marginTop: '15px', 
          padding: '10px', 
          backgroundColor: '#d1ecf1', 
          borderRadius: '5px',
          border: '1px solid #bee5eb',
          fontSize: '14px',
          color: '#0c5460'
        }}>
          <span style={{ marginRight: '8px' }}>✨</span>
          ใช้ระบบใหม่สำหรับหมวดงาน "{formData.category}" ({config.fields.length} ฟิลด์)
        </div>
      </div>
    );
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
            {capturedPhotos.length > 0 && ` | 📷 ถ่ายแล้ว: ${capturedPhotos.length} รูป`}
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
      
      {/* Category Selection */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
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
              padding: '8px', 
              fontSize: '14px',
              border: '1px solid #ced4da',
              borderRadius: '4px'
            }}
            disabled={captureMode || isLoadingCategories}
          >
            <option value="">เลือกหมวดงาน...</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          {isLoadingCategories && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              กำลังโหลดหมวดงาน...
            </div>
          )}
        </div>
      </div>
      
      {/* 🔥 HYBRID FORM: Conditional rendering */}
      {renderForm()}

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
          {formData.category && qcTopics[formData.category] && isFormValid() ? (
            <div style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              backgroundColor: '#ffffff', 
              borderRadius: '8px',
              border: '1px solid #dee2e6'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#495057' }}>
                📝 เลือกหัวข้อที่ต้องการถ่าย (คลิก = เปิดกล้องมือถือ):
              </h3>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                gap: '10px' 
              }}>
                {qcTopics[formData.category].map((topic, index) => {
                  const isCompleted = completedTopics.has(topic);
                  const photosForThisTopic = capturedPhotos.filter(p => p.topic === topic);
                  
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
                        backgroundColor: isCompleted ? '#e8f5e8' : '#ffffff',
                        color: isCompleted ? '#2e7d32' : '#495057',
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
                        e.target.style.backgroundColor = isCompleted ? '#e8f5e8' : '#ffffff';
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
                        {isCompleted ? (
                          <span style={{ fontSize: '16px', color: '#28a745' }}>✅</span>
                        ) : (
                          <span style={{ fontSize: '16px', color: '#007bff' }}>📷</span>
                        )}
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
              ⚠️ กรุณากรอกข้อมูลให้ครบถ้วนเพื่อแสดงรายการหัวข้อ
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

      {/* Captured Photos Management */}
      {capturedPhotos.length > 0 && (
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
              📋 รูปที่ถ่ายแล้ว ({capturedPhotos.length} รูป)
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
            {capturedPhotos.map((photo, index) => (
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
                    // Show photo details based on category type
                    const photoDetails = photo.dynamicFields ? 
                      Object.entries(photo.dynamicFields).map(([key, value]) => `${key}: ${value}`).join(', ') :
                      `${photo.building} - ${photo.foundation}`;
                      
                    const newWindow = window.open('', '_blank');
                    newWindow.document.write(`
                      <html>
                        <head><title>${photo.topic}</title></head>
                        <body style="margin:0; padding:20px; text-align:center; background:#f5f5f5;">
                          <h3>${photo.topic}</h3>
                          <img src="${photo.url}" style="max-width:100%; height:auto;" />
                          <p style="margin-top:10px; font-size:14px; color:#666;">
                            ${photoDetails}<br/>
                            หมวดงาน: ${photo.category}<br/>
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
                  <strong>{index + 1}.</strong> {photo.topic}
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