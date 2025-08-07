// src/components/PhotoCapture.js
import React, { useState, useRef, useEffect } from 'react';
import { useApi } from '../context/ApiContext';
import { useLoading } from '../context/LoadingContext';

const PhotoCapture = () => {
  // State management
  const [selectedBuilding, setSelectedBuilding] = useState('A');
  const [selectedFoundation, setSelectedFoundation] = useState('F01');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  
  const [topics, setTopics] = useState({});
  const [topicStatus, setTopicStatus] = useState({});
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  
  const [cameraStream, setCameraStream] = useState(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Context hooks
  const { api } = useApi();
  const { setLoading } = useLoading();

  // Buildings and foundations options
  const buildings = ['A', 'B', 'C'];
  const foundations = ['F01', 'F02', 'F03', 'F04', 'F05'];

  // Load topics on component mount
  useEffect(() => {
    loadTopics();
    getCurrentLocation();
    return () => {
      // Cleanup camera stream
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Load topic status when selection changes
  useEffect(() => {
    if (selectedBuilding && selectedFoundation) {
      loadTopicStatus();
    }
  }, [selectedBuilding, selectedFoundation, selectedCategory]);

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLocationError(null);
          setLoading(false);
        },
        (error) => {
          console.error('Location error:', error);
          setLocationError('ไม่สามารถเข้าถึงตำแหน่งได้');
          setLoading(false);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 10000, 
          maximumAge: 60000 
        }
      );
    } else {
      setLocationError('เบราว์เซอร์ไม่รองรับการหาตำแหน่ง');
    }
  };

  // Load QC topics from API
  const loadTopics = async () => {
    try {
      setLoading(true);
      const response = await api.get('/topics');
      if (response.success) {
        setTopics(response.data);
        // Auto-select first category
        const firstCategory = Object.keys(response.data)[0];
        if (firstCategory) {
          setSelectedCategory(firstCategory);
        }
      }
    } catch (error) {
      console.error('Error loading topics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load topic status
  const loadTopicStatus = async () => {
    try {
      const response = await api.get('/topics/status', {
        building: selectedBuilding,
        foundation: selectedFoundation,
        category: selectedCategory || undefined
      });
      if (response.success) {
        setTopicStatus(response.data);
      }
    } catch (error) {
      console.error('Error loading topic status:', error);
    }
  };

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOn(true);
    } catch (error) {
      console.error('Camera error:', error);
      alert('ไม่สามารถเข้าถึงกล้องได้: ' + error.message);
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOn(false);
  };

  // Capture photo
  const capturePhoto = async () => {
    if (!selectedTopic) {
      alert('กرุณาเลือกหัวข้อก่อนถ่ายรูป');
      return;
    }

    if (!location) {
      alert('กรุณารอให้ระบบหาตำแหน่งเสร็จสิ้นก่อน');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && canvas) {
      // Set canvas size to video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      // Convert to base64
      const base64Data = canvas.toDataURL('image/jpeg', 0.8);
      
      const photoData = {
        base64Data,
        filename: `${selectedBuilding}-${selectedFoundation}-${selectedTopic}.jpg`,
        building: selectedBuilding,
        foundation: selectedFoundation,
        category: selectedCategory,
        topic: selectedTopic,
        location,
        timestamp: new Date().toISOString()
      };

      setCapturedPhotos(prev => [...prev, photoData]);
      
      // Reset topic selection
      setSelectedTopic('');
      
      alert('ถ่ายรูปเสร็จสิ้น! เลือกหัวข้อถัดไปได้เลย');
    }
  };

  // Upload all photos
  const uploadAllPhotos = async () => {
    if (capturedPhotos.length === 0) {
      alert('ไม่มีรูปให้อัปโหลด');
      return;
    }

    setLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const photo of capturedPhotos) {
      try {
        const response = await api.post('/photos/upload', {
          photoBase64: photo.base64Data,
          filename: photo.filename,
          building: photo.building,
          foundation: photo.foundation,
          category: photo.category,
          topic: photo.topic,
          lat: photo.location.lat,
          lng: photo.location.lng,
          userEmail: 'current-user@example.com' // TODO: Get from auth context
        });

        if (response.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error('Upload error:', error);
        errorCount++;
      }
    }

    setLoading(false);
    
    if (successCount > 0) {
      setCapturedPhotos([]);
      loadTopicStatus(); // Refresh status
      alert(`อัปโหลดเสร็จสิ้น!\n✅ สำเร็จ: ${successCount} รูป${errorCount > 0 ? `\n❌ ล้มเหลว: ${errorCount} รูป` : ''}`);
    } else {
      alert('อัปโหลดล้มเหลวทั้งหมด');
    }
  };

  // Get available topics for current category
  const getAvailableTopics = () => {
    if (!selectedCategory || !topics[selectedCategory]) {
      return [];
    }
    return topics[selectedCategory] || [];
  };

  // Check if topic is completed
  const isTopicCompleted = (topic) => {
    const categoryStatus = topicStatus[selectedCategory];
    if (!categoryStatus) return false;
    const topicData = categoryStatus.find(t => t.topic === topic);
    return topicData?.completed || false;
  };

  return (
    <div className="photo-capture-container">
      <div className="capture-header">
        <h2>📷 ถ่ายรูป QC</h2>
        <div className="location-info">
          {location ? (
            <p>📍 ตำแหน่งปัจจุบัน: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}</p>
          ) : locationError ? (
            <p className="error">⚠️ {locationError}</p>
          ) : (
            <p>📍 กำลังหาตำแหน่ง...</p>
          )}
        </div>
      </div>

      {/* Selection Form */}
      <div className="selection-form">
        <div className="form-row">
          <div className="form-group">
            <label>อาคาร:</label>
            <select 
              value={selectedBuilding} 
              onChange={(e) => setSelectedBuilding(e.target.value)}
            >
              {buildings.map(building => (
                <option key={building} value={building}>อาคาร {building}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>ฐานราก:</label>
            <select 
              value={selectedFoundation} 
              onChange={(e) => setSelectedFoundation(e.target.value)}
            >
              {foundations.map(foundation => (
                <option key={foundation} value={foundation}>{foundation}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>หมวดงาน:</label>
            <select 
              value={selectedCategory} 
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedTopic('');
              }}
            >
              <option value="">-- เลือกหมวดงาน --</option>
              {Object.keys(topics).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>หัวข้อ:</label>
            <select 
              value={selectedTopic} 
              onChange={(e) => setSelectedTopic(e.target.value)}
              disabled={!selectedCategory}
            >
              <option value="">-- เลือกหัวข้อ --</option>
              {getAvailableTopics().map(topic => (
                <option 
                  key={topic} 
                  value={topic}
                  className={isTopicCompleted(topic) ? 'completed' : ''}
                >
                  {isTopicCompleted(topic) ? '✅' : '⭕'} {topic}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Camera Section */}
      <div className="camera-section">
        {!isCameraOn ? (
          <div className="camera-placeholder">
            <button className="start-camera-btn" onClick={startCamera}>
              📸 เปิดกล้อง
            </button>
          </div>
        ) : (
          <div className="camera-container">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="camera-video"
            />
            <div className="camera-controls">
              <button 
                className="capture-btn"
                onClick={capturePhoto}
                disabled={!selectedTopic}
              >
                📸 ถ่ายรูป
              </button>
              <button className="stop-camera-btn" onClick={stopCamera}>
                ⏹️ ปิดกล้อง
              </button>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {/* Captured Photos */}
      {capturedPhotos.length > 0 && (
        <div className="captured-photos">
          <h3>รูปที่ถ่ายแล้ว ({capturedPhotos.length})</h3>
          <div className="photos-grid">
            {capturedPhotos.map((photo, index) => (
              <div key={index} className="photo-item">
                <img src={photo.base64Data} alt={photo.filename} />
                <p>{photo.topic}</p>
              </div>
            ))}
          </div>
          <button 
            className="upload-all-btn" 
            onClick={uploadAllPhotos}
          >
            📤 อัปโหลดทั้งหมด ({capturedPhotos.length} รูป)
          </button>
        </div>
      )}

      {/* Topic Status Summary */}
      {selectedCategory && topicStatus[selectedCategory] && (
        <div className="topic-status">
          <h3>สถานะหัวข้อ - {selectedCategory}</h3>
          <div className="status-grid">
            {topicStatus[selectedCategory].map((item, index) => (
              <div 
                key={index} 
                className={`status-item ${item.completed ? 'completed' : 'pending'}`}
              >
                <span className="status-icon">
                  {item.completed ? '✅' : '⭕'}
                </span>
                <span className="topic-name">{item.topic}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoCapture;