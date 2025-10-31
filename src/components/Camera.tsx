// Filename: src/components/Camera.tsx (REFACTORED - FIX Upload Job Context Bug)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api, UploadPhotoData, ProjectConfig, MainCategory, SubCategory, Topic, SharedJob, ChecklistStatusResponse } from '../utils/api';
import { addWatermark as createWatermark, WatermarkOptions } from '../utils/watermark';
import * as persistentQueue from '../utils/persistentQueue';
import styles from './Camera.module.css';

import { 
  FiClipboard, FiSun, FiMapPin, FiCheckCircle, FiLoader, 
  FiAlertTriangle, FiCircle, FiCamera, FiPaperclip, FiRefreshCw, 
  FiTrash2, FiEdit, FiX, FiInbox
} from 'react-icons/fi';

interface CameraProps {
  qcTopics: ProjectConfig | null; 
  projectId: string;
  projectName: string | undefined;
}

interface Geolocation { latitude: number; longitude: number; }

export interface PhotoQueueItem {
  key: string; 
  base64: string;
  addWatermark: boolean;
  timestamp: string;        
  location: string | null;  
  uploadData: Omit<UploadPhotoData, 'photoBase64'>;
  status: 'pending' | 'failed';
}

// (ฟังก์ชัน reverseGeocodeNominatim เหมือนเดิม)
async function reverseGeocodeNominatim(latitude: number, longitude: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=th&zoom=18&addressdetails=1`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'QCReport-App/1.0 (Contact: [thai.l@tts2004.co.th] for issues)' }
    });
    const data = await response.json();
    if (data && data.address) {
      const addr = data.address;
      const parts: string[] = [];
      const road = addr.road || addr.street;
      if (road) { parts.push(road); }
      const subdistrict = addr.suburb || addr.village || addr.hamlet;
      if (subdistrict) { parts.push(subdistrict); }
      const district = addr.district || addr.city_district || addr.town || addr.municipality;
      if (district) { parts.push(district); }
      const province = addr.state || addr.province;
      if (province) { parts.push(province); }
      if (parts.length > 0) { return parts.join('\n'); }
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
  const [photoQueue, setPhotoQueue] = useState<Map<string, PhotoQueueItem>>(() => persistentQueue.loadQueue(projectId));
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

  useEffect(() => {
    persistentQueue.saveQueue(projectId, photoQueue);
  }, [projectId, photoQueue]);

  // (useMemo)
  const mainCategories: MainCategory[] = useMemo(() => qcTopics || [], [qcTopics]);
  const selectedMainCat: MainCategory | undefined = useMemo(() => mainCategories.find(m => m.name === selectedMainCategory), [mainCategories, selectedMainCategory]);
  const subCategories: SubCategory[] = useMemo(() => selectedMainCat?.subCategories || [], [selectedMainCat]);
  const selectedSubCat: SubCategory | undefined = useMemo(() => subCategories.find(s => s.name === selectedSubCategory), [subCategories, selectedSubCategory]);
  const topics: Topic[] = useMemo(() => selectedSubCat?.topics || [], [selectedSubCat]);
  const requiredDynamicFields: string[] = useMemo(() => selectedSubCat?.dynamicFields || [], [selectedSubCat]);

  // (fetchSharedJobs)
  const fetchSharedJobs = useCallback(async () => {
    const response = await api.getSharedJobs(projectId);
    if (response.success && response.data) {
      const pendingJobs = response.data
        .filter(job => job.status === 'pending')
        .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
      setSharedJobs(pendingJobs);
    } else { console.error("Failed to fetch shared jobs:", response.error); setSharedJobs([]); }
  }, [projectId]);

  useEffect(() => { fetchSharedJobs(); }, [fetchSharedJobs]);

  // (getCurrentJobIdentifier)
  const getCurrentJobIdentifier = (): { id: string, label: string } => { 
    if (reportType === 'QC') { 
      const fieldValues = Object.values(dynamicFields).filter(item => !!item).join('_') || 'default'; 
      const mainId = selectedMainCat?.id || selectedMainCategory; 
      const subId = selectedSubCat?.id || selectedSubCategory; 
      const id = `${mainId}_${subId}_${fieldValues}`; 
      const label = [selectedMainCategory, selectedSubCategory, ...Object.values(dynamicFields).filter(item => !!item)].join(' / '); 
      return { id, label: label }; 
    } else { 
      const dateStr = new Date().toISOString().split('T')[0]; 
      return { id: `daily_${dateStr}`, label: 'รายงานประจำวัน' }; 
    } 
  };
  
  // (fetchChecklistStatus - แก้ไขแล้ว)
  const fetchChecklistStatus = useCallback(async ( mainCat: string, subCat: string, fields: Record<string, string> ) => { 
    if (!mainCat || !subCat) return; 
    setIsChecklistLoading(true); 
    setUploadedStatus(new Map()); 
    try { 
      const response = await api.getChecklistStatus({ 
        projectId: projectId, 
        reportType: 'QC',
        mainCategory: mainCat, 
        subCategory: subCat, 
        dynamicFields: fields 
      });

      if (response.success && response.data && response.data.statusMap) { 
        setUploadedStatus(new Map(Object.entries(response.data.statusMap))); 
      } else if (!response.success) { 
          throw new Error(response.error || 'Failed to fetch status'); 
      }
    } catch (error) { 
      console.error('Error fetching checklist status:', error); 
      alert(`ไม่สามารถดึงสถานะงาน: ${(error as Error).message}`); 
    } 
    setIsChecklistLoading(false); 
  }, [projectId]); 

  useEffect(() => { 
    if (step === 'topicList' && reportType === 'QC') { 
      fetchChecklistStatus(selectedMainCategory, selectedSubCategory, dynamicFields); 
    } 
  }, [step, reportType, selectedMainCategory, selectedSubCategory, dynamicFields, fetchChecklistStatus]);

  // (processNativePhoto)
  const processNativePhoto = (file: File): Promise<string> => { 
    return new Promise((resolve, reject) => { 
      const reader = new FileReader(); 
      reader.onload = (readerEvent) => { 
        const img = new Image(); 
        img.onload = () => { 
          const MAX_WIDTH = 1600; 
          const { width, height } = img; 
          if (width <= MAX_WIDTH) { resolve(img.src); return; } 
          const ratio = MAX_WIDTH / width; 
          const newHeight = height * ratio; 
          const canvas = document.createElement('canvas'); 
          canvas.width = MAX_WIDTH; 
          canvas.height = newHeight; 
          const ctx = canvas.getContext('2d'); 
          if (!ctx) { return reject(new Error('ไม่สามารถสร้าง canvas context ได้')); } 
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
  
  // (handleNativeFileSelected - แก้ไขแล้ว)
  const handleNativeFileSelected = async ( event: React.ChangeEvent<HTMLInputElement>, isNewCapture: boolean ) => { 
    const file = event.target.files?.[0]; 
    if (event.target) event.target.value = ""; 
    if (!file) return; 
    setIsProcessingPhoto(true); 
    
    const photoTimestamp = new Date().toISOString(); 
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
      
      // [สำคัญ] เราต้องดึง JobID ณ ตอนที่ถ่ายรูป
      const { id: jobId } = getCurrentJobIdentifier();
      
      let key: string;
      let uploadDataPayload: Omit<UploadPhotoData, 'photoBase64'>;

      if (reportType === 'QC' && currentTopic) {
        key = currentTopic;
        uploadDataPayload = {
          projectId, projectName: projectName || 'N/A', reportType, 
          timestamp: photoTimestamp, 
          location: locationString || 'ไม่สามารถระบุตำแหน่งได้',
          jobId: jobId, // <-- [สำคัญ] บันทึก JobID ณ ตอนถ่าย
          mainCategory: selectedMainCategory, 
          subCategory: selectedSubCategory, 
          topic: key, 
          dynamicFields
        };
      } else if (reportType === 'Daily' && step === 'camera') {
        key = `daily_${Date.now()}`;
        uploadDataPayload = {
          projectId, projectName: projectName || 'N/A', reportType, 
          timestamp: photoTimestamp, 
          location: locationString || 'ไม่สามารถระบุตำแหน่งได้',
          jobId: jobId, // <-- [สำคัญ] บันทึก JobID ณ ตอนถ่าย (daily_YYYY-MM-DD)
          description: '', 
          dynamicFields: {}
        };
      } else {
        throw new Error("Invalid state for photo capture.");
      }

      const newQueueItem: PhotoQueueItem = { 
        key: key,
        base64: photoBase64, 
        addWatermark: shouldAddWatermark,
        timestamp: photoTimestamp,
        location: locationString,
        uploadData: uploadDataPayload, 
        status: 'pending'
      }; 
      
      setPhotoQueue(prevQueue => {
        const newQueue = new Map(prevQueue);
        newQueue.set(key, newQueueItem);
        return newQueue;
      });
      
      if (reportType === 'QC') {
        setCurrentTopic(''); 
      }

    } catch (error) { 
      console.error("Error processing native photo:", error); 
      alert("เกิดข้อผิดพลาดในการประมวลผลรูป: " + (error as Error).message); 
    } finally { 
      setIsProcessingPhoto(false); 
    } 
  };
  

  // ✅✅✅ --- START OF FIX (Upload Job Context Bug) --- ✅✅✅
  const handleUploadAll = async () => {
    
    // 1. [FIX] ดึง JobID ของ *หน้าปัจจุบัน* ที่คุณอยู่
    const { id: currentJobId, label: jobLabel } = getCurrentJobIdentifier();

    // 2. [FIX] กรองคิวทั้งหมด ให้เหลือเฉพาะรูปที่ JobID ตรงกับหน้าปัจจุบัน
    const itemsToUpload = Array.from(photoQueue.values())
                               .filter(item => 
                                 item.uploadData.jobId === currentJobId && // <-- [!!!] นี่คือการแก้ไขที่สำคัญ
                                 (item.status === 'pending' || item.status === 'failed')
                               );
                               
    if (itemsToUpload.length === 0) {
      alert("ไม่พบรูปที่รอการอัปโหลดสำหรับงานนี้");
      return;
    }

    setIsUploading(true); 
    setUploadStatus(`กำลังอัปโหลด 0/${itemsToUpload.length}...`); 
    setStep('uploading');
    
    // (โค้ดที่เหลือเหมือนเดิมทั้งหมด)
    
    let successCount = 0; 
    const totalPhotosToUpload = itemsToUpload.length; 
    const topicsJustUploaded = new Map<string, boolean>();

    for (let index = 0; index < itemsToUpload.length; index++) {
      const photoItem = itemsToUpload[index];
      const { key, base64, addWatermark, location, timestamp, uploadData, status } = photoItem;
      
      if (status === 'failed') {
         setPhotoQueue(prev => new Map(prev).set(key, { ...photoItem, status: 'pending' }));
      }
      
      try {
        let photoToUpload = base64; 
        
        if (addWatermark) { 
          setUploadStatus(`( ${index + 1}/${totalPhotosToUpload} ) กำลังเพิ่มลายน้ำ ${key}...`);
          const watermarkOptions: WatermarkOptions = { 
            location: location, 
            timestamp: timestamp  
          };
          photoToUpload = await createWatermark(base64, watermarkOptions); 
        } else {
          setUploadStatus(`( ${index + 1}/${totalPhotosToUpload} ) กำลังเตรียม ${key}...`);
        }
        
        // 3. [FIX] ใช้ 'uploadData' จาก Snapshot ที่เก็บไว้
        //    (ซึ่งมี mainCategory, subCategory, topic ที่ถูกต้อง)
        //    และ "ยัด" photoBase64 ที่แปลงแล้วเข้าไป
        let finalUploadData: UploadPhotoData = {
            ...uploadData, // <-- ใช้ข้อมูล Snapshot ตอนถ่าย
            photoBase64: photoToUpload,
        };

        // 4. [FIX] อัปเดตเฉพาะสิ่งที่อาจเปลี่ยน (Description, JobID)
        if (finalUploadData.reportType === 'Daily') {
          finalUploadData.description = dailyDescriptions.get(key) || uploadData.description;
        }
        // (เราใช้ JobID จาก Snapshot อยู่แล้ว ซึ่งถูกต้อง)
        // finalUploadData.jobId = currentJobId; // (ไม่จำเป็นต้องอัปเดต เพราะเรากรองมาแล้ว)

        setUploadStatus(`( ${index + 1}/${totalPhotosToUpload} ) กำลังอัปโหลด ${key}...`);
        
        // 5. [FIX] เรียก api.uploadPhoto (ซึ่งตอนนี้ฉลาดพอที่จะแปลงข้อมูลให้ Backend)
        const response = await api.uploadPhoto(finalUploadData); 
        
        if (!response.success) {
          // (Error ที่คุณเห็น 'Missing QC fields.' จะถูกจับที่นี่)
          throw new Error(`อัปโหลดล้มเหลวที่รูป: ${key} (${response.error})`);
        }
        
        setPhotoQueue(prevQueue => {
          const newQueue = new Map(prevQueue);
          newQueue.delete(key); 
          return newQueue;
        });
        
        if (finalUploadData.reportType === 'QC' && finalUploadData.topic) {
            topicsJustUploaded.set(finalUploadData.topic, true);
        }
        successCount++;

      } catch (error) {
        console.error('Upload failed for item:', key, error);
        setUploadStatus(`( ${index + 1}/${totalPhotosToUpload} ) อัปโหลด ${key} ล้มเหลว: ${(error as Error).message}`);
        
        setPhotoQueue(prevQueue => {
          const newQueue = new Map(prevQueue);
          const item = newQueue.get(key);
          if (item) {
             newQueue.set(key, { ...item, status: 'failed' });
          }
          return newQueue;
        });
      }
    }  
      
    setUploadStatus(`อัปโหลดสำเร็จ ${successCount} / ${totalPhotosToUpload} รูป!`);
    
    const newUploadedStatus = new Map(uploadedStatus); 
    topicsJustUploaded.forEach((value, key) => newUploadedStatus.set(key, value));
    setUploadedStatus(newUploadedStatus); 
    
    if (successCount > 0 && reportType === 'QC') {
      const completedCount = newUploadedStatus.size;
      const totalTopicCount = topics.length;  
      
      const jobData: SharedJob = {
        id: currentJobId, // <-- [FIX] ใช้ currentJobId
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
      
      api.saveSharedJob(projectId, jobData).then(response => {
        if (response.success) { fetchSharedJobs(); } 
        else { console.error("Failed to save shared job:", response.error); }
      });
    }

    setIsUploading(false);
    setTimeout(() => {
      setDailyDescriptions(prevDesc => {
        const newDesc = new Map(prevDesc);
        prevDesc.forEach((value, key) => {
          if (!photoQueue.has(key)) { 
            newDesc.delete(key);
          }
        });
        return newDesc;
      });
      
      setUploadStatus('');
      
      if (photoQueue.size > 0) {
        setStep(reportType === 'QC' ? 'topicList' : 'dailyReview');
        alert(`อัปโหลดล้มเหลว ${photoQueue.size} รายการ กรุณาลองอีกครั้ง`);
      } else {
        setStep('type');
      }
    }, 2000);
  };
  // ✅✅✅ --- END OF FIX --- ✅✅✅
  
  // (ฟังก์ชันอื่นๆ ทั้งหมดเหมือนเดิม)
  const goToTypeScreen = () => {
    setCurrentTopic(''); setUploadStatus('');
    setDailyDescriptions(new Map());
    setSelectedMainCategory(''); setSelectedSubCategory(''); setDynamicFields({});
    setUploadedStatus(new Map()); setStep('type');
    setAddWatermarkToAttached(true); 
    fetchSharedJobs(); 
  };
  
  const handleDynamicFieldChange = (fieldName: string, value: string) => { 
    setDynamicFields(prev => ({ ...prev, [fieldName]: value })); 
  };
  
  const handleSelectReportType = (type: 'QC' | 'Daily') => {
      setCurrentTopic(''); setUploadStatus('');
      setDailyDescriptions(new Map());
      setSelectedMainCategory(''); setSelectedSubCategory(''); setDynamicFields({});
      setUploadedStatus(new Map()); setStep('type');
      setAddWatermarkToAttached(true); 
      fetchSharedJobs();
      setReportType(type);
      if (type === 'QC') setStep('mainCat');
      else setStep('camera');
  };
  const handleSelectMainCat = (mainCat: string) => { 
    setSelectedMainCategory(mainCat); 
    setSelectedSubCategory(''); 
    setUploadedStatus(new Map()); 
    setStep('subCat'); 
  };
  const handleSelectSubCat = (subCat: string) => { 
    setSelectedSubCategory(subCat); 
    setUploadedStatus(new Map()); 
    const mainCat = mainCategories.find(m => m.name === selectedMainCategory); 
    const config = mainCat?.subCategories.find(s => s.name === subCat); 
    if (config?.dynamicFields && config.dynamicFields.length > 0) { 
      setStep('dynamicFields'); 
    } else { 
      setStep('topicList'); 
    } 
  };
  const handleDynamicFieldsSubmit = () => { 
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
      
      setPhotoQueue(prevQueue => {
         const newQueue = new Map(prevQueue);
         const item = newQueue.get(photoKey);
         if (item && item.uploadData.reportType === 'Daily') {
             const updatedUploadData = { ...item.uploadData, description: text };
             newQueue.set(photoKey, { ...item, uploadData: updatedUploadData });
         }
         return newQueue;
      });
  };
  const handleDeleteDailyPhoto = (photoKey: string) => { 
      setPhotoQueue(prevQueue => {
          const newQueue = new Map(prevQueue);
          newQueue.delete(photoKey);
          return newQueue;
      });
      const newDescriptions = new Map(dailyDescriptions); 
      newDescriptions.delete(photoKey); 
      setDailyDescriptions(newDescriptions); 
  }; 
  const handleSelectSharedJob = (job: SharedJob) => {
    if (job.reportType === 'QC') {
        setReportType('QC'); 
        setSelectedMainCategory(job.mainCategory); 
        setSelectedSubCategory(job.subCategory); 
        setDynamicFields(job.dynamicFields);
        setUploadedStatus(new Map()); 
        setStep('topicList');
    }
  };
  const goBack = () => {
    if (isUploading) return;
    switch (step) {
      case 'mainCat': goToTypeScreen(); break; 
      case 'subCat': setStep('mainCat'); break; 
      case 'dynamicFields': setStep('subCat'); break; 
      case 'topicList': 
        if (requiredDynamicFields.length > 0) setStep('dynamicFields');
        else setStep('subCat');
        break; 
      case 'dailyReview': setStep('camera'); break; 
      case 'camera': goToTypeScreen(); break; 
      default: goToTypeScreen(); 
    }
  };
  
  const renderChecklistHeader = () => {
    if (reportType === 'QC') {
      const parts = [selectedMainCategory, selectedSubCategory, ...Object.values(dynamicFields).filter(item => !!item)];
      return <div className={styles['checklist-header']}>{parts.join(' / ')}</div>;
    }
    return null;
  };

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
          value={dailyDescriptions.get(key) ?? photoItem.uploadData.description}
          onChange={(e) => handleDailyDescriptionChange(key, e.target.value)}
          placeholder="เพิ่มคำบรรยาย (Optional)..."
          rows={3}
          className={styles['daily-review-textarea']}
        />
        <small style={{ color: '#555', paddingLeft: '5px' }}>
          {photoItem.addWatermark ? '✅ จะเพิ่มลายน้ำ' : '❌ ไม่เพิ่มลายน้ำ'}
          {photoItem.status === 'failed' && <span style={{ color: 'red', fontWeight: 'bold' }}> (อัปโหลดล้มเหลว)</span>}
        </small>
      </div>

      <button onClick={() => handleDeleteDailyPhoto(key)} className={styles['daily-review-delete-button']}>
        <FiTrash2 /> 
      </button>
    </div>
  );
  
  const renderPreviewModal = () => {
      if (!previewData) return null;
      let formattedTimestamp = '';
      if (previewData.timestamp) {
        const date = new Date(previewData.timestamp);
        const datePart = date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timePart = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        formattedTimestamp = `${datePart} ${timePart}`;
      }
      const locationLines = previewData.location ? previewData.location.split('\n').filter(line => !!line.trim()) : ['ไม่สามารถระบุตำแหน่งได้'];
      return (
        <div className={styles['preview-modal-overlay']} onClick={() => setPreviewData(null)}>
          <div className={styles['preview-modal-content']} onClick={(e) => e.stopPropagation()}>
            <div className={styles['preview-image-container']}>
              <img src={previewData.url} alt="Preview" />
              {(formattedTimestamp || previewData.location) && (
                <div className={styles['preview-watermark-overlay']}>
                  {formattedTimestamp && <span>{formattedTimestamp}</span>}
                  {locationLines.map((line, index) => ( <span key={index}>{line}</span> ))}
                </div>
              )}
            </div>
            <button className={styles['preview-modal-close']} onClick={() => setPreviewData(null)}>
              <FiX /> 
            </button>
          </div>
        </div>
      );
    };

  // --- Main Render ---
  return (
    <div className={styles['wizard-container']}>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleNativeFileSelected(e, true)} />
      <input ref={attachInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleNativeFileSelected(e, false)} />
      {renderPreviewModal()} 

      {isProcessingPhoto && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          <div style={{textAlign: 'center'}}><h3>กำลังประมวลผลรูป...</h3><p>กรุณารอสักครู่...</p></div>
        </div>
      )}

      {step === 'type' && (
        <div className={styles['wizard-step']}>
          <h2>1. เลือกประเภทรายงาน</h2>
          <div className={styles['selection-grid']}>
            <div className={styles['selection-card']} onClick={() => handleSelectReportType('QC')}>
              <span style={{fontSize: '2rem'}}><FiClipboard /></span> 
              <p>รายงาน QC (ตามหัวข้อ)</p>
            </div>
            <div className={`${styles['selection-card']} ${styles.daily}`} onClick={() => handleSelectReportType('Daily')}>
              <span style={{fontSize: '2rem'}}><FiSun /></span> 
              <p>รายงานประจำวัน (Daily)</p>
            </div>
          </div>
          
          {(() => {
            const qcItemsInQueue = Array.from(photoQueue.values()).filter(item => item.uploadData.reportType === 'QC').length;
            const dailyItemsInQueue = Array.from(photoQueue.values()).filter(item => item.uploadData.reportType === 'Daily').length;

            return (
              <div className={styles.pendingQueueContainer}>
                {qcItemsInQueue > 0 && (
                  <div 
                    className={styles.pendingQueueWarning} 
                    onClick={() => handleSelectReportType('QC')}
                    role="button"
                    tabIndex={0}
                  >
                    <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>
                      <FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: '8px' }} /> 
                      คุณมี {qcItemsInQueue} รูป QC ที่ยังไม่ได้อัปโหลด
                    </h3>
                    <p style={{ margin: 0, color: '#856404' }}>คลิกที่นี่เพื่อไปที่หน้า "รายงาน QC" และค้นหา Job ของคุณเพื่ออัปโหลด</p>
                  </div>
                )}
                {dailyItemsInQueue > 0 && (
                  <div 
                    className={styles.pendingQueueWarning} 
                    onClick={() => {
                      setReportType('Daily');
                      setStep('dailyReview');
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>
                      <FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: '8px' }} /> 
                      คุณมี {dailyItemsInQueue} รูป Daily ที่ยังไม่ได้อัปโหลด
                    </h3>
                    <p style={{ margin: 0, color: '#856404' }}>คลิกที่นี่เพื่อไปที่หน้า "จัดการรูป Daily" และอัปโหลด</p>
                  </div>
                )}
              </div>
            );
          })()}

          {sharedJobs.length > 0 && (
            <div className={styles['recent-jobs-container']}>
              <h3><FiMapPin style={{ verticalAlign: 'middle', marginRight: '8px' }} /> งานที่ค้างอยู่ (สำหรับทุกคน)</h3> 
              {sharedJobs.map((job) => (
                <div key={job.id} className={styles['recent-job-item']} onClick={() => handleSelectSharedJob(job)}>
                  <span>{job.label}</span>
                  {job.reportType === 'QC' && job.totalTopics > 0 && (
                     <span style={{marginLeft: '10px', color: '#555', fontSize: '0.9em'}}>
                       (ถ่ายแล้ว {job.completedTopics}/{job.totalTopics})
                     </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {step === 'mainCat' && (
        <div className={styles['wizard-step']}>
          <h2>2. เลือกหมวดงานหลัก</h2>
          {renderChecklistHeader()}
          <div className={styles['selection-grid']}>
            {mainCategories.map((mainCat) => ( <div key={mainCat.id} className={styles['selection-card']} onClick={() => handleSelectMainCat(mainCat.name)}> {mainCat.name} </div> ))}
          </div>
          <div className={styles['wizard-nav']}> <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>ย้อนกลับ</button> </div>
        </div>
      )}
      {step === 'subCat' && (
        <div className={styles['wizard-step']}>
          <h2>3. เลือกหมวดงานย่อย</h2>
          {renderChecklistHeader()}
          <div className={styles['selection-grid']}>
            {subCategories.map((subCat) => ( <div key={subCat.id} className={styles['selection-card']} onClick={() => handleSelectSubCat(subCat.name)}> {subCat.name} </div> ))}
          </div>
          <div className={styles['wizard-nav']}> <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>ย้อนกลับ</button> </div>
        </div>
      )}
      {step === 'dynamicFields' && (
        <div className={styles['wizard-step']}>
          <h2>4. กรอกข้อมูลเพิ่มเติม</h2>
          {renderChecklistHeader()}
          {requiredDynamicFields.map((fieldName: string) => (
            <div className={styles['form-group']} key={fieldName}>
              <label>{fieldName}</label>
              <input type="text" value={dynamicFields[fieldName] || ''} onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)} placeholder={`ระบุ${fieldName}...`} />
            </div>
          ))}
          <div className={styles['wizard-nav']}>
            <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>ย้อนกลับ</button>
            <button className={styles['wizard-button']} onClick={handleDynamicFieldsSubmit}>ถัดไป</button>
          </div>
        </div>
      )}

      {step === 'topicList' && (
        <div className={styles['wizard-step']}>
          <h2>5. ถ่ายรูปตามหัวข้อ</h2>
          {renderChecklistHeader()}
          {isChecklistLoading ? ( <div className="loading-container" style={{height: '50vh'}}>กำลังตรวจสอบสถานะ...</div> ) : (
            <>
            <div className={styles['topic-list']}>
                {topics.map((topic: Topic) => {
                  const topicName = topic.name; 
                  const queueItem = photoQueue.get(topicName);
                  const isQueued = !!queueItem;
                  const isUploaded = uploadedStatus.has(topicName);
                  
                  let statusIcon: React.ReactNode = <FiCircle />; 
                  let statusLabel = '';
                  let statusColor = '#888';
                  
                  if (isUploaded) {
                      statusIcon = <FiCheckCircle style={{ color: 'green' }}/>; 
                      statusLabel = '(อัปโหลดแล้ว)';
                  } else if (isQueued && queueItem?.status === 'failed') { 
                      statusIcon = <FiAlertTriangle style={{ color: 'red' }}/>; 
                      statusLabel = '(ล้มเหลว)'; statusColor = 'red';
                  } else if (isQueued) {
                      statusIcon = <FiInbox style={{ color: '#0056b3' }}/>; 
                      statusLabel = '(อยู่ในคิว)'; 
                      statusColor = '#0056b3';
                  }

                  return (
                    <div key={topic.id} className={styles['topic-list-item']}> 
                      <span className={styles['topic-list-item-status']}>{statusIcon}</span>
                      <span 
                        className={`${styles['topic-list-item-name']} ${isQueued ? styles.viewable : ''}`}
                        onClick={() => isQueued && queueItem ? setPreviewData({ url: queueItem.base64, timestamp: queueItem.timestamp, location: queueItem.location }) : undefined}
                        title={isQueued ? 'กดเพื่อดูรูป' : topicName}
                        style={{ color: isQueued ? statusColor : 'inherit' }} 
                      >
                        {topicName} <span style={{color: statusColor, fontSize: '0.8em', fontWeight: 'bold'}}>{statusLabel}</span>
                      </span>
                      
                      <button className={`${styles['topic-list-item-button']} ${(isQueued || isUploaded) ? styles.retake : ''}`} onClick={() => handleStartPhotoForTopic(topicName, 'capture')} title="ถ่ายรูป (บังคับลายน้ำ)">
                        {(isQueued || isUploaded) ? <FiRefreshCw /> : <FiCamera />} 
                      </button>
                      <button className={`${styles['topic-list-item-button']} ${styles.attach}`} onClick={() => handleStartPhotoForTopic(topicName, 'attach')} title="แนบรูป">
                        <FiPaperclip /> 
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className={styles['watermark-toggle']}>
                <input type="checkbox" id="wm-toggle-qc" checked={addWatermarkToAttached} onChange={(e) => setAddWatermarkToAttached(e.target.checked)} />
                <label htmlFor="wm-toggle-qc"> เพิ่มลายน้ำ (Timestamp/Location) ให้กับ "รูปที่แนบ" </label>
              </div>

              <div className={styles['button-grid-container']}>
                <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack} style={{ width: '100%' }}> ย้อนกลับ </button>
                <button 
                  className={styles['upload-all-button']} 
                  // [FIX] กรองจำนวนปุ่มให้ตรงกับ Job ID ปัจจุบัน
                  disabled={Array.from(photoQueue.values()).filter(item => item.uploadData.jobId === getCurrentJobIdentifier().id).length === 0 || isUploading} 
                  onClick={handleUploadAll} 
                  style={{ width: '100%' }}
                >
                  📤 อัปโหลด ({Array.from(photoQueue.values()).filter(item => item.uploadData.jobId === getCurrentJobIdentifier().id).length})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'dailyReview' && (
        <div className={styles['wizard-step']}>
          <h2><FiEdit style={{ verticalAlign: 'middle', marginRight: '8px' }} /> จัดการรูป & คำบรรยาย (Daily)</h2> 
          
          <div className={styles['daily-review-list']}>
             {Array.from(photoQueue.entries())
                  // [FIX] กรองให้ตรง Job ID (daily_YYYY-MM-DD)
                  .filter(([key, item]) => item.uploadData.jobId === getCurrentJobIdentifier().id)
                  .map(renderDailyReviewItem)
             }
          </div>
          {Array.from(photoQueue.values()).filter(item => item.uploadData.jobId === getCurrentJobIdentifier().id).length === 0 && ( 
             <p style={{textAlign: 'center', color: '#888', margin: '40px 0'}}>ยังไม่มีรูปถ่าย</p> 
          )}

          <div className={styles['wizard-nav']}>
            <button 
              className={`${styles['wizard-button']} ${styles.secondary}`} 
              onClick={() => setStep('camera')}
            >
               <FiCamera style={{ verticalAlign: 'middle', marginRight: '4px' }}/> กลับไปถ่าย
            </button>
            <button
              className={styles['upload-all-button']}
              onClick={handleUploadAll}
              // [FIX] กรองจำนวนปุ่มให้ตรงกับ Job ID ปัจจุบัน
              disabled={isUploading || Array.from(photoQueue.values()).filter(item => item.uploadData.jobId === getCurrentJobIdentifier().id).length === 0}
            >
              📤 อัปโหลด ({Array.from(photoQueue.values()).filter(item => item.uploadData.jobId === getCurrentJobIdentifier().id).length})
            </button>
          </div>
        </div>
      )}

      {step === 'camera' && (
        <div className={styles['wizard-step']} style={{ display: 'flex', flexDirection: 'column' }}>
          <h2><FiSun style={{ verticalAlign: 'middle', marginRight: '8px' }} /> รายงานประจำวัน</h2> 
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '20px' }}>
            กดปุ่ม "ถ่ายรูป" เพื่อเปิดกล้อง<br/>
            รูปที่ถ่ายจะถูกเพิ่มเข้าคิวอัตโนมัติ
          </p>
          
          <div className={styles.cameraActionGrid}> 
            <button 
              className={styles.wizardButton} 
              onClick={() => cameraInputRef.current?.click()}
            >
              <span style={{ fontSize: '2.5rem' }}><FiCamera /></span>
              <br/> ถ่ายรูป (บังคับลายน้ำ)
            </button>
            
            <button 
              className={`${styles.wizardButton} ${styles.secondary}`} 
              onClick={() => attachInputRef.current?.click()}
            >
              <span style={{ fontSize: '2.5rem' }}><FiPaperclip /></span>
              <br/> แนบรูป
            </button>
          </div>
      
          <div className={styles['watermark-toggle']} style={{ marginTop: '20px', textAlign: 'center' }}>
            <input type="checkbox" id="wm-toggle-daily" checked={addWatermarkToAttached} onChange={(e) => setAddWatermarkToAttached(e.target.checked)} />
            <label htmlFor="wm-toggle-daily"> เพิ่มลายน้ำให้กับ "รูปที่แนบ" </label>
          </div>
          
          {(() => {
            // [FIX] กรองจำนวนปุ่มให้ตรงกับ Job ID ปัจจุบัน
            const dailyQueueSize = Array.from(photoQueue.values()).filter(item => item.uploadData.jobId === getCurrentJobIdentifier().id).length;
            return (
              <>
                <p style={{ textAlign: 'center', color: '#666', marginTop: '20px' }}>
                  มี {dailyQueueSize} รูปในคิว
                </p>
                <div className={styles['wizard-nav']}>
                  <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}> ย้อนกลับ </button>
                  {dailyQueueSize > 0 ? (
                    <button className={styles['wizard-button']} onClick={() => setStep('dailyReview')} title="จัดการรูปและเพิ่มคำบรรยาย">
                      <FiEdit style={{ verticalAlign: 'middle', marginRight: '4px' }} /> จัดการรูป ({dailyQueueSize}) 
                    </button>
                  ) : ( <div style={{minWidth: '120px', display: 'inline-block'}}></div> )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {step === 'uploading' && (
        <div className={styles['wizard-step']} style={{textAlign: 'center', paddingTop: '100px'}}>
          <h2>{uploadStatus}</h2>
          {isUploading && <p>กรุณารอสักครู่...</p>}
          {!isUploading && photoQueue.size > 0 && (
            <button className={styles['wizard-button']} onClick={() => setStep(reportType === 'QC' ? 'topicList' : 'dailyReview')}>
              กลับไปที่คิว (เหลือ {photoQueue.size} รูป)
            </button>
          )}
        </div>
      )}

    </div>
  );
};

export default Camera;