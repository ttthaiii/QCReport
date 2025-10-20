// Filename: src/components/Camera.tsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api, UploadPhotoData, ProjectConfig } from '../utils/api';
import { addWatermark, WatermarkOptions } from '../utils/watermark';
import './Camera.css';

interface CameraProps {
  qcTopics: ProjectConfig | null;
  projectId: string;
  projectName: string | undefined;
}

interface Geolocation {
  latitude: number;
  longitude: number;
}

const Camera: React.FC<CameraProps> = ({ qcTopics, projectId, projectName }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [location, setLocation] = useState<Geolocation | string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [reportType, setReportType] = useState<'QC' | 'Daily'>('QC');
  const [description, setDescription] = useState<string>('');
  const [dynamicFields, setDynamicFields] = useState<{ [key: string]: string }>({});

  const mainCategories = useMemo(() => qcTopics ? Object.keys(qcTopics) : [], [qcTopics]);
  
  const subCategories = useMemo(() => 
    (qcTopics && selectedMainCategory && qcTopics[selectedMainCategory]) 
    ? Object.keys(qcTopics[selectedMainCategory]) 
    : [], 
  [qcTopics, selectedMainCategory]);
  
  // ✅ 1. แก้ไข: Logic การดึงข้อมูล topics และ dynamicFields ตามโครงสร้างใหม่
  const currentSubCategoryConfig = useMemo(() => {
    if (qcTopics && selectedMainCategory && selectedSubCategory) {
      return qcTopics[selectedMainCategory]?.[selectedSubCategory];
    }
    return { topics: [], dynamicFields: [] };
  }, [qcTopics, selectedMainCategory, selectedSubCategory]);

  const topics = currentSubCategoryConfig?.topics || [];
  const requiredDynamicFields = currentSubCategoryConfig?.dynamicFields || [];

  // --- Effects to set default selections and clear dynamic fields ---
  useEffect(() => {
    if (mainCategories.length > 0 && !selectedMainCategory) setSelectedMainCategory(mainCategories[0]);
  }, [mainCategories, selectedMainCategory]);

  useEffect(() => {
    if (subCategories.length > 0) {
      if (!selectedSubCategory || !subCategories.includes(selectedSubCategory)) {
        setSelectedSubCategory(subCategories[0]);
      }
    } else if (mainCategories.length > 0) {
      setSelectedSubCategory('');
    }
    // ✅ เมื่อหมวดงานย่อยเปลี่ยน ให้ล้างค่า dynamic fields เดิมทิ้ง
    setDynamicFields({});
  }, [subCategories, mainCategories, selectedSubCategory]);

  useEffect(() => {
    if (topics.length > 0) {
      if (!selectedTopic || !topics.includes(selectedTopic)) {
        setSelectedTopic(topics[0]);
      }
    } else if (subCategories.length > 0) {
      setSelectedTopic('');
    }
  }, [topics, subCategories, selectedTopic]);

  const handleDynamicFieldChange = (fieldName: string, value: string) => {
    setDynamicFields(prev => ({ ...prev, [fieldName]: value }));
  };

  // --- Camera and Upload Logic ---
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
        () => setLocation('ไม่สามารถเข้าถึงตำแหน่งได้')
      );
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบการตั้งค่าและอนุญาตให้เข้าถึงกล้อง');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      setPhoto(canvas.toDataURL('image/jpeg'));
      stopCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhoto(event.target?.result as string);
        stopCamera();
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!photo || !projectId) return;
    if (reportType === 'QC' && (!selectedMainCategory || !selectedSubCategory || !selectedTopic)) {
      alert('กรุณาเลือกข้อมูล QC ให้ครบถ้วน');
      return;
    }

    setIsUploading(true);
    setUploadStatus('กำลังเพิ่มลายน้ำ...');

    try {
      const locationString = typeof location === 'object' && location
        ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
        : (location as string) || '';

      // Prepare watermark options based on report type
      const watermarkOptions: WatermarkOptions = reportType === 'QC'
        ? {
            projectName: projectName || 'N/A',
            mainCategory: selectedMainCategory,
            subCategory: selectedSubCategory,
            topic: selectedTopic,
            location: typeof location === 'object' && location 
              ? { latitude: location.latitude, longitude: location.longitude }
              : locationString,
            timestamp: new Date().toISOString()
          }
        : {
            projectName: projectName || 'N/A',
            description: description,
            location: typeof location === 'object' && location 
              ? { latitude: location.latitude, longitude: location.longitude }
              : locationString,
            timestamp: new Date().toISOString()
          };

      // Add watermark to photo
      const watermarkedPhoto = await addWatermark(photo, watermarkOptions);

      setUploadStatus('กำลังอัปโหลดรูปภาพ...');
      
      // Prepare upload data based on report type  
      const uploadData: UploadPhotoData = {
        projectId,
        projectName: projectName || 'N/A',
        reportType,
        photoBase64: watermarkedPhoto,
        timestamp: new Date().toISOString(),
        location: locationString,
        ...(reportType === 'QC' 
          ? {
              mainCategory: selectedMainCategory,
              subCategory: selectedSubCategory,
              topic: selectedTopic,
            }
          : {
              description: description,
            }
        ),
        // ✅ 3. ตรวจสอบ: ข้อมูล dynamicFields จะถูกส่งไปพร้อมกับรูปภาพโดยอัตโนมัติ
        dynamicFields, 
      };

      const response = await api.uploadPhoto(uploadData);

      if (response.success) {
        setUploadStatus('อัปโหลดสำเร็จ!');
        setTimeout(() => {
          setPhoto(null);
          setUploadStatus('');
          setDescription('');
        }, 2000);
      } else {
        throw new Error(response.error || 'Unknown upload error');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadStatus(`อัปโหลดล้มเหลว: ${(error as Error).message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    setPhoto(null);
  };

  useEffect(() => {
    if (!photo) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  return (
    <div className="camera-container">
        <div className="camera-view">
            {photo ? (
            <img src={photo} alt="Captured" className="photo-preview" />
            ) : (
            <video ref={videoRef} autoPlay playsInline className="video-feed"></video>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        </div>

        <div className="controls-container">
            {photo ? (
                <>
                <button onClick={handleRetake} disabled={isUploading} className="control-button retake">
                  ถ่ายใหม่
                </button>
                <button onClick={handleUpload} disabled={isUploading} className="control-button upload">
                  {isUploading ? uploadStatus : 'อัปโหลด'}
                </button>
                </>
            ) : (
                <>
                <label htmlFor="file-upload" className="control-button upload">แนบไฟล์</label>
                <input 
                  id="file-upload" 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileUpload} 
                  style={{display: 'none'}}
                />
                <button onClick={takePhoto} className="control-button capture">
                  <span className="capture-icon"></span>
                </button>
                </>
            )}
        </div>

        <div className="report-type-selector">
            <button 
              className={`type-button ${reportType === 'QC' ? 'active' : ''}`} 
              onClick={() => setReportType('QC')} 
              disabled={isUploading || !!photo}
            >
              ตรวจสอบตามหัวข้อ (QC)
            </button>
            <button 
              className={`type-button ${reportType === 'Daily' ? 'active' : ''}`} 
              onClick={() => setReportType('Daily')} 
              disabled={isUploading || !!photo}
            >
              รายงานประจำวัน (Daily)
            </button>
        </div>

        <div className="form-container">
            {reportType === 'QC' ? (
            <>
                <div className="form-group">
                  <label>หมวดงานหลัก</label>
                  <select 
                    value={selectedMainCategory} 
                    onChange={(e) => setSelectedMainCategory(e.target.value)} 
                    disabled={isUploading || mainCategories.length === 0}
                  >
                      {mainCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>หมวดงานย่อย</label>
                  <select 
                    value={selectedSubCategory} 
                    onChange={(e) => setSelectedSubCategory(e.target.value)} 
                    disabled={isUploading || subCategories.length === 0}
                  >
                      {subCategories.map((subcategory) => (
                        <option key={subcategory} value={subcategory}>{subcategory}</option>
                      ))}
                  </select>
                </div>

                {requiredDynamicFields.map((fieldName) => (
                  <div className="form-group" key={fieldName}>
                    <label>{fieldName}</label>
                    <input
                      type="text"
                      value={dynamicFields[fieldName] || ''}
                      onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
                      placeholder={`ระบุ${fieldName}...`}
                      disabled={isUploading}
                    />
                  </div>
                ))}  
                             
                <div className="form-group">
                  <label>หัวข้อการตรวจ</label>
                  <select 
                    value={selectedTopic} 
                    onChange={(e) => setSelectedTopic(e.target.value)} 
                    disabled={isUploading || topics.length === 0}
                  >
                      {topics.map((topic) => (
                        <option key={topic} value={topic}>{topic}</option>
                      ))}
                  </select>
                </div>
            </>
            ) : (
            <div className="form-group">
                <label>คำบรรยายภาพ (Description)</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  disabled={isUploading} 
                  placeholder="บรรยายสิ่งที่เกิดขึ้นในภาพ..." 
                  rows={4}
                />
            </div>
            )}
        </div>
        {uploadStatus && <div className="status-message">{uploadStatus}</div>}
    </div>
  );
};

export default Camera;