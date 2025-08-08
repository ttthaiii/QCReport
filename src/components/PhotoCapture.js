// src/components/PhotoCapture.js (StrictMode Compatible)
import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [cameraError, setCameraError] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // ✅ Stable refs with initialization tracking
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const cleanupInProgressRef = useRef(false);
  const componentIdRef = useRef(Math.random()); // Unique component ID
  const videoReadyTimeoutRef = useRef(null);

  // Context hooks
  const { api } = useApi();
  const { setLoading } = useLoading();

  // Buildings and foundations options
  const buildings = ['A', 'B', 'C'];
  const foundations = ['F01', 'F02', 'F03', 'F04', 'F05'];

  // ✅ Enhanced cleanup with better tracking
  const cleanupCamera = useCallback(() => {
    if (cleanupInProgressRef.current) return;
    
    cleanupInProgressRef.current = true;
    console.log(`🧹 [${componentIdRef.current.toString().substring(2, 6)}] Starting cleanup...`);
    
    try {
      // Clear timeout
      if (videoReadyTimeoutRef.current) {
        clearTimeout(videoReadyTimeoutRef.current);
        videoReadyTimeoutRef.current = null;
      }

      // Stop stream tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          console.log(`🛑 Stopping ${track.kind} track: ${track.label}`);
          track.stop();
        });
        streamRef.current = null;
      }
      
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      
      // Reset video element
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.load();
      }
      
      // Reset states
      setCameraStream(null);
      setIsCameraOn(false);
      setVideoReady(false);
      setCameraError(null);
      setIsStartingCamera(false);
      
      console.log(`✅ [${componentIdRef.current.toString().substring(2, 6)}] Cleanup completed`);
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    } finally {
      cleanupInProgressRef.current = false;
    }
  }, [cameraStream]);

  // ✅ Stable mount effect
  useEffect(() => {
    console.log(`🔄 [${componentIdRef.current.toString().substring(2, 6)}] PhotoCapture mounted`);
    
    // Load initial data
    loadTopics();
    getCurrentLocation();
    
    // Cleanup on unmount only
    return () => {
      console.log(`🔄 [${componentIdRef.current.toString().substring(2, 6)}] PhotoCapture unmounting`);
      cleanupCamera();
    };
  }, []); // ✅ Empty deps - only run once

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
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }
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

  // ✅ Improved start camera with better state management
  const startCamera = async () => {
    if (isStartingCamera) {
      console.log('🔄 Camera start already in progress');
      return;
    }

    const componentId = componentIdRef.current.toString().substring(2, 6);
    
    try {
      console.log(`📸 [${componentId}] Starting camera process...`);
      setIsStartingCamera(true);
      setCameraError(null);
      setVideoReady(false);
      
      // Cleanup existing stream first
      if (streamRef.current || cameraStream) {
        console.log(`🛑 [${componentId}] Cleaning up existing stream...`);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (cameraStream) {
          cameraStream.getTracks().forEach(track => track.stop());
        }
        streamRef.current = null;
        setCameraStream(null);
        
        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Set camera on and wait for render
      setIsCameraOn(true);
      await new Promise(resolve => setTimeout(resolve, 150));
      
      console.log(`🔍 [${componentId}] Checking refs:`, {
        video: !!videoRef.current,
        canvas: !!canvasRef.current
      });
      
      if (!videoRef.current || !canvasRef.current) {
        throw new Error('Video or Canvas element not available');
      }

      // Check browser support
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Browser does not support camera access');
      }

      const constraints = {
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280, min: 640, max: 1920 },
          height: { ideal: 720, min: 480, max: 1080 }
        },
        audio: false
      };

      console.log(`🎥 [${componentId}] Requesting camera permission...`);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!stream?.active) {
        throw new Error('Camera stream is not active');
      }

      console.log(`✅ [${componentId}] Camera permission granted, setting up video...`);
      
      streamRef.current = stream;
      setCameraStream(stream);
      
      // ✅ Enhanced video setup with immediate dimension checking
      const video = videoRef.current;
      
      // Event handlers
      const handleVideoReady = () => {
        const hasValidDimensions = video.videoWidth > 0 && video.videoHeight > 0;
        const isReadyState = video.readyState >= 2; // HAVE_CURRENT_DATA
        
        console.log(`📹 [${componentId}] Video check:`, {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          hasValidDimensions,
          isReadyState
        });
        
        if (hasValidDimensions && isReadyState) {
          console.log(`✅ [${componentId}] Video is ready for capture`);
          setVideoReady(true);
          
          if (videoReadyTimeoutRef.current) {
            clearTimeout(videoReadyTimeoutRef.current);
            videoReadyTimeoutRef.current = null;
          }
        }
      };

      const handleLoadedMetadata = () => {
        console.log(`📹 [${componentId}] Video metadata loaded`);
        handleVideoReady();
      };

      const handleCanPlay = () => {
        console.log(`📹 [${componentId}] Video can play`);
        handleVideoReady();
      };

      const handlePlay = () => {
        console.log(`📹 [${componentId}] Video playing`);
        handleVideoReady();
      };

      const handleError = (e) => {
        console.error(`❌ [${componentId}] Video error:`, e);
        setCameraError('Video playback error');
      };

      // Clear existing listeners
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);  
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('error', handleError);

      // Add new listeners
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('play', handlePlay); 
      video.addEventListener('error', handleError);

      // Configure video
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.controls = false;

      // ✅ Multiple play attempts with better timing
      const attemptPlay = async () => {
        for (let i = 0; i < 3; i++) {
          try {
            console.log(`📹 [${componentId}] Play attempt ${i + 1}/3`);
            await video.play();
            console.log(`✅ [${componentId}] Video play successful`);
            
            // Check dimensions immediately after play
            setTimeout(handleVideoReady, 100);
            break;
          } catch (playError) {
            console.warn(`⚠️ [${componentId}] Play attempt ${i + 1} failed:`, playError.message);
            if (i < 2) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
        }
      };

      // Start playing
      setTimeout(attemptPlay, 200);

      // ✅ Enhanced timeout with dimension polling
      videoReadyTimeoutRef.current = setTimeout(() => {
        console.log(`⏰ [${componentId}] Video ready timeout, checking dimensions...`);
        handleVideoReady();
        
        // If still not ready, try polling
        if (!videoReady && video.videoWidth === 0) {
          console.log(`🔄 [${componentId}] Starting dimension polling...`);
          
          let pollCount = 0;
          const pollInterval = setInterval(() => {
            pollCount++;
            console.log(`🔍 [${componentId}] Poll ${pollCount}: ${video.videoWidth}x${video.videoHeight}`);
            
            if (video.videoWidth > 0 || pollCount >= 10) {
              clearInterval(pollInterval);
              handleVideoReady();
            }
          }, 500);
        }
      }, 2000);
      
    } catch (error) {
      console.error(`❌ [${componentId}] Camera initialization failed:`, error);
      
      // Reset state on error
      setIsCameraOn(false);
      setVideoReady(false);
      
      let userMessage = 'ไม่สามารถเปิดกล้องได้';
      
      if (error.name === 'NotAllowedError') {
        userMessage = '🚫 การเข้าถึงกล้องถูกปฏิเสธ\n\nกรุณาคลิก "อนุญาต" เมื่อเบราว์เซอร์ถาม\nหรือตรวจสอบการตั้งค่าเบราว์เซอร์';
      } else if (error.name === 'NotFoundError') {
        userMessage = '📷 ไม่พบกล้องในอุปกรณ์นี้\n\nตรวจสอบการเชื่อมต่อกล้อง';
      } else if (error.name === 'NotReadableError') {
        userMessage = '🔒 กล้องกำลังถูกใช้งานโดยแอปอื่น\n\nปิดแอปอื่นที่ใช้กล้อง';
      } else if (error.name === 'SecurityError') {
        userMessage = '🔐 ต้องใช้ HTTPS เพื่อเข้าถึงกล้อง';
      } else if (error.message.includes('element')) {
        userMessage = '🔧 ปัญหาการโหลดหน้าเว็บ\n\nรีเฟรชหน้าเว็บ (Ctrl+F5)';
      }
      
      setCameraError(userMessage);
      alert(`${userMessage}\n\n🔧 รายละเอียด: ${error.message}`);
      
    } finally {
      setIsStartingCamera(false);
    }
  };

  // Stop camera
  const stopCamera = () => {
    console.log(`🛑 [${componentIdRef.current.toString().substring(2, 6)}] User requested camera stop`);
    cleanupCamera();
  };

  // Enhanced capture photo
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
    
    if (!video || !canvas) {
      alert('❌ ส่วนประกอบไม่พร้อม กรุณาปิด-เปิดกล้องใหม่');
      return;
    }

    if (!videoReady || !video.videoWidth || !video.videoHeight) {
      alert('⏳ กรุณารอให้กล้องพร้อมสมบูรณ์');
      return;
    }
    
    try {
      const componentId = componentIdRef.current.toString().substring(2, 6);
      console.log(`📸 [${componentId}] Capturing photo...`);
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const base64Data = canvas.toDataURL('image/jpeg', 0.85);
      
      if (!base64Data || base64Data.length < 1000) {
        throw new Error('ไม่สามารถจับภาพได้');
      }
      
      const photoData = {
        base64Data,
        filename: `${selectedBuilding}-${selectedFoundation}-${selectedTopic.replace(/[/\\?%*:|"<>]/g, '_')}-${Date.now()}.jpg`,
        building: selectedBuilding,
        foundation: selectedFoundation,
        category: selectedCategory,
        topic: selectedTopic,
        location,
        timestamp: new Date().toISOString(),
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        dataSize: Math.round(base64Data.length * 0.75)
      };

      setCapturedPhotos(prev => [...prev, photoData]);
      setSelectedTopic('');
      
      // Visual feedback
      if (video.style) {
        video.style.filter = 'brightness(1.5)';
        setTimeout(() => {
          if (video.style) video.style.filter = '';
        }, 150);
      }
      
      console.log(`✅ [${componentId}] Photo captured:`, photoData.filename);
      alert('✅ ถ่ายรูปเสร็จสิ้น!');
      
    } catch (error) {
      console.error('❌ Capture error:', error);
      alert(`เกิดข้อผิดพลาด: ${error.message}`);
    }
  };

  // Upload all photos (unchanged)
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
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
        console.error('Upload error:', error);
      }
    }

    setLoading(false);
    
    if (successCount > 0) {
      setCapturedPhotos([]);
      loadTopicStatus();
      alert(`🎉 อัปโหลดเสร็จสิ้น!\n✅ สำเร็จ: ${successCount} รูป${errorCount > 0 ? `\n❌ ล้มเหลว: ${errorCount} รูป` : ''}`);
    } else {
      alert('❌ อัปโหลดล้มเหลว กรุณาลองใหม่');
    }
  };

  // Helper functions
  const getAvailableTopics = () => {
    return topics[selectedCategory] || [];
  };

  const isTopicCompleted = (topic) => {
    const categoryStatus = topicStatus[selectedCategory];
    if (!categoryStatus) return false;
    return categoryStatus.find(t => t.topic === topic)?.completed || false;
  };

  return (
    <div className="photo-capture-container">
      {/* ✅ Always present hidden elements */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted
        style={{ display: 'none' }} 
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

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
            <select value={selectedBuilding} onChange={(e) => setSelectedBuilding(e.target.value)}>
              {buildings.map(building => (
                <option key={building} value={building}>อาคาร {building}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>ฐานราก:</label>
            <select value={selectedFoundation} onChange={(e) => setSelectedFoundation(e.target.value)}>
              {foundations.map(foundation => (
                <option key={foundation} value={foundation}>{foundation}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>หมวดงาน:</label>
            <select value={selectedCategory} onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedTopic('');
            }}>
              <option value="">-- เลือกหมวดงาน --</option>
              {Object.keys(topics).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>หัวข้อ:</label>
            <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)} disabled={!selectedCategory}>
              <option value="">-- เลือกหัวข้อ --</option>
              {getAvailableTopics().map(topic => (
                <option key={topic} value={topic} className={isTopicCompleted(topic) ? 'completed' : ''}>
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
            <div style={{
              background: '#f8f9fa',
              border: '2px dashed #dee2e6',
              borderRadius: '12px',
              padding: '40px 20px',
              textAlign: 'center',
              minHeight: '300px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <div style={{fontSize: '4rem', marginBottom: '20px'}}>📸</div>
              <h3>กล้องยังไม่เปิด</h3>
              <p style={{maxWidth: '350px', marginBottom: '20px', lineHeight: '1.5'}}>
                กดปุ่มด้านล่างเพื่อเปิดกล้อง<br/>
                <small>📱 อนุญาตให้เข้าถึงกล้องเมื่อเบราว์เซอร์ถาม</small>
              </p>
              
              {cameraError && (
                <div style={{
                  background: '#f8d7da',
                  border: '1px solid #f5c2c7',
                  borderRadius: '8px',
                  padding: '15px',
                  marginBottom: '20px',
                  color: '#721c24',
                  fontSize: '14px',
                  maxWidth: '400px',
                  whiteSpace: 'pre-line',
                  textAlign: 'left'
                }}>
                  {cameraError}
                </div>
              )}
              
              <button 
                onClick={startCamera}
                disabled={isStartingCamera}
                style={{
                  background: isStartingCamera ? '#6c757d' : '#28a745',
                  color: 'white',
                  border: 'none',
                  padding: '14px 28px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  cursor: isStartingCamera ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '180px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              >
                {isStartingCamera ? '🔄 กำลังเปิดกล้อง...' : '📸 เปิดกล้อง'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{position: 'relative'}}>
            <div style={{
              background: '#000',
              borderRadius: '12px',
              overflow: 'hidden',
              position: 'relative',
              minHeight: '300px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {/* ✅ Video display with better visibility control */}
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '70vh',
                  minHeight: '300px',
                  objectFit: 'cover',
                  display: isCameraOn && videoReady ? 'block' : 'none'
                }}
              />
              
              {isCameraOn && !videoReady && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'white',
                  textAlign: 'center',
                  background: 'rgba(0,0,0,0.8)',
                  padding: '20px',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    border: '4px solid rgba(255,255,255,0.3)',
                    borderTop: '4px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 15px'
                  }}></div>
                  <p>กำลังตั้งค่ากล้อง...</p>
                  <small>อนุญาตการเข้าถึงหากมีข้อความถาม</small>
                </div>
              )}
              
              {isCameraOn && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: videoReady ? 'rgba(40, 167, 69, 0.9)' : 'rgba(255, 193, 7, 0.9)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {videoReady ? '🟢 พร้อมถ่ายรูป' : '🟡 กำลังเตรียม...'}
                </div>
              )}
            </div>
            
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '15px',
              marginTop: '15px',
              padding: '15px',
              background: '#f8f9fa',
              borderRadius: '8px'
            }}>
              <button 
                onClick={capturePhoto}
                disabled={!selectedTopic || !videoReady}
                style={{
                  background: (selectedTopic && videoReady) ? '#dc3545' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '14px 28px',
                  borderRadius: '25px',
                  fontSize: '16px',
                  cursor: (selectedTopic && videoReady) ? 'pointer' : 'not-allowed',
                  minWidth: '140px',
                  transition: 'all 0.2s'
                }}
              >
                📸 ถ่ายรูป
              </button>
              <button 
                onClick={stopCamera}
                style={{
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '14px 28px',
                  borderRadius: '25px',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                ⏹️ ปิดกล้อง
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          background: '#e9ecef',
          padding: '10px',
          borderRadius: '6px',
          margin: '10px 0',
          fontSize: '11px',
          fontFamily: 'monospace',
          border: '1px solid #ced4da'
        }}>
          <strong>🔧 Debug [{componentIdRef.current.toString().substring(2, 6)}]:</strong><br/>
          Video Ref: {videoRef.current ? '✅' : '❌'} | 
          Canvas Ref: {canvasRef.current ? '✅' : '❌'} | 
          Camera On: {isCameraOn ? '✅' : '❌'} | 
          Video Ready: {videoReady ? '✅' : '❌'} | 
          Stream Active: {streamRef.current?.active ? '✅' : '❌'}
          {videoRef.current && isCameraOn && (
            <div style={{marginTop: '5px'}}>
              Video State: readyState={videoRef.current.readyState} | 
              Dimensions: {videoRef.current.videoWidth}×{videoRef.current.videoHeight} | 
              SrcObject: {videoRef.current.srcObject ? '✅' : '❌'}
            </div>
          )}
        </div>
      )}

      {/* Captured Photos */}
      {capturedPhotos.length > 0 && (
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '20px'
        }}>
          <h3>📷 รูปที่ถ่ายแล้ว ({capturedPhotos.length})</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '15px',
            margin: '15px 0'
          }}>
            {capturedPhotos.map((photo, index) => (
              <div key={index} style={{
                textAlign: 'center',
                background: '#f8f9fa',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
              }}>
                <img 
                  src={photo.base64Data} 
                  alt={photo.filename}
                  style={{
                    width: '100%',
                    height: '80px',
                    objectFit: 'cover',
                    borderRadius: '6px',
                    marginBottom: '8px'
                  }}
                />
                <p style={{fontSize: '12px', margin: '0 0 4px 0', fontWeight: '600'}}>
                  {photo.topic}
                </p>
                <small style={{color: '#6c757d', fontSize: '10px'}}>
                  {photo.videoWidth}×{photo.videoHeight}<br/>
                  {Math.round(photo.dataSize/1024)}KB
                </small>
              </div>
            ))}
          </div>
          <button 
            onClick={uploadAllPhotos}
            style={{
              background: 'linear-gradient(135deg, #007bff, #0056b3)',
              color: 'white',
              border: 'none',
              padding: '14px 28px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              width: '100%',
              boxShadow: '0 4px 12px rgba(0, 123, 255, 0.3)',
              transition: 'all 0.2s'
            }}
          >
            📤 อัปโหลดทั้งหมด ({capturedPhotos.length} รูป)
          </button>
        </div>
      )}

      {/* Topic Status */}
      {selectedCategory && topicStatus[selectedCategory] && (
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3>📋 สถานะหัวข้อ - {selectedCategory}</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '8px',
            marginTop: '15px'
          }}>
            {topicStatus[selectedCategory].map((item, index) => (
              <div key={index} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px',
                borderRadius: '8px',
                background: item.completed ? '#d4edda' : '#fff3cd',
                color: item.completed ? '#155724' : '#856404',
                border: `1px solid ${item.completed ? '#c3e6cb' : '#ffeaa7'}`,
                fontSize: '14px'
              }}>
                <span>{item.completed ? '✅' : '⭕'}</span>
                <span style={{flex: 1}}>{item.topic}</span>
                {item.completed && (
                  <small style={{fontSize: '11px', opacity: 0.8}}>✓</small>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSS for animations */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default PhotoCapture;