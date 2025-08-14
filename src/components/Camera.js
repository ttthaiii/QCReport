import React, { useState, useRef, useEffect } from 'react';
import { addWatermark, formatThaiDateTime } from '../utils/watermark';
import { api } from '../utils/api';

const Camera = () => {
  // Form States (เดิม)
  const [qcTopics, setQcTopics] = useState({});
  const [masterData, setMasterData] = useState({
    buildings: [],
    foundations: [],
    combinations: []
  });
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(false);
  const [formData, setFormData] = useState({
    building: '',
    foundation: '',
    category: ''
  });
  const [inputMode, setInputMode] = useState({
    building: 'select',
    foundation: 'select'
  });
  const [newInputs, setNewInputs] = useState({
    building: '',
    foundation: ''
  });

  // 🔥 NEW: Native Camera States (แทน camera stream states)
  const [selectedTopic, setSelectedTopic] = useState(''); // หัวข้อที่เลือก
  const [captureMode, setCaptureMode] = useState(false); // โหมดถ่ายรูป
  const [isProcessing, setIsProcessing] = useState(false); // กำลัง process รูป
  
  // Multiple Photos System (เก็บรูปสะสม - เดิม)
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Progress Tracking (เดิม)
  const [completedTopics, setCompletedTopics] = useState(new Set());
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  
  // Geolocation states (เดิม)
  const [currentLocation, setCurrentLocation] = useState('กำลังหาตำแหน่ง...');
  const [cachedLocation, setCachedLocation] = useState(null);
  const [lastPosition, setLastPosition] = useState(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // 🔥 Native Camera Input Ref
  const cameraInputRef = useRef(null);

  // Load data on mount (เดิม)
  useEffect(() => {
    loadQCTopics();
    loadMasterData();
    getCurrentLocation();
  }, []);

  // Load progress when building/foundation/category changes (เดิม)
  useEffect(() => {
    if (formData.building && formData.foundation && formData.category) {
      loadProgress();
    }
  }, [formData.building, formData.foundation, formData.category]);

  // Load Functions (เดิม - ไม่แก้ไข)
  const loadMasterData = async () => {
    setIsLoadingMasterData(true);
    try {
      const response = await api.getMasterData();
      if (response.success) {
        setMasterData(response.data);
        if (response.data.buildings.length > 0) {
          setFormData(prev => ({ ...prev, building: response.data.buildings[0] }));
        }
        if (response.data.foundations.length > 0) {
          setFormData(prev => ({ ...prev, foundation: response.data.foundations[0] }));
        }
      }
    } catch (error) {
      console.error('Error loading master data:', error);
    } finally {
      setIsLoadingMasterData(false);
    }
  };

  const addNewMasterData = async () => {
    const building = newInputs.building.trim();
    const foundation = newInputs.foundation.trim();
    
    if (!building || !foundation) {
      alert('กรุณากรอกชื่ออาคารและเลขฐานรากให้ครบถ้วน');
      return;
    }
    
    try {
      setIsUploading(true);
      const response = await api.addMasterData(building, foundation);
      
      if (response.success) {
        if (response.data.duplicate) {
          alert('ข้อมูลนี้มีอยู่แล้วในระบบ');
        } else {
          alert('เพิ่มข้อมูลใหม่สำเร็จ!');
        }
        
        await loadMasterData();
        setFormData(prev => ({ ...prev, building: building, foundation: foundation }));
        setInputMode({ building: 'select', foundation: 'select' });
        setNewInputs({ building: '', foundation: '' });
      } else {
        throw new Error('Failed to add master data');
      }
    } catch (error) {
      console.error('Error adding master data:', error);
      alert('เกิดข้อผิดพลาดในการเพิ่มข้อมูล: ' + error.message);
    } finally {
      setIsUploading(false);
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
    if (!formData.building || !formData.foundation || !formData.category) return;
    
    setIsLoadingProgress(true);
    try {
      const response = await api.getCompletedTopics({
        building: formData.building,
        foundation: formData.foundation,
        category: formData.category
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

  // 🔥 NEW: Native Camera Functions

  // One-Click Topic Selection with Native Camera
  const selectTopicAndOpenCamera = (topic) => {
    if (!formData.building || !formData.foundation || !formData.category) {
      alert('กรุณาเลือกข้อมูลให้ครบถ้วน: อาคาร, ฐานราก, และหมวดงาน');
      return;
    }

    console.log(`Selected topic: ${topic}, opening native camera...`);
    
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
      
      // 🔥 NO PREVIEW - Add directly to captured photos
      const photoData = {
        id: Date.now() + Math.random(),
        blob: processedBlob,
        url: URL.createObjectURL(processedBlob),
        building: formData.building,
        foundation: formData.foundation,
        category: formData.category,
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

  // Approve processed photo (REMOVED - No longer needed)

  // Retake photo (REMOVED - No longer needed)

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

  // Upload all photos (เดิม - ไม่แก้ไข)
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
            location: photo.location
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

  // Clear all photos and other utility functions (เดิม - ไม่แก้ไข)
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

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>📸 ถ่ายรูป QC (Native Camera)</h1>
      
      {/* Location Status (เดิม) */}
      <div style={{ 
        marginBottom: '15px', 
        padding: '10px', 
        backgroundColor: isGettingLocation ? '#fff3cd' : '#d4edda', 
        borderRadius: '5px',
        fontSize: '14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>
          📍 <strong>สถานที่:</strong> {currentLocation}
          {isGettingLocation && ' (กำลังอัปเดต...)'}
        </span>
        <button 
          onClick={refreshLocation}
          disabled={isGettingLocation}
          style={{
            padding: '5px 10px',
            fontSize: '12px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            opacity: isGettingLocation ? 0.6 : 1
          }}
        >
          🔄 อัปเดต
        </button>
      </div>

      {/* Progress Status (เดิม) */}
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
      
      {/* Basic Form Controls (เดิม - ไม่แก้ไข) */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          
          {/* Building Input */}
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              อาคาร:
            </label>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              {inputMode.building === 'select' ? (
                <select 
                  value={formData.building}
                  onChange={(e) => setFormData(prev => ({ ...prev, building: e.target.value }))}
                  style={{ flex: 1, padding: '8px', fontSize: '14px' }}
                  disabled={isLoadingMasterData || captureMode}
                >
                  <option value="">เลือกอาคาร...</option>
                  {masterData.buildings.map(building => (
                    <option key={building} value={building}>{building}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={newInputs.building}
                  onChange={(e) => setNewInputs(prev => ({ ...prev, building: e.target.value }))}
                  placeholder="ชื่ออาคารใหม่ เช่น A, B, C"
                  style={{ flex: 1, padding: '8px', fontSize: '14px' }}
                  disabled={captureMode}
                />
              )}
              <button
                onClick={() => setInputMode(prev => ({ 
                  ...prev, 
                  building: prev.building === 'select' ? 'input' : 'select' 
                }))}
                disabled={captureMode}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  opacity: captureMode ? 0.5 : 1
                }}
              >
                {inputMode.building === 'select' ? '+ ใหม่' : 'ยกเลิก'}
              </button>
            </div>
          </div>

          {/* หมวดงาน */}
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              หมวดงาน:
            </label>
            <select 
              value={formData.category}
              onChange={(e) => {
                const newCategory = e.target.value;
                setFormData(prev => ({ 
                  ...prev, 
                  category: newCategory
                }));
              }}
              style={{ width: '100%', padding: '8px', fontSize: '14px' }}
              disabled={captureMode}
            >
              <option value="">เลือกหมวดงาน...</option>
              {Object.keys(qcTopics).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          {/* Foundation Input */}
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              ฐานราก:
            </label>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              {inputMode.foundation === 'select' ? (
                <select 
                  value={formData.foundation}
                  onChange={(e) => setFormData(prev => ({ ...prev, foundation: e.target.value }))}
                  style={{ flex: 1, padding: '8px', fontSize: '14px' }}
                  disabled={isLoadingMasterData || captureMode}
                >
                  <option value="">เลือกฐานราก...</option>
                  {masterData.foundations.map(foundation => (
                    <option key={foundation} value={foundation}>{foundation}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={newInputs.foundation}
                  onChange={(e) => setNewInputs(prev => ({ ...prev, foundation: e.target.value }))}
                  placeholder="เลขฐานราก เช่น F01, F02"
                  style={{ flex: 1, padding: '8px', fontSize: '14px' }}
                  disabled={captureMode}
                />
              )}
              <button
                onClick={() => setInputMode(prev => ({ 
                  ...prev, 
                  foundation: prev.foundation === 'select' ? 'input' : 'select'
                }))}
                disabled={captureMode}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  opacity: captureMode ? 0.5 : 1
                }}
              >
                {inputMode.foundation === 'select' ? '+ ใหม่' : 'ยกเลิก'}
              </button>
            </div>
          </div>
        </div>
        
        {/* Save New Master Data Button */}
        {(inputMode.building === 'input' || inputMode.foundation === 'input') && (
          <div style={{ marginTop: '15px', textAlign: 'center' }}>
            <button
              onClick={addNewMasterData}
              disabled={isUploading || !newInputs.building.trim() || !newInputs.foundation.trim() || captureMode}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                opacity: (isUploading || !newInputs.building.trim() || !newInputs.foundation.trim() || captureMode) ? 0.6 : 1
              }}
            >
              {isUploading ? 'กำลังบันทึก...' : '💾 บันทึกข้อมูลใหม่'}
            </button>
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

      {/* 🔥 Native Camera Input (Hidden) */}
      <input 
        ref={cameraInputRef}
        type="file" 
        accept="image/*" 
        capture="camera"
        style={{ display: 'none' }}
        onChange={handleCameraInput}
      />

      {/* 🔥 Main Content: Topic Selection OR Processing OR Preview */}
      {!captureMode ? (
        // Topic Selection Mode (หน้าแรก)
        <>
          {formData.building && formData.foundation && formData.category && qcTopics[formData.category] ? (
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
              ⚠️ กรุณาเลือก อาคาร, ฐานราก, และหมวดงาน เพื่อแสดงรายการหัวข้อ
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

      {/* Captured Photos Management (เดิม - ไม่แก้ไข) */}
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
                    const newWindow = window.open('', '_blank');
                    newWindow.document.write(`
                      <html>
                        <head><title>${photo.topic}</title></head>
                        <body style="margin:0; padding:20px; text-align:center; background:#f5f5f5;">
                          <h3>${photo.topic}</h3>
                          <img src="${photo.url}" style="max-width:100%; height:auto;" />
                          <p style="margin-top:10px; font-size:14px; color:#666;">
                            ${photo.building} - ${photo.foundation}<br/>
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

      {/* Instructions */}
      <div style={{ 
        marginTop: '30px',
        padding: '15px',
        backgroundColor: '#fff3cd',
        borderRadius: '6px',
        border: '1px solid #ffeaa7'
      }}>
        <h4 style={{ marginTop: 0, color: '#856404' }}>📝 วิธีการใช้งาน (Native Camera)</h4>
        <ol style={{ color: '#856404', fontSize: '14px', lineHeight: '1.6' }}>
          <li>เลือก <strong>อาคาร</strong>, <strong>ฐานราก</strong>, และ <strong>หมวดงาน</strong></li>
          <li><strong>คลิกหัวข้อ</strong> → <strong>เปิดแอปกล้องมือถือ</strong></li>
          <li><strong>ถ่ายรูป</strong> ด้วยกล้องเต็มประสิทธิภาพ (auto focus, HDR)</li>
          <li><strong>ตรวจสอบ preview</strong> → เลือก "ใช้รูปนี้" หรือ "ถ่ายใหม่"</li>
          <li><strong>วนซ้ำ</strong> จนถ่ายครบทุกหัวข้อ</li>
          <li>กดปุ่ม <strong>"บันทึกทั้งหมด"</strong> เพื่อส่งรูปทั้งหมด</li>
        </ol>
        <div style={{ 
          marginTop: '10px', 
          padding: '8px', 
          backgroundColor: '#e2e3e5', 
          borderRadius: '4px',
          fontSize: '13px'
        }}>
          <strong>💡 เคล็ดลับ:</strong> 
          <br />• <strong>ถือมือถือแนวนอน</strong> เพื่อให้ได้อัตราส่วน 4:3 ที่ดีที่สุด
          <br />• <strong>วางวัตถุตรงกลาง</strong> รูปจะถูก crop จากตรงกลางอัตโนมัติ
          <br />• <strong>ใช้ auto focus</strong> ของกล้องมือถือได้เต็มที่
          <br />• <strong>รูปจะถูกปรับเป็น 1600×1200</strong> พร้อม watermark อัตโนมัติ
        </div>
      </div>
    </div>
  );
};

export default Camera;