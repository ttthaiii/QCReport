// Filename: src/components/Camera.tsx (REFACTORED - FIX Upload Job Context Bug + Pending Manager)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api, UploadPhotoData, ProjectConfig, MainCategory, SubCategory, Topic, SharedJob, ChecklistStatusResponse } from '../utils/api';
import { addWatermark as createWatermark, WatermarkOptions } from '../utils/watermark';
import * as persistentQueue from '../utils/persistentQueue';
import styles from './Camera.module.css';
import CustomModal from './CustomModal';
import AutocompleteInput from './AutocompleteInput';
import { useDialog } from '../contexts/DialogContext';

import {
  FiClipboard, FiSun, FiMapPin, FiCheckCircle, FiLoader,
  FiAlertTriangle, FiCircle, FiCamera, FiPaperclip, FiRefreshCw,
  FiTrash2, FiEdit, FiX, FiInbox, FiImage, FiEye, FiEyeOff, FiSave,
  FiZoomIn, FiZoomOut
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
  // ✅ [แก้ไข 1.1] อัปเดต Type ให้ตรงกับที่บันทึก
  uploadData: Omit<UploadPhotoData, 'photoBase64'> & {
    jobLabel?: string;
    dynamicFields: Record<string, string>; // <-- ระบุให้ชัดเจน
  };
  status: 'pending' | 'failed';
}

// (ฟังก์ชัน reverseGeocodeNominatim ถูกลบออกแล้ว ใช้ api.reverseGeocode แทน)

// ✅ [แก้ไข 2] ย้าย 'pendingManager' เข้ามาใน Type ให้ถูกต้อง
type WizardStep =
  | 'type'
  | 'mainCat'
  | 'subCat'
  | 'dynamicFields'
  | 'topicList'
  | 'dailyReview'
  | 'camera'
  | 'uploading'
  | 'pendingManager'; // <-- ย้ายมาไว้ที่นี่

