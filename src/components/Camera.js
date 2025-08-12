import React, { useState, useRef, useEffect } from 'react';
import { addWatermark, formatThaiDateTime } from '../utils/watermark';
import { api } from '../utils/api';

const Camera = () => {
  const [stream, setStream] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [qcTopics, setQcTopics] = useState({});
  const [formData, setFormData] = useState({
    building: 'A',
    foundation: 'F01',
    category: '',
    topic: ''
  });
  const [capturedImage, setCapturedImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Geolocation states
  const [currentLocation, setCurrentLocation] = useState('กำลังหาตำแหน่ง...');
  const [cachedLocation, setCachedLocation] = useState(null);
  const [lastPosition, setLastPosition] = useState(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Load QC topics on mount
  useEffect(() => {
    loadQCTopics();
  }, []);

  // Start camera and get location when component mounts
  useEffect(() => {
    startCamera();
    getCurrentLocation();
    return () => stopCamera();
  }, []);

  const loadQCTopics = async () => {
    try {
      const response = await api.getQCTopics();
      if (response.success) {
        setQcTopics(response.data);
        // Set default category
        const categories = Object.keys(response.data);
        if (categories.length > 0) {
          setFormData(prev => ({
            ...prev,
            category: categories[0],
            topic: response.data[categories[0]][0] || ''
          }));
        }
      }
    } catch (error) {
      console.error('Error loading QC topics:', error);
      alert('ไม่สามารถโหลดหัวข้อการตรวจ QC ได้');
    }
  };

  // Calculate distance between two coordinates (in km)
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
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
          
          // Check if position changed significantly (>100m = 0.1km)
          if (lastPosition && cachedLocation) {
            const distance = calculateDistance(
              latitude, longitude, 
              lastPosition.lat, lastPosition.lng
            );
            
            if (distance < 0.1) { // Less than 100m
              console.log('Using cached location (distance:', distance, 'km)');
              setCurrentLocation(cachedLocation);
              setIsGettingLocation(false);
              return;
            }
          }
          
          console.log('Getting new location from Nominatim API...');
          
          // เรียก Nominatim API (ฟรี!)
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
          // สร้าง address แบบละเอียด
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
          
          let fullAddress = addressParts.join(' ');
          
          // ถ้าไม่มีข้อมูลครบ ใช้ display_name
          if (addressParts.length < 3) {
            fullAddress = data.display_name
              .replace(/\d{5}/, '') // ลบรหัสไปรษณีย์
              .replace(/ประเทศไทย|Thailand/gi, '')
              .replace(/\s+/g, ' ')
              .trim();
          }
          
          setCachedLocation(fullAddress);
          setLastPosition({ lat: latitude, lng: longitude });
          setCurrentLocation(fullAddress);
          
          console.log('Full location:', fullAddress);
        }
        
      } catch (error) {
          console.error('Error getting address:', error);
          const errorLocation = 'ไม่สามารถระบุสถานที่ได้';
          setCurrentLocation(errorLocation);
          setCachedLocation(errorLocation);
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMessage = 'ไม่สามารถเข้าถึงตำแหน่งได้';
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'ไม่อนุญาตให้ใช้ตำแหน่ง';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'ไม่สามารถหาตำแหน่งได้';
            break;
          case error.TIMEOUT:
            errorMessage = 'หาตำแหน่งใช้เวลานานเกินไป';
            break;
        }
        
        setCurrentLocation(errorMessage);
        setCachedLocation(errorMessage);
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000 // 5 minutes
      }
    );
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',  // Use back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error starting camera:', error);
      alert('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้งานกล้อง');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsCapturing(true);
    
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to video size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw current video frame
      ctx.drawImage(video, 0, 0);
      
      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          console.error('Failed to create blob from canvas');
          setIsCapturing(false);
          return;
        }
        
        try {
          // Add watermark
          const watermarkText = formatThaiDateTime();
          const location = currentLocation || 'กำลังหาตำแหน่ง...';
          const watermarkedBlob = await addWatermark(blob, watermarkText, location);
          
          setCapturedImage(URL.createObjectURL(watermarkedBlob));
          setIsCapturing(false);
        } catch (error) {
          console.error('Error adding watermark:', error);
          setCapturedImage(URL.createObjectURL(blob)); // Show original if watermark fails
          setIsCapturing(false);
        }
      }, 'image/jpeg', 0.9);
      
    } catch (error) {
      console.error('Error capturing photo:', error);
      setIsCapturing(false);
    }
  };

