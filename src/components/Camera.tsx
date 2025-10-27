// Filename: src/components/Camera.tsx (REFACTORED - V6 - ID Based)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// [แก้ไข] 1. Import Types ใหม่ที่เราสร้างขึ้นมา
import { api, UploadPhotoData, ProjectConfig, MainCategory, SubCategory, Topic } from '../utils/api';
import { addWatermark, WatermarkOptions } from '../utils/watermark';
import './Camera.css';

interface CameraProps {
  qcTopics: ProjectConfig | null; // <-- นี่คือ MainCategory[] | null
  projectId: string;
  projectName: string | undefined;
}

interface Geolocation {
  latitude: number;
  longitude: number;
}

// ... (Interface PersistentJob, getRecentJobs, reverseGeocodeNominatim, saveRecentJob ไม่ต้องแก้) ...
interface PersistentJob {
  id: string;
  label: string;
  reportType: 'QC' | 'Daily';
  mainCategory: string;
  subCategory: string;
  description: string; // <--- เพิ่มบรรทัดนี้กลับเข้าไป
  dynamicFields: Record<string, string>;
  completedTopics: number;
  totalTopics: number;
}

interface PhotoQueueItem {
  base64: string;
  addWatermark: boolean;
}

const RECENT_JOBS_KEY = 'qc-recent-jobs';
const getRecentJobs = (projectId: string): PersistentJob[] => {
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
      headers: { 'User-Agent': 'QCReport-App/1.0 (Contact: [thai.l@tts2004.co.th] for issues)' }
    });
    const data = await response.json();
    if (data && data.address) {
      const addr = data.address;
      const district = addr.district || addr.city_district || addr.town || addr.municipality;
      const province = addr.state || addr.province;
      if (district && province) return `${district}\n${province}`;
      else if (province) return province;
      else if (district) return district;
      return data.display_name.split(',').slice(0, 3).join(', ');
    } else {
      return `พิกัด: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
  } catch (error) {
    console.error('Error fetching Nominatim:', error);
    return `ไม่สามารถระบุสถานที่`;
  }
}
const saveRecentJob = (
  projectId: string,
  job: Omit<PersistentJob, 'completedTopics' | 'totalTopics'>,
  completedTopics: number,
  totalTopics: number
) => {
  const jobs = getRecentJobs(projectId);
  const otherJobs = jobs.filter(j => j.id !== job.id);
  const jobToSave: PersistentJob = { ...job, completedTopics, totalTopics };
  const updatedJobs = [jobToSave, ...otherJobs].slice(0, 5);
  localStorage.setItem(`${RECENT_JOBS_KEY}_${projectId}`, JSON.stringify(updatedJobs));
};

type WizardStep = 
  | 'type'
  | 'mainCat'
  | 'subCat'
  | 'dynamicFields'
  | 'topicList'
  | 'dailyReview'
  | 'camera'
  | 'uploading';

const Camera: React.FC<CameraProps> = ({ qcTopics, projectId, projectName }) => {
  const [step, setStep] = useState<WizardStep>('type');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const [photoQueue, setPhotoQueue] = useState<Map<string, PhotoQueueItem>>(new Map());
  const [currentTopic, setCurrentTopic] = useState<string>(''); 
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [recentJobs, setRecentJobs] = useState<PersistentJob[]>([]);
  const [uploadedStatus, setUploadedStatus] = useState<Map<string, boolean>>(new Map());
  const [isChecklistLoading, setIsChecklistLoading] = useState(false);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>(''); // <-- เก็บ 'name'
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');  // <-- เก็บ 'name'
  const [reportType, setReportType] = useState<'QC' | 'Daily'>('QC');
  const [dailyDescriptions, setDailyDescriptions] = useState<Map<string, string>>(new Map());
  const [dynamicFields, setDynamicFields] = useState<{ [key: string]: string }>({});
  const [addWatermarkToAttached, setAddWatermarkToAttached] = useState<boolean>(true);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  // --- [แก้ไข] 2. Logic การดึงข้อมูล (Refactored for ID-based Array) ---
  const mainCategories: MainCategory[] = useMemo(() => qcTopics || [], [qcTopics]);
  
  const selectedMainCat: MainCategory | undefined = useMemo(() =>
    mainCategories.find(m => m.name === selectedMainCategory),
  [mainCategories, selectedMainCategory]);

  const subCategories: SubCategory[] = useMemo(() =>
    selectedMainCat?.subCategories || [],
  [selectedMainCat]);

  const selectedSubCat: SubCategory | undefined = useMemo(() =>
    subCategories.find(s => s.name === selectedSubCategory),
  [subCategories, selectedSubCategory]);

  const topics: Topic[] = useMemo(() =>
    selectedSubCat?.topics || [],
  [selectedSubCat]);
  
  const requiredDynamicFields: string[] = useMemo(() =>
    selectedSubCat?.dynamicFields || [],
  [selectedSubCat]);
  // --- สิ้นสุดการแก้ไข ---

  useEffect(() => { setRecentJobs(getRecentJobs(projectId)); }, [projectId]);

  const getCurrentJobIdentifier = (): { id: string, label: string } => {
    if (reportType === 'QC') {
      const fieldValues = Object.values(dynamicFields).filter(Boolean).join('_') || 'default';
      // [แก้ไข] 3. ใช้ ID ที่เสถียร (ถ้ามี) หรือ Name (ถ้าไม่มี)
      const mainId = selectedMainCat?.id || selectedMainCategory;
      const subId = selectedSubCat?.id || selectedSubCategory;
      const id = `${mainId}_${subId}_${fieldValues}`;
      const label = [selectedMainCategory, selectedSubCategory, ...Object.values(dynamicFields).filter(Boolean)].join(' / ');
      return { id, label: `📋 ${label}` };
    } else {
      const dateStr = new Date().toISOString().split('T')[0];
      return { id: `daily_${dateStr}`, label: '☀️ รายงานประจำวัน' };
    }
  };

  const fetchChecklistStatus = useCallback(async (
    mainCat: string,
    subCat: string,
    fields: Record<string, string>
  ) => {
    if (!mainCat || !subCat) return;
    setIsChecklistLoading(true);
    setUploadedStatus(new Map());
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

  useEffect(() => {
    if (step === 'topicList' && reportType === 'QC') { // <-- [แก้ไข] เพิ่ม check reportType
      fetchChecklistStatus(selectedMainCategory, selectedSubCategory, dynamicFields);
    }
  }, [step, reportType, selectedMainCategory, selectedSubCategory, dynamicFields, fetchChecklistStatus]);
  
  const processNativePhoto = (file: File): Promise<string> => {
    // ... (ฟังก์ชันนี้ไม่ต้องแก้) ...
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

  const handleNativeFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
    isNewCapture: boolean // true = ถ่าย, false = แนบ
  ) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = "";
    if (!file) return;
    setIsProcessingPhoto(true);
    
    try {
      const photoBase64 = await processNativePhoto(file);
      
      // Logic การตัดสินใจว่าจะใส่ลายน้ำหรือไม่
      // 1. ถ้าถ่ายใหม่ (isNewCapture=true) -> บังคับใส่ลายน้ำ
      // 2. ถ้าแนบไฟล์ (isNewCapture=false) -> ดูจากค่า Checkbox
      const shouldAddWatermark = isNewCapture || addWatermarkToAttached;
      
      const newQueueItem: PhotoQueueItem = {
        base64: photoBase64,
        addWatermark: shouldAddWatermark
      };
      
      const newQueue = new Map(photoQueue);
      
      if (reportType === 'QC' && currentTopic) {
          newQueue.set(currentTopic, newQueueItem); // <-- ใส่ Item object
          setPhotoQueue(newQueue);
          setCurrentTopic('');
      } else if (reportType === 'Daily' && step === 'camera') {
          const timestampKey = `daily_${Date.now()}`;
          newQueue.set(timestampKey, newQueueItem); // <-- ใส่ Item object
          setPhotoQueue(newQueue);
      }
    } catch (error) {
      console.error("Error processing native photo:", error);
      alert("เกิดข้อผิดพลาดในการประมวลผลรูป: " + (error as Error).message);
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleUploadAll = async () => {
    if (photoQueue.size === 0) return;
    setIsUploading(true); setUploadStatus(`กำลังอัปโหลด 0/${photoQueue.size}...`); setStep('uploading');
    let locationString = 'ไม่สามารถระบุตำแหน่งได้';
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
          enableHighAccuracy: true, timeout: 10000 
        });
      });
      locationString = await reverseGeocodeNominatim(
        position.coords.latitude,
        position.coords.longitude
      );
    } catch (geoError) {
      console.warn('Could not get geolocation or geocode:', geoError);
      locationString = 'ไม่สามารถระบุตำแหน่งได้';
    }
    
    // ... (ตรรกะการวนลูป Upload ไม่ต้องแก้) ...
    let successCount = 0; const totalPhotosInQueue = photoQueue.size; const topicsJustUploaded = new Map<string, boolean>();
    try {
      const photosToUpload = Array.from(photoQueue.entries()); // <-- ได้ Array ของ [key, PhotoQueueItem]
      
      for (const [key, photoItem] of photosToUpload) {
        if (!photoItem || !photoItem.base64) continue;
        
        let photoToUpload = photoItem.base64; // รูปตั้งต้น (อาจจะไม่ใส่ลายน้ำ)
        
        // --- ตรวจสอบว่าต้องใส่ลายน้ำหรือไม่ ---
        if (photoItem.addWatermark) {
          setUploadStatus(`กำลังเพิ่มลายน้ำรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
          const timestamp = new Date().toISOString();
          const watermarkOptions: WatermarkOptions = { location: locationString, timestamp: timestamp };
          photoToUpload = await addWatermark(photoItem.base64, watermarkOptions); // ได้รูปใหม่ที่มีลายน้ำ
        } else {
          // ไม่ต้องใส่ลายน้ำ
          setUploadStatus(`กำลังเตรียมรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
        }
        // ------------------------------------

        setUploadStatus(`กำลังอัปโหลดรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
        
        let descriptionForUpload = '';
        if (reportType === 'Daily') {
          descriptionForUpload = dailyDescriptions.get(key) || '';
        }
        
        const uploadData: UploadPhotoData = {
          projectId, projectName: projectName || 'N/A', reportType, 
          photoBase64: photoToUpload, // <-- [แก้ไข] ใช้รูปที่ผ่านการตรวจสอบแล้ว
          timestamp: new Date().toISOString(), // <-- [แก้ไข] timestamp ควรเป็นเวลาปัจจุบันเสมอ
          location: locationString,
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

      // ... (ตรรกะ Success ไม่ต้องแก้) ...
      setUploadStatus(`อัปโหลดสำเร็จ ${successCount} รูป!`);
      const newUploadedStatus = new Map(uploadedStatus); topicsJustUploaded.forEach((value, key) => newUploadedStatus.set(key, value));
      const completedCount = newUploadedStatus.size;
      const totalTopicCount = topics.length; // <-- [แก้ไข] 4. topics ตอนนี้เป็น Array
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
    setPhotoQueue(new Map()); setCurrentTopic(''); setUploadStatus('');
    setDailyDescriptions(new Map());
    setSelectedMainCategory(''); setSelectedSubCategory(''); setDynamicFields({});
    setUploadedStatus(new Map()); setStep('type'); setRecentJobs(getRecentJobs(projectId));
    setAddWatermarkToAttached(true); // [ใหม่] 7. Reset Checkbox
  };

  const handleDynamicFieldChange = (fieldName: string, value: string) => {
    setDynamicFields(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleSelectReportType = (type: 'QC' | 'Daily') => {
      resetAllState();
      setReportType(type);
      if (type === 'QC') setStep('mainCat');
      else setStep('camera');
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
    
    // [แก้ไข] 5. ใช้ Array .find() เพื่อหา config
    const mainCat = mainCategories.find(m => m.name === selectedMainCategory);
    const config = mainCat?.subCategories.find(s => s.name === subCat);
    
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
  
  const handleStartPhotoForTopic = (topic: string, type: 'capture' | 'attach') => {
    setCurrentTopic(topic);
    if (type === 'capture') {
      cameraInputRef.current?.click();
    } else {
      attachInputRef.current?.click();
    }
  };

  const handleDailyDescriptionChange = (photoKey: string, text: string) => {
    const newDescriptions = new Map(dailyDescriptions);
    newDescriptions.set(photoKey, text);
    setDailyDescriptions(newDescriptions);
  };

  const handleDeleteDailyPhoto = (photoKey: string) => {
    const newQueue = new Map(photoQueue);
    const newDescriptions = new Map(dailyDescriptions);
    newQueue.delete(photoKey);
    newDescriptions.delete(photoKey);
    setPhotoQueue(newQueue);
    setDailyDescriptions(newDescriptions);
  };

  const handleSelectRecentJob = (job: PersistentJob) => {
    // ... (ฟังก์ชันนี้ไม่ต้องแก้) ...
    if (job.reportType === 'QC') {
        setReportType('QC'); setSelectedMainCategory(job.mainCategory); setSelectedSubCategory(job.subCategory); setDynamicFields(job.dynamicFields);
        setPhotoQueue(new Map()); setUploadedStatus(new Map()); setStep('topicList');
    } else {
        setReportType('Daily');
        setPhotoQueue(new Map()); setDailyDescriptions(new Map());
        setStep('camera');
    }
  };

  const goBack = () => {
    // ... (ฟังก์ชันนี้ไม่ต้องแก้) ...
    if (isUploading) return;
    switch (step) {
      case 'mainCat': setStep('type'); break;
      case 'subCat': setStep('mainCat'); break;
      case 'dynamicFields': setStep('subCat'); break;
      case 'topicList': 
        // [แก้ไข] 6. กลับไปหน้า subCat ถ้ามี dynamic fields
        if (requiredDynamicFields.length > 0) setStep('dynamicFields');
        else setStep('subCat');
        break;
      case 'dailyReview': setStep('camera'); break;
      case 'camera':
        setStep('type');
        break;
      default:
        setStep('type');
    }
  };

  // --- Render ส่วนของ Wizard ---
  const renderChecklistHeader = () => {
    // ... (ฟังก์ชันนี้ไม่ต้องแก้) ...
    if (reportType === 'QC') {
      const parts = [selectedMainCategory, selectedSubCategory, ...Object.values(dynamicFields)];
      return <div className="checklist-header">{parts.filter(Boolean).join(' / ')}</div>;
    }
    return null;
  };

  const renderDailyReviewItem = ([key, photoItem]: [string, PhotoQueueItem]) => (
    <div key={key} className="daily-review-item">
      <img src={photoItem.base64} alt={`Daily ${key}`} className="daily-review-thumbnail" />
      
      {/* [ใหม่] เพิ่ม wrapper เพื่อจัด layout */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <textarea
          value={dailyDescriptions.get(key) || ''}
          onChange={(e) => handleDailyDescriptionChange(key, e.target.value)}
          placeholder="เพิ่มคำบรรยาย (Optional)..."
          rows={3}
          className="daily-review-textarea"
        />
        {/* [ใหม่] แสดงสถานะลายน้ำ */}
        <small style={{ color: '#555', paddingLeft: '5px' }}>
          {photoItem.addWatermark ? '✅ จะเพิ่มลายน้ำ' : '❌ ไม่เพิ่มลายน้ำ'}
        </small>
      </div>

      <button onClick={() => handleDeleteDailyPhoto(key)} className="daily-review-delete-button">🗑️</button>
    </div>
  );
  const renderPreviewModal = () => {
      if (!previewImageUrl) return null;

      return (
        // กดที่พื้นหลังสีดำเพื่อปิด
        <div className="preview-modal-overlay" onClick={() => setPreviewImageUrl(null)}>
          <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={previewImageUrl} alt="Preview" />
            <button className="preview-modal-close" onClick={() => setPreviewImageUrl(null)}>
              &times;
            </button>
          </div>
        </div>
      );
    };

  return (
    <div className="wizard-container">
      {/* [แก้ไข] 10. เพิ่ม Input สำหรับ "แนบไฟล์" (ไม่มี capture) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => handleNativeFileSelected(e, true)} // true = ถ่ายใหม่
      />
      <input
        ref={attachInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleNativeFileSelected(e, false)} // false = แนบ
      />
      {renderPreviewModal()} 

      {isProcessingPhoto && (
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

      {/* 1. Step: เลือกประเภท (Recent Jobs) */}
      {step === 'type' && (
        <div className="wizard-step">
          {/* ... (ปุ่ม QC/Daily ไม่ต้องแก้) ... */}
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
          
          {/* ... (Recent Jobs render ไม่ต้องแก้) ... */}
          {recentJobs.length > 0 && (
            <div className="recent-jobs-container">
              <h3>📌 งานที่ค้างอยู่</h3>
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="recent-job-item"
                  onClick={() => handleSelectRecentJob(job)}
                >
                  <span>{job.label}</span>
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
            {/* [แก้ไข] 7. .map() จาก Array (MainCategory[]) */}
            {mainCategories.map((mainCat) => (
              <div key={mainCat.id} className="selection-card" onClick={() => handleSelectMainCat(mainCat.name)}>
                {mainCat.name}
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
            {/* [แก้ไข] 8. .map() จาก Array (SubCategory[]) */}
            {subCategories.map((subCat) => (
              <div key={subCat.id} className="selection-card" onClick={() => handleSelectSubCat(subCat.name)}>
                {subCat.name}
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
          {/* [แก้ไข] 9. เพิ่ม Type (string) เพื่อแก้ TS7006 */}
          {requiredDynamicFields.map((fieldName: string) => (
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

      {/* 5. Step: Topic Checklist */}
      {step === 'topicList' && (
        <div className="wizard-step">
          <h2>5. ถ่ายรูปตามหัวข้อ</h2>
          {renderChecklistHeader()}

          {isChecklistLoading ? (
            <div className="loading-container" style={{height: '50vh'}}>กำลังตรวจสอบสถานะ...</div>
          ) : (
            <>
            <div className="topic-list">
                {topics.map((topic: Topic) => {
                  const topicName = topic.name; 
                  const isQueued = photoQueue.has(topicName);
                  const isUploaded = uploadedStatus.has(topicName);
                  const queueItem = photoQueue.get(topicName);

                  const statusIcon = isUploaded ? '✅' : (isQueued ? '🔄' : '⚪️');
                  const statusLabel = isUploaded ? '(อัปโหลดแล้ว)' : '';

                  return (
                    <div key={topic.id} className="topic-list-item"> 
                      <span className="topic-list-item-status">
                        {statusIcon}
                      </span>
                      
                      {/* [แก้ไข] 1. ทำให้ชื่อหัวข้อกดดูรูปได้ */}
                      <span 
                        className={`topic-list-item-name ${isQueued ? 'viewable' : ''}`}
                        onClick={() => isQueued && queueItem ? setPreviewImageUrl(queueItem.base64) : undefined}
                        title={isQueued ? 'กดเพื่อดูรูป' : topicName}
                      >
                        {topicName} <span style={{color: '#888', fontSize: '0.8em'}}>{statusLabel}</span>
                      </span>
                      
                      {/* 3. ปุ่มถ่ายรูป/แนบรูป (เหมือนเดิม) */}
                      <button
                        className={`topic-list-item-button ${(isQueued || isUploaded) ? 'retake' : ''}`}
                        onClick={() => handleStartPhotoForTopic(topicName, 'capture')}
                        title="ถ่ายรูป (บังคับลายน้ำ)"
                      >
                        {(isQueued || isUploaded) ? '🔄' : '📷'}
                      </button>
                      
                      <button
                        className="topic-list-item-button attach"
                        onClick={() => handleStartPhotoForTopic(topicName, 'attach')}
                        title="แนบรูป"
                      >
                        📎
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* [ใหม่] 13. เพิ่ม Checkbox ควบคุมลายน้ำ */}
              <div className="watermark-toggle">
                <input 
                  type="checkbox" 
                  id="wm-toggle-qc" 
                  checked={addWatermarkToAttached}
                  onChange={(e) => setAddWatermarkToAttached(e.target.checked)}
                />
                <label htmlFor="wm-toggle-qc">
                  เพิ่มลายน้ำ (Timestamp/Location) ให้กับ "รูปที่แนบ"
                </label>
              </div>

              <div className="button-grid-container">
                <button
                  className="wizard-button secondary"
                  onClick={goBack}
                  style={{ width: '100%' }} // ทำให้ปุ่มเต็มคอลัมน์
                >
                  ย้อนกลับ
                </button>
                
                <button
                  className="upload-all-button"
                  disabled={photoQueue.size === 0 || isUploading}
                  onClick={handleUploadAll}
                  style={{ width: '100%' }} // ทำให้ปุ่มเต็มคอลัมน์
                >
                  📤 อัปโหลด ({photoQueue.size})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 6. Step: Daily Review */}
      {step === 'dailyReview' && (
        <div className="wizard-step">
          <h2>📝 จัดการรูป & คำบรรยาย (Daily)</h2>
          <div className="daily-review-list">
             {photoQueue.size > 0 ? Array.from(photoQueue.entries()).map(renderDailyReviewItem) : null}
          </div>
          {photoQueue.size === 0 && ( <p style={{textAlign: 'center', color: '#888', margin: '40px 0'}}>ยังไม่มีรูปถ่าย</p> )}
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

    {/* 7. Step: Camera (Daily) */}
      {step === 'camera' && (
        <div className="wizard-step" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2>☀️ รายงานประจำวัน</h2>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
            กดปุ่ม "ถ่ายรูป" เพื่อเปิดกล้อง<br/>
            รูปที่ถ่ายจะถูกเพิ่มเข้าคิวอัตโนมัติ
          </p>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
            {/* 1. ปุ่มถ่ายรูป */}
            <button 
              className="wizard-button"
              style={{ padding: '20px 40px', fontSize: '1.5rem', height: 'auto', lineHeight: '1.5' }}
              onClick={() => cameraInputRef.current?.click()}
            >
              <span style={{ fontSize: '2.5rem' }}>📷</span>
              <br/>
              ถ่ายรูป (บังคับลายน้ำ)
            </button>
            
            {/* 2. ปุ่มแนบรูป */}
            <button 
              className="wizard-button secondary" // <-- ใช้ .secondary
              style={{ padding: '20px 40px', fontSize: '1.5rem', height: 'auto', lineHeight: '1.5' }}
              onClick={() => attachInputRef.current?.click()}
            >
              <span style={{ fontSize: '2.5rem' }}>📎</span>
              <br/>
              แนบรูป
            </button>
          </div>

          {/* [ใหม่] 15. เพิ่ม Checkbox ควบคุมลายน้ำ (Daily) */}
          <div className="watermark-toggle" style={{ marginTop: '20px', textAlign: 'center' }}>
            <input 
              type="checkbox" 
              id="wm-toggle-daily" 
              checked={addWatermarkToAttached}
              onChange={(e) => setAddWatermarkToAttached(e.target.checked)}
            />
            <label htmlFor="wm-toggle-daily">
              เพิ่มลายน้ำให้กับ "รูปที่แนบ"
            </label>
          </div>
          <p style={{ textAlign: 'center', color: '#666', marginTop: '30px' }}>
            มี {photoQueue.size} รูปในคิว
          </p>
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
              <div style={{minWidth: '120px', display: 'inline-block'}}></div> 
            )}
          </div>
        </div>
      )}

    {/* 8. Step: Uploading */}
    {step === 'uploading' && (
      <div className="wizard-step" style={{textAlign: 'center', paddingTop: '100px'}}>
        <h2>{uploadStatus}</h2>
        {isUploading && <p>กรุณารอสักครู่...</p>}
        {!isUploading && uploadStatus.includes('ล้มเหลว') && (
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