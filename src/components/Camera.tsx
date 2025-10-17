// Filename: src/components/Camera.tsx

import React, { useState, useEffect, useRef } from 'react';
import { api, UploadPhotoData } from '../utils/api.ts';
import { addWatermark } from '../utils/watermark.ts';
import './Camera.css';

// "พิมพ์เขียว" สำหรับข้อมูล Project Config
export interface ProjectConfig {
  [category: string]: string[];
}

// "พิมพ์เขียว" สำหรับ Props ที่ Component นี้ได้รับมาจาก App.tsx
interface CameraProps {
  qcTopics: ProjectConfig | null;
  projectId: string;
  projectName: string | undefined;
}

// "พิมพ์เขียว" สำหรับข้อมูลตำแหน่ง
interface Geolocation {
  latitude: number;
  longitude: number;
}

const Camera: React.FC<CameraProps> = ({ qcTopics, projectId, projectName }) => {
  // --- States and Refs ---
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [location, setLocation] = useState<Geolocation | string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [topicsForCategory, setTopicsForCategory] = useState<string[]>([]);

  // States for Feature: Daily Report
  const [reportType, setReportType] = useState<'QC' | 'Daily'>('QC');
  const [description, setDescription] = useState<string>('');
  const [dynamicFields, setDynamicFields] = useState<object>({});

  // --- Logic ---

  useEffect(() => {
    if (qcTopics && Object.keys(qcTopics).length > 0) {
      const firstCategory = Object.keys(qcTopics)[0];
      setSelectedCategory(firstCategory);
    } else {
      setSelectedCategory('');
    }
  }, [qcTopics]);

  useEffect(() => {
    if (selectedCategory && qcTopics && qcTopics[selectedCategory]) {
      const topics = qcTopics[selectedCategory];
      setTopicsForCategory(topics);
      setSelectedTopic(topics[0] || '');
    } else {
      setTopicsForCategory([]);
      setSelectedTopic('');
    }
  }, [selectedCategory, qcTopics]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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
    if (reportType === 'QC' && (!selectedCategory || !selectedTopic)) {
      alert('กรุณาเลือกหมวดงานและหัวข้อให้ครบถ้วน');
      return;
    }

    setIsUploading(true);
    setUploadStatus('กำลังเพิ่มลายน้ำ...');

    try {
      const locationString = typeof location === 'object' && location
        ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
        : (location as string) || '';

      const watermarkText = reportType === 'QC'
        ? { category: selectedCategory, topic: selectedTopic }
        : { category: 'Daily Report', topic: description.substring(0, 50) };

      // ตอนนี้ TypeScript รู้จัก UploadPhotoData แล้ว และจะไม่มี Error
      const uploadMetadata: UploadPhotoData = reportType === 'QC'
        ? {
            type: 'QC',
            projectId,
            category: selectedCategory,
            topic: selectedTopic,
            location: locationString,
            dynamicFields,
          }
        : {
            type: 'Daily',
            projectId,
            description: description,
            location: locationString,
            dynamicFields,
          };

      const watermarkedBlob = await addWatermark(photo, {
        projectName: projectName || 'N/A',
        ...watermarkText,
        location: locationString,
      });

      setUploadStatus('กำลังอัปโหลดรูปภาพ...');
      
      const response = await api.uploadPhoto(watermarkedBlob, uploadMetadata);

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
      {/* --- ส่วน JSX ที่เหลือเหมือนเดิม --- */}
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
              <button onClick={handleRetake} disabled={isUploading} className="control-button retake">ถ่ายใหม่</button>
              <button onClick={handleUpload} disabled={isUploading} className="control-button upload">{isUploading ? uploadStatus : 'อัปโหลด'}</button>
            </>
        ) : (
            <>
              <label htmlFor="file-upload" className="control-button upload">แนบไฟล์</label>
              <input id="file-upload" type="file" accept="image/*" onChange={handleFileUpload} style={{display: 'none'}}/>
              <button onClick={takePhoto} className="control-button capture"><span className="capture-icon"></span></button>
            </>
        )}
      </div>

      <div className="report-type-selector">
        <button className={`type-button ${reportType === 'QC' ? 'active' : ''}`} onClick={() => setReportType('QC')} disabled={isUploading || !!photo}>ตรวจสอบตามหัวข้อ (QC)</button>
        <button className={`type-button ${reportType === 'Daily' ? 'active' : ''}`} onClick={() => setReportType('Daily')} disabled={isUploading || !!photo}>รายงานประจำวัน (Daily)</button>
      </div>

      <div className="form-container">
        {reportType === 'QC' ? (
          <>
            <div className="form-group">
              <label>หมวดงาน</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} disabled={isUploading}>
                <option value="" disabled>-- เลือกหมวดงาน --</option>
                {qcTopics && Object.keys(qcTopics).map((category) => (<option key={category} value={category}>{category}</option>))}
              </select>
            </div>
            <div className="form-group">
              <label>หัวข้อการตรวจ</label>
              <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)} disabled={isUploading || topicsForCategory.length === 0}>
                <option value="" disabled>-- เลือกหัวข้อ --</option>
                {topicsForCategory.map((topic) => (<option key={topic} value={topic}>{topic}</option>))}
              </select>
            </div>
          </>
        ) : (
          <div className="form-group">
            <label>คำบรรยายภาพ (Description)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={isUploading} placeholder="บรรยายสิ่งที่เกิดขึ้นในภาพ..." rows={4}/>
          </div>
        )}
      </div>
      {uploadStatus && <div className="status-message">{uploadStatus}</div>}
    </div>
  );
};

export default Camera;