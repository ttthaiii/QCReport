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

async function reverseGeocodeNominatim(latitude: number, longitude: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=th&zoom=18&addressdetails=1`;
  
  try {
    const response = await fetch(url, {
      headers: {
        // [แก้ไข] เปลี่ยนเป็นภาษาอังกฤษทั้งหมด
        // ❗️ อย่าลืมเปลี่ยน [your_email@example.com] เป็นอีเมลของคุณนะครับ
        'User-Agent': 'QCReport-App/1.0 (Contact: [thai.l@tts2004.co.th] for issues)'
      }
    });
    
    const data = await response.json();
    
    if (data && data.address) {
      const addr = data.address;
      
      const district = addr.district || addr.city_district || addr.town || addr.municipality;
      const province = addr.state || addr.province;

      if (district && province) {
        return `${district}\n${province}`;
      } else if (province) {
        return province;
      } else if (district) {
        return district;
      }
      
      return data.display_name.split(',').slice(0, 3).join(', ');
    } else {
      return `พิกัด: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
  } catch (error) {
    console.error('Error fetching Nominatim:', error);
    return `ไม่สามารถระบุสถานที่`; // ⬅️ นี่คือที่มาของข้อความ "ไม่สามารถระบุสถานที่" ครับ
  }
}

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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  // --- State สำหรับกล้องและรูป ---
  const [photoQueue, setPhotoQueue] = useState<Map<string, string>>(new Map()); 
  const [currentTopic, setCurrentTopic] = useState<string>(''); 
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

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
  
  const processNativePhoto = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        img.onload = () => {
          const MAX_WIDTH = 1600;
          const { width, height } = img;
          if (width <= MAX_WIDTH) {
            resolve(img.src);
            return;
          }
          const ratio = MAX_WIDTH / width;
          const newHeight = height * ratio;
          const canvas = document.createElement('canvas');
          canvas.width = MAX_WIDTH;
          canvas.height = newHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return reject(new Error('ไม่สามารถสร้าง canvas context ได้'));
          }
          ctx.drawImage(img, 0, 0, MAX_WIDTH, newHeight);
          const resizedBase64 = canvas.toDataURL('image/jpeg', 0.9);
          resolve(resizedBase64);
        };
        img.onerror = (err) => reject(new Error('ไม่สามารถโหลด Image object ได้'));
        img.src = readerEvent.target?.result as string;
      };
      reader.onerror = (err) => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
      reader.readAsDataURL(file);
    });
  };

  // --- [ใหม่] Function เมื่อ Native Camera ถ่ายเสร็จ ---
  const handleNativeFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (event.target) {
      event.target.value = "";
    }
    if (!file) return;

    setIsProcessingPhoto(true);

    try {
      const photoBase64 = await processNativePhoto(file);
      const newQueue = new Map(photoQueue);

      if (reportType === 'QC' && currentTopic) {
          // --- QC Flow ---
          newQueue.set(currentTopic, photoBase64);
          setPhotoQueue(newQueue);
          setCurrentTopic(''); // เคลียร์ topic
      } else if (reportType === 'Daily' && step === 'camera') {
          // --- Daily Flow ---
          const timestampKey = `daily_${Date.now()}`;
          newQueue.set(timestampKey, photoBase64);
          setPhotoQueue(newQueue);
          // ยังคงอยู่หน้า 'camera'
      }

    } catch (error) {
      console.error("Error processing native photo:", error);
      alert("เกิดข้อผิดพลาดในการประมวลผลรูป: " + (error as Error).message);
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  // 9. [แก้ไข] Logic การอัปโหลดทั้งหมด ---
  const handleUploadAll = async () => {
    if (photoQueue.size === 0) return;
    setIsUploading(true); setUploadStatus(`กำลังอัปโหลด 0/${photoQueue.size}...`); setStep('uploading');
   
    // [ใหม่] ดึง Location สดๆ ตอนกดอัปโหลด
    let locationString = 'ไม่สามารถระบุตำแหน่งได้'; // ⬅️ นี่คือตัวแปรที่เราจะส่งให้ watermark
    try {
      // 1. ดึงพิกัด (เหมือนเดิม)
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
          enableHighAccuracy: true, 
          timeout: 10000 
        });
      });

      // 2. [ใหม่] เรียก Nominatim เพื่อแปลพิกัด
      locationString = await reverseGeocodeNominatim(
        position.coords.latitude,
        position.coords.longitude
      );
      
    } catch (geoError) {
      console.warn('Could not get geolocation or geocode:', geoError);
      locationString = 'ไม่สามารถระบุตำแหน่งได้'; // Fallback
    }
    // [จบส่วนใหม่]

    let successCount = 0; const totalPhotosInQueue = photoQueue.size; const topicsJustUploaded = new Map<string, boolean>();

    try {
      const photosToUpload = Array.from(photoQueue.entries());

      for (const [key, photoBase64] of photosToUpload) {
        if (!photoBase64) continue;

        setUploadStatus(`กำลังเพิ่มลายน้ำรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
        const timestamp = new Date().toISOString();
        const watermarkOptions: WatermarkOptions = { location: locationString, timestamp: timestamp }; // <-- [แก้ไข] ใช้ locationString
        const watermarkedPhoto = await addWatermark(photoBase64, watermarkOptions);
        setUploadStatus(`กำลังอัปโหลดรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);

        let descriptionForUpload = '';
        if (reportType === 'Daily') {
          descriptionForUpload = dailyDescriptions.get(key) || '';
        }

        const uploadData: UploadPhotoData = {
          projectId, projectName: projectName || 'N/A', reportType, photoBase64: watermarkedPhoto, timestamp, 
          location: locationString, // <-- [แก้ไข] ใช้ locationString
          ...(reportType === 'QC'
            ? { mainCategory: selectedMainCategory, subCategory: selectedSubCategory, topic: key, dynamicFields }
            : { description: descriptionForUpload, dynamicFields: {} }
          ),
        };

        const response = await api.uploadPhoto(uploadData);
        if (!response.success) throw new Error(`อัปโหลดล้มเหลวที่รูป: ${reportType === 'QC' ? key : `Daily Photo ${successCount + 1}`} (${response.error})`);

        if (reportType === 'QC') {
            topicsJustUploaded.set(key, true);
        }
        successCount++;
      }

      // --- Logic เมื่ออัปโหลดสำเร็จ (เหมือนเดิม V5) ---
      setUploadStatus(`อัปโหลดสำเร็จ ${successCount} รูป!`);
      const newUploadedStatus = new Map(uploadedStatus); topicsJustUploaded.forEach((value, key) => newUploadedStatus.set(key, value));
      const completedCount = newUploadedStatus.size; const totalTopicCount = topics.length;
      const { id, label } = getCurrentJobIdentifier();

      if (reportType === 'QC') {
        saveRecentJob(projectId, { id, label, reportType, mainCategory: selectedMainCategory, subCategory: selectedSubCategory, dynamicFields, description: '' }, completedCount, totalTopicCount);
        setRecentJobs(getRecentJobs(projectId));
      }

      setTimeout(() => {
        setPhotoQueue(new Map());
        setDailyDescriptions(new Map());
        setIsUploading(false); setUploadStatus('');
        setUploadedStatus(newUploadedStatus);
        setStep('type');
      }, 2000);

    } catch (error) { console.error('Upload failed:', error); setUploadStatus(`อัปโหลดล้มเหลว: ${(error as Error).message}`); setIsUploading(false); }
  };


  // --- Logic การควบคุม Wizard ---
  const resetAllState = () => {
    // [ลบ] setTempPhoto(null)
    setPhotoQueue(new Map()); setCurrentTopic(''); setUploadStatus('');
    setDailyDescriptions(new Map());
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
    cameraInputRef.current?.click(); // <-- เรียกกล้อง Native ทันที
    // [ลบ] setStep('camera');
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

  const goBack = () => {
    if (isUploading) return;
    switch (step) {
      case 'mainCat': setStep('type'); break;
      case 'subCat': setStep('mainCat'); break;
      case 'dynamicFields': setStep('subCat'); break;
      case 'topicList': setStep('type'); break;
      case 'dailyReview': setStep('camera'); break;
      case 'camera':
        // [แก้ไข] หน้านี้สำหรับ Daily เท่านั้น (QC ไม่เข้ามาแล้ว)
        setStep('type');
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

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleNativeFileSelected}
      />

      {/* --- [ใหม่] Global Loading Overlay (สำหรับตอนประมวลผลรูป) --- */}
      {isProcessingPhoto && (
        // (คุณอาจจะต้องเพิ่ม CSS .global-loading-overlay เอง)
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
          }}>
          <div style={{textAlign: 'center'}}>
            <h3>กำลังประมวลผลรูป...</h3>
            <p>กรุณารอสักครู่...</p>
          </div>
        </div>
      )}

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
        // เราจะใช้ .wizard-step เพื่อรักษา Layout V5 เดิม
        <div className="wizard-step" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2>☀️ รายงานประจำวัน</h2>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
            กดปุ่ม "ถ่ายรูป" เพื่อเปิดกล้อง<br/>
            รูปที่ถ่ายจะถูกเพิ่มเข้าคิวอัตโนมัติ
          </p>

          {/* [ใหม่] UI ส่วนกลางสำหรับปุ่มถ่าย */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button 
              className="wizard-button" // <-- ใช้สไตล์ .wizard-button เดิม
              style={{
                padding: '20px 40px',
                fontSize: '1.5rem',
                height: 'auto',
                lineHeight: '1.5'
              }}
              onClick={() => cameraInputRef.current?.click()}
            >
              <span style={{ fontSize: '2.5rem' }}>📷</span>
              <br/>
              ถ่ายรูป
            </button>
          </div>
          
          <p style={{ textAlign: 'center', color: '#666', marginTop: '30px' }}>
            มี {photoQueue.size} รูปในคิว
          </p>

          {/* [ใหม่] Navigation โดยใช้ .wizard-nav (เหมือน V5) */}
          <div className="wizard-nav">
            <button className="wizard-button secondary" onClick={goBack}>
              ย้อนกลับ
            </button>
            
            {photoQueue.size > 0 ? (
              <button 
                className="wizard-button" 
                onClick={() => setStep('dailyReview')}
                title="จัดการรูปและเพิ่มคำบรรยาย"
              >
                📝 จัดการรูป ({photoQueue.size})
              </button>
            ) : (
              // Spacer (เพื่อให้ปุ่ม 'ย้อนกลับ' อยู่ซ้ายสุด)
              <div style={{minWidth: '120px', display: 'inline-block'}}></div> 
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