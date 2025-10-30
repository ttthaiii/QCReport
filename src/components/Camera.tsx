// Filename: src/components/Camera.tsx (REFACTORED for Kebab-case bug)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api, UploadPhotoData, ProjectConfig, MainCategory, SubCategory, Topic, SharedJob } from '../utils/api';
import { addWatermark, WatermarkOptions } from '../utils/watermark';
// [แก้ไข] 1. เปลี่ยนวิธี Import CSS
import styles from './Camera.module.css';

// (โค้ดส่วนบนทั้งหมดเหมือนเดิม)
interface CameraProps {
  qcTopics: ProjectConfig | null; 
  projectId: string;
  projectName: string | undefined;
}
interface Geolocation { latitude: number; longitude: number; }
interface PhotoQueueItem {
  base64: string;
  addWatermark: boolean;
  timestamp?: string;        // [เพิ่ม] เก็บเวลาถ่าย
  location?: string | null;  // [เพิ่ม] เก็บตำแหน่ง
}

async function reverseGeocodeNominatim(latitude: number, longitude: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=th&zoom=18&addressdetails=1`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'QCReport-App/1.0 (Contact: [thai.l@tts2004.co.th] for issues)' }
    });
    const data = await response.json();
    if (data && data.address) {
      const addr = data.address;
      
      // [แก้ไข] แยกข้อมูลที่ละเอียดขึ้น แต่ละบรรทัดสั้นๆ
      const parts: string[] = [];
      
      // บรรทัด 1: ถนน/ซอย (ถ้ามี)
      const road = addr.road || addr.street;
      if (road) {
        parts.push(road);
      }
      
      // บรรทัด 2: แขวง/ตำบล
      const subdistrict = addr.suburb || addr.village || addr.hamlet;
      if (subdistrict) {
        parts.push(subdistrict);
      }
      
      // บรรทัด 3: เขต/อำเภอ
      const district = addr.district || addr.city_district || addr.town || addr.municipality;
      if (district) {
        parts.push(district);
      }
      
      // บรรทัด 4: จังหวัด
      const province = addr.state || addr.province;
      if (province) {
        parts.push(province);
      }
      
      // ถ้ามีข้อมูล คืนค่าแบบแยกบรรทัด
      if (parts.length > 0) {
        return parts.join('\n');
      }
      
      // ถ้าไม่มีข้อมูลเลย ใช้ display_name แทน (แบ่งเป็นบรรทัดสั้นๆ)
      const displayParts = data.display_name.split(',').slice(0, 3).map((s: string) => s.trim());
      return displayParts.join('\n');
    } else {
      return `พิกัด:\n${latitude.toFixed(4)},\n${longitude.toFixed(4)}`;
    }
  } catch (error) {
    console.error('Error fetching Nominatim:', error);
    return `ไม่สามารถระบุสถานที่`;
  }
}

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
  // (State ทั้งหมดเหมือนเดิม)
  const [step, setStep] = useState<WizardStep>('type');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const [photoQueue, setPhotoQueue] = useState<Map<string, PhotoQueueItem>>(new Map());
  const [currentTopic, setCurrentTopic] = useState<string>(''); 
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [sharedJobs, setSharedJobs] = useState<SharedJob[]>([]);
  const [uploadedStatus, setUploadedStatus] = useState<Map<string, boolean>>(new Map());
  const [isChecklistLoading, setIsChecklistLoading] = useState(false);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [reportType, setReportType] = useState<'QC' | 'Daily'>('QC');
  const [dailyDescriptions, setDailyDescriptions] = useState<Map<string, string>>(new Map());
  const [dynamicFields, setDynamicFields] = useState<{ [key: string]: string }>({});
  const [addWatermarkToAttached, setAddWatermarkToAttached] = useState<boolean>(true);
  const [previewData, setPreviewData] = useState<{ url: string, timestamp?: string, location?: string | null } | null>(null);

  // (useMemo, useEffect, Functions ทั้งหมดเหมือนเดิม)
  const mainCategories: MainCategory[] = useMemo(() => qcTopics || [], [qcTopics]);
  const selectedMainCat: MainCategory | undefined = useMemo(() => mainCategories.find(m => m.name === selectedMainCategory), [mainCategories, selectedMainCategory]);
  const subCategories: SubCategory[] = useMemo(() => selectedMainCat?.subCategories || [], [selectedMainCat]);
  const selectedSubCat: SubCategory | undefined = useMemo(() => subCategories.find(s => s.name === selectedSubCategory), [subCategories, selectedSubCategory]);
  const topics: Topic[] = useMemo(() => selectedSubCat?.topics || [], [selectedSubCat]);
  const requiredDynamicFields: string[] = useMemo(() => selectedSubCat?.dynamicFields || [], [selectedSubCat]);

  const fetchSharedJobs = useCallback(async () => {
    const response = await api.getSharedJobs(projectId);
    if (response.success && response.data) {
      // (เราจะกรองเฉพาะงานที่ยังไม่เสร็จ และเรียงตามวันที่อัปเดตล่าสุด)
      const pendingJobs = response.data
        .filter(job => job.status === 'pending')
        .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
      setSharedJobs(pendingJobs);
    } else {
      console.error("Failed to fetch shared jobs:", response.error);
      setSharedJobs([]); // ถ้าโหลดไม่สำเร็จ ให้เป็นค่าว่าง
    }
  }, [projectId]);

  useEffect(() => {
    fetchSharedJobs();
  }, [fetchSharedJobs]);

  const getCurrentJobIdentifier = (): { id: string, label: string } => { if (reportType === 'QC') { const fieldValues = Object.values(dynamicFields).filter(Boolean).join('_') || 'default'; const mainId = selectedMainCat?.id || selectedMainCategory; const subId = selectedSubCat?.id || selectedSubCategory; const id = `${mainId}_${subId}_${fieldValues}`; const label = [selectedMainCategory, selectedSubCategory, ...Object.values(dynamicFields).filter(Boolean)].join(' / '); return { id, label: `📋 ${label}` }; } else { const dateStr = new Date().toISOString().split('T')[0]; return { id: `daily_${dateStr}`, label: '☀️ รายงานประจำวัน' }; } };
  const fetchChecklistStatus = useCallback(async ( mainCat: string, subCat: string, fields: Record<string, string> ) => { if (!mainCat || !subCat) return; setIsChecklistLoading(true); setUploadedStatus(new Map()); try { 
  const response = await api.getChecklistStatus({
    projectId: projectId,
    mainCategory: mainCat,
    subCategory: subCat,
    dynamicFields: fields
  });
  if (response.success && response.data) { setUploadedStatus(new Map(Object.entries(response.data))); } else { throw new Error(response.error || 'Failed to fetch status'); } } catch (error) { console.error('Error fetching checklist status:', error); alert(`ไม่สามารถดึงสถานะงาน: ${(error as Error).message}`); } setIsChecklistLoading(false); }, [projectId]);
  useEffect(() => { if (step === 'topicList' && reportType === 'QC') { fetchChecklistStatus(selectedMainCategory, selectedSubCategory, dynamicFields); } }, [step, reportType, selectedMainCategory, selectedSubCategory, dynamicFields, fetchChecklistStatus]);
  const processNativePhoto = (file: File): Promise<string> => { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (readerEvent) => { const img = new Image(); img.onload = () => { const MAX_WIDTH = 1600; const { width, height } = img; if (width <= MAX_WIDTH) { resolve(img.src); return; } const ratio = MAX_WIDTH / width; const newHeight = height * ratio; const canvas = document.createElement('canvas'); canvas.width = MAX_WIDTH; canvas.height = newHeight; const ctx = canvas.getContext('2d'); if (!ctx) { return reject(new Error('ไม่สามารถสร้าง canvas context ได้')); } ctx.drawImage(img, 0, 0, MAX_WIDTH, newHeight); const resizedBase64 = canvas.toDataURL('image/jpeg', 0.9); resolve(resizedBase64); }; img.onerror = (err) => reject(new Error('ไม่สามารถโหลด Image object ได้')); img.src = readerEvent.target?.result as string; }; reader.onerror = (err) => reject(new Error('ไม่สามารถอ่านไฟล์ได้')); reader.readAsDataURL(file); }); };
  const handleNativeFileSelected = async ( event: React.ChangeEvent<HTMLInputElement>, isNewCapture: boolean ) => { 
    const file = event.target.files?.[0]; 
    if (event.target) event.target.value = ""; 
    if (!file) return; 
    setIsProcessingPhoto(true); 
    
    // [เพิ่ม] ดึง location ทันทีตอนถ่าย/แนบรูป
    let locationString: string | null = null;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
          enableHighAccuracy: true, timeout: 5000 
        });
      });
      locationString = await reverseGeocodeNominatim(
        position.coords.latitude,
        position.coords.longitude
      );
    } catch (geoError) {
      console.warn('Could not get geolocation:', geoError);
      locationString = null;
    }
    
    try { 
      const photoBase64 = await processNativePhoto(file); 
      const shouldAddWatermark = isNewCapture || addWatermarkToAttached; 
      const newQueueItem: PhotoQueueItem = { 
        base64: photoBase64, 
        addWatermark: shouldAddWatermark,
        timestamp: new Date().toISOString(),  // [เพิ่ม] เก็บเวลาถ่าย
        location: locationString               // [เพิ่ม] เก็บตำแหน่ง
      }; 
      const newQueue = new Map(photoQueue); 
      if (reportType === 'QC' && currentTopic) { 
        newQueue.set(currentTopic, newQueueItem); 
        setPhotoQueue(newQueue); 
        setCurrentTopic(''); 
      } else if (reportType === 'Daily' && step === 'camera') { 
        const timestampKey = `daily_${Date.now()}`; 
        newQueue.set(timestampKey, newQueueItem); 
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

    const { id: jobId, label: jobLabel } = getCurrentJobIdentifier();
    let successCount = 0; const totalPhotosInQueue = photoQueue.size; const topicsJustUploaded = new Map<string, boolean>();
    try {
      const photosToUpload = Array.from(photoQueue.entries()); 
      for (const [key, photoItem] of photosToUpload) {
        if (!photoItem || !photoItem.base64) continue;
        let photoToUpload = photoItem.base64; 
        if (photoItem.addWatermark) {
          setUploadStatus(`กำลังเพิ่มลายน้ำรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
          const timestamp = new Date().toISOString();
          const watermarkOptions: WatermarkOptions = { location: locationString, timestamp: timestamp };
          photoToUpload = await addWatermark(photoItem.base64, watermarkOptions); 
        } else {
          setUploadStatus(`กำลังเตรียมรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
        }
        setUploadStatus(`กำลังอัปโหลดรูปที่ ${successCount + 1}/${totalPhotosInQueue}...`);
        let descriptionForUpload = '';
        if (reportType === 'Daily') {
          descriptionForUpload = dailyDescriptions.get(key) || '';
        }
        
        const uploadData: UploadPhotoData = {
          projectId, projectName: projectName || 'N/A', reportType, 
          photoBase64: photoToUpload, 
          timestamp: new Date().toISOString(),
          location: locationString,
          jobId: jobId, // <-- [ใหม่] ส่ง Job ID ไปกับรูป
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
      setUploadStatus(`อัปโหลดสำเร็จ ${successCount} รูป!`);
      const newUploadedStatus = new Map(uploadedStatus); topicsJustUploaded.forEach((value, key) => newUploadedStatus.set(key, value));
      const completedCount = newUploadedStatus.size;
      const totalTopicCount = topics.length;  

      // [ใหม่] สร้าง Job Data และเรียก api.saveSharedJob
      if (reportType === 'QC') {
        const jobData: SharedJob = {
          id: jobId,
          label: jobLabel,
          reportType: 'QC',
          mainCategory: selectedMainCategory,
          subCategory: selectedSubCategory,
          dynamicFields: dynamicFields,
          completedTopics: completedCount,
          totalTopics: totalTopicCount,
          status: (completedCount >= totalTopicCount) ? 'completed' : 'pending',
          lastUpdatedAt: new Date().toISOString()
        };
        // เราไม่จำเป็นต้องรอ (await) ให้เสร็จ
        api.saveSharedJob(projectId, jobData).then(response => {
          if (response.success) {
            fetchSharedJobs(); // [ใหม่] เมื่อบันทึกสำเร็จ ให้ดึงรายการใหม่
          } else {
            console.error("Failed to save shared job:", response.error);
          }
        });
      }

      // [แก้ไข] ลบ setRecentJobs
      // setRecentJobs(getRecentJobs(projectId));
      
      setTimeout(() => {
        setPhotoQueue(new Map());
        setDailyDescriptions(new Map());
        setIsUploading(false); setUploadStatus('');
        setUploadedStatus(newUploadedStatus);
        setStep('type');
      }, 2000);

    } catch (error) { console.error('Upload failed:', error); setUploadStatus(`อัปโหลดล้มเหลว: ${(error as Error).message}`); setIsUploading(false); }
  };

  const goToTypeScreen = () => {
    setPhotoQueue(new Map()); setCurrentTopic(''); setUploadStatus('');
    setDailyDescriptions(new Map());
    setSelectedMainCategory(''); setSelectedSubCategory(''); setDynamicFields({});
    setUploadedStatus(new Map()); setStep('type');
    setAddWatermarkToAttached(true); 
    
    // [ใหม่] ดึงข้อมูล Job ล่าสุดทุกครั้งที่กลับมาหน้าแรก
    fetchSharedJobs(); 
  };
  const handleDynamicFieldChange = (fieldName: string, value: string) => { setDynamicFields(prev => ({ ...prev, [fieldName]: value })); };
  const handleSelectReportType = (type: 'QC' | 'Daily') => {
      // [แก้ไข] เรียกใช้ goToTypeScreen แทน
      goToTypeScreen(); 
      setReportType(type);
      if (type === 'QC') setStep('mainCat');
      else setStep('camera');
  };
  const handleSelectMainCat = (mainCat: string) => { setSelectedMainCategory(mainCat); setSelectedSubCategory(''); setPhotoQueue(new Map()); setUploadedStatus(new Map()); setStep('subCat'); };
  const handleSelectSubCat = (subCat: string) => { setSelectedSubCategory(subCat); setPhotoQueue(new Map()); setUploadedStatus(new Map()); const mainCat = mainCategories.find(m => m.name === selectedMainCategory); const config = mainCat?.subCategories.find(s => s.name === subCat); if (config?.dynamicFields && config.dynamicFields.length > 0) { setStep('dynamicFields'); } else { setStep('topicList'); } };
  const handleDynamicFieldsSubmit = () => { setPhotoQueue(new Map()); setUploadedStatus(new Map()); setStep('topicList'); };
  const handleStartPhotoForTopic = (topic: string, type: 'capture' | 'attach') => { setCurrentTopic(topic); if (type === 'capture') { cameraInputRef.current?.click(); } else { attachInputRef.current?.click(); } };
  const handleDailyDescriptionChange = (photoKey: string, text: string) => { const newDescriptions = new Map(dailyDescriptions); newDescriptions.set(photoKey, text); setDailyDescriptions(newDescriptions); };
  const handleDeleteDailyPhoto = (photoKey: string) => { const newQueue = new Map(photoQueue); const newDescriptions = new Map(dailyDescriptions); newQueue.delete(photoKey); newDescriptions.delete(photoKey); setPhotoQueue(newQueue); setDailyDescriptions(newDescriptions); }; 
  
  const handleSelectSharedJob = (job: SharedJob) => {
    if (job.reportType === 'QC') {
        setReportType('QC'); 
        setSelectedMainCategory(job.mainCategory); 
        setSelectedSubCategory(job.subCategory); 
        setDynamicFields(job.dynamicFields);
        setPhotoQueue(new Map()); 
        setUploadedStatus(new Map()); 
        setStep('topicList');
    } else {
        // (ยังไม่รองรับการ "ทำต่อ" สำหรับ Daily Job ที่แชร์กัน)
        // setReportType('Daily');
        // setPhotoQueue(new Map()); 
        // setDailyDescriptions(new Map());
        // setStep('camera');
    }
  };

  const goBack = () => {
    if (isUploading) return;
    switch (step) {
      case 'mainCat': goToTypeScreen(); break; // [แก้ไข]
      case 'subCat': setStep('mainCat'); break;
      case 'dynamicFields': setStep('subCat'); break;
      case 'topicList': 
        if (requiredDynamicFields.length > 0) setStep('dynamicFields');
        else setStep('subCat');
        break;
      case 'dailyReview': setStep('camera'); break;
      case 'camera': goToTypeScreen(); break; // [แก้ไข]
      default: goToTypeScreen(); // [แก้ไข]
    }
  };

  // --- Render Functions (มีการแก้ไข className) ---
  
  // [แก้ไข] ใช้ Bracket Notation styles['...']
  const renderChecklistHeader = () => {
    if (reportType === 'QC') {
      const parts = [selectedMainCategory, selectedSubCategory, ...Object.values(dynamicFields)];
      return <div className={styles['checklist-header']}>{parts.filter(Boolean).join(' / ')}</div>;
    }
    return null;
  };

  // [แก้ไข] ใช้ Bracket Notation styles['...']
  const renderDailyReviewItem = ([key, photoItem]: [string, PhotoQueueItem]) => (
    <div key={key} className={styles['daily-review-item']}>
      <img 
        src={photoItem.base64} 
        alt={`Daily ${key}`} 
        className={styles['daily-review-thumbnail']}
        onClick={() => setPreviewData({
          url: photoItem.base64,
          timestamp: photoItem.timestamp,
          location: photoItem.location
        })}
        style={{ cursor: 'pointer' }}
        title="กดเพื่อดูรูปขนาดใหญ่"
      />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <textarea
          value={dailyDescriptions.get(key) || ''}
          onChange={(e) => handleDailyDescriptionChange(key, e.target.value)}
          placeholder="เพิ่มคำบรรยาย (Optional)..."
          rows={3}
          className={styles['daily-review-textarea']}
        />
        <small style={{ color: '#555', paddingLeft: '5px' }}>
          {photoItem.addWatermark ? '✅ จะเพิ่มลายน้ำ' : '❌ ไม่เพิ่มลายน้ำ'}
        </small>
      </div>

      <button onClick={() => handleDeleteDailyPhoto(key)} className={styles['daily-review-delete-button']}>🗑️</button>
    </div>
  );
  
  // [แก้ไข] ใช้ Bracket Notation styles['...']
  const renderPreviewModal = () => {
      if (!previewData) return null;

      // [เพิ่ม] จัดรูปแบบวันที่
      let formattedTimestamp = '';
      if (previewData.timestamp) {
        const date = new Date(previewData.timestamp);
        const datePart = date.toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        const timePart = date.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        formattedTimestamp = `${datePart} ${timePart}`;
      }

      // [เพิ่ม] แยก location เป็นบรรทัด (ถ้ามี \n)
      const locationLines = previewData.location 
        ? previewData.location.split('\n').filter(line => line.trim())
        : ['ไม่สามารถระบุตำแหน่งได้'];

      return (
        <div className={styles['preview-modal-overlay']} onClick={() => setPreviewData(null)}>
          <div className={styles['preview-modal-content']} onClick={(e) => e.stopPropagation()}>
            {/* [เพิ่ม] Container ครอบรูป + ลายน้ำ */}
            <div className={styles['preview-image-container']}>
              <img src={previewData.url} alt="Preview" />
              
              {/* [เพิ่ม] Watermark Overlay */}
              {(formattedTimestamp || previewData.location) && (
                <div className={styles['preview-watermark-overlay']}>
                  {formattedTimestamp && <span>{formattedTimestamp}</span>}
                  {/* [แก้ไข] แสดง location ทีละบรรทัด */}
                  {locationLines.map((line, index) => (
                    <span key={index}>{line}</span>
                  ))}
                </div>
              )}
            </div>

            <button className={styles['preview-modal-close']} onClick={() => setPreviewData(null)}>
              &times;
            </button>
          </div>
        </div>
      );
    };

  // [แก้ไข] ใช้ Bracket Notation styles['...']
  return (
    <div className={styles['wizard-container']}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => handleNativeFileSelected(e, true)} 
      />
      <input
        ref={attachInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleNativeFileSelected(e, false)} 
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
        <div className={styles['wizard-step']}>
          <h2>1. เลือกประเภทรายงาน</h2>
          <div className={styles['selection-grid']}>
            <div className={styles['selection-card']} onClick={() => handleSelectReportType('QC')}>
              <span style={{fontSize: '2rem'}}>📋</span>
              <p>รายงาน QC (ตามหัวข้อ)</p>
            </div>
            <div className={`${styles['selection-card']} ${styles.daily}`} onClick={() => handleSelectReportType('Daily')}>
              <span style={{fontSize: '2rem'}}>☀️</span>
              <p>รายงานประจำวัน (Daily)</p>
            </div>
          </div>
          
          {sharedJobs.length > 0 && (
            <div className={styles['recent-jobs-container']}>
              <h3>📌 งานที่ค้างอยู่ (สำหรับทุกคน)</h3>
              {sharedJobs.map((job) => (
                <div
                  key={job.id}
                  className={styles['recent-job-item']}
                  onClick={() => handleSelectSharedJob(job)} // [แก้ไข]
                >
                  <span>{job.label}</span>
                  {job.reportType === 'QC' && job.totalTopics > 0 && (
                     <span style={{marginLeft: '10px', color: '#555', fontSize: '0.9em'}}> {/* (ใช้ inline style แทน .jobProgress) */}
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
        <div className={styles['wizard-step']}>
          <h2>2. เลือกหมวดงานหลัก</h2>
          {renderChecklistHeader()}
          <div className={styles['selection-grid']}>
            {mainCategories.map((mainCat) => (
              <div key={mainCat.id} className={styles['selection-card']} onClick={() => handleSelectMainCat(mainCat.name)}>
                {mainCat.name}
              </div>
            ))}
          </div>
          <div className={styles['wizard-nav']}>
            <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>ย้อนกลับ</button>
          </div>
        </div>
      )}
      
      {/* 3. Step: เลือก Sub Category */}
      {step === 'subCat' && (
        <div className={styles['wizard-step']}>
          <h2>3. เลือกหมวดงานย่อย</h2>
          {renderChecklistHeader()}
          <div className={styles['selection-grid']}>
            {subCategories.map((subCat) => (
              <div key={subCat.id} className={styles['selection-card']} onClick={() => handleSelectSubCat(subCat.name)}>
                {subCat.name}
              </div>
            ))}
          </div>
          <div className={styles['wizard-nav']}>
            <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>ย้อนกลับ</button>
          </div>
        </div>
      )}

      {/* 4. Step: กรอก Dynamic Fields */}
      {step === 'dynamicFields' && (
        <div className={styles['wizard-step']}>
          <h2>4. กรอกข้อมูลเพิ่มเติม</h2>
          {renderChecklistHeader()}
          {requiredDynamicFields.map((fieldName: string) => (
            <div className={styles['form-group']} key={fieldName}>
              <label>{fieldName}</label>
              <input
                type="text"
                value={dynamicFields[fieldName] || ''}
                onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
                placeholder={`ระบุ${fieldName}...`}
              />
            </div>
          ))}
          <div className={styles['wizard-nav']}>
            <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>ย้อนกลับ</button>
            <button className={styles['wizard-button']} onClick={handleDynamicFieldsSubmit}>ถัดไป</button>
          </div>
        </div>
      )}

      {/* 5. Step: Topic Checklist */}
      {step === 'topicList' && (
        <div className={styles['wizard-step']}>
          <h2>5. ถ่ายรูปตามหัวข้อ</h2>
          {renderChecklistHeader()}

          {isChecklistLoading ? (
            <div className="loading-container" style={{height: '50vh'}}>กำลังตรวจสอบสถานะ...</div>
          ) : (
            <>
            <div className={styles['topic-list']}>
                {topics.map((topic: Topic) => {
                  const topicName = topic.name; 
                  const isQueued = photoQueue.has(topicName);
                  const isUploaded = uploadedStatus.has(topicName);
                  const queueItem = photoQueue.get(topicName);
                  const statusIcon = isUploaded ? '✅' : (isQueued ? '🔄' : '⚪️');
                  const statusLabel = isUploaded ? '(อัปโหลดแล้ว)' : '';

                  return (
                    <div key={topic.id} className={styles['topic-list-item']}> 
                      <span className={styles['topic-list-item-status']}>
                        {statusIcon}
                      </span>
                      
                      <span 
                        className={`${styles['topic-list-item-name']} ${isQueued ? styles.viewable : ''}`}
                        onClick={() => isQueued && queueItem ? setPreviewData({ 
                          url: queueItem.base64,
                          timestamp: queueItem.timestamp,
                          location: queueItem.location
                        }) : undefined}
                        title={isQueued ? 'กดเพื่อดูรูป' : topicName}
                      >
                        {topicName} <span style={{color: '#888', fontSize: '0.8em'}}>{statusLabel}</span>
                      </span>
                      
                      <button
                        className={`${styles['topic-list-item-button']} ${(isQueued || isUploaded) ? styles.retake : ''}`}
                        onClick={() => handleStartPhotoForTopic(topicName, 'capture')}
                        title="ถ่ายรูป (บังคับลายน้ำ)"
                      >
                        {(isQueued || isUploaded) ? '🔄' : '📷'}
                      </button>
                      
                      <button
                        className={`${styles['topic-list-item-button']} ${styles.attach}`}
                        onClick={() => handleStartPhotoForTopic(topicName, 'attach')}
                        title="แนบรูป"
                      >
                        📎
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className={styles['watermark-toggle']}>
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

              <div className={styles['button-grid-container']}>
                <button
                  className={`${styles['wizard-button']} ${styles.secondary}`}
                  onClick={goBack}
                  style={{ width: '100%' }}
                >
                  ย้อนกลับ
                </button>
                
                <button
                  className={styles['upload-all-button']}
                  disabled={photoQueue.size === 0 || isUploading}
                  onClick={handleUploadAll}
                  style={{ width: '100%' }}
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
        <div className={styles['wizard-step']}>
          <h2>📝 จัดการรูป & คำบรรยาย (Daily)</h2>
          <div className={styles['daily-review-list']}>
             {photoQueue.size > 0 ? Array.from(photoQueue.entries()).map(renderDailyReviewItem) : null}
          </div>
          {photoQueue.size === 0 && ( <p style={{textAlign: 'center', color: '#888', margin: '40px 0'}}>ยังไม่มีรูปถ่าย</p> )}
          <button
            className={styles['upload-all-button']}
            onClick={handleUploadAll}
            disabled={isUploading || photoQueue.size === 0}
          >
            📤 อัปโหลดทั้งหมด ({photoQueue.size}) รูป
          </button>
          <div className={styles['wizard-nav']} style={{ justifyContent: 'center', borderTop: 'none', paddingTop: '10px' }}>
            <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={() => setStep('camera')}>
               📷 กลับไปถ่ายรูปเพิ่ม
            </button>
          </div>
        </div>
      )}

    {/* 7. Step: Camera (Daily) */}
      {step === 'camera' && (
        <div className={styles['wizard-step']} style={{ display: 'flex', flexDirection: 'column' }}>
          <h2>☀️ รายงานประจำวัน</h2>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
            กดปุ่ม "ถ่ายรูป" เพื่อเปิดกล้อง<br/>
            รูปที่ถ่ายจะถูกเพิ่มเข้าคิวอัตโนมัติ
          </p>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
            <button 
              className={styles['wizard-button']}
              style={{ padding: '20px 40px', fontSize: '1.5rem', height: 'auto', lineHeight: '1.5' }}
              onClick={() => cameraInputRef.current?.click()}
            >
              <span style={{ fontSize: '2.5rem' }}>📷</span>
              <br/>
              ถ่ายรูป (บังคับลายน้ำ)
            </button>
            
            <button 
              className={`${styles['wizard-button']} ${styles.secondary}`}
              style={{ padding: '20px 40px', fontSize: '1.5rem', height: 'auto', lineHeight: '1.5' }}
              onClick={() => attachInputRef.current?.click()}
            >
              <span style={{ fontSize: '2.5rem' }}>📎</span>
              <br/>
              แนบรูป
            </button>
          </div>

          <div className={styles['watermark-toggle']} style={{ marginTop: '20px', textAlign: 'center' }}>
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
          <div className={styles['wizard-nav']}>
            <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>
              ย้อนกลับ
            </button>
            {photoQueue.size > 0 ? (
              <button 
                className={styles['wizard-button']} 
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
      <div className={styles['wizard-step']} style={{textAlign: 'center', paddingTop: '100px'}}>
        <h2>{uploadStatus}</h2>
        {isUploading && <p>กรุณารอสักครู่...</p>}
        {!isUploading && uploadStatus.includes('ล้มเหลว') && (
          <button className={styles['wizard-button']} onClick={() => setStep(reportType === 'QC' ? 'topicList' : 'dailyReview')}>
            กลับไปแก้ไข
          </button>
        )}
      </div>
    )}

    </div>
  );
};

export default Camera;