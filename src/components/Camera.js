import React, { useState, useRef, useEffect } from 'react';
import { addWatermark, formatThaiDateTime } from '../utils/watermark';
import { api } from '../utils/api';

const Camera = () => {
  const [stream, setStream] = useState(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [qcTopics, setQcTopics] = useState({});
  
  // Master Data States
  const [masterData, setMasterData] = useState({
    buildings: [],
    foundations: [],
    combinations: []
  });
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(false);
  
  // Form States
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
  
  // 🔥 NEW: One-Click Topic Selection States
  const [selectedTopic, setSelectedTopic] = useState(''); // หัวข้อที่เลือกปัจจุบัน
  const [captureMode, setCaptureMode] = useState(false); // อยู่ในโหมดถ่ายรูปหรือไม่
  
  // Multiple Photos System (เก็บรูปสะสม)
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
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Load data on mount
  useEffect(() => {
    loadQCTopics();
    loadMasterData();
    getCurrentLocation();
  }, []);

  // Load progress when building/foundation/category changes
  useEffect(() => {
    if (formData.building && formData.foundation && formData.category) {
      loadProgress();
    }
  }, [formData.building, formData.foundation, formData.category]);

  // Cleanup camera when component unmounts
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const loadMasterData = async () => {
    setIsLoadingMasterData(true);
    try {
      const response = await api.getMasterData();
      if (response.success) {
        setMasterData(response.data);
        
        if (response.data.buildings.length > 0) {
          setFormData(prev => ({
            ...prev,
            building: response.data.buildings[0]
          }));
        }
        if (response.data.foundations.length > 0) {
          setFormData(prev => ({
            ...prev,
            foundation: response.data.foundations[0]
          }));
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
        setFormData(prev => ({
          ...prev,
          building: building,
          foundation: foundation
        }));
        
        setInputMode({
          building: 'select',
          foundation: 'select'
        });
        setNewInputs({
          building: '',
          foundation: ''
        });
        
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
          setFormData(prev => ({
            ...prev,
            category: categories[0]
          }));
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
            {
              headers: {
                'User-Agent': 'QCReport-App/1.0'
              }
            }
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

  // 🔥 NEW: One-Click Topic Selection with Auto Camera Start
  const selectTopicAndStartCamera = async (topic) => {
    if (!formData.building || !formData.foundation || !formData.category) {
      alert('กรุณาเลือกข้อมูลให้ครบถ้วน: อาคาร, ฐานราก, และหมวดงาน');
      return;
    }

    try {
      console.log(`Selected topic: ${topic}, starting camera...`);
      
      // เลือกหัวข้อ
      setSelectedTopic(topic);
      setCaptureMode(true);
      
      // เปิดกล้องทันที
      await startCamera();
      
    } catch (error) {
      console.error('Error starting camera for topic:', error);
      // ถ้าเปิดกล้องไม่ได้ให้ reset state
      setSelectedTopic('');
      setCaptureMode(false);
    }
  };

const startCamera = async () => {
  try {
    console.log('Starting camera...');
    if (stream) {
      console.log('Stopping existing stream before starting new one...');
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    setIsCameraOn(true);
    
    // 🔥 ปรับปรุงการตั้งค่ากล้อง
    const constraints = {
      video: { 
        facingMode: 'environment', // กล้องหลัง
        width: { 
          min: 640,
          ideal: 1920,    // เพิ่มความละเอียด
          max: 4096 
        },
        height: { 
          min: 480,
          ideal: 1080,    // เพิ่มความละเอียด
          max: 2160 
        },
        frameRate: { 
          ideal: 30,      // เพิ่ม frame rate
          max: 60 
        },
        aspectRatio: { ideal: 16/9 } // กำหนด aspect ratio
      }
    };
    
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    console.log('MediaStream obtained:', mediaStream.id);
    
    // ตรวจสอบความละเอียดจริงที่ได้
    const videoTrack = mediaStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    console.log('Actual camera settings:', settings);
    
    setStream(mediaStream);
    
    if (videoRef.current) {
      videoRef.current.srcObject = mediaStream;
      
      return new Promise((resolve, reject) => {
        const video = videoRef.current;
        
        const onLoadedData = () => {
          console.log('Video loaded and ready');
          console.log(`Video dimensions: ${video.videoWidth}x${video.videoHeight}`);
          video.removeEventListener('loadeddata', onLoadedData);
          video.removeEventListener('error', onError);
          resolve();
        };
        
        const onError = (error) => {
          console.error('Video error:', error);
          video.removeEventListener('loadeddata', onLoadedData);
          video.removeEventListener('error', onError);
          reject(error);
        };
        
        video.addEventListener('loadeddata', onLoadedData);
        video.addEventListener('error', onError);
        
        setTimeout(() => {
          video.removeEventListener('loadeddata', onLoadedData);
          video.removeEventListener('error', onError);
          
          if (video.readyState >= 2) {
            console.log('Camera ready after timeout check');
            resolve();
          } else {
            console.log('Camera timeout, but trying to continue...');
            resolve();
          }
        }, 10000);
      });
    }
    
  } catch (error) {
    console.error('Error starting camera:', error);
    setIsCameraOn(false);
    setStream(null);
    
    if (error.name === 'NotAllowedError') {
      alert('กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์');
    } else if (error.name === 'NotFoundError') {
      alert('ไม่พบกล้องในอุปกรณ์');
    } else if (error.name === 'NotReadableError') {
      alert('กล้องถูกใช้งานโดยแอปอื่นอยู่');
    } else {
      alert('ไม่สามารถเปิดกล้องได้: ' + error.message);
    }
    throw error;
  }
};

  const stopCamera = () => {
    console.log('Stopping camera...');
    
    if (stream) {
      console.log('Stopping all tracks...');
      stream.getTracks().forEach(track => {
        console.log(`Stopping track: ${track.kind}, state: ${track.readyState}`);
        track.stop();
      });
      setStream(null);
    }
    
    setIsCameraOn(false);
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      console.log('Video srcObject cleared');
    }
  };

  // 🔥 NEW: Capture Photo and Auto Reset Camera
const capturePhotoAndReset = async () => {
  if (!videoRef.current || !canvasRef.current || !isCameraOn || !selectedTopic) {
    console.log('Cannot capture: missing requirements');
    return;
  }
  
  const video = videoRef.current;
  
  if (video.readyState < 2) {
    console.log('Video not ready yet, but trying anyway...');
  }
  
  setIsCapturing(true);
  
  try {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // 🔥 กำหนดขนาดรูปมาตรฐาน - แนวนอน 4:3 ratio
    const standardWidth = 1600;   // ความกว้าง
    const standardHeight = 1200;  // ความสูง (4:3 ratio)
    
    // ตั้ง canvas ตามขนาดมาตรฐาน
    canvas.width = standardWidth;
    canvas.height = standardHeight;
    
    console.log(`Canvas standardized to: ${standardWidth}x${standardHeight}`);
    
    // คำนวณการครอบตัดจาก video
    const videoWidth = video.videoWidth || video.clientWidth;
    const videoHeight = video.videoHeight || video.clientHeight;
    
    console.log(`Video size: ${videoWidth}x${videoHeight}`);
    
    // คำนวณ aspect ratios
    const videoRatio = videoWidth / videoHeight;
    const canvasRatio = standardWidth / standardHeight;
    
    let sourceX = 0, sourceY = 0, sourceWidth = videoWidth, sourceHeight = videoHeight;
    
    if (videoRatio > canvasRatio) {
      // Video กว้างกว่า - ครอบตัดด้านซ้าย-ขวา
      sourceWidth = videoHeight * canvasRatio;
      sourceX = (videoWidth - sourceWidth) / 2;
    } else {
      // Video สูงกว่า - ครอบตัดด้านบน-ล่าง
      sourceHeight = videoWidth / canvasRatio;
      sourceY = (videoHeight - sourceHeight) / 2;
    }
    
    console.log(`Crop area: ${sourceX}, ${sourceY}, ${sourceWidth}, ${sourceHeight}`);
    
    // วาดรูปด้วยการครอบตัดและปรับขนาด
    ctx.drawImage(
      video,
      sourceX, sourceY, sourceWidth, sourceHeight,  // source (crop from video)
      0, 0, standardWidth, standardHeight            // destination (canvas)
    );
    
    canvas.toBlob(async (blob) => {
      if (!blob) {
        console.error('Failed to create blob from canvas');
        alert('ไม่สามารถสร้างรูปภาพได้ กรุณาลองอีกครั้ง');
        setIsCapturing(false);
        return;
      }
      
      console.log('Standardized photo created, size:', blob.size);
      
      try {
        const watermarkText = formatThaiDateTime();
        const location = currentLocation || 'กำลังหาตำแหน่ง...';
        const watermarkedBlob = await addWatermark(blob, watermarkText, location);
        
        // สร้าง photo object และเก็บไว้ในคลังรูป
        const photoData = {
          id: Date.now() + Math.random(),
          blob: watermarkedBlob,
          url: URL.createObjectURL(watermarkedBlob),
          building: formData.building,
          foundation: formData.foundation,
          category: formData.category,
          topic: selectedTopic,
          location: currentLocation,
          timestamp: new Date().toISOString(),
          dimensions: `${standardWidth}x${standardHeight}` // เก็บขนาดรูป
        };
        
        // เพิ่มลงใน array (เก็บสะสม)
        setCapturedPhotos(prev => [...prev, photoData]);
        
        // อัปเดต completed topics
        setCompletedTopics(prev => new Set([...prev, selectedTopic]));
        
        console.log(`📸 Standardized photo captured: ${standardWidth}x${standardHeight}`);
        
        // Auto Reset Camera State (ไม่ลบรูป)
        stopCamera();
        setSelectedTopic('');
        setCaptureMode(false);
        setIsCapturing(false);
        
        // แสดงข้อความสำเร็จ
        alert(`✅ ถ่ายรูป "${selectedTopic}" เรียบร้อย!\n📏 ขนาด: ${standardWidth}x${standardHeight}\n📷 รูปทั้งหมด: ${capturedPhotos.length + 1} รูป`);
        
      } catch (error) {
        console.error('Error adding watermark:', error);
        setIsCapturing(false);
      }
    }, 'image/jpeg', 0.9); // คุณภาพ 90%
    
  } catch (error) {
    console.error('Error capturing photo:', error);
    alert('เกิดข้อผิดพลาดในการถ่ายรูป');
    setIsCapturing(false);
  }
};

  // 🔥 NEW: Cancel Capture (back to topic selection)
  const cancelCapture = () => {
    stopCamera();
    setSelectedTopic('');
    setCaptureMode(false);
  };

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

  const clearAllPhotos = () => {
    if (capturedPhotos.length === 0) return;
    
    if (window.confirm(`ต้องการลบรูปทั้งหมด ${capturedPhotos.length} รูป?`)) {
      capturedPhotos.forEach(photo => {
        URL.revokeObjectURL(photo.url);
      });
      
      setCapturedPhotos([]);
      
      // อัปเดต completed topics จากรูปที่เหลือ (ไม่มี)
      setCompletedTopics(new Set());
    }
  };

  const removePhoto = (photoId) => {
    setCapturedPhotos(prev => {
      const updated = prev.filter(photo => photo.id !== photoId);
      
      const photoToRemove = prev.find(photo => photo.id === photoId);
      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.url);
        
        // อัปเดต completed topics จากรูปที่เหลือ
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

  // แสดงสถานะความครบถ้วนของหมวดงาน
  const getProgressStats = () => {
    const currentTopics = qcTopics[formData.category] || [];
    const completed = currentTopics.filter(topic => completedTopics.has(topic)).length;
    const total = currentTopics.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  };

  const progressStats = getProgressStats();

  const fullscreenCameraStyles = `
    .fullscreen-camera {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      background: #000;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    
    .fullscreen-camera video {
      width: 100vw;
      height: 100vh;
      object-fit: cover;
      cursor: crosshair;
    }
    
    .fullscreen-controls {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
      padding: 30px 20px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .fullscreen-topic {
      position: absolute;
      top: 20px;
      left: 20px;
      right: 20px;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      backdrop-filter: blur(10px);
    }
    
    .capture-button-large {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #fff;
      border: 4px solid #007bff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.2s ease;
    }
    
    .capture-button-large:active {
      transform: scale(0.95);
      background: #f0f0f0;
    }
    
    .cancel-button {
      padding: 12px 20px;
      background: rgba(220, 53, 69, 0.9);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      backdrop-filter: blur(10px);
    }
    
    .focus-indicator {
      position: absolute;
      width: 60px;
      height: 60px;
      border: 2px solid #fff;
      border-radius: 4px;
      pointer-events: none;
      transform: translate(-50%, -50%);
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    
    .focus-indicator.show {
      opacity: 1;
    }
  `;

  const handleTapToFocus = async (event) => {
    if (!videoRef.current || !stream) return;
    
    const rect = videoRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // แสดง Focus Indicator
    const indicator = document.querySelector('.focus-indicator');
    if (indicator) {
      indicator.style.left = x + 'px';
      indicator.style.top = y + 'px';
      indicator.classList.add('show');
      
      setTimeout(() => {
        indicator.classList.remove('show');
      }, 1000);
    }
    
    try {
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      
      console.log('Camera capabilities:', capabilities);
      
      // ลอง Auto Focus ก่อน
      if (capabilities.focusMode) {
        await track.applyConstraints({
          advanced: [{
            focusMode: 'continuous'
          }]
        });
        console.log('Applied continuous focus');
      }
      
      // ลองปรับ Exposure
      if (capabilities.exposureMode) {
        await track.applyConstraints({
          advanced: [{
            exposureMode: 'continuous'
          }]
        });
        console.log('Applied continuous exposure');
      }
      
    } catch (error) {
      console.log('Focus/Exposure adjustment not supported:', error);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>📸 ถ่ายรูป QC (One-Click)</h1>
      
      {/* Location Status */}
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
      
      {/* Basic Form Controls */}
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

      {/* 🔥 Main Content: Topic Selection OR Camera Mode */}
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
                📝 เลือกหัวข้อที่ต้องการถ่าย (คลิก = เปิดกล้องทันที):
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
                      onClick={() => selectTopicAndStartCamera(topic)}
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
        // Fullscreen Camera Mode (หลังกดหัวข้อ)
        <>
          <style>{fullscreenCameraStyles}</style>
          
          <div className="fullscreen-camera">
            <div className="fullscreen-topic">
              📸 {selectedTopic}
            </div>
            
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              {isCameraOn ? (
                <>
                  <video 
                    ref={videoRef}
                    autoPlay 
                    playsInline
                    muted
                    onClick={handleTapToFocus}
                  />
                  
                  <div className="focus-indicator"></div>
                  
                  {!stream && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0,0,0,0.8)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div>📷 กำลังเปิดกล้อง...</div>
                        <div style={{ fontSize: '14px', marginTop: '8px', opacity: 0.8 }}>
                          โปรดรอสักครู่
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '18px'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div>📷 กำลังเปิดกล้อง...</div>
                    <div style={{ fontSize: '14px', marginTop: '8px', opacity: 0.8 }}>
                      กรุณารอสักครู่
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="fullscreen-controls">
              <button
                className="cancel-button"
                onClick={cancelCapture}
                disabled={isCapturing}
              >
                ✕ ยกเลิก
              </button>
              
              <button 
                className="capture-button-large"
                onClick={capturePhotoAndReset}
                disabled={isCapturing || !stream}
                style={{
                  opacity: (isCapturing || !stream) ? 0.6 : 1,
                  background: isCapturing ? '#ffc107' : '#fff'
                }}
              >
                {isCapturing ? '⏳' : '📷'}
              </button>
              
              <div style={{ 
                color: 'white', 
                fontSize: '12px', 
                textAlign: 'right',
                opacity: 0.8,
                maxWidth: '100px'
              }}>
                <div>จิ้มเพื่อโฟกัส</div>
                <div>{capturedPhotos.length + 1}/∞</div>
              </div>
            </div>
            
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
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
                    // แสดงรูปขยาย
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

      {/* Instructions */}
      <div style={{ 
        marginTop: '30px',
        padding: '15px',
        backgroundColor: '#fff3cd',
        borderRadius: '6px',
        border: '1px solid #ffeaa7'
      }}>
        <h4 style={{ marginTop: 0, color: '#856404' }}>📝 วิธีการใช้งาน (One-Click)</h4>
        <ol style={{ color: '#856404', fontSize: '14px', lineHeight: '1.6' }}>
          <li>เลือก <strong>อาคาร</strong>, <strong>ฐานราก</strong>, และ <strong>หมวดงาน</strong></li>
          <li><strong>คลิกหัวข้อ</strong>ที่ต้องการถ่าย → <strong>เปิดกล้องทันที</strong></li>
          <li>กดปุ่ม <strong>"ถ่ายรูป"</strong> → <strong>Auto reset กลับไปเลือกหัวข้อ</strong></li>
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
          <br />• <strong>คลิกหัวข้อ = เปิดกล้องทันที</strong> ไม่ต้องกดปุ่มเปิดกล้องแยก
          <br />• ✅ = ถ่ายแล้ว | 📷 = ยังไม่ถ่าย | คลิกรูปเล็กๆ เพื่อดูขยาย
          <br />• <strong>รูปจะเก็บสะสม</strong> จนกว่าจะกด "บันทึกทั้งหมด" หรือ "ลบทั้งหมด"
        </div>
      </div>
    </div>
  );
};

export default Camera;