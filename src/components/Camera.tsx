// Filename: src/components/Camera.tsx (REPLACED - V5 - Persistent State)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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

// 1. [ใหม่] ประเภทข้อมูล "งานที่ทำต่อเนื่อง" ที่เราจะเก็บใน localStorage
interface PersistentJob {
  id: string;
  label: string;
  reportType: 'QC' | 'Daily';
  mainCategory: string;
  subCategory: string;
  dynamicFields: Record<string, string>;
  description: string;
  completedTopics: number; // <-- [เพิ่ม]
  totalTopics: number;     // <-- [เพิ่ม]
}

// 2. [ใหม่] Helper สำหรับ localStorage
const RECENT_JOBS_KEY = 'qc-recent-jobs';

const getRecentJobs = (projectId: string): PersistentJob[] => { // <-- [เพิ่ม] ฟังก์ชันใหม่
  try {
    const data = localStorage.getItem(`${RECENT_JOBS_KEY}_${projectId}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

const saveRecentJob = ( // <-- [แก้ไข] ฟังก์ชันนี้ถูกแก้ไข
  projectId: string,
  job: Omit<PersistentJob, 'completedTopics' | 'totalTopics'>, // รับข้อมูลหลัก
  completedTopics: number, // <-- [เพิ่ม] Parameter
  totalTopics: number      // <-- [เพิ่ม] Parameter
) => {
  const jobs = getRecentJobs(projectId);
  const otherJobs = jobs.filter(j => j.id !== job.id);

  // สร้าง object ที่สมบูรณ์ก่อนบันทึก
  const jobToSave: PersistentJob = { // <-- [เพิ่ม] สร้าง object ที่มี Progress
      ...job,
      completedTopics,
      totalTopics
  };

  const updatedJobs = [jobToSave, ...otherJobs].slice(0, 5);
  localStorage.setItem(`${RECENT_JOBS_KEY}_${projectId}`, JSON.stringify(updatedJobs));
};

// 3. กำหนดขั้นตอนของ Wizard (เหมือนเดิม)
type WizardStep = 
  | 'type'          // 1. เลือกประเภท
  | 'mainCat'       // 2. เลือก Main Category
  | 'subCat'        // 3. เลือก Sub Category
  | 'dynamicFields' // 4. กรอก Dynamic Fields
  | 'topicList'     // 5. หน้า Checklist ของ Topics
  | 'dailyReview'     // 5b. (Daily) กรอก Description
  | 'camera'        // 6. เปิดกล้อง
  | 'uploading';    // 7. กำลังอัปโหลด

const Camera: React.FC<CameraProps> = ({ qcTopics, projectId, projectName }) => {
  // --- State สำหรับ Wizard ---
  const [step, setStep] = useState<WizardStep>('type');

  // --- State สำหรับกล้องและรูป ---
  const streamRef = useRef<MediaStream | null>(null);
  const [tempPhoto, setTempPhoto] = useState<string | null>(null); 
  const [photoQueue, setPhotoQueue] = useState<Map<string, string>>(new Map()); 
  const [currentTopic, setCurrentTopic] = useState<string>(''); 
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [location, setLocation] = useState<Geolocation | string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- 4. [ใหม่] State สำหรับ "งานที่ทำต่อเนื่อง" ---
  const [recentJobs, setRecentJobs] = useState<PersistentJob[]>([]); // <-- [เพิ่ม] State ใหม่
  const [uploadedStatus, setUploadedStatus] = useState<Map<string, boolean>>(new Map()); // <-- [เพิ่ม] State ใหม่
  const [isChecklistLoading, setIsChecklistLoading] = useState(false);

  // --- State สำหรับข้อมูล ---
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [reportType, setReportType] = useState<'QC' | 'Daily'>('QC');
  const [dailyDescriptions, setDailyDescriptions] = useState<Map<string, string>>(new Map());
  const [dynamicFields, setDynamicFields] = useState<{ [key: string]: string }>({});

  // --- Logic การดึงข้อมูล (เหมือนเดิม) ---
  const mainCategories = useMemo(() => qcTopics ? Object.keys(qcTopics) : [], [qcTopics]);
  const subCategories = useMemo(() =>
    (qcTopics && selectedMainCategory && qcTopics[selectedMainCategory])
      ? Object.keys(qcTopics[selectedMainCategory])
      : [],
    [qcTopics, selectedMainCategory]);
  const currentSubCategoryConfig = useMemo(() => {
    if (qcTopics && selectedMainCategory && selectedSubCategory) {
      return qcTopics[selectedMainCategory]?.[selectedSubCategory];
    }
    return { topics: [], dynamicFields: [] };
  }, [qcTopics, selectedMainCategory, selectedSubCategory]);
  const topics = currentSubCategoryConfig?.topics || [];
  const requiredDynamicFields = currentSubCategoryConfig?.dynamicFields || [];

  useEffect(() => { setRecentJobs(getRecentJobs(projectId)); }, [projectId]);

  // 6. [ใหม่] Helper: สร้าง Label และ ID สำหรับ "Job"
  const getCurrentJobIdentifier = (): { id: string, label: string } => { // <-- [เพิ่ม] ฟังก์ชันใหม่
    if (reportType === 'QC') {
      const fieldValues = Object.values(dynamicFields).filter(Boolean).join('_') || 'default';
      const id = `${selectedMainCategory}_${selectedSubCategory}_${fieldValues}`;
      const label = [selectedMainCategory, selectedSubCategory, ...Object.values(dynamicFields).filter(Boolean)].join(' / ');
      return { id, label: `📋 ${label}` };
    } else {
      // ทำให้ Daily มี ID ไม่ซ้ำ (เผื่ออนาคต)
      const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      return { id: `daily_${dateStr}`, label: '☀️ รายงานประจำวัน' };
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      console.log("Camera stopped."); // <-- เพิ่ม Log
    }
  }, []);

  const startCamera = useCallback(async (videoElement: HTMLVideoElement | null) => {
    if (!videoElement) {
        console.error("Video element is NULL in startCamera.");
        stopCamera();
        return;
    }
    // ป้องกันการเรียกซ้ำซ้อน ถ้า stream ยังทำงานอยู่
    if (streamRef.current) {
        console.log("Stream already exists, stopping old one.");
        stopCamera();
    }

    console.log("Attempting to start camera...");
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      console.log("getUserMedia successful:", mediaStream);
      streamRef.current = mediaStream; // <-- เก็บ stream ไว้ใน ref

      console.log("Setting videoElement.srcObject");
      videoElement.srcObject = mediaStream; // <-- ตั้งค่า srcObject ที่นี่

      // ตั้งค่า Geolocation (ย้ายมาไว้หลังสุด)
      navigator.geolocation.getCurrentPosition(
        (position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => setLocation('ไม่สามารถเข้าถึงตำแหน่งได้')
      );
    } catch (error) {
      console.error('ERROR in startCamera:', error);
      alert('ไม่สามารถเปิดกล้องได้ (โปรดดู Console)');
      stopCamera(); // <-- เรียก stopCamera ถ้าเกิด Error
    }
  }, [stopCamera]);
  
  useEffect(() => {
    if (step !== 'camera') {
        stopCamera();
    }
    // Cleanup ตอน unmount
    return () => stopCamera();
  }, [step, stopCamera]);

  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
      // node คือ <video> element ที่ Render เสร็จแล้ว (หรือ null ถ้า unmount)
      if (node && step === 'camera' && !tempPhoto) {
          // ถ้า element พร้อม, อยู่ใน step camera, และยังไม่มีรูปถ่าย
          // ให้เรียก startCamera พร้อมส่ง element ไปด้วย
          startCamera(node);
      } else {
          // ถ้าเงื่อนไขไม่ตรง (เช่น ออกจาก step camera) ให้หยุด stream
          stopCamera();
      }
  // [แก้ไข] เพิ่ม dependency ให้ถูกต้อง
  }, [step, tempPhoto, startCamera, stopCamera]);

  // 7. [ใหม่] Logic: ดึงสถานะ Checklist จาก API ---
  const fetchChecklistStatus = useCallback(async ( // <-- [เพิ่ม] ฟังก์ชันใหม่
    mainCat: string,
    subCat: string,
    fields: Record<string, string>
  ) => {
    if (!mainCat || !subCat) return;

    setIsChecklistLoading(true);
    setUploadedStatus(new Map()); // ล้างสถานะเก่า
    try {
      const response = await api.getChecklistStatus(projectId, mainCat, subCat, fields);
      if (response.success && response.data) {
        setUploadedStatus(new Map(Object.entries(response.data)));
      } else {
        throw new Error(response.error || 'Failed to fetch status');
      }
    } catch (error) {
      console.error('Error fetching checklist status:', error);
      alert(`ไม่สามารถดึงสถานะงาน: ${(error as Error).message}`);
    }
    setIsChecklistLoading(false);
  }, [projectId]);

  // 8. [ใหม่] Effect: เรียก API นี้เมื่อเข้าสู่หน้า topicList
  useEffect(() => { // <-- [เพิ่ม] Effect ใหม่
    if (step === 'topicList') {
      fetchChecklistStatus(selectedMainCategory, selectedSubCategory, dynamicFields);
    }
  }, [step, selectedMainCategory, selectedSubCategory, dynamicFields, fetchChecklistStatus]);
  
  // --- Logic การถ่าย/ยืนยันรูป (เหมือนเดิม) ---
  const takePhoto = () => {
    // [แก้ไข] ต้องเช็ค videoElement จาก Callback Ref (แต่เราใช้ tempPhoto แทน)
    const videoNode = document.querySelector('.video-feed') as HTMLVideoElement; // <-- หา Element ตรงๆ (อาจจะไม่ใช่วิธีที่ดีที่สุด)
    if (videoNode && canvasRef.current && videoNode.readyState >= 2) { // เช็ค readyState เพิ่ม
      const canvas = canvasRef.current;
      canvas.width = videoNode.videoWidth;
      canvas.height = videoNode.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
          context.drawImage(videoNode, 0, 0, canvas.width, canvas.height);
          setTempPhoto(canvas.toDataURL('image/jpeg'));
          stopCamera(); // หยุดกล้องหลังถ่าย
      } else {
          console.error("Failed to get canvas context");
      }
    } else {
        console.error("Cannot take photo: video node not found, canvas ref missing, or video not ready.");
        alert("ไม่สามารถถ่ายรูปได้: กล้องยังไม่พร้อม");
    }
  };
  const handleRetake = () => { setTempPhoto(null); };

  const handleConfirmPhoto = () => { // <-- [แก้ไข] Logic สำหรับ Daily
    if (!tempPhoto) return;
    const timestampKey = `daily_${Date.now()}`; // <-- ใช้ Timestamp เป็น Key

    if (reportType === 'QC') {
      const newQueue = new Map(photoQueue);
      newQueue.set(currentTopic, tempPhoto);
      setPhotoQueue(newQueue);
      setTempPhoto(null);
      setStep('topicList');
    } else {
      // --- [แก้ไข] Daily Report ---
      const newQueue = new Map(photoQueue);
      newQueue.set(timestampKey, tempPhoto); // <-- เพิ่มรูปล่าสุดเข้าคิว
      setPhotoQueue(newQueue);
      setTempPhoto(null); // <-- ล้างรูปชั่วคราว
      // ไม่ต้องเปลี่ยน Step! ให้อยู่หน้า camera ต่อไป
      // setStep('dailyReview'); // <-- ลบบรรทัดนี้
    }
  };

  // 9. [แก้ไข] Logic การอัปโหลดทั้งหมด ---
  const handleUploadAll = async () => {
    if (photoQueue.size === 0) return;
    setIsUploading(true); setUploadStatus(`กำลังอัปโหลด 0/${photoQueue.size}...`); setStep('uploading');
    const locationString = typeof location === 'object' && location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : (location as string) || '';
    let successCount = 0; const totalPhotosInQueue = photoQueue.size; const topicsJustUploaded = new Map<string, boolean>();

    try {
      const photosToUpload = Array.from(photoQueue.entries()); // <-- [แก้ไข] ดึงทั้ง Key และ Value

      for (const [key, photoBase64] of photosToUpload) { // <-- [แก้ไข] วน Loop ด้วย Key และ Value
        if (!photoBase64) continue;

        setUploadStatus(`กำลังเพิ่มลายน้ำรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
        const timestamp = new Date().toISOString(); const watermarkOptions: WatermarkOptions = { location: locationString, timestamp: timestamp }; const watermarkedPhoto = await addWatermark(photoBase64, watermarkOptions);
        setUploadStatus(`กำลังอัปโหลดรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);

        let descriptionForUpload = '';
        if (reportType === 'Daily') {
          descriptionForUpload = dailyDescriptions.get(key) || ''; // <-- [แก้ไข] ใช้ชื่อ State ที่ถูกต้อง
        }

        const uploadData: UploadPhotoData = {
          projectId, projectName: projectName || 'N/A', reportType, photoBase64: watermarkedPhoto, timestamp, location: locationString,
          ...(reportType === 'QC'
            ? { mainCategory: selectedMainCategory, subCategory: selectedSubCategory, topic: key, dynamicFields } // <-- QC ใช้ Key เป็น Topic
            : { description: descriptionForUpload, dynamicFields: {} } // <-- Daily ใช้ Description ที่หามา
          ),
        };

        const response = await api.uploadPhoto(uploadData);
        if (!response.success) throw new Error(`อัปโหลดล้มเหลวที่รูป: ${reportType === 'QC' ? key : `Daily Photo ${successCount + 1}`} (${response.error})`);

        if (reportType === 'QC') {
            topicsJustUploaded.set(key, true); // <-- QC เก็บ Topic ที่อัปโหลด
        }
        successCount++;
      }

      // --- Logic เมื่ออัปโหลดสำเร็จ ---
      setUploadStatus(`อัปโหลดสำเร็จ ${successCount} รูป!`);
      const newUploadedStatus = new Map(uploadedStatus); topicsJustUploaded.forEach((value, key) => newUploadedStatus.set(key, value));
      const completedCount = newUploadedStatus.size; const totalTopicCount = topics.length;
      const { id, label } = getCurrentJobIdentifier();

      if (reportType === 'QC') {
        saveRecentJob(projectId, { id, label, reportType, mainCategory: selectedMainCategory, subCategory: selectedSubCategory, dynamicFields, description: '' }, completedCount, totalTopicCount);
        setRecentJobs(getRecentJobs(projectId));
      } else {
         // ไม่ต้องบันทึก Daily ลง Recent Jobs (ตาม Logic เดิม)
      }

      setTimeout(() => {
        setPhotoQueue(new Map());
        setDailyDescriptions(new Map()); // <-- [แก้ไข] ใช้ชื่อ State ที่ถูกต้อง
        setIsUploading(false); setUploadStatus('');
        setUploadedStatus(newUploadedStatus);
        setStep('type');
      }, 2000);

    } catch (error) { console.error('Upload failed:', error); setUploadStatus(`อัปโหลดล้มเหลว: ${(error as Error).message}`); setIsUploading(false); }
  };


  // --- Logic การควบคุม Wizard ---

  const resetAllState = () => {
    setTempPhoto(null); setPhotoQueue(new Map()); setCurrentTopic(''); setUploadStatus('');
    // setDescription(''); // <-- [ลบ] ลบ State description ตัวเก่า
    setDailyDescriptions(new Map()); // <-- ใช้ State ใหม่แทน
    setSelectedMainCategory(''); setSelectedSubCategory(''); setDynamicFields({});
    setUploadedStatus(new Map()); setStep('type'); setRecentJobs(getRecentJobs(projectId));
  };

  const handleDynamicFieldChange = (fieldName: string, value: string) => {
    setDynamicFields(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleSelectReportType = (type: 'QC' | 'Daily') => { // <-- [แก้ไข] Daily ไป Camera
      resetAllState();
      setReportType(type);
      if (type === 'QC') setStep('mainCat');
      else setStep('camera'); // <-- ไป Camera เลย
  };

  const handleSelectMainCat = (mainCat: string) => {
    setSelectedMainCategory(mainCat);
    setSelectedSubCategory('');
    setPhotoQueue(new Map());
    setUploadedStatus(new Map());
    setStep('subCat');
  };

  const handleSelectSubCat = (subCat: string) => {
    setSelectedSubCategory(subCat);
    setPhotoQueue(new Map());
    setUploadedStatus(new Map());
    
    const config = qcTopics?.[selectedMainCategory]?.[subCat];
    if (config?.dynamicFields && config.dynamicFields.length > 0) {
      setStep('dynamicFields');
    } else {
      setStep('topicList');
    }
  };

  const handleDynamicFieldsSubmit = () => {
    setPhotoQueue(new Map());
    setUploadedStatus(new Map());
    setStep('topicList');
  };
  
  const handleStartPhotoForTopic = (topic: string) => {
    setCurrentTopic(topic);
    setStep('camera');
  };

  // --- [ใหม่] ฟังก์ชันสำหรับอัปเดต Daily Description ---
  const handleDailyDescriptionChange = (photoKey: string, text: string) => {
    const newDescriptions = new Map(dailyDescriptions); // <-- [แก้ไข] ใช้ชื่อ State ที่ถูกต้อง
    newDescriptions.set(photoKey, text);
    setDailyDescriptions(newDescriptions); // <-- [แก้ไข] ใช้ชื่อ State ที่ถูกต้อง
  };

  // --- [ใหม่] ฟังก์ชันสำหรับลบรูป Daily ออกจากคิว ---
  const handleDeleteDailyPhoto = (photoKey: string) => {
    const newQueue = new Map(photoQueue);
    const newDescriptions = new Map(dailyDescriptions); // <-- [แก้ไข] ใช้ชื่อ State ที่ถูกต้อง
    newQueue.delete(photoKey);
    newDescriptions.delete(photoKey);
    setPhotoQueue(newQueue);
    setDailyDescriptions(newDescriptions); // <-- [แก้ไข] ใช้ชื่อ State ที่ถูกต้อง
  };

  // 10. [ใหม่] เมื่อกดเลือก "Job" จาก localStorage
  const handleSelectRecentJob = (job: PersistentJob) => {
    if (job.reportType === 'QC') {
        setReportType('QC'); setSelectedMainCategory(job.mainCategory); setSelectedSubCategory(job.subCategory); setDynamicFields(job.dynamicFields);
        setPhotoQueue(new Map()); setUploadedStatus(new Map()); setStep('topicList');
    } else {
        setReportType('Daily');
        // setDescription(job.description || ''); // <-- [ลบ] ไม่มี State description ตัวเก่าแล้ว
        setPhotoQueue(new Map()); setDailyDescriptions(new Map()); // <-- เคลียร์ Map แทน
        setStep('camera');
    }
  };

  const goBack = () => { // <-- [แก้ไข] ตาม Logic ล่าสุด
    if (isUploading) return;
    switch (step) {
      case 'mainCat': setStep('type'); break;
      case 'subCat': setStep('mainCat'); break;
      case 'dynamicFields': setStep('subCat'); break;
      case 'topicList': setStep('type'); break; // <-- กลับหน้าแรก
      case 'dailyReview': setStep('camera'); break; // <-- [แก้ไข] Review กลับไป Camera
      case 'camera':
        // ถ้ามาจาก QC -> กลับไป topicList
        // ถ้ามาจาก Daily -> กลับไป type
        if (reportType === 'QC') setStep('topicList');
        else setStep('type');
        break;
      default:
        setStep('type');
    }
  };

  // --- Render ส่วนของ Wizard ---
  const renderChecklistHeader = () => {
    if (reportType === 'QC') {
      const parts = [selectedMainCategory, selectedSubCategory, ...Object.values(dynamicFields)];
      return <div className="checklist-header">{parts.filter(Boolean).join(' / ')}</div>;
    }
    return null;
  };

  const renderDailyReviewItem = ([key, photoBase64]: [string, string]) => (
    <div key={key} className="daily-review-item"> {/* <-- ใช้ Class ใหม่ */}
      <img src={photoBase64} alt={`Daily ${key}`} className="daily-review-thumbnail" /> {/* <-- ใช้ Class ใหม่ */}
      <textarea
        value={dailyDescriptions.get(key) || ''}
        onChange={(e) => handleDailyDescriptionChange(key, e.target.value)}
        placeholder="เพิ่มคำบรรยาย (Optional)..."
        rows={3} // <-- ลด rows ลงได้
        className="daily-review-textarea" // <-- ใช้ Class ใหม่
      />
      <button onClick={() => handleDeleteDailyPhoto(key)} className="daily-review-delete-button">🗑️</button> {/* <-- ใช้ Class ใหม่, เอาคำว่า ลบ ออก */}
    </div>
  );

  return (
    <div className="wizard-container">
      
      {/* 1. Step: เลือกประเภท (แก้ไข) */}
      {step === 'type' && (
        <div className="wizard-step">
          <h2>1. เลือกประเภทรายงาน</h2>
          <div className="selection-grid">
            <div className="selection-card" onClick={() => handleSelectReportType('QC')}>
              <span style={{fontSize: '2rem'}}>📋</span>
              <p>รายงาน QC (ตามหัวข้อ)</p>
            </div>
            <div className="selection-card daily" onClick={() => handleSelectReportType('Daily')}>
              <span style={{fontSize: '2rem'}}>☀️</span>
              <p>รายงานประจำวัน (Daily)</p>
            </div>
          </div>

          {/* --- 11. [ใหม่] แสดง "งานที่ทำต่อเนื่อง" --- */}
          {recentJobs.length > 0 && (
            <div className="recent-jobs-container">
              <h3>📌 งานที่ค้างอยู่</h3>
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="recent-job-item"
                  onClick={() => handleSelectRecentJob(job)} // <-- [แก้ไข] ใช้ handleSelectRecentJob
                >
                  {/* แสดง Label */}
                  <span>{job.label}</span>
                  {/* แสดง Progress เฉพาะ QC และถ้ามีข้อมูล */}
                  {job.reportType === 'QC' && job.totalTopics > 0 && (
                     <span className="job-progress">
                       (ถ่ายแล้ว {job.completedTopics}/{job.totalTopics})
                     </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Step: เลือก Main Category */}
      {step === 'mainCat' && (
        <div className="wizard-step">
          <h2>2. เลือกหมวดงานหลัก</h2>
          {renderChecklistHeader()}
          <div className="selection-grid">
            {mainCategories.map((mainCat) => (
              <div key={mainCat} className="selection-card" onClick={() => handleSelectMainCat(mainCat)}>
                {mainCat}
              </div>
            ))}
          </div>
          <div className="wizard-nav">
            <button className="wizard-button secondary" onClick={goBack}>ย้อนกลับ</button>
          </div>
        </div>
      )}
      
      {/* 3. Step: เลือก Sub Category */}
      {step === 'subCat' && (
        <div className="wizard-step">
          <h2>3. เลือกหมวดงานย่อย</h2>
          {renderChecklistHeader()}
          <div className="selection-grid">
            {subCategories.map((subCat) => (
              <div key={subCat} className="selection-card" onClick={() => handleSelectSubCat(subCat)}>
                {subCat}
              </div>
            ))}
          </div>
          <div className="wizard-nav">
            <button className="wizard-button secondary" onClick={goBack}>ย้อนกลับ</button>
          </div>
        </div>
      )}

      {/* 4. Step: กรอก Dynamic Fields */}
      {step === 'dynamicFields' && (
        <div className="wizard-step">
          <h2>4. กรอกข้อมูลเพิ่มเติม</h2>
          {renderChecklistHeader()}
          {requiredDynamicFields.map((fieldName) => (
            <div className="form-group" key={fieldName}>
              <label>{fieldName}</label>
              <input
                type="text"
                value={dynamicFields[fieldName] || ''}
                onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
                placeholder={`ระบุ${fieldName}...`}
              />
            </div>
          ))}
          <div className="wizard-nav">
            <button className="wizard-button secondary" onClick={goBack}>ย้อนกลับ</button>
            <button className="wizard-button" onClick={handleDynamicFieldsSubmit}>ถัดไป</button>
          </div>
        </div>
      )}

      {/* 5. [แก้ไข] Step: Topic Checklist */}
      {step === 'topicList' && (
        <div className="wizard-step">
          <h2>5. ถ่ายรูปตามหัวข้อ</h2>
          {renderChecklistHeader()}

          {isChecklistLoading ? ( // <-- [เพิ่ม] แสดง Loading ตอนรอ API
            <div className="loading-container" style={{height: '50vh'}}>กำลังตรวจสอบสถานะ...</div>
          ) : (
            <>
              <div className="topic-list">
                {topics.map((topic) => {
                  // 10. [แก้ไข] Logic การแสดงสถานะ ✅/🔄/⚪️
                  const isQueued = photoQueue.has(topic); // อยู่ในคิวรออัปโหลด
                  const isUploaded = uploadedStatus.has(topic); // อัปโหลดไปแล้ว (จาก API)

                  const statusIcon = isUploaded ? '✅' : (isQueued ? '🔄' : '⚪️');
                  // [แก้ไข] ถ้าอัปโหลดแล้ว ให้เป็นปุ่มถ่ายใหม่ (🔄) ไม่ใช่ 📷
                  const buttonIcon = (isUploaded || isQueued) ? '🔄' : '📷';
                  const buttonClass = (isQueued || isUploaded) ? 'retake' : '';
                  const statusLabel = isUploaded ? '(อัปโหลดแล้ว)' : (isQueued ? '(ในคิว)' : '');

                  return (
                    <div key={topic} className="topic-list-item">
                      <span className="topic-list-item-status">
                        {statusIcon}
                      </span>
                      <span className="topic-list-item-name">
                        {topic} <span style={{color: '#888', fontSize: '0.8em'}}>{statusLabel}</span>
                      </span>
                      <button
                        className={`topic-list-item-button ${buttonClass}`}
                        onClick={() => handleStartPhotoForTopic(topic)}
                      >
                        {buttonIcon}
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                className="upload-all-button"
                disabled={photoQueue.size === 0 || isUploading}
                onClick={handleUploadAll}
              >
                📤 อัปโหลด ({photoQueue.size}) รูปที่เลือก
              </button>
            </>
          )}

          <div className="wizard-nav">
            <button className="wizard-button secondary" onClick={goBack}>ย้อนกลับ</button>
          </div>
        </div>
      )}

      {step === 'dailyReview' && (
        <div className="wizard-step">
          <h2>📝 จัดการรูป & คำบรรยาย (Daily)</h2>

          {/* ใช้ List Layout ใหม่ */}
          <div className="daily-review-list"> {/* <-- ใช้ Class ใหม่ */}
             {photoQueue.size > 0 ? Array.from(photoQueue.entries()).map(renderDailyReviewItem) : null}
          </div>

          {photoQueue.size === 0 && ( <p style={{textAlign: 'center', color: '#888', margin: '40px 0'}}>ยังไม่มีรูปถ่าย</p> )}

          {/* ปุ่มควบคุมเหมือนเดิม */}
          <button
            className="upload-all-button"
            onClick={handleUploadAll}
            disabled={isUploading || photoQueue.size === 0}
          >
            📤 อัปโหลดทั้งหมด ({photoQueue.size}) รูป
          </button>
          <div className="wizard-nav" style={{ justifyContent: 'center', borderTop: 'none', paddingTop: '10px' }}>
            <button className="wizard-button secondary" onClick={() => setStep('camera')}>
               📷 กลับไปถ่ายรูปเพิ่ม
            </button>
          </div>
        </div>
      )}

    {/* 6. Step: เปิดกล้อง (แก้ไขเล็กน้อย) */}
      {step === 'camera' && (
        <div className="camera-view-container">
          <div className="camera-topic-overlay">
            {reportType === 'QC' ? currentTopic : '☀️ รายงานประจำวัน'}
            {/* [เพิ่ม] แสดงจำนวนรูปในคิวสำหรับ Daily */}
            {reportType === 'Daily' && photoQueue.size > 0 &&
              ` (${photoQueue.size} รูปในคิว)`
            }
          </div>
          {tempPhoto ? (
            <img src={tempPhoto} alt="Captured" className="photo-preview" />
          ) : (
            // [แก้ไข] ใช้ Callback Ref
            <video ref={videoCallbackRef} autoPlay playsInline className="video-feed"></video>
          )}
          {/* canvas ยังต้องมี แต่ซ่อนไว้ */}
          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
          <div className="camera-controls">
            {tempPhoto ? (
              <>
                <button onClick={handleRetake} className="retake-button">ถ่ายใหม่</button>
                <button onClick={handleConfirmPhoto} className="confirm-button">ยืนยันรูปนี้</button>
              </>
            ) : (
              <>
                <button onClick={goBack} className="retake-button">
                    {reportType === 'QC' ? 'ย้อนกลับ' : 'ยกเลิก'}
                 </button>
                <button onClick={takePhoto} className="capture-button"></button>
                {/* [ใหม่] ปุ่มไปหน้า Review สำหรับ Daily */}
                {reportType === 'Daily' && photoQueue.size > 0 ? (
                  <button onClick={() => setStep('dailyReview')} className="review-button" title="จัดการรูป"> {/* <-- อาจจะต้องเพิ่ม Class นี้ใน CSS */}
                    📝 ({photoQueue.size})
                  </button>
                ) : (
                  <div style={{width: '90px'}}></div> /* Spacer */
                )}
              </>
            )}
          </div>
        </div>
      )}

    {/* 7. Step: กำลังอัปโหลด (แก้ไขปุ่ม "กลับไปแก้ไข") */}
    {step === 'uploading' && (
      <div className="wizard-step" style={{textAlign: 'center', paddingTop: '100px'}}>
        <h2>{uploadStatus}</h2>
        {isUploading && <p>กรุณารอสักครู่...</p>}
        {!isUploading && uploadStatus.includes('ล้มเหลว') && (
          // [แก้ไข] ถ้า Daily ล้มเหลว ให้กลับไปหน้า Review
          <button className="wizard-button" onClick={() => setStep(reportType === 'QC' ? 'topicList' : 'dailyReview')}>
            กลับไปแก้ไข
          </button>
        )}
      </div>
    )}

    </div>
  );
};

export default Camera;