const savePhoto = async () => {
  if (!capturedImage || isLoading) return;
  
  setIsLoading(true);
  
  try {
    console.log('Starting photo save process...');
    
    // Convert image URL to blob
    const response = await fetch(capturedImage);
    const photoBlob = await response.blob();
    
    console.log('Photo blob created:', {
      type: photoBlob.type,
      size: photoBlob.size
    });
    
    // Prepare photo data
    const photoData = {
      building: formData.building,
      foundation: formData.foundation,
      category: formData.category,
      topic: formData.topic,
      location: currentLocation
    };
    
    console.log('Photo data prepared:', photoData);
    
    // Upload to Google Drive + log to Sheets
    const result = await api.uploadPhoto(photoBlob, photoData);
    
    if (result.success) {
      alert(`บันทึกรูปภาพสำเร็จ!\nไฟล์: ${result.data.filename}\nID: ${result.data.sheetTimestamp.uniqueId}`);
      setCapturedImage(null);
    } else {
      throw new Error('Failed to upload photo');
    }
    
  } catch (error) {
    console.error('Error saving photo:', error);
    alert('เกิดข้อผิดพลาดในการบันทึกรูปภาพ: ' + error.message);
  } finally {
    setIsLoading(false);
  }
};

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const refreshLocation = () => {
    // Clear cache and get new location
    setCachedLocation(null);
    setLastPosition(null);
    getCurrentLocation();
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>📸 ถ่ายรูป QC</h1>
      
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
      
      {/* Form Controls */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <div>
            <label>อาคาร:</label>
            <select 
              value={formData.building}
              onChange={(e) => setFormData(prev => ({ ...prev, building: e.target.value }))}
              style={{ width: '100%', padding: '5px' }}
            >
              <option value="A">อาคาร A</option>
              <option value="B">อาคาร B</option>
              <option value="C">อาคาร C</option>
            </select>
          </div>
          
          <div>
            <label>ฐานราก:</label>
            <select 
              value={formData.foundation}
              onChange={(e) => setFormData(prev => ({ ...prev, foundation: e.target.value }))}
              style={{ width: '100%', padding: '5px' }}
            >
              {['F01', 'F02', 'F03', 'F04', 'F05'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label>หมวดงาน:</label>
            <select 
              value={formData.category}
              onChange={(e) => {
                const newCategory = e.target.value;
                setFormData(prev => ({ 
                  ...prev, 
                  category: newCategory,
                  topic: qcTopics[newCategory]?.[0] || ''
                }));
              }}
              style={{ width: '100%', padding: '5px' }}
            >
              {Object.keys(qcTopics).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label>หัวข้อ:</label>
            <select 
              value={formData.topic}
              onChange={(e) => setFormData(prev => ({ ...prev, topic: e.target.value }))}
              style={{ width: '100%', padding: '5px' }}
            >
              {(qcTopics[formData.category] || []).map(topic => (
                <option key={topic} value={topic}>{topic}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Camera/Preview Area */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        {!capturedImage ? (
          <div>
            <video 
              ref={videoRef}
              autoPlay 
              playsInline
              style={{ 
                width: '100%', 
                maxWidth: '600px', 
                height: 'auto',
                backgroundColor: '#000',
                borderRadius: '8px'
              }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
        ) : (
          <img 
            src={capturedImage}
            alt="Captured"
            style={{ 
              width: '100%', 
              maxWidth: '600px', 
              height: 'auto',
              borderRadius: '8px'
            }}
          />
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {!capturedImage ? (
          <button 
            onClick={capturePhoto}
            disabled={isCapturing || !stream}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              opacity: isCapturing ? 0.6 : 1
            }}
          >
            {isCapturing ? 'กำลังถ่าย...' : '📸 ถ่ายรูป'}
          </button>
        ) : (
          <>
            <button 
              onClick={retakePhoto}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              🔄 ถ่ายใหม่
            </button>
            <button 
              onClick={savePhoto}
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              {isLoading ? 'กำลังบันทึก...' : '💾 บันทึก'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Camera;