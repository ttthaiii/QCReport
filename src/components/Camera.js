import React, { useState, useRef, useEffect } from 'react';
import { addWatermark, formatThaiDateTime } from '../utils/watermark';
import { api } from '../utils/api';

const Camera = () => {
  const [stream, setStream] = useState(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [qcTopics, setQcTopics] = useState({});
  const [formData, setFormData] = useState({
    building: 'A',
    foundation: 'F01',
    category: '',
    topic: ''
  });
  
  // เปลี่ยนกลับไปใช้ single photo แทน multiple photos ก่อน
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
    getCurrentLocation();
  }, []);

  // Cleanup camera when component unmounts
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const loadQCTopics = async () => {
    try {
      const response = await api.getQCTopics();
      if (response.success) {
        setQcTopics(response.data);
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

  const startCamera = async () => {
    try {
      console.log('Starting camera...');
      setIsCameraOn(true); // ตั้งสถานะเปิดก่อน เพื่อแสดง loading
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 640 },   // ลดขนาดเป็น 640x480 (เร็วกว่า)
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 30 } // จำกัด framerate
        }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // รอให้ video พร้อมใช้งาน
        return new Promise((resolve) => {
          videoRef.current.onloadeddata = () => {
            console.log('Camera ready!');
            resolve();
          };
          
          // Timeout หากรอนานเกิน 5 วินาที
          setTimeout(() => {
            console.log('Camera timeout, but continuing...');
            resolve();
          }, 5000);
        });
      }
      
    } catch (error) {
      console.error('Error starting camera:', error);
      setIsCameraOn(false);
      
      // แสดง error ที่เจาะจงกว่า
      if (error.name === 'NotAllowedError') {
        alert('กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์');
      } else if (error.name === 'NotFoundError') {
        alert('ไม่พบกล้องในอุปกรณ์');
      } else {
        alert('ไม่สามารถเปิดกล้องได้: ' + error.message);
      }
    }
  };

  const stopCamera = () => {
    console.log('Stopping camera...');
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOn(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !isCameraOn) {
      console.log('Cannot capture: missing refs or camera off');
      return;
    }
    
    const video = videoRef.current;
    
    // ตรวจสอบสถานะ video (ผ่อนปรนกว่าเดิม)
    if (video.readyState < 2) { // HAVE_CURRENT_DATA
      console.log('Video not ready yet, but trying anyway...');
    }
    
    setIsCapturing(true);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // ใช้ขนาดที่เล็กกว่าเพื่อความเร็ว
      const targetWidth = 800;  // ลดจาก 1476
      const targetHeight = 600; // ลดจาก 992
      
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      console.log(`Canvas size: ${canvas.width}x${canvas.height}`);
      
      // วาดรูปจาก video ลงใน canvas
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      
      // แปลงเป็น blob (quality 0.8 เพื่อความเร็ว)
      canvas.toBlob(async (blob) => {
        if (!blob) {
          console.error('Failed to create blob from canvas');
          alert('ไม่สามารถสร้างรูปภาพได้ กรุณาลองอีกครั้ง');
          setIsCapturing(false);
          return;
        }
        
        console.log('Blob created successfully, size:', blob.size);
        
        try {
          // เพิ่ม watermark
          const watermarkText = formatThaiDateTime();
          const location = currentLocation || 'กำลังหาตำแหน่ง...';
          const watermarkedBlob = await addWatermark(blob, watermarkText, location);
          
          setCapturedImage(URL.createObjectURL(watermarkedBlob));
          setIsCapturing(false);
          console.log('Photo captured successfully');
        } catch (error) {
          console.error('Error adding watermark:', error);
          // ถ้า watermark ไม่ได้ ให้ใช้รูปเดิม
          setCapturedImage(URL.createObjectURL(blob));
          setIsCapturing(false);
        }
      }, 'image/jpeg', 0.8); // ลด quality จาก 0.9 เป็น 0.8
      
    } catch (error) {
      console.error('Error capturing photo:', error);
      alert('เกิดข้อผิดพลาดในการถ่ายรูป');
      setIsCapturing(false);
    }
  };

  const savePhoto = async () => {
    if (!capturedImage || isLoading) return;
    
    setIsLoading(true);
    
    try {
      console.log('Starting photo save process...');
      
      const response = await fetch(capturedImage);
      const photoBlob = await response.blob();
      
      console.log('Photo blob created:', {
        type: photoBlob.type,
        size: photoBlob.size
      });
      
      const photoData = {
        building: formData.building,
        foundation: formData.foundation,
        category: formData.category,
        topic: formData.topic,
        location: currentLocation
      };
      
      console.log('Photo data prepared:', photoData);
      
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

      {/* Camera Control */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <button 
          onClick={toggleCamera}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: isCameraOn ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          {isCameraOn ? '📴 ปิดกล้อง' : '📷 เปิดกล้อง'}
        </button>
      </div>

      {/* Camera/Preview Area */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        {!capturedImage ? (
          <div>
            {isCameraOn ? (
              <div style={{ position: 'relative' }}>
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline
                  muted
                  style={{ 
                    width: '100%', 
                    maxWidth: '600px', 
                    height: 'auto',
                    backgroundColor: '#000',
                    borderRadius: '8px'
                  }}
                />
                {/* Loading overlay */}
                {!stream && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    fontSize: '16px'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div>กำลังเปิดกล้อง...</div>
                      <div style={{ fontSize: '12px', marginTop: '5px' }}>
                        โปรดรอสักครู่
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                width: '100%',
                maxWidth: '600px',
                height: '300px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed #dee2e6',
                color: '#6c757d',
                fontSize: '16px'
              }}>
                กดปุ่ม "เปิดกล้อง" เพื่อเริ่มถ่ายรูป
              </div>
            )}
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
          isCameraOn && (
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
          )
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

      {/* Instructions */}
      <div style={{ 
        marginTop: '30px',
        padding: '15px',
        backgroundColor: '#fff3cd',
        borderRadius: '6px',
        border: '1px solid #ffeaa7'
      }}>
        <h4 style={{ marginTop: 0, color: '#856404' }}>📝 วิธีการใช้งาน</h4>
        <ol style={{ color: '#856404', fontSize: '14px', lineHeight: '1.6' }}>
          <li>กดปุ่ม <strong>"เปิดกล้อง"</strong> เพื่อเริ่มใช้งาน</li>
          <li>เลือก <strong>อาคาร</strong>, <strong>ฐานราก</strong>, <strong>หมวดงาน</strong> และ <strong>หัวข้อ</strong></li>
          <li>กดปุ่ม <strong>"ถ่ายรูป"</strong> เพื่อถ่ายรูป</li>
          <li>กดปุ่ม <strong>"บันทึก"</strong> เพื่อส่งไปยัง Google Drive</li>
          <li>หรือกดปุ่ม <strong>"ถ่ายใหม่"</strong> เพื่อถ่ายรูปใหม่</li>
        </ol>
      </div>
    </div>
  );
};

export default Camera;