// src/components/PhotoCapture.js (Fixed Camera Display)
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
    checkCameraPermission();
    return () => {
      // Cleanup camera stream
      if (cameraStream) {
        console.log('🧹 Cleaning up camera stream...');
        cameraStream.getTracks().forEach(track => {
          track.stop();
          console.log('🛑 Camera track stopped');
        });
      }
    };
  }, []);

  // Check camera permission
  const checkCameraPermission = async () => {
    try {
      if (navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'camera' });
        console.log('📷 Camera permission status:', permission.state);
        
        permission.addEventListener('change', () => {
          console.log('📷 Camera permission changed to:', permission.state);
        });
      }
      
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('⚠️ getUserMedia is not supported');
        return;
      }
      
      // Check available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log('📷 Available video devices:', videoDevices.length);
      
    } catch (error) {
      console.warn('⚠️ Could not check camera permission:', error);
    }
  };

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
          console.log('📍 Location obtained:', position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error('❌ Location error:', error);
          setLocationError('ไม่สามารถเข้าถึงตำแหน่งได้');
          setLoading(false);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 15000, 
          maximumAge: 300000 
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

  // Start camera (COMPLETELY FIXED)
  const startCamera = async () => {
    try {
      console.log('📸 Starting camera...');
      
      // Stop any existing stream first
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: { 
          facingMode: 'environment', // Back camera on mobile
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Camera stream obtained:', stream);
      
      setCameraStream(stream);
      
      // CRITICAL: Proper video setup
      if (videoRef.current) {
        const video = videoRef.current;
        
        // Clear any previous source
        video.srcObject = null;
        
        // Set stream
        video.srcObject = stream;
        
        // Set important attributes
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.controls = false;
        
        // Add CSS class for proper styling
        video.className = 'camera-video';
        
        // Wait for metadata and play
        const playVideo = () => {
          console.log('📹 Video metadata loaded, attempting to play...');
          console.log('📹 Video dimensions:', video.videoWidth, 'x', video.videoHeight);
          
          video.play()
            .then(() => {
              console.log('✅ Video playing successfully!');
              setIsCameraOn(true);
            })
            .catch(err => {
              console.error('❌ Video play failed:', err);
              // Force play after short delay
              setTimeout(() => {
                video.play().catch(e => {
                  console.error('❌ Second play attempt failed:', e);
                  console.log('📹 Trying to set camera as on anyway...');
                  setIsCameraOn(true); // Set anyway to show UI
                });
              }, 500);
            });
        };

        if (video.readyState >= 1) {
          // Metadata already loaded
          playVideo();
        } else {
          // Wait for metadata
          video.addEventListener('loadedmetadata', playVideo, { once: true });
          
          // Fallback timeout
          setTimeout(() => {
            if (!isCameraOn && video.srcObject) {
              console.log('⚠️ Timeout - forcing camera on state');
              setIsCameraOn(true);
            }
          }, 3000);
        }
        
        // Additional event listeners for debugging
        video.addEventListener('canplay', () => {
          console.log('📹 Video can play');
        });
        
        video.addEventListener('playing', () => {
          console.log('📹 Video is playing');
        });
        
        video.addEventListener('error', (e) => {
          console.error('❌ Video error:', e);
        });
        
        video.addEventListener('loadstart', () => {
          console.log('📹 Video load started');
        });
        
        video.addEventListener('loadeddata', () => {
          console.log('📹 Video data loaded');
        });
      }
      
    } catch (error) {
      console.error('❌ Camera error:', error);
      let errorMessage = 'ไม่สามารถเข้าถึงกล้องได้';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'กรุณาอนุญาตให้เข้าถึงกล้อง (ปุ่ม Allow)';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'ไม่พบกล้องในอุปกรณ์';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'เบราว์เซอร์ไม่รองรับกล้อง (ต้องใช้ HTTPS)';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'กล้องถูกใช้งานโดยแอปพลิเคชันอื่น';
      }
      
      alert(errorMessage + '\n\nรายละเอียด: ' + error.message);
    }
  };

  // Stop camera
  const stopCamera = () => {
    console.log('🛑 Stopping camera...');
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        track.stop();
        console.log('🛑 Track stopped:', track.kind);
      });
      setCameraStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.load(); // Reset video element
    }
    
    setIsCameraOn(false);
    console.log('✅ Camera stopped successfully');
  };

  // Capture photo
  const capturePhoto = async () => {
    if (!selectedTopic) {
      alert('กรุณาเลือกหัวข้อก่อนถ่ายรูป');
      return;
    }

    if (!location) {
      alert('กรุณารอให้ระบบหาตำแหน่งเสร็จสิ้นก่อน');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && canvas && video.readyState >= 2) { // HAVE_CURRENT_DATA
      try {
        console.log('📸 Capturing photo...');
        console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);
        
        // Set canvas size to video dimensions
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64 with good quality
        const base64Data = canvas.toDataURL('image/jpeg', 0.85);
        
        const photoData = {
          base64Data,
          filename: `${selectedBuilding}-${selectedFoundation}-${selectedTopic}-${Date.now()}.jpg`,
          building: selectedBuilding,
          foundation: selectedFoundation,
          category: selectedCategory,
          topic: selectedTopic,
          location,
          timestamp: new Date().toISOString(),
          videoWidth: video.videoWidth || 640,
          videoHeight: video.videoHeight || 480
        };

        setCapturedPhotos(prev => [...prev, photoData]);
        
        // Reset topic selection
        setSelectedTopic('');
        
        console.log('✅ Photo captured:', photoData.filename);
        alert('✅ ถ่ายรูปเสร็จสิ้น! เลือกหัวข้อถัดไปได้เลย');
        
      } catch (error) {
        console.error('❌ Capture error:', error);
        alert('เกิดข้อผิดพลาดในการถ่ายรูป: ' + error.message);
      }
    } else {
      console.warn('⚠️ Video not ready:', {
        hasVideo: !!video,
        hasCanvas: !!canvas,
        readyState: video?.readyState,
        videoWidth: video?.videoWidth,
        videoHeight: video?.videoHeight
      });
      alert('กรุณารอให้กล้องโหลดเสร็จสิ้นก่อน');
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
          userEmail: 'current-user@example.com'
        });

        if (response.success) {
          successCount++;
          console.log('✅ Upload success:', photo.filename);
        } else {
          errorCount++;
          console.error('❌ Upload failed:', photo.filename, response);
        }
      } catch (error) {
        console.error('❌ Upload error:', photo.filename, error);
        errorCount++;
      }
    }

    setLoading(false);
    
    if (successCount > 0) {
      setCapturedPhotos([]);
      loadTopicStatus(); // Refresh status
      alert(`🎉 อัปโหลดเสร็จสิ้น!\n✅ สำเร็จ: ${successCount} รูป${errorCount > 0 ? `\n❌ ล้มเหลว: ${errorCount} รูป` : ''}`);
    } else {
      alert('❌ อัปโหลดล้มเหลวทั้งหมด กรุณาลองใหม่อีกครั้ง');
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

      {/* Camera Section - COMPLETELY REDESIGNED */}
      <div className="camera-section">
        {!isCameraOn ? (
          <div className="camera-placeholder">
            <div style={{
              background: '#f0f0f0',
              border: '2px dashed #ccc',
              borderRadius: '8px',
              padding: '40px',
              textAlign: 'center',
              minHeight: '300px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <div style={{fontSize: '4rem', marginBottom: '20px'}}>📸</div>
              <h3>กล้องยังไม่เปิด</h3>
              <p style={{color: '#666', marginBottom: '20px'}}>
                กดปุ่มด้านล่างเพื่อเปิดกล้อง
              </p>
              <button 
                className="start-camera-btn" 
                onClick={startCamera}
                style={{
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  padding: '15px 30px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  marginBottom: '10px'
                }}
              >
                📸 เปิดกล้อง
              </button>
              <small style={{color: '#999'}}>
                📱 หากใช้มือถือ กรุณาอนุญาตให้เข้าถึงกล้อง
              </small>
            </div>
          </div>
        ) : (
          <div className="camera-container">
            <div className="camera-video-wrapper">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="camera-video"
              />
              
              {/* Camera status overlay */}
              <div className="camera-status-overlay">
                🔴 กล้องเปิดอยู่
              </div>
              
              {/* Video loading indicator */}
              {cameraStream && !videoRef.current?.videoWidth && (
                <div className="video-loading-overlay">
                  <div className="loading-spinner"></div>
                  <p>กำลังโหลดกล้อง...</p>
                </div>
              )}
            </div>
            
            <div className="camera-controls-bottom">
              <button 
                className="capture-btn"
                onClick={capturePhoto}
                disabled={!selectedTopic}
              >
                📸 ถ่ายรูป {selectedTopic ? `(${selectedTopic})` : ''}
              </button>
              <button 
                className="stop-camera-btn" 
                onClick={stopCamera}
              >
                ⏹️ ปิดกล้อง
              </button>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {/* Debug Info (Remove in production) */}
      {isCameraOn && (
        <div style={{
          background: '#f8f9fa',
          padding: '10px',
          borderRadius: '4px',
          margin: '10px 0',
          fontSize: '12px',
          color: '#666'
        }}>
          <strong>🔧 Camera Debug Info:</strong><br/>
          Video Ready State: {videoRef.current?.readyState || 'N/A'}<br/>
          Video Dimensions: {videoRef.current?.videoWidth || 0} × {videoRef.current?.videoHeight || 0}<br/>
          Stream Active: {cameraStream ? 'Yes' : 'No'}<br/>
          Stream Tracks: {cameraStream?.getTracks().length || 0}<br/>
          Video Source: {videoRef.current?.srcObject ? 'Set' : 'Not Set'}<br/>
          Video Paused: {videoRef.current?.paused ? 'Yes' : 'No'}
        </div>
      )}

      {/* Captured Photos */}
      {capturedPhotos.length > 0 && (
        <div className="captured-photos">
          <h3>รูปที่ถ่ายแล้ว ({capturedPhotos.length})</h3>
          <div className="photos-grid">
            {capturedPhotos.map((photo, index) => (
              <div key={index} className="photo-item">
                <img 
                  src={photo.base64Data} 
                  alt={photo.filename}
                  style={{
                    width: '100%',
                    height: '80px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    border: '2px solid #e0e0e0'
                  }}
                />
                <p style={{fontSize: '12px', margin: '5px 0'}}>{photo.topic}</p>
                <small style={{color: '#666'}}>{photo.videoWidth}×{photo.videoHeight}</small>
              </div>
            ))}
          </div>
          <button 
            className="upload-all-btn" 
            onClick={uploadAllPhotos}
            style={{
              background: '#2196F3',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: 'pointer',
              width: '100%',
              marginTop: '15px'
            }}
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '4px',
                  background: item.completed ? '#e8f5e8' : '#fff3e0',
                  color: item.completed ? '#2e7d32' : '#f57c00',
                  margin: '4px 0'
                }}
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