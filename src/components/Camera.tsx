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
  | 'dailyDesc'     // 5b. (Daily) กรอก Description
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- 4. [ใหม่] State สำหรับ "งานที่ทำต่อเนื่อง" ---
  const [recentJobs, setRecentJobs] = useState<PersistentJob[]>([]); // <-- [เพิ่ม] State ใหม่
  const [uploadedStatus, setUploadedStatus] = useState<Map<string, boolean>>(new Map()); // <-- [เพิ่ม] State ใหม่
  const [isChecklistLoading, setIsChecklistLoading] = useState(false);

  // --- State สำหรับข้อมูล ---
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [reportType, setReportType] = useState<'QC' | 'Daily'>('QC');
  const [description, setDescription] = useState<string>('');
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
  
  // 5. [ใหม่] Effect: โหลด "Recent Jobs" จาก localStorage ตอนเริ่ม
  useEffect(() => { // <-- [เพิ่ม] Effect ใหม่
    setRecentJobs(getRecentJobs(projectId));
  }, [projectId]);

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
  
  // --- Logic การเปิด/ปิดกล้อง (เหมือนเดิม) ---
  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = mediaStream;
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
      navigator.geolocation.getCurrentPosition(
        (position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => setLocation('ไม่สามารถเข้าถึงตำแหน่งได้')
      );
    } catch (error) { console.error('Error accessing camera:', error); alert('ไม่สามารถเปิดกล้องได้'); }
  }, []);
  
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (step === 'camera' && !tempPhoto) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
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
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      setTempPhoto(canvas.toDataURL('image/jpeg'));
      stopCamera();
    }
  };
  const handleRetake = () => { setTempPhoto(null); };

  const handleConfirmPhoto = () => {
    if (!tempPhoto) return;
    if (reportType === 'QC') {
      const newQueue = new Map(photoQueue);
      newQueue.set(currentTopic, tempPhoto);
      setPhotoQueue(newQueue);
      setTempPhoto(null);
      setStep('topicList'); 
    } else {
      const newQueue = new Map();
      newQueue.set(description || 'Daily Photo', tempPhoto);
      setPhotoQueue(newQueue);
      setTempPhoto(null);
      setStep('dailyDesc');
    }
  };

  // 9. [แก้ไข] Logic การอัปโหลดทั้งหมด ---
  const handleUploadAll = async () => { // <-- [แก้ไข] ฟังก์ชันนี้ถูกแก้ไข
    if (photoQueue.size === 0) return;

    setIsUploading(true);
    setUploadStatus(`กำลังอัปโหลด 0/${photoQueue.size}...`);
    setStep('uploading');

    const locationString = typeof location === 'object' && location
      ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
      : (location as string) || '';

    let successCount = 0;
    const totalPhotosInQueue = photoQueue.size;
    const topicsJustUploaded = new Map<string, boolean>(); // Map ของที่เพิ่งอัปโหลดสำเร็จในรอบนี้

    try {
      const topicsToUpload = Array.from(photoQueue.keys());
      for (const topicOrDesc of topicsToUpload) {
        const photoBase64 = photoQueue.get(topicOrDesc);
        if (!photoBase64) continue;

        setUploadStatus(`กำลังเพิ่มลายน้ำรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
        const timestamp = new Date().toISOString();
        const watermarkOptions: WatermarkOptions = { location: locationString, timestamp: timestamp };
        const watermarkedPhoto = await addWatermark(photoBase64, watermarkOptions);
        setUploadStatus(`กำลังอัปโหลดรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
        const uploadData: UploadPhotoData = {
            projectId, projectName: projectName || 'N/A', reportType, photoBase64: watermarkedPhoto, timestamp, location: locationString,
            ...(reportType === 'QC' ? { mainCategory: selectedMainCategory, subCategory: selectedSubCategory, topic: topicOrDesc, dynamicFields } : { description: topicOrDesc, dynamicFields: {} }),
        };

        const response = await api.uploadPhoto(uploadData);
        if (!response.success) {
          throw new Error(`อัปโหลดล้มเหลวที่รูป: ${topicOrDesc} (${response.error})`);
        }

        topicsJustUploaded.set(topicOrDesc, true);
        successCount++;
      }

      // --- Logic เมื่ออัปโหลดสำเร็จ ---
      setUploadStatus(`อัปโหลดสำเร็จ ${successCount} รูป!`);

      // [แก้ไข] คำนวณ Progress ใหม่
      const newUploadedStatus = new Map(uploadedStatus); // <-- สร้าง Map ใหม่จากสถานะเดิม
      topicsJustUploaded.forEach((value, key) => newUploadedStatus.set(key, value)); // <-- รวมกับอันที่เพิ่งอัปโหลด
      const completedCount = newUploadedStatus.size; // <-- นับจำนวน ✅ ทั้งหมด
      const totalTopicCount = topics.length; // <-- จำนวน Topic ทั้งหมดในหมวดนี้

      // [แก้ไข] บันทึก "Job" นี้ลงใน localStorage พร้อม Progress
      const { id, label } = getCurrentJobIdentifier();
      if (reportType === 'QC') {
        saveRecentJob(projectId, { // ส่งข้อมูลหลัก
          id, label, reportType,
          mainCategory: selectedMainCategory,
          subCategory: selectedSubCategory,
          dynamicFields: dynamicFields,
          description: ''
        },
        completedCount, // ส่ง Progress
        totalTopicCount // ส่ง Progress
        );
        setRecentJobs(getRecentJobs(projectId)); // <-- [เพิ่ม] อัปเดต State recentJobs ทันที
      } else {
         // (ถ้าต้องการจำ Daily Job ด้วย ก็เพิ่ม Logic ที่นี่)
         // saveRecentJob(projectId, { id, label, reportType, ... }, 0, 0);
         // setRecentJobs(getRecentJobs(projectId));
      }


      setTimeout(() => {
        setPhotoQueue(new Map());
        setIsUploading(false);
        setUploadStatus('');
        setUploadedStatus(newUploadedStatus); // <-- [แก้ไข] อัปเดตสถานะ ✅ ด้วย Map ที่รวมแล้ว
        setStep(reportType === 'QC' ? 'topicList' : 'type');
      }, 2000);

    } catch (error) {
      console.error('Upload failed:', error);
      setUploadStatus(`อัปโหลดล้มเหลว: ${(error as Error).message}`);
      setIsUploading(false);
    }
  };


  // --- Logic การควบคุม Wizard ---

  const resetAllState = () => { // <-- [แก้ไข] เพิ่มการโหลด Recent Jobs
    setTempPhoto(null);
    setPhotoQueue(new Map());
    setCurrentTopic('');
    setUploadStatus('');
    setDescription('');
    setSelectedMainCategory('');
    setSelectedSubCategory('');
    setDynamicFields({});
    setUploadedStatus(new Map());
    setStep('type');
    setRecentJobs(getRecentJobs(projectId)); // <-- [เพิ่ม] โหลด Recent Jobs ใหม่ทุกครั้งที่ Reset
  };

  const handleDynamicFieldChange = (fieldName: string, value: string) => {
    setDynamicFields(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleSelectReportType = (type: 'QC' | 'Daily') => {
    // [แก้ไข] Reset state ก่อนเลือกใหม่
    resetAllState(); 
    setReportType(type);
    if (type === 'QC') {
      setStep('mainCat');
    } else {
      setStep('dailyDesc');
    }
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

  const handleDailyDescSubmit = () => {
    if (photoQueue.size === 0) {
      setStep('camera');
    } else {
      handleUploadAll();
    }
  };

  // 10. [ใหม่] เมื่อกดเลือก "Job" จาก localStorage
  const handleSelectRecentJob = (job: PersistentJob) => { // <-- [เพิ่ม] ฟังก์ชันใหม่
    if (job.reportType === 'QC') {
      setReportType('QC');
      setSelectedMainCategory(job.mainCategory);
      setSelectedSubCategory(job.subCategory);
      setDynamicFields(job.dynamicFields);
      setPhotoQueue(new Map()); // เริ่มคิวใหม่เสมอ
      setUploadedStatus(new Map()); // ล้างสถานะ (เดี๋ยว useEffect จะโหลดใหม่)
      setStep('topicList'); // [สำคัญ] ข้ามไปหน้า Checklist เลย
    } else {
      setReportType('Daily');
      setDescription(job.description || '');
      setPhotoQueue(new Map());
      setUploadedStatus(new Map());
      setStep('dailyDesc');
    }
  };

  const goBack = () => {
    if (isUploading) return;
    switch (step) {
      case 'mainCat': setStep('type'); break;
      case 'subCat': setStep('mainCat'); break;
      case 'dynamicFields': setStep('subCat'); break;
      case 'topicList': // <-- ✨ [แก้ไข] ให้กลับไปหน้าแรกเสมอ
        setStep('type'); 
        break; 
      case 'dailyDesc': setStep('type'); break;
      case 'camera':
        if (reportType === 'QC') setStep('topicList');
        else setStep('dailyDesc');
        break;
      default:
        // ถ้าอยู่ที่หน้าแรก (type) แล้วกดย้อนกลับ อาจจะไม่ต้องทำอะไรเลย
        // หรือจะให้ resetAllState() ก็ได้ แล้วแต่ UX ที่ต้องการ
        // resetAllState(); // <--- อาจจะเอาออก ถ้าไม่ต้องการ Reset ตอนอยู่หน้าแรก
        setStep('type'); // <--- หรือแค่บังคับให้อยู่หน้าแรก
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

      {/* 5b. Step: (Daily) กรอก Description */}
      {step === 'dailyDesc' && (
        <div className="wizard-step">
          <h2>2. กรอกคำบรรยาย (Daily)</h2>
          <div className="form-group">
            <label>คำบรรยายภาพ (Description)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="บรรยายสิ่งที่เกิดขึ้นในภาพ..."
              rows={5}
            />
          </div>
          {photoQueue.size > 0 && (
            <div style={{textAlign: 'center', margin: '20px 0'}}>
              <img 
                src={photoQueue.values().next().value} 
                alt="Daily preview" 
                style={{maxWidth: '50%', height: 'auto', borderRadius: '8px'}} 
              />
              <p>✅ ถ่ายรูปแล้ว</p>
            </div>
          )}
          <div className="wizard-nav">
            <button className="wizard-button secondary" onClick={goBack}>ย้อนกลับ</button>
            <button 
              className="wizard-button" 
              onClick={handleDailyDescSubmit}
              disabled={!description}
            >
              {photoQueue.size === 0 ? 'ถัดไป (เปิดกล้อง)' : '📤 อัปโหลดเลย'}
            </button>
          </div>
        </div>
      )}

      {/* 6. Step: เปิดกล้อง */}
      {step === 'camera' && (
        <div className="camera-view-container">
          <div className="camera-topic-overlay">
            {reportType === 'QC' ? currentTopic : 'รายงาน Daily'}
          </div>
          {tempPhoto ? (
            <img src={tempPhoto} alt="Captured" className="photo-preview" />
          ) : (
            <video ref={videoRef} autoPlay playsInline className="video-feed"></video>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
          <div className="camera-controls">
            {tempPhoto ? (
              <>
                <button onClick={handleRetake} className="retake-button">ถ่ายใหม่</button>
                <button onClick={handleConfirmPhoto} className="confirm-button">ยืนยันรูปนี้</button>
              </>
            ) : (
              <>
                <button onClick={goBack} className="retake-button">ย้อนกลับ</button>
                <button onClick={takePhoto} className="capture-button"></button>
                <div style={{width: '90px'}}></div> {/* Spacer */}
              </>
            )}
          </div>
        </div>
      )}

      {/* 7. Step: กำลังอัปโหลด */}
      {step === 'uploading' && (
        <div className="wizard-step" style={{textAlign: 'center', paddingTop: '100px'}}>
          <h2>{uploadStatus}</h2>
          {isUploading && <p>กรุณารอสักครู่...</p>}
          {!isUploading && uploadStatus.includes('ล้มเหลว') && (
            <button className="wizard-button" onClick={() => setStep(reportType === 'QC' ? 'topicList' : 'dailyDesc')}>
              กลับไปแก้ไข
            </button>
          )}
        </div>
      )}

    </div>
  );
};

export default Camera;