const Camera: React.FC<CameraProps> = ({ qcTopics, projectId, projectName }) => {

  // (State ทั้งหมดเหมือนเดิม)
  const [step, setStep] = useState<WizardStep>('type');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const watermarkPreferenceRef = useRef<boolean>(false); // ✅ เพิ่ม ref เก็บค่าจริง
  const { showAlert, showConfirm } = useDialog();
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
  const [addWatermarkToAttached, setAddWatermarkToAttached] = useState<boolean>(false);
  const [showWatermarkModal, setShowWatermarkModal] = useState<boolean>(false);
  const [pendingAttachTopic, setPendingAttachTopic] = useState<string>('');
  const [fieldSuggestions, setFieldSuggestions] = useState<Record<string, string[]>>({});
  const [previewData, setPreviewData] = useState<{
    url: string;
    timestamp?: string;
    location?: string | null;
    addWatermark?: boolean;
  } | null>(null);

  // ✅ [ใหม่] State สำหรับ Zoom
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showInfoOverlay, setShowInfoOverlay] = useState<boolean>(true); // ✅ State สำหรับ Toggle Overlay
  // ✅ State สำหรับคำนวณขนาด Font ให้เท่ากับ Watermark ของจริง
  const [watermarkFontSize, setWatermarkFontSize] = useState<number>(24);

  const [modalState, setModalState] = useState<{
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  // ✅ [ใหม่] State สำหรับ Daily Feed & Date Selector
  const [selectedDailyDate, setSelectedDailyDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [fetchedDailyPhotos, setFetchedDailyPhotos] = useState<any[]>([]);
  const [isFetchingDaily, setIsFetchingDaily] = useState<boolean>(false);
  const [pendingReplaceDailyPhotoId, setPendingReplaceDailyPhotoId] = useState<string | null>(null); // ✅ เก็บ ID รูปรอแทนที่
  const [refreshDailyTrigger, setRefreshDailyTrigger] = useState<number>(0); // ✅ รีเฟรชหน้า Daily

  useEffect(() => {
    persistentQueue.saveQueue(projectId, photoQueue);
  }, [projectId, photoQueue]);

  // (useMemo)
  const mainCategories: MainCategory[] = useMemo(() => qcTopics || [], [qcTopics]);
  const selectedMainCat: MainCategory | undefined = useMemo(() => mainCategories.find(m => m.name === selectedMainCategory), [mainCategories, selectedMainCategory]);
  const subCategories: SubCategory[] = useMemo(() => selectedMainCat?.subCategories || [], [selectedMainCat]);
  const selectedSubCat: SubCategory | undefined = useMemo(() => subCategories.find(s => s.name === selectedSubCategory), [subCategories, selectedSubCategory]);
  const topics: Topic[] = useMemo(() => selectedSubCat?.topics || [], [selectedSubCat]);
  const requiredDynamicFields = useMemo(() => selectedSubCat?.dynamicFields || [], [selectedSubCat]);

  useEffect(() => {
    const fetchFieldSuggestions = async () => {
      // ✅ ใช้ selectedSubCategory แทน formData.subCategory
      const selectedSubCat = subCategories.find(s => s.name === selectedSubCategory);

      if (selectedSubCat?.id) {
        console.log('🔍 [Camera] Fetching suggestions for:', selectedSubCat.id);

        const response = await api.getDynamicFieldValues(projectId, selectedSubCat.id);

        console.log('📦 [Camera] Response:', response);

        if (response.success && response.data) {
          console.log('✅ [Camera] Setting suggestions:', response.data);
          setFieldSuggestions(response.data);
        } else {
          console.warn('⚠️ [Camera] Failed to load suggestions');
          setFieldSuggestions({});
        }
      } else {
        console.log('❌ [Camera] No subCategory selected');
        setFieldSuggestions({});
      }
    };

    // ✅ ใช้ selectedSubCategory แทน formData.subCategory
    if (reportType === 'QC' && selectedSubCategory) {
      fetchFieldSuggestions();
    } else {
      setFieldSuggestions({});
    }
  }, [projectId, reportType, selectedSubCategory, subCategories]);

  // ✅ [ใหม่] Effect ดึงรูป Daily ตามวันที่เลือก
  useEffect(() => {
    const fetchDaily = async () => {
      if (reportType !== 'Daily' || step !== 'camera') return;
      setIsFetchingDaily(true);
      try {
        const res = await api.getDailyPhotos(projectId, selectedDailyDate);
        if (res.success && res.data) {
          setFetchedDailyPhotos(res.data);
        } else {
          setFetchedDailyPhotos([]);
        }
      } catch (err) {
        console.error('Failed to fetch daily photos', err);
        setFetchedDailyPhotos([]);
      } finally {
        setIsFetchingDaily(false);
      }
    };
    fetchDaily();
  }, [projectId, reportType, selectedDailyDate, step, refreshDailyTrigger]);

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

  const sanitizeForFirestoreId = (str: string): string => {
    return str.replace(/[\/\.\$\[\]#]/g, '_');
  };

  const getCurrentJobIdentifier = (): { id: string, label: string } => {
    if (reportType === 'QC') {
      const fieldValues = Object.keys(dynamicFields || {}) // <-- ✅ 1. ดึง Keys
        .sort() // <-- ✅ 2. เรียงตามตัวอักษร
        .map(key => dynamicFields[key] || '') // <-- ✅ 3. ดึงค่า
        .filter(item => !!item)
        .map(sanitizeForFirestoreId)
        .join('_') || 'default';

      const mainId = sanitizeForFirestoreId(selectedMainCat?.id || selectedMainCategory);
      const subId = sanitizeForFirestoreId(selectedSubCat?.id || selectedSubCategory);

      const id = `${mainId}_${subId}_${fieldValues}`;

      // ✅ label ก็ต้องเรียงตาม requiredDynamicFields เหมือนกัน
      const label = [
        selectedMainCategory,
        selectedSubCategory,
        ...requiredDynamicFields
          .map(fieldConfig => {
            const label = typeof fieldConfig === 'string' ? fieldConfig : fieldConfig.label;
            return dynamicFields[label];
          })
          .filter(item => !!item)
      ].join(' / ');

      return { id, label };
    } else {
      const dateStr = new Date().toISOString().split('T')[0];
      return { id: `daily_${dateStr}`, label: 'รายงานประจำวัน' };
    }
  };

  // (fetchChecklistStatus - แก้ไขแล้ว)
  const fetchChecklistStatus = useCallback(async (mainCat: string, subCat: string, fields: Record<string, string>) => {
    if (!mainCat || !subCat) {
      setIsChecklistLoading(false); // <-- ✅ 2. เพิ่ม Fallback เผื่อไว้
      return;
    }
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
      await showAlert(`ไม่สามารถดึงสถานะงาน: ${(error as Error).message}`, 'เกิดข้อผิดพลาด');
    }
    setIsChecklistLoading(false);
  }, [projectId]);

  // เพิ่ม debounce helper
  function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  // แก้ไข fetchChecklistStatus
  const fetchChecklistStatusDebounced = useMemo(
    () => debounce(fetchChecklistStatus, 500),
    [fetchChecklistStatus]
  );

  // ✅ ใช้ debounced version ใน useEffect
  useEffect(() => {
    if (step === 'topicList' && reportType === 'QC') {
      fetchChecklistStatusDebounced(
        selectedMainCategory,
        selectedSubCategory,
        dynamicFields
      );
    }
  }, [step, reportType, selectedMainCategory, selectedSubCategory, dynamicFields, fetchChecklistStatusDebounced]);

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

  // (handleNativeFileSelected - ทยอยประมวลผลทีละไฟล์สำหรับ Bulk Upload)
  const handleNativeFileSelected = async (event: React.ChangeEvent<HTMLInputElement>, isNewCapture: boolean, forceWatermark?: boolean) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingPhoto(true);

    let locationString: string | null = null;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 5000
        });
      });
      // ✅ ใช้ api.reverseGeocode (Proxied) แทน direct fetch
      locationString = await api.reverseGeocode(
        position.coords.latitude,
        position.coords.longitude
      );
    } catch (geoError) {
      console.warn('Could not get geolocation:', geoError);
      locationString = null;
    }

    try {
      const { id: jobId, label: jobLabel } = getCurrentJobIdentifier();
      const shouldAddWatermark = isNewCapture ? true : watermarkPreferenceRef.current;
      console.log('🎨 shouldAddWatermark:', shouldAddWatermark, '| isNewCapture:', isNewCapture, '| watermarkPreferenceRef:', watermarkPreferenceRef.current);

      const newPhotos = new Map<string, PhotoQueueItem>();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const photoTimestamp = new Date().toISOString();
        const photoBase64 = await processNativePhoto(file);

        let key: string;
        let uploadDataPayload: PhotoQueueItem['uploadData'];

        if (reportType === 'QC' && currentTopic) {
          key = i === 0 ? currentTopic : `${currentTopic}_${i}`; // Handle multiple for QC just in case
          uploadDataPayload = {
            projectId, projectName: projectName || 'N/A', reportType,
            timestamp: photoTimestamp,
            location: locationString || 'ไม่สามารถระบุตำแหน่งได้',
            jobId: jobId,
            jobLabel: jobLabel,
            mainCategory: selectedMainCategory,
            subCategory: selectedSubCategory,
            topic: currentTopic, // Use base topic
            dynamicFields: dynamicFields
          };
        } else if (reportType === 'Daily' && (step === 'camera' || step === 'topicList')) {
          key = `daily_${Date.now()}_${i}`;
          uploadDataPayload = {
            projectId, projectName: projectName || 'N/A', reportType,
            timestamp: photoTimestamp,
            location: locationString || 'ไม่สามารถระบุตำแหน่งได้',
            jobId: jobId,
            jobLabel: jobLabel,
            description: pendingAttachTopic || '', // ✅ สืบทอดคำบรรยาย
            dynamicFields: {},
            replaceDailyPhotoId: pendingReplaceDailyPhotoId || undefined, // ✅ แนบ ID รูปที่จะถูกแทนที่
          };
        } else {
          console.warn("Skipping file: Invalid state for photo capture.");
          continue;
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

        newPhotos.set(key, newQueueItem);

        // Optional: clear topic if QC and we only wanted one photo per topic
        // if (reportType === 'QC') break; 
      }

      setPhotoQueue(prevQueue => {
        const newQueue = new Map(prevQueue);
        newPhotos.forEach((value, key) => newQueue.set(key, value));
        return newQueue;
      });

      if (reportType === 'QC') {
        setCurrentTopic('');
      } else if (reportType === 'Daily') {
        setPendingAttachTopic(''); // ✅ ล้างค่าหัวข้อหลังจากคิวแล้ว
        setPendingReplaceDailyPhotoId(null); // ✅ ล้างค่าเซสชันการแทนที่
      }

      // ✅ [เพิ่ม] นำทางไปยังหน้าคิวหลังจากเลือกรูปเสร็จ
      if (reportType === 'QC') {
        setStep('topicList');
      } else if (reportType === 'Daily') {
        setStep('dailyReview');
      }

    } catch (error) {
      console.error("Error processing native photo:", error);
      await showAlert("เกิดข้อผิดพลาดในการประมวลผลรูป: " + (error as Error).message, 'ข้อผิดพลาดเกี่ยวกับรูปภาพ');
    } finally {
      if (event.target) event.target.value = ""; // Clear input
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
      await showAlert("ไม่พบรูปที่รอการอัปโหลดสำหรับงานนี้", 'ไม่มีข้อมูล');
      return;
    }

    setIsUploading(true);
    setUploadStatus(`กำลังอัปโหลด 0/${itemsToUpload.length}...`);
    setStep('uploading');

    let successCount = 0;
    const totalPhotosToUpload = itemsToUpload.length;
    const topicsJustUploaded = new Map<string, boolean>();

    for (let index = 0; index < itemsToUpload.length; index++) {
      const photoItem = itemsToUpload[index];
      const { key, base64, addWatermark, location, timestamp, uploadData, status } = photoItem;
      console.log('📤 Uploading:', key, '| addWatermark:', addWatermark);

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
        //    และ "ยัด" photoBase64 ที่แปลงแล้วเข้าไป
        let finalUploadData: UploadPhotoData = {
          ...uploadData, // <-- ใช้ข้อมูล Snapshot ตอนถ่าย
          photoBase64: photoToUpload,
        };

        // 4. [FIX] อัปเดตเฉพาะสิ่งที่อาจเปลี่ยน (Description)
        if (finalUploadData.reportType === 'Daily') {
          finalUploadData.description = dailyDescriptions.get(key) || uploadData.description;
        }

        setUploadStatus(`( ${index + 1}/${totalPhotosToUpload} ) กำลังอัปโหลด ${key}...`);

        // 5. [FIX] เรียก api.uploadPhoto (ซึ่งตอนนี้ฉลาดพอที่จะแปลงข้อมูลให้ Backend)
        const response = await api.uploadPhoto(finalUploadData);

        if (!response.success) {
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

    // ✅ Refresh Daily Data if we uploaded any Daily photos
    if (itemsToUpload.some(item => item.uploadData.reportType === 'Daily')) {
      setRefreshDailyTrigger(prev => prev + 1);
    }

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

    // ✅ [แก้ไข 3.1] นับจำนวนที่ "ล้มเหลว" (failed) เฉพาะใน "งานปัจจุบัน" เท่านั้น
    const failedCount = Array.from(photoQueue.values()).filter(
      item => item.uploadData.jobId === currentJobId && item.status === 'failed'
    ).length;

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

      // ✅ [แก้ไข 3.2] เปลี่ยนเงื่อนไข Alert
      if (failedCount > 0) {
        // ถ้ามีรายการที่ล้มเหลวใน "งานนี้" จริงๆ ให้แจ้งเตือน
        setStep(reportType === 'QC' ? 'topicList' : 'dailyReview');
        setModalState({
          title: 'อัปโหลดไม่สำเร็จ',
          message: `อัปโหลดสำหรับงานนี้ล้มเหลว ${failedCount} รายการ กรุณาลองอีกครั้ง`
        });
      } else {
        // ถ้า "งานนี้" สำเร็จหมด (ล้มเหลว 0) ให้กลับหน้าแรก
        // (แม้ว่าจะมีงานอื่นค้างในคิวก็ตาม)
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
    fetchSharedJobs();
  };

  /* 
   * [MODIFIED] Handle field changes and auto-populate dependent fields
   * Example: Select "Room 1" -> Auto select "ECN-..." for "Code note"
   */
  const handleDynamicFieldChange = useCallback((fieldName: string, value: string) => {
    // ✅ [แก้ไข] บังคับเป็นตัวพิมพ์ใหญ่ (Uppercase) เสมอ เพื่อแก้ปัญหาข้อมูล Case Sensitive
    const upperValue = value ? value.toUpperCase() : '';

    setDynamicFields(prev => {
      const newFields = { ...prev, [fieldName]: upperValue };

      // DEBUG
      console.log('📷 [Camera] Field Change:', fieldName, '=', upperValue);
      console.log('📷 [Camera] Selected SubCat:', selectedSubCat);

      // 1. Check for dependencies using 'selectedSubCat'
      if (selectedSubCat && selectedSubCat.fieldDependencies) {
        console.log('📷 [Camera] Dependencies found:', selectedSubCat.fieldDependencies);
        const dependency = selectedSubCat.fieldDependencies[fieldName];
        if (dependency) {
          console.log('📷 [Camera] Dependency match!', dependency);
          // ✅ [แก้ไข] ใช้ upperValue ในการ Lookup
          const targetValue = dependency.mapping[upperValue];
          console.log('📷 [Camera] Target Value:', targetValue);

          if (targetValue) {
            newFields[dependency.targetField] = targetValue;
          } else if (upperValue === '' || upperValue === null) {
            newFields[dependency.targetField] = '';
          }
        }
      } else {
        console.warn('📷 [Camera] No dependencies found in SubCat');
      }
      return newFields;
    });
  }, [selectedSubCat]);

  const handleSelectReportType = (type: 'QC' | 'Daily') => {
    setCurrentTopic(''); setUploadStatus('');
    setDailyDescriptions(new Map());
    setSelectedMainCategory(''); setSelectedSubCategory(''); setDynamicFields({});
    setUploadedStatus(new Map()); setStep('type');
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
    setIsChecklistLoading(true);
    setStep('topicList');
  };
  const handleStartPhotoForTopic = (topic: string, type: 'capture' | 'attach') => {
    console.log('🔍 handleStartPhotoForTopic called:', { topic, type });
    setCurrentTopic(topic);
    if (type === 'capture') {
      // ถ่ายรูปใหม่ → บังคับมีลายน้ำเสมอ
      console.log('📸 Opening camera input');
      cameraInputRef.current?.click();
    } else {
      // แนบรูป → แสดง Modal ให้เลือก
      console.log('📎 Opening watermark modal');
      setPendingAttachTopic(topic);
      setShowWatermarkModal(true);
    }
  };
  // ฟังก์ชันเมื่อ User เลือก "เพิ่มลายน้ำ"
  const handleAttachWithWatermark = () => {
    console.log('✅ User selected: เพิ่มลายน้ำ');
    setShowWatermarkModal(false);
    setAddWatermarkToAttached(true); // ตั้งค่าให้เพิ่มลายน้ำ
    watermarkPreferenceRef.current = true; // ✅ ตั้งค่า ref ด้วย

    // ✅ [แก้ไข] ต้องมั่นใจว่าเรียก "attachInputRef"
    attachInputRef.current?.click();
  };

  // ฟังก์ชันเมื่อ User เลือก "ไม่เพิ่มลายน้ำ"
  const handleAttachWithoutWatermark = () => {
    console.log('❌ User selected: ไม่เพิ่มลายน้ำ');
    setShowWatermarkModal(false);
    setAddWatermarkToAttached(false); // ตั้งค่าไม่เพิ่มลายน้ำ
    watermarkPreferenceRef.current = false; // ✅ ตั้งค่า ref ด้วย

    // ✅ [แก้ไข] ต้องมั่นใจว่าเรียก "attachInputRef" (ไม่ใช่ cameraInputRef)
    attachInputRef.current?.click();
  };

  // ฟังก์ชันเมื่อ User ยกเลิก
  const handleCancelWatermarkModal = () => {
    setShowWatermarkModal(false);
    setPendingAttachTopic('');
    setPendingReplaceDailyPhotoId(null); // ✅ ยกเลิกการแทนที่ด้วย
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
      // ✅ [เพิ่ม]
      case 'pendingManager': goToTypeScreen(); break;
      default: goToTypeScreen();
    }
  };

  const handleDeleteTopic = (photoKey: string, topicLabel: string) => {
    setModalState({
      title: 'ยืนยันการลบ',
      message: `คุณต้องการลบรูปของ '${topicLabel}' ออกจากคิวใช่หรือไม่?`,
      onConfirm: () => {
        setPhotoQueue(prevQueue => {
          const newQueue = new Map(prevQueue);
          newQueue.delete(photoKey);
          return newQueue;
        });
      }
    });
  };

  // ✅ [เพิ่ม] ฟังก์ชันสำหรับดูรูป (ใช้ Modal เดิม)
  const handlePreviewPhoto = (item: PhotoQueueItem) => {
    setPreviewData({
      url: item.base64,
      timestamp: item.timestamp,
      location: item.location,
      addWatermark: item.addWatermark  // ✅ เพิ่ม
    });
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
          location: photoItem.location,
          addWatermark: photoItem.addWatermark  // ✅ เพิ่ม
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

    const formattedTimestamp = previewData.timestamp
      ? new Date(previewData.timestamp).toLocaleString('th-TH')
      : '';
    const locationLines = previewData.location
      ? previewData.location.split('\n').filter(line => !!line.trim())
      : [];

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      // สูตรเดียวกับ watermark.ts: Math.max(24, width / 60)
      const calculatedFontSize = Math.max(24, img.naturalWidth / 60);
      setWatermarkFontSize(calculatedFontSize);
    };

    // ฟังก์ชันดาวน์โหลดรูปพร้อมลายน้ำ
    const handleDownloadWithWatermark = async () => {
      let imageSrc = previewData.url;

      // ✅ ถ้าเป็นรูปจาก Firebase Storage (URL) ต้องผ่าน Proxy เพื่อแก้ CORS
      if (imageSrc.startsWith('http')) {
        setModalState({ title: 'กำลังเตรียมรูป...', message: 'กำลังโหลดรูปต้นฉบับ...' });
        try {
          const res = await api.proxyImage(imageSrc);
          if (res.success && res.data) {
            imageSrc = res.data; // data เป็น base64
          } else {
            throw new Error(res.error || 'Proxy failed');
          }
        } catch (e) {
          console.error("Proxy error:", e);
          await showAlert('ไม่สามารถดาวน์โหลดรูปได้ (CORS Error)', 'เกิดข้อผิดพลาด');
          setModalState(null);
          return;
        }
        setModalState(null);
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      // img.crossOrigin = "anonymous"; // ❌ ไม่ต้องใช้แล้วเพราะเป็น Base64
      img.src = imageSrc;

      img.onload = () => {
        canvas.width = img.width; // ... rest of the code
        canvas.height = img.height;
        if (!ctx) return;

        // 1. วาดรูปต้นฉบับ
        ctx.drawImage(img, 0, 0);

        // 2. ถ้าต้องมีลายน้ำ (หรือรูปนี้ถูกระบุว่ามีลายน้ำ) ให้วาดลงไป
        if (previewData.addWatermark && (formattedTimestamp || locationLines.length > 0)) {
          // Config ลายน้ำ (เลียนแบบ watermark.ts)
          const fontSize = Math.max(24, Math.floor(canvas.width * 0.03));
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.fillStyle = 'white';
          ctx.shadowColor = 'black';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';

          const padding = Math.floor(canvas.width * 0.02);
          const lineHeight = fontSize * 1.5;
          let currentY = canvas.height - padding;

          // วาด Timestamp ก่อน (อยู่ล่างสุด)
          if (formattedTimestamp) {
            ctx.fillText(formattedTimestamp, canvas.width - padding, currentY);
            currentY -= lineHeight;
          }

          // วาด Location (ย้อนกลับจากล่างขึ้นบน)
          [...locationLines].reverse().forEach(line => {
            if (line) {
              ctx.fillText(line.trim(), canvas.width - padding, currentY);
              currentY -= lineHeight;
            }
          });
        }

        // 3. สั่งดาวน์โหลด
        const link = document.createElement('a');
        link.download = `photo_${Date.now()}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
      };
    };

    return (
      <div className={styles['preview-modal-overlay']} onClick={() => { setPreviewData(null); setZoomLevel(1); }}>
        <div className={styles['preview-modal-content']} onClick={(e) => e.stopPropagation()}>

          {/* ✅ [ใหม่] Top Toolbar สำหรับเครื่องมือ */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
            borderBottom: '1px solid #eee',
            paddingBottom: '10px'
          }}>
            <h3 className={styles['preview-modal-title']}>Preview</h3>

            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Toggle Info Overlay */}
              <button
                onClick={() => setShowInfoOverlay(prev => !prev)}
                className={styles['preview-control-button']}
                title={showInfoOverlay ? "ซ่อนรายละเอียด" : "แสดงรายละเอียด"}
                style={{ backgroundColor: showInfoOverlay ? '#007bff' : '#eee', color: showInfoOverlay ? 'white' : 'black' }}
              >
                {showInfoOverlay ? <FiEye /> : <FiEyeOff />}
              </button>

              {/* Zoom Controls */}
              <button onClick={() => setZoomLevel(prev => Math.max(1, prev - 0.5))} className={styles['preview-control-button']} title="Zoom Out"><FiZoomOut /> -</button>
              <span style={{ background: '#eee', padding: '5px 10px', borderRadius: '4px', minWidth: '40px', textAlign: 'center', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Math.round(zoomLevel * 100)}%</span>
              <button onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.5))} className={styles['preview-control-button']} title="Zoom In"><FiZoomIn /> +</button>

              {/* Download */}
              <button
                onClick={handleDownloadWithWatermark}
                className={styles['preview-control-button']}
                title="Download with Watermark"
                style={{ backgroundColor: '#27ae60', color: 'white', borderColor: '#27ae60' }}
              >
                <FiSave /> <span className={styles['button-text']}>บันทึก</span>
              </button>
            </div>

            <button className={styles['preview-modal-close']} onClick={() => { setPreviewData(null); setZoomLevel(1); }} style={{ position: 'static', marginLeft: '10px' }}>
              <FiX />
            </button>
          </div>

          <div className={styles['preview-image-container']} style={{
            overflow: 'auto',
            maxHeight: '80vh', // ✅ ปรับให้พอดีจอ ไม่ล้นจนมี Scrollbar ซ้อน
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>

            {/* Wrapper สำหรับรูป + Text เพื่อให้ Zoom ไปพร้อมกัน */}
            <div style={{
              position: 'relative',
              display: 'inline-block',
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center', // ✅ Zoom จากตรงกลาง
              transition: 'transform 0.2s ease',
            }}>
              <img
                src={previewData.url}
                alt="Preview"
                onLoad={handleImageLoad} // ✅ คำนวณขนาด Font เมื่อรูปโหลดเสร็จ
                style={{
                  maxWidth: '100%',
                  maxHeight: '80vh', // ✅ บังคับความสูงให้พอดีจอ
                  width: 'auto',
                  display: 'block',
                  // margin: '0 auto' // ไม่ต้องใช้เพราะมี Flex parent แล้ว
                }}
              />

              {/* ✅ [แก้ไข] แสดง Text แบบจำลอง Watermark 100% */}
              {showInfoOverlay && previewData.addWatermark && (formattedTimestamp || locationLines.length > 0) && (
                <div style={{
                  position: 'absolute',
                  // ✅ ใช้ padding เท่ากับขนาด font (เหมือน watermark.ts)
                  bottom: `${watermarkFontSize}px`,
                  right: `${watermarkFontSize}px`,
                  textAlign: 'right',
                  color: 'white',
                  textShadow: '0px 0px 4px rgba(0,0,0,1)', // เงา blur 3 (ใกล้เคียง 4)
                  fontWeight: 'bold',
                  fontFamily: 'Arial, sans-serif',
                  fontSize: `${watermarkFontSize}px`,
                  lineHeight: '1.2', // ตาม watermark.ts
                  pointerEvents: 'none',
                  whiteSpace: 'pre', // ใช้ pre เพื่อให้ \n ทำงาน
                }}>
                  {/* แสดง Location ก่อน (อยู่ด้านบน) */}
                  {locationLines.length > 0 && (
                    <div style={{ marginBottom: 0 }}>
                      {[...locationLines].map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  )}
                  {/* Timestamp อยู่ล่างสุด */}
                  {formattedTimestamp && (
                    <div>{formattedTimestamp}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div >
    );
  };

  // --- Main Render ---
  return (
    <div className={styles['wizard-container']}>
      {modalState && (
        <CustomModal
          title={modalState.title}
          message={modalState.message}
          onConfirm={modalState.onConfirm ? () => {
            modalState.onConfirm!();
            setModalState(null);
          } : undefined
          }
          onClose={() => setModalState(null)}
        />
      )}

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={cameraInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={(e) => handleNativeFileSelected(e, true)}
      />

      <input
        type="file"
        accept="image/*"
        ref={attachInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={(e) => {
          handleNativeFileSelected(e, false, addWatermarkToAttached);
        }}
      />
      {renderPreviewModal()}

      {isProcessingPhoto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          <div style={{ textAlign: 'center' }}><h3>กำลังประมวลผลรูป...</h3><p>กรุณารอสักครู่...</p></div>
        </div>
      )}

      {step === 'type' && (
        <div className={styles['wizard-step']}>
          <h2>1. เลือกประเภทรายงาน</h2>
          <div className={styles['selection-grid']}>
            <div className={styles['selection-card']} onClick={() => handleSelectReportType('QC')}>
              <span style={{ fontSize: '2rem' }}><FiClipboard /></span>
              <p>รายงาน QC (ตามหัวข้อ)</p>
            </div>
            <div className={`${styles['selection-card']} ${styles.daily}`} onClick={() => handleSelectReportType('Daily')}>
              <span style={{ fontSize: '2rem' }}><FiSun /></span>
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
                    // ✅ [แก้ไข 4] เปลี่ยน onClick ให้ไปที่ 'pendingManager'
                    onClick={() => {
                      setReportType('QC');
                      setStep('pendingManager'); // <-- Error 2 & 3 จะหายไป
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>
                      <FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                      คุณมี {qcItemsInQueue} รูป QC ที่ยังไม่ได้อัปโหลด
                    </h3>
                    {/* ✅ [แก้ไข] เปลี่ยนข้อความให้สื่อความหมายมากขึ้น */}
                    <p style={{ margin: 0, color: '#856404' }}>คลิกที่นี่เพื่อ "จัดการ" รูปที่ค้างอยู่</p>
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

          {/* sharedJobs list removed as per new workflow */}

          {/* ✅ [ใหม่] ปุ่มซ่อมแซมข้อมูล (Migration Tool) */}
          <div style={{ marginTop: '30px', textAlign: 'center', padding: '20px', borderTop: '1px solid #eee' }}>
            <p style={{ color: '#888', marginBottom: '10px', fontSize: '0.8rem' }}>เครื่องมือสำหรับผู้ดูแลระบบ</p>
            <button
              onClick={async () => {
                const isConfirmed = await showConfirm('ยืนยันที่จะแปลงข้อมูลเก่าทั้งหมดเป็นตัวพิมพ์ใหญ่ (Uppercase)?\nการกระทำนี้จะแก้ไขข้อมูลในฐานข้อมูลทันที', 'ยืนยันการแปลงข้อมูล');
                if (!isConfirmed) return;
                setModalState({ title: 'กำลังประมวลผล...', message: 'กำลังซ่อมแซมข้อมูล...' });
                try {
                  const response = await api.getSharedJobs(projectId);
                  if (response.success && response.data) {
                    let updatedCount = 0;
                    const jobs = response.data;

                    for (const job of jobs) {
                      let needsUpdate = false;
                      const newDynamicFields: Record<string, string> = {};

                      // 1. Check & Convert Fields
                      for (const [key, value] of Object.entries(job.dynamicFields)) {
                        if (value && value !== value.toUpperCase()) {
                          needsUpdate = true;
                          newDynamicFields[key] = value.toUpperCase();
                        } else {
                          newDynamicFields[key] = value;
                        }
                      }

                      if (needsUpdate) {
                        // 2. Re-generate ID/Label
                        const sanitizeForFirestoreId = (str: string) => str.replace(/[\/\.\$\[\]#]/g, '_');

                        const mainId = sanitizeForFirestoreId(job.mainCategory);
                        const subId = sanitizeForFirestoreId(job.subCategory);
                        const fieldValues = Object.keys(newDynamicFields).sort().map(k => newDynamicFields[k]).map(sanitizeForFirestoreId).join('_');
                        const newId = `${mainId}_${subId}_${fieldValues}`;

                        // 3. Prepare New Job Data
                        const newJob = {
                          ...job,
                          id: newId, // New ID
                          dynamicFields: newDynamicFields,
                          label: [job.mainCategory, job.subCategory, ...Object.values(newDynamicFields)].join(' / ')
                        };

                        // 4. Save New & Delete Old
                        await api.saveSharedJob(projectId, newJob);
                        await api.deleteSharedJob(projectId, job.id); // ✅ Delete the old job
                        updatedCount++;
                      }
                    }
                    await showAlert(`✅ ซ่อมแซมข้อมูลเสร็จสิ้น!\nแก้ไขไปทั้งหมด ${updatedCount} รายการ`, 'สำเร็จ');
                    fetchSharedJobs();
                  }
                } catch (e) {
                  await showAlert('❌ เกิดข้อผิดพลาด: ' + (e as Error).message, 'เกิดข้อผิดพลาด');
                } finally {
                  setModalState(null);
                }
              }}
              style={{
                background: '#f8f9fa',
                border: '1px dashed #ccc',
                color: '#dc3545',
                padding: '10px 15px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}
            >
              🔧 Fix Data Case (เปลี่ยนเป็นตัวพิมพ์ใหญ่)
            </button>
          </div>
        </div>
      )}


      {step === 'mainCat' && (
        <div className={styles['wizard-step']}>
          <h2>2. เลือกหมวดงานหลัก</h2>
          {renderChecklistHeader()}
          <div className={styles['selection-grid']}>
            {mainCategories.map((mainCat) => {
              // ✅ [ใหม่] คำนวณความคืบหน้าของ Main Category
              const activeJobsInMain = sharedJobs.filter(
                job => job.mainCategory === mainCat.name && job.reportType === 'QC' && job.status === 'pending'
              );
              const pendingCount = activeJobsInMain.length;

              return (
                <div key={mainCat.id} className={styles['selection-card']} onClick={() => handleSelectMainCat(mainCat.name)} style={{ position: 'relative' }}>
                  {mainCat.name}
                  {/* Badge แจ้งเตือนงานค้าง */}
                  {pendingCount > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '-10px',
                      background: '#dc3545',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      {pendingCount} อยู่ระหว่างดำเนินการ
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles['wizard-nav']}> <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>ย้อนกลับ</button> </div>
        </div>
      )}
      {step === 'subCat' && (
        <div className={styles['wizard-step']}>
          <h2>3. เลือกหมวดงานย่อย</h2>
          {renderChecklistHeader()}
          <div className={styles['selection-grid']}>
            {subCategories.map((subCat) => {
              // ✅ [ใหม่] คำนวณจำนวนงานค้างของ Sub Category (เหมือน Main Cat)
              const activeJobsInSub = sharedJobs.filter(
                job => job.mainCategory === selectedMainCategory &&
                  job.subCategory === subCat.name &&
                  job.reportType === 'QC' &&
                  job.status === 'pending'
              );
              const pendingCount = activeJobsInSub.length;

              return (
                <div key={subCat.id} className={styles['selection-card']} onClick={() => handleSelectSubCat(subCat.name)} style={{ position: 'relative' }}>
                  {subCat.name}
                  {/* Badge แจ้งเตือนงานค้าง */}
                  {pendingCount > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '-10px',
                      background: '#dc3545',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      {pendingCount} อยู่ระหว่างดำเนินการ
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles['wizard-nav']}> <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>ย้อนกลับ</button> </div>
        </div>
      )}
      {step === 'dynamicFields' && (
        <div className={styles['wizard-step']}>
          <h2>4. กรอกข้อมูลเพิ่มเติม</h2>
          {renderChecklistHeader()}
          {requiredDynamicFields.map((fieldConfig: string | any) => {
            const fieldLabel = typeof fieldConfig === 'string' ? fieldConfig : fieldConfig.label;
            const staticOptions = (typeof fieldConfig === 'object' && fieldConfig.options) ? fieldConfig.options : [];
            const suggestions = [
              ...staticOptions,
              ...(fieldSuggestions[fieldLabel] || [])
            ];
            // Remove duplicates
            const uniqueSuggestions = Array.from(new Set(suggestions));

            return (
              <div className={styles['form-group']} key={fieldLabel}>
                <label>{fieldLabel}</label>
                <AutocompleteInput
                  value={dynamicFields[fieldLabel] || ''}
                  onChange={(value) => handleDynamicFieldChange(fieldLabel, value)}
                  suggestions={uniqueSuggestions}
                  placeholder={`ระบุ${fieldLabel}...`}
                />
              </div>
            );
          })}
          <div className={styles['wizard-nav']}>
            <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack}>ย้อนกลับ</button>
            <button className={styles['wizard-button']} onClick={handleDynamicFieldsSubmit}>เริ่มตรวจใหม่</button>
          </div>

          {/* ✅ [ใหม่] ส่วนแสดงงานที่ค้างอยู่ (Resume Job) - พร้อม Smart Filter */}
          {(() => {
            // 1. กรองงานที่ "สถานะ" ตรงกันก่อน
            let relevantJobs = sharedJobs.filter(
              job => job.mainCategory === selectedMainCategory &&
                job.subCategory === selectedSubCategory &&
                job.reportType === 'QC' &&
                job.status === 'pending'
            );

            // 2. Smart Filter: กรองตามสิ่งที่ User พิมพ์ใน dynamicFields
            const filterKeys = Object.keys(dynamicFields);
            if (filterKeys.length > 0) {
              relevantJobs = relevantJobs.filter(job => {
                return filterKeys.every(key => {
                  const filterValue = dynamicFields[key] || '';
                  if (!filterValue) return true; // ถ้าช่องนี้ User ไม่ได้พิมพ์ ก็ข้ามไป (ถือว่าผ่าน)

                  const jobValue = job.dynamicFields[key] || '';
                  // เปรียบเทียบแบบ Case Insensitive และ Partial Match
                  return jobValue.toLowerCase().includes(filterValue.toLowerCase());
                });
              });
            }

            if (relevantJobs.length > 0) {
              return (
                <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                  <h3 style={{ fontSize: '1rem', color: '#666', marginBottom: '15px' }}>
                    <FiRefreshCw style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                    ทำงานต่อจากเดิม (Resume) - พบ {relevantJobs.length} รายการ
                  </h3>
                  <div className={styles['selection-grid']}>
                    {relevantJobs.map(job => (
                      <div
                        key={job.id}
                        className={styles['selection-card']}
                        onClick={() => handleSelectSharedJob(job)}
                        style={{ flexDirection: 'column', gap: '5px', alignItems: 'flex-start', padding: '15px' }}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                          {Object.values(job.dynamicFields).join(' / ')}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>
                          แก้ไขล่าสุด: {new Date(job.lastUpdatedAt).toLocaleString('th-TH')}
                        </div>
                        <div style={{
                          color: '#007bff',
                          fontSize: '0.8rem',
                          background: '#e3f2fd',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          marginTop: '5px',
                          alignSelf: 'flex-start'
                        }}>
                          📸 ถ่ายแล้ว {job.completedTopics}/{job.totalTopics}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      {step === 'topicList' && (
        <div className={styles['wizard-step']}>
          <h2>5. ถ่ายรูปตามหัวข้อ</h2>
          {renderChecklistHeader()}
          {isChecklistLoading ? (<div className="loading-container" style={{ height: '50vh' }}>กำลังตรวจสอบสถานะ...</div>) : (
            <>
              <div className={styles['topic-list']}>
                {topics.map((topic: Topic) => {
                  const topicName = topic.name;
                  const queueItem = photoQueue.get(topicName);
                  const isQueued = !!queueItem;
                  const isUploaded = uploadedStatus.get(topicName) || uploadedStatus.has(topicName); // ✅ Safe check

                  let statusIcon: React.ReactNode = <FiCircle />;
                  let statusLabel = '';
                  let statusColor = '#888';

                  if (isUploaded) {
                    statusIcon = <FiCheckCircle style={{ color: 'green' }} />;
                    statusLabel = '(อัปโหลดแล้ว)';
                  } else if (isQueued && queueItem?.status === 'failed') {
                    statusIcon = <FiAlertTriangle style={{ color: 'red' }} />;
                    statusLabel = '(ล้มเหลว)'; statusColor = 'red';
                  } else if (isQueued) {
                    statusIcon = <FiInbox style={{ color: '#0056b3' }} />;
                    statusLabel = '(อยู่ในคิว)';
                    statusColor = '#0056b3';
                  }

                  // ✅ [ใหม่] ฟังก์ชันกดดูรูปที่อัปโหลดแล้ว
                  const handleViewUploaded = async () => {
                    if (!isUploaded) return;
                    setModalState({ title: 'กำลังโหลด...', message: 'กำลังดึงรูปภาพล่าสุด...' });
                    try {
                      const response = await api.getLatestPhotoForTopic(projectId, topicName, `${selectedMainCategory} > ${selectedSubCategory}`, dynamicFields);
                      setModalState(null);
                      if (response.success && response.data) {
                        setPreviewData({
                          url: response.data.driveUrl, // ✅ Changed to driveUrl
                          timestamp: response.data.createdAt, // ✅ Changed to createdAt
                          location: response.data.location || null,
                          addWatermark: false
                        });
                      } else {
                        await showAlert('ไม่พบรูปภาพ', 'ข้อผิดพลาด');
                      }
                    } catch (e) {
                      setModalState(null);
                      await showAlert('เกิดข้อผิดพลาดในการโหลดรูป', 'ข้อผิดพลาด');
                    }
                  };

                  return (
                    <div key={topic.id} className={styles['topic-list-item']}>
                      <span className={styles['topic-list-item-status']}>{statusIcon}</span>
                      <span
                        className={`${styles['topic-list-item-name']} ${(isQueued || isUploaded) ? styles.viewable : ''}`}
                        onClick={() => {
                          if (isQueued && queueItem) {
                            setPreviewData({
                              url: queueItem.base64,
                              timestamp: queueItem.timestamp,
                              location: queueItem.location,
                              addWatermark: queueItem.addWatermark
                            });
                          } else if (isUploaded) {
                            handleViewUploaded();
                          }
                        }}
                        title={(isQueued || isUploaded) ? 'กดเพื่อดูรูป' : topicName}
                        style={{ color: isQueued ? statusColor : 'inherit' }}
                      >
                        {topicName} <span style={{ color: statusColor, fontSize: '0.8em', fontWeight: 'bold' }}>{statusLabel}</span>
                      </span>

                      <button className={`${styles['topic-list-item-button']} ${(isQueued || isUploaded) ? styles.retake : ''}`} onClick={() => handleStartPhotoForTopic(topicName, 'capture')} title="ถ่ายรูป (บังคับลายน้ำ)">
                        <FiCamera />
                      </button>
                      <button className={`${styles['topic-list-item-button']} ${styles.attach}`} onClick={() => handleStartPhotoForTopic(topicName, 'attach')} title="แนบรูป">
                        <FiImage />
                      </button>

                      {/* ✅ [ใหม่] ปุ่มดูรูปแยกต่างหาก (ชัดเจนขึ้น) */}
                      {isUploaded && (
                        <button
                          className={`${styles['topic-list-item-button']} ${styles.attach}`}
                          onClick={handleViewUploaded}
                          title="ดูรูปที่ส่งแล้ว"
                          style={{ marginLeft: '5px' }}
                        >
                          <FiEye />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className={styles['button-grid-container']}>
                <button className={`${styles['wizard-button']} ${styles.secondary}`} onClick={goBack} style={{ width: '100%' }}> ย้อนกลับ </button>
                <button
                  className={styles['upload-all-button']}
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

      {/* ✅ [เพิ่ม] หน้า Pending Manager */}
      {step === 'pendingManager' && (
        <div className={styles['wizard-step']}>
          <h2><FiInbox style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            งาน {reportType === 'QC' ? 'QC' : 'Daily'} ที่ค้างในคิว
          </h2>

          <PendingJobsManager
            queue={photoQueue}
            reportType={reportType}
            onGoToJob={(jobData) => {
              if (jobData.reportType === 'QC') {
                setReportType('QC');
                setSelectedMainCategory(jobData.mainCategory || '');
                setSelectedSubCategory(jobData.subCategory || '');
                // ✅ [แก้ไข 5] Cast Type ตรงนี้
                setDynamicFields((jobData.dynamicFields as Record<string, string>) || {});
                setUploadedStatus(new Map());
                setStep('topicList');
              } else {
                setReportType('Daily');
                setStep('dailyReview');
              }
            }}

            onConfirmDeleteJob={(jobId, jobLabel, itemCount) => {
              setModalState({
                title: 'ยืนยันการลบ',
                message: `คุณต้องการลบ ${itemCount} รูป ของงาน '${jobLabel}' ออกจากคิวใช่หรือไม่?`,
                onConfirm: () => {
                  setPhotoQueue(prevQueue => {
                    const newQueue = new Map(prevQueue);
                    newQueue.forEach((item, key) => {
                      if (item.uploadData.jobId === jobId) {
                        newQueue.delete(key);
                      }
                    });
                    return newQueue;
                  });
                }
              });
            }}
            // ✅ [แก้ไข] เปลี่ยนชื่อ Prop และส่งข้อมูลมาสร้าง Modal
            onConfirmDeleteTopic={(photoKey, topicLabel) => {
              // ส่งต่อให้ฟังก์ชันที่เราสร้างไว้ในข้อ 3.3
              handleDeleteTopic(photoKey, topicLabel);
            }}
            onPreviewPhoto={handlePreviewPhoto}
          // onDeleteTopic={handleDeleteTopic} // (ลบอันนี้)
          />

          <div className={styles['wizard-nav']}>
            <button
              className={`${styles['wizard-button']} ${styles.secondary}`}
              onClick={goBack} // <-- แก้ไขให้ goBack ไป TypeScreen
            >
              ย้อนกลับ
            </button>
          </div>
        </div>
      )}

      {step === 'dailyReview' && (
        <div className={styles['wizard-step']}>
          <h2><FiEdit style={{ verticalAlign: 'middle', marginRight: '8px' }} /> จัดการรูป & คำบรรยาย (Daily)</h2>

          <div className={styles['daily-review-list']}>
            {Array.from(photoQueue.entries())
              .filter(([key, item]) => item.uploadData.jobId === getCurrentJobIdentifier().id)
              .map(renderDailyReviewItem)
            }
          </div>
          {Array.from(photoQueue.values()).filter(item => item.uploadData.jobId === getCurrentJobIdentifier().id).length === 0 && (
            <p style={{ textAlign: 'center', color: '#888', margin: '40px 0' }}>ยังไม่มีรูปถ่าย</p>
          )}

          <div className={styles['wizard-nav']}>
            <button
              className={`${styles['wizard-button']} ${styles.secondary}`}
              onClick={() => setStep('camera')}
            >
              <FiCamera style={{ verticalAlign: 'middle', marginRight: '4px' }} /> กลับไปถ่าย
            </button>
            <button
              className={styles['upload-all-button']}
              onClick={handleUploadAll}
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
            กดปุ่ม "ถ่ายรูป" เพื่อเปิดกล้อง<br />
            รูปที่ถ่ายจะถูกเพิ่มเข้าคิวอัตโนมัติ
          </p>

          <div className={styles.cameraActionGrid}>
            <button
              className={styles.wizardButton}
              onClick={() => cameraInputRef.current?.click()}
            >
              <span style={{ fontSize: '2.5rem' }}><FiCamera /></span>
              <br /> ถ่ายรูป (บังคับลายน้ำ)
            </button>

            <button
              className={`${styles.wizardButton} ${styles.secondary}`}
              onClick={() => {
                setPendingAttachTopic('');  // Daily ไม่มี topic เฉพาะ
                setShowWatermarkModal(true); // เปิด Modal
              }}
            >
              <span style={{ fontSize: '2.5rem' }}><FiImage /></span>
              <br /> แนบรูป
            </button>
          </div>

          {(() => {
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
                      <FiEdit style={{ verticalAlign: 'middle', marginRight: '4px' }} /> จัดการคิวก่อนอัปโหลด ({dailyQueueSize})
                    </button>
                  ) : (<div style={{ minWidth: '120px', display: 'inline-block' }}></div>)}
                </div>

                <hr style={{ margin: '30px 0', border: 'none', borderTop: '2px dashed #eee' }} />

                {/* ✅ [ใหม่] Daily Resume Dashboard */}
                <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#333' }}>
                      <FiInbox style={{ marginRight: '8px', color: '#007bff' }} /> รูปที่ส่งแล้ว
                    </h3>
                    <input
                      type="date"
                      value={selectedDailyDate}
                      onChange={(e) => setSelectedDailyDate(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '1rem', cursor: 'pointer' }}
                    />
                  </div>

                  {isFetchingDaily ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
                      <FiLoader className={styles.iconSpin} style={{ fontSize: '1.5rem', marginBottom: '10px' }} /><br />
                      กำลังโหลดข้อมูล...
                    </div>
                  ) : fetchedDailyPhotos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#888', background: '#fff', borderRadius: '8px', border: '1px dashed #ccc' }}>
                      ไม่มีรูปภาพสำหรับวันที่ {new Date(selectedDailyDate).toLocaleDateString('th-TH')}
                    </div>
                  ) : (
                    <>
                      <p style={{ margin: '0 0 15px 0', color: '#555', fontSize: '0.9rem' }}>พบ {fetchedDailyPhotos.length} รูป (สามารถแก้ไขได้ที่หน้ารายงาน)</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
                        {fetchedDailyPhotos.map((photo, index) => {
                          const cdnUrl = process.env.REACT_APP_FIREBASE_CDN_HOST;
                          const displayUrl = cdnUrl && photo.firepath
                            ? `${cdnUrl}/${photo.firepath.replace(/^\//, '')}`
                            : photo.driveUrl || '';
                          return (
                            <div key={photo.id} style={{ display: 'flex', gap: '15px', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #eee' }}>
                              <div style={{ width: '80px', height: '80px', flexShrink: 0, overflow: 'hidden', borderRadius: '6px', cursor: 'pointer' }} onClick={() => setPreviewData({ url: displayUrl, timestamp: photo.createdAt, addWatermark: false })}>
                                <img src={displayUrl} alt={`Daily ${index}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <strong style={{ fontSize: '0.95rem', color: '#333', marginBottom: '4px' }}>{index + 1}. {photo.description || 'ไม่มีคำบรรยาย'}</strong>
                                <small style={{ color: '#888' }}>{new Date(photo.createdAt).toLocaleTimeString('th-TH')}</small>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <button
                                  style={{ background: 'white', border: '1px solid #007bff', borderRadius: '4px', padding: '6px', cursor: 'pointer', color: '#007bff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  title="ถ่ายรูปแทนที่ (บังคับลายน้ำ)"
                                  onClick={() => {
                                    setPendingAttachTopic(photo.description || ''); // เก็บหัวข้อเดิมไว้
                                    setPendingReplaceDailyPhotoId(photo.id); // ✅ ตั้งค่า ID ของรูปที่จะถูกแทนที่
                                    handleStartPhotoForTopic(photo.description || '', 'capture');
                                  }}
                                >
                                  <FiCamera />
                                </button>
                                <button
                                  style={{ background: 'white', border: '1px solid #28a745', borderRadius: '4px', padding: '6px', cursor: 'pointer', color: '#28a745', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  title="แนบรูปแทนที่"
                                  onClick={() => {
                                    setPendingAttachTopic(photo.description || ''); // เก็บหัวข้อเดิมไว้
                                    setPendingReplaceDailyPhotoId(photo.id); // ✅ ตั้งค่า ID ของรูปที่จะถูกแทนที่
                                    setShowWatermarkModal(true); // เปิด Modal ให้เลือกลายน้ำใหม่
                                  }}
                                >
                                  <FiImage />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {step === 'uploading' && (
        <div className={styles['wizard-step']} style={{ textAlign: 'center', paddingTop: '100px' }}>
          <h2>{uploadStatus}</h2>
          {isUploading && <p>กรุณารอสักครู่...</p>}
          {!isUploading && photoQueue.size > 0 && (
            <button className={styles['wizard-button']} onClick={() => setStep(reportType === 'QC' ? 'topicList' : 'dailyReview')}>
              กลับไปที่คิว (เหลือ {photoQueue.size} รูป)
            </button>
          )}
        </div>
      )}
      {showWatermarkModal && (
        <div className={styles['watermark-modal-overlay']} onClick={handleCancelWatermarkModal}>
          <div className={styles['watermark-modal-content']} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles['watermark-modal-title']}>
              📎 เลือกการแนบรูปภาพ
            </h3>

            <button
              className={styles['watermark-modal-button']}
              onClick={handleAttachWithWatermark}
            >
              <span className={styles['watermark-modal-icon']}>🏷️</span>
              <div className={styles['watermark-modal-text']}>
                <strong>เพิ่มลายน้ำ</strong>
                <small>วันเวลา + ตำแหน่ง</small>
              </div>
            </button>

            <button
              className={styles['watermark-modal-button']}
              onClick={handleAttachWithoutWatermark}
            >
              <span className={styles['watermark-modal-icon']}>📷</span>
              <div className={styles['watermark-modal-text']}>
                <strong>ไม่เพิ่มลายน้ำ</strong>
                <small>ใช้รูปต้นฉบับ</small>
              </div>
            </button>

            <button
              className={styles['watermark-modal-cancel']}
              onClick={handleCancelWatermarkModal}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ✅ [เพิ่ม] Component ใหม่
interface PendingJobsManagerProps {
  queue: Map<string, PhotoQueueItem>;
  reportType: 'QC' | 'Daily';
  onGoToJob: (jobData: PhotoQueueItem['uploadData']) => void;
  // ✅ [แก้ไข] อัปเดต Props
  onConfirmDeleteJob: (jobId: string, jobLabel: string, itemCount: number) => void;
  onConfirmDeleteTopic: (photoKey: string, topicLabel: string) => void;
  onPreviewPhoto: (item: PhotoQueueItem) => void;
}

const PendingJobsManager: React.FC<PendingJobsManagerProps> = ({
  queue,
  reportType,
  onGoToJob,
  onConfirmDeleteJob,
  onConfirmDeleteTopic,
  onPreviewPhoto
}) => {

  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const pendingJobs = useMemo(() => {
    type JobGroup = {
      jobId: string;
      jobLabel: string;
      items: PhotoQueueItem[];
      firstItemData: PhotoQueueItem['uploadData'];
    };
    const groups = new Map<string, JobGroup>();

    // ✅ [แก้ไข 6.2] เปลี่ยน Loop เป็น forEach
    queue.forEach((item) => {
      if (item.uploadData.reportType !== reportType) return; // 'continue'

      const jobId = item.uploadData.jobId;
      if (!jobId) return; // 'continue'

      if (!groups.has(jobId)) {
        let label = item.uploadData.jobLabel;
        if (!label) {
          if (reportType === 'QC') {
            label = item.uploadData.mainCategory ? `${item.uploadData.mainCategory} / ${item.uploadData.subCategory}` : 'งานไม่ระบุชื่อ';
          } else {
            label = `รายงานประจำวัน (${new Date(item.timestamp).toLocaleDateString('th-TH')})`;
          }
        }

        groups.set(jobId, {
          jobId: jobId,
          jobLabel: label,
          items: [],
          firstItemData: item.uploadData,
        });
      }
      groups.get(jobId)!.items.push(item);
    });

    return Array.from(groups.values());
  }, [queue, reportType]);

  if (pendingJobs.length === 0) {
    return <p style={{ textAlign: 'center', color: '#888', margin: '40px 0' }}>ไม่พบงานที่ค้างในคิว</p>;
  }

  return (
    <div className={styles['topic-list']}>
      {pendingJobs.map((job) => (
        <div key={job.jobId} className={styles['pending-job-group']}>
          {/* === ส่วน Header ของ Accordion (Job) === */}
          <div
            className={styles['recent-job-item']}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            {/* ทำให้ส่วนข้อความกดขยายได้ */}
            <div
              style={{ flex: 1, cursor: 'pointer', padding: '10px 0' }}
              onClick={() => setExpandedJobId(job.jobId === expandedJobId ? null : job.jobId)}
            >
              <span style={{ fontWeight: 'bold' }}>
                {/* เพิ่มไอคอนลูกศร */}
                {expandedJobId === job.jobId ? '▼' : '►'} {job.jobLabel}
              </span>
              <br />
              <small style={{ color: '#555', paddingLeft: '20px' }}>
                {job.items.length} รูปที่ยังไม่ได้อัปโหลด
              </small>
            </div>

            {/* ปุ่ม "ไปที่หน้านี้" (วาร์ป) */}
            <button
              className={styles['topic-list-item-button']}
              title="ไปที่หน้านี้เพื่ออัปโหลด"
              onClick={() => onGoToJob(job.firstItemData)}
              style={{ marginRight: '5px' }}
            >
              📤
            </button>

            {/* ปุ่ม "ลบทั้ง Job" */}
            <button
              className={`${styles['topic-list-item-button']} ${styles.attach}`}
              title="ลบรูปทั้งหมดของงานนี้"
              onClick={() => {
                // ✅ [แก้ไข] เรียก Prop ใหม่
                onConfirmDeleteJob(job.jobId, job.jobLabel, job.items.length);
              }}
            >
              <FiTrash2 />
            </button>
          </div>

          {/* === ส่วน Body ของ Accordion (แสดง Topic/รูป) === */}
          {expandedJobId === job.jobId && (
            <div className={styles['pending-job-details']}>
              {job.items.map((item) => {
                // สร้าง Label สำหรับแต่ละรูป
                let itemLabel = item.key;
                if (item.uploadData.reportType === 'QC' && item.uploadData.topic) {
                  itemLabel = `หัวข้อ: ${item.uploadData.topic}`;
                } else if (item.uploadData.reportType === 'Daily') {
                  itemLabel = item.uploadData.description
                    ? `(Daily) ${item.uploadData.description.substring(0, 30)}...`
                    : `(Daily) รูปถ่าย ${new Date(item.timestamp).toLocaleTimeString('th-TH')}`;
                }

                return (
                  <div key={item.key} className={styles['pending-topic-item']}>
                    {/* ชื่อหัวข้อ/รูป */}
                    <span style={{ color: item.status === 'failed' ? 'red' : 'inherit' }}>
                      {itemLabel}
                      {item.status === 'failed' && ' (ล้มเหลว)'}
                    </span>

                    {/* ปุ่มจัดการรายรูป */}
                    <div className={styles['pending-topic-actions']}>
                      <button
                        className={`${styles['topic-list-item-button']} ${styles.attach}`}
                        title="ดูรูป"
                        onClick={() => onPreviewPhoto(item)}
                      >
                        👁️
                      </button>
                      <button
                        className={`${styles['topic-list-item-button']} ${styles.attach}`}
                        title="ลบรูปนี้"
                        onClick={() => {
                          // ✅ [แก้ไข] เรียก Prop ใหม่
                          onConfirmDeleteTopic(item.key, itemLabel);
                        }}
                        style={{ marginLeft: '5px' }}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default Camera;