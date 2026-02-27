// Filename: src/components/Reports.tsx (REFACTORED for Search Button & Preview)

import React, { useState, useEffect, useCallback } from 'react';
// ✅ [ใหม่] 1. Import Type ใหม่
import { api, ProjectConfig, MainCategory, SubCategory, GeneratedReportInfo, ChecklistStatusResponse, SharedJob, Photo } from '../utils/api';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import styles from './Reports.module.css';
import { useDialog } from '../contexts/DialogContext';
import AutocompleteInput from './AutocompleteInput';
import JSZip from 'jszip';

import { FiFileText, FiDownload, FiSearch, FiRefreshCw, FiActivity, FiCheckCircle, FiClock, FiChevronRight, FiChevronDown, FiChevronUp, FiZoomIn, FiZoomOut, FiEyeOff, FiEye, FiSave, FiAlertTriangle, FiLoader, FiDownloadCloud, FiClipboard, FiSun, FiPlus, FiInbox, FiX } from 'react-icons/fi';

interface ReportsProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
}

const cdnUrl = (process.env.REACT_APP_CDN_URL || '').replace(/\/$/, '');
const formatDateToYYYYMMDD = (date: Date | null): string | undefined => {
  if (!date) return undefined;

  // สร้าง Date ใหม่และตั้งเวลาเป็นเที่ยงวัน (หลีกเลี่ยงปัญหา timezone)
  const safeDate = new Date(date);
  safeDate.setHours(12, 0, 0, 0);

  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};
const Reports: React.FC<ReportsProps> = ({ projectId, projectName, projectConfig }) => {

  // --- 1. STATES ---
  const [qcTopics, setQcTopics] = useState<ProjectConfig>(projectConfig || []);
  const [reportType, setReportType] = useState<'QC' | 'Daily'>('QC');
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [formData, setFormData] = useState({ mainCategory: '', subCategory: '' });
  const [dynamicFields, setDynamicFields] = useState<{ [key: string]: string }>({});

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);

  // States สำหรับ List (ด้านล่าง)
  const [generatedReportsList, setGeneratedReportsList] = useState<GeneratedReportInfo[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  // ✅ [ใหม่] 2. States สำหรับ Preview (ด้านบน)
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [previewStatus, setPreviewStatus] = useState<ChecklistStatusResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fieldSuggestions, setFieldSuggestions] = useState<Record<string, string[]>>({});

  // ✅ [ใหม่] Daily Photos States
  const [dailyPhotos, setDailyPhotos] = useState<Photo[]>([]);
  const [showDailyPreviewModal, setShowDailyPreviewModal] = useState<boolean>(false);
  const [showDailyGenerateModal, setShowDailyGenerateModal] = useState<boolean>(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());

  // ✅ [ใหม่] QC Photos States
  const [qcPhotos, setQcPhotos] = useState<Photo[]>([]);
  const [showQcDownloadModal, setShowQcDownloadModal] = useState<boolean>(false);
  const [selectedQcPhotoIds, setSelectedQcPhotoIds] = useState<Set<string>>(new Set());
  const [isDownloadingPhotos, setIsDownloadingPhotos] = useState<boolean>(false); // สำหรับ Download Progress

  // ✅ [ใหม่] แทนที่ fullScreenImage ด้วย previewData แบบละเอียด
  const [previewData, setPreviewData] = useState<{ url: string, timestamp: string, location: string | null, addWatermark: boolean } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showInfoOverlay, setShowInfoOverlay] = useState<boolean>(true);
  const [watermarkFontSize, setWatermarkFontSize] = useState<number>(24);

  // ✅ [ใหม่] 3. States สำหรับ Active Feed (SharedJobs)
  const [sharedJobs, setSharedJobs] = useState<any[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);

  const { showAlert } = useDialog();

  // --- 3. useEffects for Filters (ปรับปรุงเล็กน้อย) ---
  useEffect(() => {
    if (projectConfig) {
      setQcTopics(projectConfig);
      const mainCategories = projectConfig;
      if (mainCategories.length > 0 && reportType === 'QC') {
        if (!formData.mainCategory) {
          // setFormData(prev => ({ ...prev, mainCategory: mainCategories[0].name }));
        }
      } else if (reportType !== 'QC') {
        setFormData({ mainCategory: '', subCategory: '' });
      }
    }
  }, [projectConfig, reportType, formData.mainCategory]);

  // ✅ [ใหม่] 6. Accordion State
  const [expandedMain, setExpandedMain] = useState<Set<string>>(new Set());
  const [expandedSub, setExpandedSub] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState(''); // ✅ [ใหม่] Smart Filter State

  const toggleMain = (mainCat: string) => {
    setExpandedMain(prev => {
      const next = new Set(prev);
      if (next.has(mainCat)) next.delete(mainCat);
      else next.add(mainCat);
      return next;
    });
  };

  const toggleSub = (subKey: string) => {
    setExpandedSub(prev => {
      const next = new Set(prev);
      if (next.has(subKey)) next.delete(subKey);
      else next.add(subKey);
      return next;
    });
  };

  useEffect(() => {
    // 1. If QC Topics are loaded but no Main Category is selected, select the first one.
    if (reportType === 'QC' && qcTopics.length > 0 && !formData.mainCategory) {
      // Optional: Auto-select first main category if user hasn't selected any (commented out in original, but might be needed)
      // setFormData(prev => ({ ...prev, mainCategory: qcTopics[0].name }));
    }

    // 2. Main Logic: Ensure SubCategory is valid for the selected MainCategory
    if (reportType === 'QC' && formData.mainCategory && qcTopics.length > 0) {
      const selectedMainCat = qcTopics.find(m => m.name === formData.mainCategory);

      if (selectedMainCat) {
        // A. If Main Category has sub-categories
        if (selectedMainCat.subCategories.length > 0) {
          // Check if current subCategory is valid
          const isValidSub = formData.subCategory && selectedMainCat.subCategories.find(s => s.name === formData.subCategory);

          if (!isValidSub) {
            // If invalid or empty, default to the FIRST sub-category
            setDynamicFields({});
            setFormData(prev => ({ ...prev, subCategory: selectedMainCat.subCategories[0].name }));
          }
        } else {
          // B. If Main Category has NO sub-categories
          if (formData.subCategory !== '') {
            setFormData(prev => ({ ...prev, subCategory: '' }));
            setDynamicFields({});
          }
        }
      }
    } else if (reportType !== 'QC') {
      // Clear for non-QC types
      if (formData.mainCategory || formData.subCategory) {
        setFormData({ mainCategory: '', subCategory: '' });
        setDynamicFields({});
      }
    }
  }, [formData.mainCategory, formData.subCategory, qcTopics, reportType]);

  useEffect(() => {
    if (reportType === 'QC') {
      // QC: ต้องมี mainCategory และ subCategory
      if (formData.mainCategory && formData.subCategory) {
        // Auto-search แบบไม่กรอง dynamic fields (แสดงทั้งหมด)
        handleAutoSearch();
      }
    } else if (reportType === 'Daily') {
      // Daily: ต้องมี date
      if (selectedDate) {
        // ✅ [Fix] Close modals and clear previous photos on date change
        setShowDailyPreviewModal(false);
        setShowDailyGenerateModal(false);
        setDailyPhotos([]);
        setPreviewStatus(null);
        handleAutoSearch();
      }
    }
  }, [reportType, formData.mainCategory, formData.subCategory, selectedDate]);
  // --- 5. Data Fetching Functions ---

  // (5.1) โหลด "รายการรายงานที่เคยสร้าง" (List #2) -> Supports override
  const fetchGeneratedReports = useCallback(async (overrideParams?: any) => {
    setIsLoadingList(true);
    setListError(null);
    setGeneratedReport(null);

    const checkOverride = (key: string, fallback: any) => {
      if (overrideParams && key in overrideParams) return overrideParams[key];
      return fallback;
    };

    const currentMainCat = checkOverride('mainCategory', reportType === 'QC' ? formData.mainCategory : undefined);
    const currentSubCat = checkOverride('subCategory', reportType === 'QC' ? formData.subCategory : undefined);
    const currentDate = checkOverride('date', reportType === 'Daily' ? formatDateToYYYYMMDD(selectedDate) : undefined);
    const currentType = checkOverride('reportType', reportType);
    const currentDynamic = checkOverride('dynamicFields', (currentType === 'QC' ? dynamicFields : undefined));

    const filterCriteria = {
      reportType: currentType,
      mainCategory: currentMainCat,
      subCategory: currentSubCat,
      dynamicFields: currentDynamic,
      date: currentDate
    };

    const response = await api.getGeneratedReports(projectId, filterCriteria);

    if (response.success && response.data) {
      response.data.sort((a: GeneratedReportInfo, b: GeneratedReportInfo) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setGeneratedReportsList(response.data);
    } else {
      setListError(response.error || 'ไม่สามารถโหลดรายการรายงานได้');
      setGeneratedReportsList([]);
    }
    setIsLoadingList(false);
  }, [projectId, reportType, selectedDate, formData.mainCategory, formData.subCategory, dynamicFields]);

  // ✅ [ใหม่] Initial Load (Load ALL items)
  useEffect(() => {
    // Fetch all shared jobs (already doing it?) -> Yes, in its own useEffect?
    // Fetch all reports (Reset filters)
    // Pass undefined to clear params
    fetchGeneratedReports({ mainCategory: undefined, subCategory: undefined, dynamicFields: undefined });
  }, []);

  const handleAutoSearch = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    setGeneratedReport(null);

    const filterCriteria = {
      reportType,
      mainCategory: reportType === 'QC' ? formData.mainCategory : undefined,
      subCategory: reportType === 'QC' ? formData.subCategory : undefined,
      date: reportType === 'Daily' ? formatDateToYYYYMMDD(selectedDate) : undefined // ✅
    };

    const response = await api.getGeneratedReports(projectId, filterCriteria);

    if (response.success && response.data) {
      setGeneratedReportsList(response.data);
    } else {
      setListError(response.error || 'เกิดข้อผิดพลาดในการโหลดรายงาน');
      setGeneratedReportsList([]);
    }
    setIsLoadingList(false);
  }, [projectId, reportType, formData.mainCategory, formData.subCategory, selectedDate]);

  // ✅ [ใหม่] (5.X) โหลด "Active Feed" (รายการงานล่าสุด)
  const fetchFeed = useCallback(async () => {
    setIsLoadingFeed(true);
    const response = await api.getSharedJobs(projectId);
    if (response.success && response.data) {
      setSharedJobs(response.data);
      // if (response.data.length === 0) setIsFormVisible(true); 
    }
    setIsLoadingFeed(false);
  }, [projectId]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // ✅ [ใหม่] (5.2) โหลด "สถานะรูปภาพ" (Preview Box #1.5) -> Supports override
  const fetchPreviewStatus = useCallback(async (overrideParams?: any) => {
    setIsPreviewLoading(true);
    setPreviewStatus(null);
    setPreviewError(null);

    // ✅ [Fix] Explicitly clear old daily photos when fetching new status to prevent showing old data
    if (reportType === 'Daily') {
      setDailyPhotos([]);
      setSelectedPhotoIds(new Set());
    }

    const currentMainCat = overrideParams?.mainCategory ?? (reportType === 'QC' ? formData.mainCategory : undefined);
    const currentSubCat = overrideParams?.subCategory ?? (reportType === 'QC' ? formData.subCategory : undefined);
    const currentDate = overrideParams?.date ?? (reportType === 'Daily' ? formatDateToYYYYMMDD(selectedDate) : undefined);
    const currentType = overrideParams?.reportType ?? reportType;
    const currentDynamic = overrideParams?.dynamicFields ?? (currentType === 'QC' ? dynamicFields : undefined);

    const payload = {
      projectId,
      reportType: currentType,
      mainCategory: currentMainCat,
      subCategory: currentSubCat,
      dynamicFields: currentDynamic,
      date: currentDate
    };

    console.log('🔍 [fetchPreviewStatus] Payload:', payload); // DEBUG

    try {
      if (currentType === 'QC' && (!currentMainCat || !currentSubCat)) {
        console.warn('⚠️ [fetchPreviewStatus] Missing Main/Sub Category for QC report. Skipping API call.');
        setIsPreviewLoading(false); // ✅ Fix: Stop loading before returning
        return;
      }

      if (currentType === 'Daily') {
        const response = await api.getDailyPhotos(projectId, currentDate!);
        if (response.success && response.data) {
          setPreviewStatus({ found: response.data.length, total: response.data.length });
          setDailyPhotos(response.data);
        } else {
          setPreviewStatus({ found: 0, total: 0 });
          setDailyPhotos([]);
        }
      } else {
        const response = await api.getChecklistStatus(payload);
        if (response.success && response.data) {
          setPreviewStatus(response.data);
        } else {
          throw new Error(response.error || 'ไม่สามารถโหลดสถานะได้');
        }
      }
    } catch (error) {
      setPreviewError((error as Error).message);
    }
    setIsPreviewLoading(false);
  }, [projectId, reportType, selectedDate, formData.mainCategory, formData.subCategory, dynamicFields]);

  // --- 6. Event Handlers ---

  // ✅ [ใหม่] Handle Clicking Feed Item -> Direct Search
  const handleFeedItemClick = async (job: any) => {
    // 1. Update Form State (visual sync)
    // Note: We don't need to await state updates because we use overrideParams
    if (job.reportType === 'QC') {
      setReportType('QC');
      setFormData({ mainCategory: job.mainCategory, subCategory: job.subCategory });
    }

    // 2. Trigger Search Immediately with Job Data
    const overrideParams = {
      reportType: 'QC',
      mainCategory: job.mainCategory,
      subCategory: job.subCategory,
    };

    await fetchPreviewStatus(overrideParams);
    await fetchGeneratedReports(overrideParams);
  };

  // ✅ [ใหม่] (6.1) ปุ่ม "ค้นหา" (Manual)
  const handleSearch = async () => {
    if (reportType === 'Daily') {
      setIsPreviewLoading(true);
      setPreviewStatus(null);
      setPreviewError(null);

      const dateStr = formatDateToYYYYMMDD(selectedDate);
      if (!dateStr) {
        setIsPreviewLoading(false);
        return;
      }

      try {
        const response = await api.getDailyPhotos(projectId, dateStr);
        if (response.success && response.data) {
          setDailyPhotos(response.data);
          setPreviewStatus({ found: response.data.length, total: response.data.length });
          // Default all selected
          setSelectedPhotoIds(new Set(response.data.map((p: any) => p.id)));
          setShowDailyGenerateModal(true); // เปิด Modal สร้างรายงานที่มีครบทุกอย่าง
        } else {
          setPreviewError(response.error || 'ไม่สามารถดึงรูปภาพได้');
          setPreviewStatus({ found: 0, total: 0 });
        }
      } catch (err) {
        setPreviewError((err as Error).message);
      }
      setIsPreviewLoading(false);
      await fetchGeneratedReports(); // Update history list
    } else {
      // QC Search
      await fetchPreviewStatus();
      await fetchGeneratedReports();
    }
  };

  // (6.2) ปุ่ม "สร้างรายงาน" (เหมือนเดิม แต่ปรับรองรับ QC แบบเลือกรูป)
  const generateReport = async () => {
    if (isGenerating || !previewStatus || previewStatus.found === 0) {
      if (!previewStatus) {
        await showAlert('กรุณากด "ค้นหา" เพื่อตรวจสอบข้อมูลก่อนสร้าง', 'คำเตือน');
        return;
      }
      if (previewStatus.found === 0) {
        await showAlert('ไม่พบรูปภาพ จึงไม่สามารถสร้างรายงานได้', 'ไม่สามารถสร้างรายงานได้');
        return;
      }
      return;
    }

    if (reportType === 'Daily') {
      // ✅ [Fix] ปิด Modal Preview รูปภาพก่อน เพื่อไม่ให้ซ้อนทับกัน
      setShowDailyPreviewModal(false);

      // สำหรับ Daily ให้เปิด Modal เลือกรูป แทนที่จะสร้างเลย
      // ถ้ายังไม่ได้กดค้นหา (ไม่มี dailyPhotos ดึงข้อมูลใหม่ก่อน)
      if (dailyPhotos.length === 0) {
        setIsPreviewLoading(true);
        const dateStr = formatDateToYYYYMMDD(selectedDate);
        if (dateStr) {
          const response = await api.getDailyPhotos(projectId, dateStr);
          if (response.success && response.data) {
            setDailyPhotos(response.data);
            // ตั้งค่าเริ่มต้นให้เลือกทั้งหมด
            setSelectedPhotoIds(new Set(response.data.map(p => p.id)));
            setShowDailyGenerateModal(true);
          } else {
            await showAlert('ไม่พบรูปภาพ', 'ข้อผิดพลาด');
          }
        }
        setIsPreviewLoading(false);
      } else {
        // มีข้อมูลอยู่แล้ว (อาจจะมาจากการกด Search ก่อนหน้า) เปิด Modal เลย
        // ตั้งค่าเริ่มต้นให้เลือกทั้งหมด ในกรณีที่ไม่ได้กดเลือกค้างไว้
        if (selectedPhotoIds.size === 0) {
          setSelectedPhotoIds(new Set(dailyPhotos.map(p => p.id)));
        }
        setShowDailyGenerateModal(true);
      }
      return; // หยุดทำงาน ให้ผู้ใช้ไปกดยืนยันใน Modal
    }

    if (reportType === 'QC') {
      // สำหรับ QC (การสร้างรายงานแบบเดิม) เผื่อกรณีมีการเรียกติดมา
      const filterDataFromState = {
        reportType,
        mainCategory: formData.mainCategory,
        subCategory: formData.subCategory,
        dynamicFields: dynamicFields
      };

      await runGenerateReport(filterDataFromState);
      return;
    }
  };

  // ✅ [ใหม่] ฟังก์ชันสำหรับดาวน์โหลดรูปที่เลือกแบบ Zip (สำหรับ QC)
  const handleDownloadSelectedPhotos = async () => {
    if (selectedQcPhotoIds.size === 0) {
      await showAlert('กรุณาเลือกรูปภาพอย่างน้อย 1 รูป', 'แจ้งเตือน');
      return;
    }

    setIsDownloadingPhotos(true);
    let successCount = 0;

    try {
      const selectedPhotos = qcPhotos.filter(p => selectedQcPhotoIds.has(p.id));
      const zip = new JSZip();

      // Build a string from dynamicFields (e.g., "Zone-A_Floor-2")
      let dynamicFieldStr = '';
      if (dynamicFields && Object.keys(dynamicFields).length > 0) {
        dynamicFieldStr = '_' + Object.values(dynamicFields)
          .map(val => String(val).replace(/[\/\\]/g, '-'))
          .join('_');
      }

      const folderName = `${formData.mainCategory}_${formData.subCategory}${dynamicFieldStr}`.replace(/[\/\\]/g, '-');
      const imgFolder = zip.folder(folderName);

      if (!imgFolder) {
        throw new Error("Cannot create zip folder");
      }

      for (let i = 0; i < selectedPhotos.length; i++) {
        const photo = selectedPhotos[i];
        const displayUrl = cdnUrl && photo.firepath
          ? `${cdnUrl}/${photo.firepath.replace(/^\//, '')}`
          : photo.driveUrl || '';

        // Validate URL before loading
        if (!displayUrl || displayUrl === '') {
          console.warn(`Skipping photo ${photo.id} due to invalid URL.`);
          continue;
        }

        try {
          let finalUrl = displayUrl;
          if (finalUrl.startsWith('http')) {
            const resProxy = await api.proxyImage(finalUrl);
            if (resProxy.success && resProxy.data) {
              finalUrl = resProxy.data;
            }
          }

          const blob = await new Promise<Blob>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((b) => {
                  if (b) resolve(b);
                  else reject(new Error('Canvas toBlob failed'));
                }, 'image/jpeg', 0.9);
              } else {
                reject(new Error('Failed to get canvas context'));
              }
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${finalUrl}`));
            img.src = finalUrl;
          });

          const filePrefix = dynamicFieldStr ? dynamicFieldStr.substring(1) + '_' : '';
          const filename = `${filePrefix}${photo.topic}_${i + 1}.jpg`.replace(/[\/\\]/g, '-');
          imgFolder.file(filename, blob);
          successCount++;
        } catch (fetchErr) {
          console.warn(`Failed to fetch image for zip: ${displayUrl}`, fetchErr);
        }
      }

      if (successCount > 0) {
        // Generate the zip file and trigger download
        const content = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(content);

        const atag = document.createElement('a');
        atag.href = zipUrl;
        atag.download = `${folderName}_Photos.zip`;
        document.body.appendChild(atag);
        atag.click();
        document.body.removeChild(atag);
        setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);

        await showAlert(`สร้างไฟล์ Zip โปรเจ็กต์สำเร็จ! (รวม ${successCount} รูป)`, 'ดาวน์โหลดสำเร็จ');
      } else {
        await showAlert(`ระบบไม่สามารถดาวน์โหลดรูปภาพได้ (อาจจะติดปัญหาที่เบราว์เซอร์หรือเซิร์ฟเวอร์ปลายทาง)`, 'ดาวน์โหลดล้มเหลว');
      }
    } catch (err) {
      console.error('Download error:', err);
      await showAlert('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์รูปภาพแบบ Zip', 'ข้อผิดพลาด');
    } finally {
      setIsDownloadingPhotos(false);
      setShowQcDownloadModal(false);
    }
  };

  // ✅ [ใหม่] ฟังก์ชันสำหรับดาวน์โหลดรูปประจำวัน (Daily) แบบ Zip
  const handleDownloadDailyPhotos = async () => {
    if (selectedPhotoIds.size === 0) {
      await showAlert('กรุณาเลือกรูปภาพอย่างน้อย 1 รูป', 'แจ้งเตือน');
      return;
    }

    setIsDownloadingPhotos(true);
    let successCount = 0;

    try {
      const selected = dailyPhotos.filter(p => selectedPhotoIds.has(p.id));
      const zip = new JSZip();

      // For daily, use the date as the folder name
      const dateStr = selectedDate ? formatDateToYYYYMMDD(selectedDate) : 'Unknown_Date';
      const folderName = `Daily_Report_${dateStr}`;
      const imgFolder = zip.folder(folderName);

      if (!imgFolder) {
        throw new Error("Cannot create zip folder");
      }

      for (let i = 0; i < selected.length; i++) {
        const photo = selected[i];
        const displayUrl = cdnUrl && photo.firepath
          ? `${cdnUrl}/${photo.firepath.replace(/^\//, '')}`
          : photo.driveUrl || '';

        // Validate URL before loading
        if (!displayUrl || displayUrl === '') {
          console.warn(`Skipping photo ${photo.id} due to invalid URL.`);
          continue;
        }

        try {
          let finalUrl = displayUrl;
          if (finalUrl.startsWith('http')) {
            const resProxy = await api.proxyImage(finalUrl);
            if (resProxy.success && resProxy.data) {
              finalUrl = resProxy.data;
            }
          }

          const blob = await new Promise<Blob>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((b) => {
                  if (b) resolve(b);
                  else reject(new Error('Canvas toBlob failed'));
                }, 'image/jpeg', 0.9);
              } else {
                reject(new Error('Failed to get canvas context'));
              }
            };
            img.src = finalUrl;
          });

          // Daily photos primarily use 'description', whereas QC uses 'topic'
          const topicName = photo.description || photo.topic || 'Photo';
          const filename = `${topicName}_${i + 1}.jpg`.replace(/[\/\\]/g, '-');
          imgFolder.file(filename, blob);
          successCount++;
        } catch (fetchErr) {
          console.warn(`Failed to fetch image for zip: ${displayUrl}`, fetchErr);
        }
      }

      if (successCount > 0) {
        // Generate the zip file and trigger download
        const content = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(content);

        const atag = document.createElement('a');
        atag.href = zipUrl;
        atag.download = `${folderName}_Photos.zip`;
        document.body.appendChild(atag);
        atag.click();
        document.body.removeChild(atag);
        setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);

        await showAlert(`ดาวน์โหลดสำเร็จ! (รวม ${successCount} รูป)`, 'สำเร็จ');
      } else {
        await showAlert(`ระบบไม่สามารถดาวน์โหลดรูปภาพได้ (อาจจะติดปัญหาที่เบราว์เซอร์หรือเซิร์ฟเวอร์ปลายทาง)`, 'ดาวน์โหลดล้มเหลว');
      }
    } catch (err) {
      console.error('Download error:', err);
      await showAlert('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์รูปภาพแบบ Zip', 'ข้อผิดพลาด');
    } finally {
      setIsDownloadingPhotos(false);
      setShowDailyGenerateModal(false);
    }
  };

  // (Helper Functions ที่เหลือเหมือนเดิม)
  /* 
   * [MODIFIED] Handle field changes and auto-populate dependent fields
   * Example: Select "Room 1" -> Auto select "ECN-..." for "Code note"
   */
  /* 
   * [MODIFIED] Handle field changes and auto-populate dependent fields
   * Example: Select "Room 1" -> Auto select "ECN-..." for "Code note"
   */
  const handleDynamicFieldChange = useCallback((fieldName: string, value: string) => {
    // ✅ [Fix] Force Uppercase AND Trim to match Backend exactly
    // Note: We trim here to ensure state consistency, but user might want to type space? 
    // Actually, for Room/Floor, space at the end is usually an error.
    const upperValue = value ? value.toUpperCase().trim() : '';

    setDynamicFields(prev => {
      const newFields = { ...prev, [fieldName]: upperValue };

      // 1. Find current SubCategory config
      // [FIX] Use qcTopics directly to avoid "used before declaration" error
      const selectedMain = qcTopics.find(m => m.name === formData.mainCategory);
      const currentSubCats = selectedMain ? selectedMain.subCategories : [];
      const subCat = currentSubCats.find(s => s.name === formData.subCategory);

      // DEBUG: Check if we have dependencies
      // console.log('Handling change:', fieldName, upperValue);
      // console.log('Current SubCat:', subCat);

      // 2. Check for dependencies
      if (subCat && subCat.fieldDependencies) {
        const dependency = subCat.fieldDependencies[fieldName];
        // console.log('Found dependency:', dependency);

        if (dependency) {
          const targetValue = dependency.mapping[upperValue];
          // console.log('Target Value:', targetValue);

          if (targetValue) {
            newFields[dependency.targetField] = targetValue;
          } else if (upperValue === '' || upperValue === null) {
            newFields[dependency.targetField] = '';
          }
        }
      }
      return newFields;
    });
  }, [formData.mainCategory, formData.subCategory, qcTopics]);
  const isFieldsComplete = () => {
    if (reportType === 'QC') {
      return !!formData.mainCategory && !!formData.subCategory;
    }
    if (reportType === 'Daily') {
      return !!selectedDate;
    }
    return false;
  };
  const runGenerateReport = async (filterData: {
    reportType: 'QC' | 'Daily';
    mainCategory?: string;
    subCategory?: string;
    dynamicFields?: Record<string, string>;
    date?: string;
    selectedPhotoIds?: string[]; // ✅ รับค่ารูปที่ถูกเลือก
  }) => {
    setIsGenerating(true);
    setGeneratedReport(null);
    setListError(null);

    try {
      // ✅ แก้ไข: รวม projectId เข้าไปใน object
      // ✅ [Fix] ส่ง selectedPhotoIds ที่เหมาะสมกับประเภทรายงานไปให้ Backend
      const finalSelectedPhotos = filterData.reportType === 'QC'
        ? (selectedQcPhotoIds.size > 0 ? Array.from(selectedQcPhotoIds) : undefined)
        : filterData.selectedPhotoIds;

      const response = await api.generateReport({
        projectId,      // ← เพิ่มบรรทัดนี้
        projectName,    // ← เพิ่มบรรทัดนี้ (optional)
        ...filterData,
        selectedPhotoIds: finalSelectedPhotos // แทนที่ค่า selectedPhotoIds เดิม
      });

      if (response.success && response.data) {
        setGeneratedReport(response.data);
        await showAlert('สร้างรายงานสำเร็จ! 🎉', 'สำเร็จ');

        // ✅ แสดง loading ขณะ refetch
        setIsPreviewLoading(true);
        setIsLoadingList(true);

        await Promise.all([
          fetchPreviewStatus(),
          fetchGeneratedReports()
        ]);

      } else {
        throw new Error(response.error || 'ไม่สามารถสร้างรายงานได้');
      }
    } catch (error) {
      await showAlert('เกิดข้อผิดพลาด: ' + (error as Error).message, 'เกิดข้อผิดพลาด');
    } finally {
      setIsGenerating(false);
    }
  };
  const mainCategories: MainCategory[] = qcTopics;
  const selectedMainCat = mainCategories.find(m => m.name === formData.mainCategory);
  // ✅ [Safe Check] Ensure subCategories is always an array
  const subCategories: SubCategory[] = (selectedMainCat && Array.isArray(selectedMainCat.subCategories)) ? selectedMainCat.subCategories : [];

  // ✅ [แก้ไข] ลบ Type Annotation ออก เพื่อให้ TS Infer เองจากการเปลี่ยนแปลงใน api.ts
  const requiredDynamicFields = subCategories.find(s => s.name === formData.subCategory)?.dynamicFields || [];

  const handleRegenerateReport = async (report: GeneratedReportInfo) => {
    // ✅ แก้ไข: รวม projectId เข้าไปด้วย
    const filterDataFromReport = {
      projectId,      // ← เพิ่มบรรทัดนี้
      projectName,    // ← เพิ่มบรรทัดนี้
      reportType: report.reportType,
      mainCategory: report.mainCategory,
      subCategory: report.subCategory,
      dynamicFields: report.dynamicFields,
      date: report.reportDate
    };
    await runGenerateReport(filterDataFromReport);
  };
  // ... (skip lines)
  // ... (inside return)


  useEffect(() => {
    const fetchFieldSuggestions = async () => {
      const selectedSubCat = subCategories.find(s => s.name === formData.subCategory);

      if (selectedSubCat?.id) {
        console.log('🔍 [Reports] Fetching suggestions for:', selectedSubCat.id);

        const response = await api.getDynamicFieldValues(projectId, selectedSubCat.id);

        console.log('📦 [Reports] Response:', response);

        if (response.success && response.data) {
          console.log('✅ [Reports] Setting suggestions:', response.data);
          setFieldSuggestions(response.data);
        } else {
          console.warn('⚠️ [Reports] Failed to load suggestions');
          setFieldSuggestions({});
        }
      } else {
        setFieldSuggestions({});
      }
    };

    if (reportType === 'QC' && formData.subCategory) {
      fetchFieldSuggestions();
    }
  }, [projectId, reportType, formData.subCategory, subCategories]);

  // (renderReportItem เหมือนเดิม)
  const renderReportItem = (report: GeneratedReportInfo) => {
    const createdAtDate = new Date(report.createdAt);
    const formattedDate = createdAtDate.toLocaleDateString('th-TH', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }) + ' น.';

    const pdfUrl = cdnUrl && report.firepath
      ? `${cdnUrl}/${report.firepath.replace(/^\//, '')}`
      : `${report.publicUrl}?v=${new Date(report.createdAt).getTime()}`;

    return (
      <div key={report.reportId} className={styles.reportListItem}>
        <div className={styles.reportInfo}>
          <span className={styles.reportFilename} title={report.filename}>
            <FiFileText style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            {report.filename}
          </span>
          <span className={styles.reportDate}> สร้างเมื่อ: {formattedDate} </span>
          <span className={styles.reportPhotoCount}>
            (มี {report.photosFound} รูป {report.reportType === 'QC' && report.totalTopics ? ` / ${report.totalTopics} หัวข้อ` : ''})
          </span>
        </div>
        <div className={styles.reportActions}>
          {/* Smart Action Buttons */}
          {report.hasNewPhotos ? (
            // A. กรณีมีรูปเพิ่ม: ปุ่มสีส้ม "อัปเดตรายงาน"
            <button
              onClick={() => handleRegenerateReport(report)}
              className={styles.reportButtonUpdate}
              title="มีรูปภาพใหม่! กดเพื่ออัปเดตรายงาน"
              disabled={isGenerating}
            >
              {isGenerating ? <FiLoader className={styles.iconSpin} /> : <FiRefreshCw />} อัปเดตรายงาน
            </button>
          ) : (
            // B. กรณีไม่มีรูปเพิ่ม: ปุ่มสีเขียว "ดู PDF" (เปิดลิงก์เดิม)
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.reportButtonViewGreen}
              title="ดู PDF เดิม (ไม่มีข้อมูลใหม่)"
            >
              <FiFileText /> ดู PDF
            </a>
          )}

          {/* ปุ่ม Download (สีปกติ) */}
          <a href={pdfUrl} download={report.filename} className={styles.reportButtonDownload} title="ดาวน์โหลด PDF" >
            <FiDownload />
          </a>
        </div>
      </div>
    );
  };

  // ✅ [ใหม่] 7. Render Function สำหรับ "ผลการค้นหา" (Preview Box)
  const renderPreviewBox = () => {
    if (isPreviewLoading) {
      return (
        <div className={styles.previewBox}>
          <p className={styles.loadingText} style={{ margin: 0 }}>
            <FiLoader className={styles.iconSpin} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            กำลังค้นหาข้อมูลรูปภาพ...
          </p>
        </div>
      );
    }

    if (previewError) {
      return (
        <div className={styles.previewBox}>
          <p className={styles.errorText} style={{ margin: 0 }}>
            <FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            {previewError}
          </p>
        </div>
      );
    }

    if (!previewStatus) {
      // (ยังไม่เริ่มค้นหา)
      return null;
    }

    // (ค้นหาเสร็จแล้ว)
    const { found, total } = previewStatus;

    if (found === 0) {
      return (
        <div className={styles.previewBox}>
          <p className={styles.previewWarningText}>
            <FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            ไม่พบรูปภาพสำหรับเงื่อนไขนี้
          </p>
        </div>
      );
    }

    return (
      <div className={styles.previewBox}>
        <p className={styles.previewStatusText}>
          <FiCheckCircle style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          {reportType === 'QC' ?
            `พบรูปภาพแล้ว ${found} / ${total} หัวข้อ` :
            `พบรูปภาพแล้ว ${found} รูป`
          }
        </p>
      </div>
    );
  };


  // ✅ [ใหม่] ฟังก์ชันดาวน์โหลดรูปพร้อมลายน้ำ และ Modal สำหรับเปิดดูรูป
  const handleDownloadWithWatermark = async () => {
    if (!previewData) return;
    let imageSrc = previewData.url;

    if (imageSrc.startsWith('http')) {
      try {
        const res = await api.proxyImage(imageSrc);
        if (res.success && res.data) {
          imageSrc = res.data;
        } else {
          throw new Error(res.error || 'Proxy failed');
        }
      } catch (e) {
        console.error("Proxy error:", e);
        await showAlert('ไม่สามารถดาวน์โหลดรูปได้ (CORS Error)', 'เกิดข้อผิดพลาด');
        return;
      }
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = imageSrc;

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);

      if (previewData.addWatermark && (previewData.timestamp || previewData.location)) {
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

        if (previewData.timestamp) {
          const formattedTimestamp = new Date(previewData.timestamp).toLocaleString('th-TH');
          ctx.fillText(formattedTimestamp, canvas.width - padding, currentY);
          currentY -= lineHeight;
        }

        if (previewData.location) {
          const locationLines = previewData.location.split('\\n');
          [...locationLines].reverse().forEach(line => {
            if (line) {
              ctx.fillText(line.trim(), canvas.width - padding, currentY);
              currentY -= lineHeight;
            }
          });
        }
      }

      const link = document.createElement('a');
      link.download = `photo_${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    };
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const imgElement = e.currentTarget;
    const naturalWidth = imgElement.naturalWidth;
    let calcFont = 24;

    if (naturalWidth > 0 && imgElement.clientWidth > 0) {
      const scaleFactor = imgElement.clientWidth / naturalWidth;
      const originalFontSize = Math.max(24, Math.floor(naturalWidth * 0.03));
      calcFont = originalFontSize * scaleFactor;
    }
    setWatermarkFontSize(Math.max(12, calcFont));
  };


  // ========== Main Render ==========
  return (
    <div className={styles.reportsContainer}>
      {/* <h1><FiBarChart2 style={{ verticalAlign: 'middle', marginRight: '8px' }} /> สร้างรายงาน</h1> */}


      {/* 2. Manual Creation Form (Always Visible) */}
      <div className={styles.formBox} style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 className={styles.formBoxTitle} style={{ marginBottom: 0 }}>ตัวกรอง / สร้างรายงาน</h3>
          {/* ✅ [New] Reset Filter Button */}
          <button
            onClick={() => {
              setFormData({ mainCategory: '', subCategory: '' });
              setDynamicFields({});
              setSearchTerm('');
              setReportType('QC');
              // Expand all sections
              setExpandedMain(new Set());
              setExpandedSub(new Set());
            }}
            className={styles.resetButton}
            title="ล้างตัวกรองทั้งหมด"
            style={{
              background: 'transparent',
              border: '1px solid #ddd',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              color: '#666',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <FiRefreshCw /> ล้างตัวกรอง
          </button>
        </div>
        <div className={styles.reportTypeToggle}>
          {/* ... Toggle Buttons ... */}
          <button onClick={() => { setReportType('QC'); setGeneratedReport(null); setPreviewStatus(null); }} className={`${styles.reportTypeButton} ${reportType === 'QC' ? styles.activeQc : ''}`} >
            <FiClipboard style={{ verticalAlign: 'middle', marginRight: '4px' }} /> รายงาน QC
          </button>
          <button onClick={() => { setReportType('Daily'); setGeneratedReport(null); setPreviewStatus(null); }} className={`${styles.reportTypeButton} ${reportType === 'Daily' ? styles.activeDaily : ''}`} >
            <FiSun style={{ verticalAlign: 'middle', marginRight: '4px' }} /> รายงานประจำวัน
          </button>
        </div>

        {reportType === 'QC' && (
          <div>
            <div className={styles.gridContainer}>
              {/* Main Category */}
              <div>
                <label className={styles.label}>หมวดงานหลัก:</label>
                <select value={formData.mainCategory} onChange={(e) => setFormData(prev => ({ subCategory: '', mainCategory: e.target.value }))} className={styles.formInput} disabled={mainCategories.length === 0} >
                  <option value="">-- เลือกหมวดงานหลัก --</option>
                  {mainCategories.length === 0 && <option>-- กำลังโหลด... --</option>}
                  {mainCategories.map(category => (<option key={category.id} value={category.name}>{category.name}</option>))}
                </select>
              </div>
              {/* Sub Category */}
              <div>
                <label className={styles.label}>หมวดงานย่อย:</label>
                <select value={formData.subCategory} onChange={(e) => { setDynamicFields({}); setFormData(prev => ({ ...prev, subCategory: e.target.value })); }} className={styles.formInput} disabled={!formData.mainCategory || subCategories.length === 0} >
                  {!formData.mainCategory ? <option>-- กรุณาเลือกหมวดหลักก่อน --</option> :
                    subCategories.length === 0 ? <option>-- ไม่พบหมวดงานย่อย (0 Items) --</option> :
                      subCategories.map(subcategory => (<option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>))}
                </select>
              </div>
            </div>
            {/* Dynamic Fields */}
            {requiredDynamicFields.length > 0 && (
              <div className={styles.formGroup}>
                <h4 className={styles.subheading}>ข้อมูลเพิ่มเติม:</h4>
                <div className={styles.smallGridContainer}>
                  {requiredDynamicFields.map((fieldConfig: any) => { // Fixed type any for simplicity or keep original
                    const fieldLabel = typeof fieldConfig === 'string' ? fieldConfig : fieldConfig.label;
                    const staticOptions = (typeof fieldConfig === 'object' && fieldConfig.options) ? fieldConfig.options : [];
                    const suggestions = [
                      ...staticOptions,
                      ...(fieldSuggestions[fieldLabel] || [])
                    ];
                    const uniqueSuggestions = Array.from(new Set(suggestions));

                    return (
                      <div key={fieldLabel}>
                        <label className={styles.smallLabel}>{fieldLabel}:</label>
                        <AutocompleteInput
                          value={dynamicFields[fieldLabel] || ''}
                          onChange={(value) => handleDynamicFieldChange(fieldLabel, value)}
                          suggestions={uniqueSuggestions}
                          placeholder={`ระบุ${fieldLabel}...`}
                          className={styles.formInput}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div >
        )}
        {reportType === 'Daily' && (
          <div className={styles.formGroup}>
            <label className={styles.label}>เลือกวันที่:</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <DatePicker selected={selectedDate} onChange={(date: Date | null) => setSelectedDate(date)} dateFormat="dd/MM/yyyy" className="daily-datepicker" />
            </div>

            {/* --- Buttons (Search & Generate) --- */}
            <div className={styles.buttonContainer} style={{ marginTop: '15px' }}>
              <button
                onClick={handleSearch}
                className={styles.generateButton}
                style={{ width: '100%', maxWidth: '300px', backgroundColor: '#007bff' }}
                disabled={isGenerating || isLoadingList || isPreviewLoading}
              >
                {isPreviewLoading ? <FiLoader className={styles.iconSpin} style={{ marginRight: '8px' }} /> : <FiSearch style={{ marginRight: '8px' }} />}
                ตรวจสอบรูปภาพและสร้างรายงาน
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Unified List (Accordion) - Always Visible below Form for QC */}
      {reportType === 'QC' && (sharedJobs.length > 0 || generatedReportsList.length > 0) && (
        <div className={styles.activeFeedBox}>
          <h3 className={styles.activeFeedTitle}>
            <FiActivity style={{ marginRight: '8px', color: '#ffc107' }} />
            รายการงานทั้งหมด
          </h3>

          {(() => {
            // --- UNIFIED LIST & ACCORDION LOGIC ---
            interface UnifiedItem {
              key: string;
              mainCategory: string;
              subCategory: string;
              dynamicFields: Record<string, string>;
              job?: SharedJob;
              report?: GeneratedReportInfo;
            }
            const unifiedMap = new Map<string, UnifiedItem>();

            // A. History
            generatedReportsList.filter(r => r.reportType === 'QC').forEach(report => {
              const key = `${report.mainCategory}_${report.subCategory}_${JSON.stringify(report.dynamicFields || {})}`;
              if (!unifiedMap.has(key)) {
                unifiedMap.set(key, {
                  key,
                  mainCategory: report.mainCategory || '',
                  subCategory: report.subCategory || '',
                  dynamicFields: report.dynamicFields || {},
                  report
                });
              } else {
                const existing = unifiedMap.get(key)!;
                if (!existing.report || new Date(report.createdAt) > new Date(existing.report.createdAt)) {
                  existing.report = report;
                }
              }
            });

            // B. Active Jobs
            sharedJobs.filter(j => (j.status === 'pending' || j.status === 'completed') && j.reportType === 'QC').forEach(job => {
              const key = `${job.mainCategory}_${job.subCategory}_${JSON.stringify(job.dynamicFields || {})}`;
              if (unifiedMap.has(key)) {
                unifiedMap.get(key)!.job = job;
              } else {
                unifiedMap.set(key, {
                  key,
                  mainCategory: job.mainCategory,
                  subCategory: job.subCategory,
                  dynamicFields: job.dynamicFields || {},
                  job
                });
              }
            });

            // 2. Filter & Group
            const groupedByMain: Record<string, Record<string, UnifiedItem[]>> = {};
            let hasMatches = false;
            const term = searchTerm.toLowerCase().trim();
            const filterMain = reportType === 'QC' ? formData.mainCategory : '';
            const filterSub = reportType === 'QC' ? formData.subCategory : '';

            Array.from(unifiedMap.values()).forEach(item => {
              // A. Text Search Filter
              const matchesTerm = !term || (
                item.mainCategory.toLowerCase().includes(term) ||
                item.subCategory.toLowerCase().includes(term) ||
                Object.values(item.dynamicFields).some(v => String(v).toLowerCase().includes(term))
              );

              // B. Dropdown Filter (Main & Sub)
              const matchesMain = !filterMain || item.mainCategory === filterMain;
              const matchesSub = !filterSub || item.subCategory === filterSub;

              // C. Dynamic Fields Filter (from Form)
              let matchesDynamic = true;
              if (reportType === 'QC' && Object.keys(dynamicFields).length > 0) {
                matchesDynamic = Object.entries(dynamicFields).every(([key, value]) => {
                  if (!value) return true; // Skip empty fields
                  const itemValue = item.dynamicFields[key];
                  // Partial match (case-insensitive)
                  return itemValue && String(itemValue).toLowerCase().includes(String(value).toLowerCase());
                });
              }

              if (matchesTerm && matchesMain && matchesSub && matchesDynamic) {
                if (!groupedByMain[item.mainCategory]) groupedByMain[item.mainCategory] = {};
                if (!groupedByMain[item.mainCategory][item.subCategory]) groupedByMain[item.mainCategory][item.subCategory] = [];
                groupedByMain[item.mainCategory][item.subCategory].push(item);
                hasMatches = true;
              }
            });

            if (!hasMatches) {
              return (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                  <FiInbox style={{ fontSize: '3rem', marginBottom: '10px' }} />
                  <p>ไม่พบรายการที่ค้นหา</p>
                </div>
              );
            }

            return (
              <div>
                {Object.entries(groupedByMain).sort().map(([mainCatName, subCats]) => {
                  const isMainMatches = term && mainCatName.toLowerCase().includes(term);
                  // ✅ Auto-expand if Search Term OR Filter Dropdown is active
                  const forceExpand = !!term || (!!filterMain && mainCatName === filterMain);
                  const isMainExpanded = forceExpand || expandedMain.has(mainCatName);
                  const totalItemsInMain = Object.values(subCats).reduce((acc, curr) => acc + curr.length, 0);

                  return (
                    <div key={mainCatName} className={styles.mainCategoryGroup}>
                      {/* Main Header */}
                      <div
                        className={styles.accordionHeader}
                        onClick={() => !forceExpand && toggleMain(mainCatName)}
                        style={forceExpand ? { cursor: 'default', background: 'transparent', paddingLeft: 0 } : {}}
                      >
                        <div className={styles.accordionTitle}>
                          {!forceExpand && (isMainExpanded ? <FiChevronDown className={styles.accordionIcon + ' ' + (isMainExpanded ? 'expanded' : '')} /> : <FiChevronRight className={styles.accordionIcon} />)}
                          {mainCatName}
                        </div>
                        <div className={styles.accordionCount}>{totalItemsInMain} รายการ</div>
                      </div>

                      {/* Main Content */}
                      {isMainExpanded && (
                        <div className={isMainExpanded && !term ? styles.accordionContent : ''}>
                          {Object.entries(subCats).sort().map(([subCatName, items]) => {
                            const subKey = `${mainCatName}_${subCatName}`;
                            const isSubExpanded = forceExpand || expandedSub.has(subKey);

                            return (
                              <div key={subCatName} className={styles.subCategoryGroup}>
                                <div
                                  className={styles.subAccordionHeader}
                                  onClick={() => !term && toggleSub(subKey)}
                                  style={term ? { cursor: 'default', background: 'transparent', border: 'none', paddingLeft: 0 } : {}}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: '#555' }}>
                                    {!term && (isSubExpanded ? <FiChevronDown /> : <FiChevronRight />)}
                                    {subCatName}
                                  </div>
                                  <div style={{ fontSize: '0.8rem', color: '#888' }}>{items.length} รายการ</div>
                                </div>

                                {isSubExpanded && (
                                  <div className={isSubExpanded && !term ? styles.accordionContent : ''}>
                                    <div className={styles.jobCardsGrid}>
                                      {items.map(item => {
                                        const hasReport = !!item.report;
                                        const hasJob = !!item.job;
                                        // ✅ [ใหม่] ดึงจำนวนรูปใหม่ (ถ้ามี)
                                        const newPhotosCount = item.report?.newPhotosCount || 0;
                                        // [DEBUG]
                                        if (item.report) {
                                          console.log(`[Reports] Item: ${item.subCategory} - ReportID: ${item.report.reportId} - NewPhotos: ${newPhotosCount}`);
                                        }

                                        const isJustGenerated = generatedReport &&
                                          generatedReport.mainCategory === item.mainCategory &&
                                          generatedReport.subCategory === item.subCategory &&
                                          JSON.stringify(generatedReport.dynamicFields) === JSON.stringify(item.dynamicFields);

                                        let statusLabel = '';
                                        let progressColor = '#ccc';
                                        if (hasJob) {
                                          statusLabel = `ถ่ายแล้ว ${item.job!.completedTopics} / ${item.job!.totalTopics}`;
                                          progressColor = item.job!.status === 'completed' ? '#28a745' : '#007bff';
                                        } else if (hasReport) {
                                          statusLabel = `(เสร็จสิ้น) มีรายงานแล้ว`;
                                          progressColor = '#28a745';
                                        }

                                        return (
                                          <div key={item.key} className={styles.jobCard} onClick={() => handleFeedItemClick(item.job || item.report)} style={newPhotosCount > 0 ? { border: '2px solid #ffc107' } : {}}>
                                            <div className={styles.jobCardContent}>
                                              <div className={styles.jobCardIcon}><FiFileText /></div>
                                              <div className={styles.jobCardDetails}>
                                                <strong>{Object.entries(item.dynamicFields).map(([k, v]) => `${k}: ${v}`).join(' / ')}</strong>
                                                <span style={{ color: progressColor, fontWeight: 'bold' }}>{statusLabel}</span>
                                                {/* ✅ [ใหม่] แสดงแจ้งเตือนรูปใหม่ (Red Badge Style) */}
                                                {newPhotosCount > 0 && (
                                                  <div style={{
                                                    position: 'absolute',
                                                    top: '-10px',
                                                    right: '-10px',
                                                    backgroundColor: '#dc3545',
                                                    color: 'white',
                                                    padding: '4px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 'bold',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                                    zIndex: 10,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                  }}>
                                                    <FiAlertTriangle />
                                                    มี {newPhotosCount} รูปใหม่
                                                  </div>
                                                )}
                                                {hasReport && <span style={{ fontSize: '0.75rem', color: '#999' }}><FiClock style={{ marginRight: '3px' }} /> ล่าสุด: {new Date(item.report!.createdAt).toLocaleDateString('th-TH')} {new Date(item.report!.createdAt).toLocaleTimeString('th-TH')}</span>}
                                              </div>
                                            </div>
                                            <div className={styles.jobCardActions} style={{ flexWrap: 'wrap', gap: '5px' }}>
                                              {(hasReport || isJustGenerated) && (
                                                <a href={item.report?.publicUrl} target="_blank" rel="noopener noreferrer" className={styles.miniSuccessButton} style={{ flex: '1 1 30%', minWidth: '80px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}><FiCheckCircle /> ดู PDF</a>
                                              )}

                                              <button className={styles.miniSecondaryButton} style={{ flex: '1 1 30%', minWidth: '100px', backgroundColor: '#6c757d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={async (e) => {
                                                e.stopPropagation();
                                                // ดึงข้อมูลรูปเพื่อเปิด Modal ดาวน์โหลด
                                                setIsPreviewLoading(true);
                                                try {
                                                  const payloadParams = {
                                                    reportType: 'QC',
                                                    mainCategory: item.mainCategory,
                                                    subCategory: item.subCategory,
                                                    dynamicFields: item.dynamicFields
                                                  };

                                                  // Sync form state (visual feedback)
                                                  setReportType('QC');
                                                  setFormData({ mainCategory: item.mainCategory, subCategory: item.subCategory });
                                                  setDynamicFields(item.dynamicFields);

                                                  const response = await api.getQcPhotosPreview(projectId, item.mainCategory, item.subCategory, item.dynamicFields || {});
                                                  if (response.success && response.data) {
                                                    setQcPhotos(response.data);
                                                    setSelectedQcPhotoIds(new Set(response.data.map(p => p.id)));
                                                    if (response.data.length > 0) {
                                                      setShowQcDownloadModal(true);
                                                    } else {
                                                      await showAlert('ไม่พบรูปภาพ QC ในหมวดหมู่นี้', 'ไม่พบรูปภาพ');
                                                    }
                                                  } else {
                                                    await showAlert('ไม่สามารถดึงรูปภาพ QC ได้', 'เกิดข้อผิดพลาด');
                                                  }
                                                } catch (err) {
                                                  console.error(err);
                                                  await showAlert('เกิดข้อผิดพลาด', 'ข้อผิดพลาด');
                                                } finally {
                                                  setIsPreviewLoading(false);
                                                }
                                              }} disabled={isPreviewLoading}>
                                                {isPreviewLoading && formData.mainCategory === item.mainCategory && formData.subCategory === item.subCategory ? <FiLoader className={styles.iconSpin} /> : <FiDownloadCloud />} ดาวน์โหลดรูป
                                              </button>

                                              <button className={styles.miniGenerateButton} style={{ flex: '1 1 30%', minWidth: '130px', backgroundColor: newPhotosCount > 0 ? '#ffc107' : (hasReport ? '#17a2b8' : '#007bff'), color: newPhotosCount > 0 ? '#000' : '#fff' }} onClick={async (e) => {
                                                e.stopPropagation();
                                                console.log('🔘 Button Clicked! Item:', item); // DEBUG
                                                const payload = {
                                                  reportType: 'QC' as const,
                                                  mainCategory: item.mainCategory,
                                                  subCategory: item.subCategory,
                                                  dynamicFields: item.dynamicFields
                                                };
                                                console.log('📦 Prepared Payload:', payload); // DEBUG

                                                if (!payload.mainCategory || !payload.subCategory) {
                                                  await showAlert(`Error: Missing Category Data! (Main: ${payload.mainCategory}, Sub: ${payload.subCategory})`, 'เกิดข้อผิดพลาด');
                                                  return;
                                                }

                                                setReportType('QC'); setFormData({ mainCategory: item.mainCategory, subCategory: item.subCategory }); setDynamicFields(item.dynamicFields);
                                                (async () => {
                                                  try {
                                                    const statusRes = await api.getChecklistStatus({ projectId, ...payload });
                                                    if (statusRes.success && statusRes.data && statusRes.data.found > 0) {
                                                      setPreviewStatus(statusRes.data); await runGenerateReport(payload);
                                                    } else { await showAlert('ไม่พบรูปภาพในระบบ', 'ไม่พบรูปภาพ'); }
                                                  } catch (err) { await showAlert(String(err), 'เกิดข้อผิดพลาด'); }
                                                })();
                                              }} disabled={isGenerating}>
                                                {isGenerating && formData.mainCategory === item.mainCategory && formData.subCategory === item.subCategory && JSON.stringify(dynamicFields) === JSON.stringify(item.dynamicFields) ? <FiLoader className={styles.iconSpin} /> : (newPhotosCount > 0 ? <FiAlertTriangle /> : (hasReport ? <FiRefreshCw /> : <FiActivity />))}
                                                {hasReport ? (newPhotosCount > 0 ? ` อัปเดต (${newPhotosCount} รูปใหม่)` : ' อัปเดตข้อมูล') : ' สร้าง PDF'}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )
                                }
                              </div>
                            );
                          })}
                        </div>
                      )
                      }
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )
      }

      {/* --- Daily Reports List --- */}
      {reportType === 'Daily' && (
        <div className={styles.generatedReportsBox}>
          <h3 className={styles.generatedReportsTitle}>
            <FiClock style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            ประวัติรายงานประจำวัน
          </h3>

          {isLoadingList ? (
            <p className={styles.loadingText}><FiLoader className={styles.iconSpin} /> กำลังโหลดรายงาน...</p>
          ) : listError ? (
            <p className={styles.errorText}><FiAlertTriangle /> {listError}</p>
          ) : generatedReportsList.filter(r => r.reportType === 'Daily').length === 0 ? (
            <p className={styles.noReportsText}><FiInbox /> ไม่พบประวัติรายงานประจำวัน</p>
          ) : (
            <div className={styles.reportListContainer}>
              {generatedReportsList.filter(r => r.reportType === 'Daily').map(renderReportItem)}
            </div>
          )}
        </div>
      )}

      {renderPreviewBox()}

      {/* --- Generated Result Box (เหมือนเดิม) --- */}
      {
        generatedReport && !isGenerating && (
          <div className={styles.generatedBox}>
            <h3 className={styles.generatedTitle}><FiCheckCircle style={{ verticalAlign: 'middle', marginRight: '8px' }} /> สร้างรายงานใหม่สำเร็จ!</h3>
            <div className={styles.generatedInfo}>
              <p><strong>ไฟล์:</strong> {generatedReport.filename}</p>
              {reportType === 'QC' ? (
                <>
                  <p><strong>หมวดงาน:</strong> {formData.mainCategory} &gt; {formData.subCategory}</p>
                  <p><strong>รูปภาพที่ใส่:</strong> {generatedReport.photosFound}/{generatedReport.totalTopics}</p>
                </>
              ) : (
                <>
                  <p><strong>วันที่:</strong> {selectedDate ? selectedDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</p>
                  <p><strong>รูปภาพที่ใส่:</strong> {generatedReport.photosFound}</p>
                </>
              )}
            </div>
            <div className={styles.generatedActions}>

              {/* ✨ [แก้ไข] สร้างตัวแปร pdfUrl โดยเช็ค firepath ก่อน */}
              {(() => {
                const pdfUrl = cdnUrl && generatedReport.firepath
                  ? `${cdnUrl}/${generatedReport.firepath.replace(/^\//, '')}`
                  : generatedReport.publicUrl;

                return (
                  <>
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={styles.generatedButton}><FiFileText style={{ verticalAlign: 'middle', marginRight: '4px' }} /> เปิดดู PDF</a>
                    <a href={pdfUrl} download={generatedReport.filename} className={styles.generatedButtonDownload}><FiDownload style={{ verticalAlign: 'middle', marginRight: '4px' }} /> ดาวน์โหลด PDF</a>
                  </>
                );
              })()}

            </div>
          </div>
        )
      }

      {/* --- Detailed Preview Modal --- */}
      {previewData && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }} onClick={() => { setPreviewData(null); setZoomLevel(1); }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'white', padding: '20px', borderRadius: '8px',
            width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Preview</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => setShowInfoOverlay(prev => !prev)} style={{ padding: '8px', borderRadius: '4px', border: 'none', backgroundColor: showInfoOverlay ? '#007bff' : '#eee', color: showInfoOverlay ? 'white' : 'black', cursor: 'pointer' }} title={showInfoOverlay ? "ซ่อนรายละเอียด" : "แสดงรายละเอียด"}>
                  {showInfoOverlay ? <FiEye /> : <FiEyeOff />}
                </button>
                <button onClick={() => setZoomLevel(prev => Math.max(1, prev - 0.5))} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}><FiZoomOut /></button>
                <span style={{ background: '#eee', padding: '5px 10px', borderRadius: '4px', minWidth: '40px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.5))} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}><FiZoomIn /></button>
                <button onClick={handleDownloadWithWatermark} style={{ backgroundColor: '#27ae60', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <FiSave /> บันทึก
                </button>
                <button onClick={() => { setPreviewData(null); setZoomLevel(1); }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', marginLeft: '10px' }}><FiX /></button>
              </div>
            </div>

            <div style={{ overflow: 'auto', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
              <div style={{ position: 'relative', display: 'inline-block', transform: `scale(${zoomLevel})`, transformOrigin: 'center center', transition: 'transform 0.2s ease' }}>
                <img src={previewData.url} alt="Preview" onLoad={handleImageLoad} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block' }} />
                {showInfoOverlay && previewData.addWatermark && (
                  <div style={{
                    position: 'absolute', bottom: `${watermarkFontSize}px`, right: `${watermarkFontSize}px`,
                    textAlign: 'right', color: 'white', textShadow: '0px 0px 4px rgba(0,0,0,1)',
                    fontWeight: 'bold', fontFamily: 'Arial, sans-serif', fontSize: `${watermarkFontSize}px`,
                    lineHeight: '1.2', pointerEvents: 'none', whiteSpace: 'pre'
                  }}>
                    {previewData.location && (
                      <div style={{ marginBottom: 0 }}>
                        {[...previewData.location.split('\\n')].reverse().map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </div>
                    )}
                    {previewData.timestamp && <div>{new Date(previewData.timestamp).toLocaleString('th-TH')}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* --- Daily Generate Modal (Selection) --- */}
      {
        showDailyGenerateModal && (
          <div className={styles.modalOverlay} onClick={() => setShowDailyGenerateModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', paddingBottom: '10px', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}><FiFileText style={{ marginRight: '8px' }} />เลือกรูปภาพเพื่อสร้างรายงาน</h3>
                <button
                  onClick={() => setShowDailyGenerateModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}
                >✕</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontWeight: 'bold' }}>เลือก: {selectedPhotoIds.size} / {dailyPhotos.length} รูป</span>
                <div>
                  <button
                    onClick={() => setSelectedPhotoIds(new Set(dailyPhotos.map(p => p.id)))}
                    style={{ background: 'none', border: '1px solid #007bff', color: '#007bff', borderRadius: '4px', padding: '4px 8px', marginRight: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
                  >เลือกทั้งหมด</button>
                  <button
                    onClick={() => setSelectedPhotoIds(new Set())}
                    style={{ background: 'none', border: '1px solid #dc3545', color: '#dc3545', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.85rem' }}
                  >ล้างการเลือก</button>
                </div>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {dailyPhotos.map((photo, index) => {
                    const displayUrl = cdnUrl && photo.firepath
                      ? `${cdnUrl}/${photo.firepath.replace(/^\//, '')}`
                      : photo.driveUrl;
                    const isSelected = selectedPhotoIds.has(photo.id);
                    return (
                      <label key={photo.id} style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', background: isSelected ? '#e8f4fd' : '#f8f9fa', padding: '10px', borderRadius: '8px', border: `1px solid ${isSelected ? '#007bff' : '#eee'}`, cursor: 'pointer', transition: 'all 0.2s' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const newSelected = new Set(selectedPhotoIds);
                            if (e.target.checked) newSelected.add(photo.id);
                            else newSelected.delete(photo.id);
                            setSelectedPhotoIds(newSelected);
                          }}
                          style={{ width: '20px', height: '20px', marginTop: '5px' }}
                        />
                        <div style={{ width: '100px', height: '100px', flexShrink: 0, overflow: 'hidden', borderRadius: '6px' }} onClick={(e) => { e.preventDefault(); setPreviewData({ url: displayUrl, timestamp: photo.createdAt, location: photo.location || null, addWatermark: false }); }}>
                          <img src={displayUrl} alt={`Photo ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: '0 0 5px 0', fontSize: '1rem', color: '#333' }}>{index + 1}. {photo.topic || photo.description || 'ไม่มีคำบรรยาย'}</h4>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', whiteSpace: 'pre-wrap' }}>{photo.topic ? photo.description : ''}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginTop: '15px', borderTop: '1px solid #ddd', paddingTop: '15px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setShowDailyGenerateModal(false)} disabled={isGenerating || isDownloadingPhotos} className={styles.searchButton} style={{ padding: '10px 20px', backgroundColor: '#e0e0e0', color: '#333', border: 'none' }}>ยกเลิก</button>

                <button
                  disabled={selectedPhotoIds.size === 0 || isDownloadingPhotos || isGenerating}
                  onClick={handleDownloadDailyPhotos}
                  className={styles.generateButton} style={{ padding: '10px 20px', margin: 0, backgroundColor: '#17a2b8' }}
                >
                  {isDownloadingPhotos ? <FiLoader className={styles.iconSpin} /> : <FiDownloadCloud />} ดาวน์โหลด ({selectedPhotoIds.size} รูป)
                </button>

                <button
                  disabled={selectedPhotoIds.size === 0 || isGenerating}
                  onClick={async () => {
                    await runGenerateReport({
                      reportType: 'Daily',
                      date: selectedDate ? selectedDate.toISOString().split('T')[0] : undefined,
                      selectedPhotoIds: Array.from(selectedPhotoIds)
                    });
                    setShowDailyGenerateModal(false); // Close ONLY after generation completes
                  }}
                  className={styles.generateButton} style={{ padding: '10px 20px', margin: 0 }}
                >
                  {isGenerating ? <FiLoader className={styles.iconSpin} /> : <FiFileText />} สร้างรายงาน ({selectedPhotoIds.size} รูป)
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* --- QC Download Modal (Bulk Images) --- */}
      {
        showQcDownloadModal && (
          <div className={styles.modalOverlay} onClick={() => setShowQcDownloadModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', paddingBottom: '10px', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}><FiDownloadCloud style={{ marginRight: '8px' }} />เลือกรูปภาพ QC เพื่อดาวน์โหลด</h3>
                <button
                  onClick={() => setShowQcDownloadModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}
                >✕</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontWeight: 'bold' }}>เลือก: {selectedQcPhotoIds.size} / {qcPhotos.length} รูป</span>
                <div>
                  <button
                    onClick={() => setSelectedQcPhotoIds(new Set(qcPhotos.map(p => p.id)))}
                    style={{ background: 'none', border: '1px solid #007bff', color: '#007bff', borderRadius: '4px', padding: '4px 8px', marginRight: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
                  >เลือกทั้งหมด</button>
                  <button
                    onClick={() => setSelectedQcPhotoIds(new Set())}
                    style={{ background: 'none', border: '1px solid #dc3545', color: '#dc3545', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.85rem' }}
                  >ล้างการเลือก</button>
                </div>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {qcPhotos.map((photo, index) => {
                    const displayUrl = cdnUrl && photo.firepath
                      ? `${cdnUrl}/${photo.firepath.replace(/^\//, '')}`
                      : photo.driveUrl || '';
                    const isSelected = selectedQcPhotoIds.has(photo.id);
                    return (
                      <label key={photo.id} style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', background: isSelected ? '#e8f4fd' : '#f8f9fa', padding: '10px', borderRadius: '8px', border: `1px solid ${isSelected ? '#007bff' : '#eee'}`, cursor: 'pointer', transition: 'all 0.2s' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const newSelected = new Set(selectedQcPhotoIds);
                            if (e.target.checked) newSelected.add(photo.id);
                            else newSelected.delete(photo.id);
                            setSelectedQcPhotoIds(newSelected);
                          }}
                          style={{ width: '20px', height: '20px', marginTop: '5px' }}
                        />
                        <div style={{ width: '100px', height: '100px', flexShrink: 0, overflow: 'hidden', borderRadius: '6px' }} onClick={(e) => { e.preventDefault(); setPreviewData({ url: displayUrl, timestamp: photo.createdAt, location: photo.location || null, addWatermark: false }); }}>
                          <img src={displayUrl} alt={`QC Photo ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: '0 0 5px 0', fontSize: '1rem', color: '#333' }}>{index + 1}. {photo.topic}</h4>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', whiteSpace: 'pre-wrap' }}>{photo.description || 'ไม่มีคำบรรยาย'}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginTop: '15px', borderTop: '1px solid #ddd', paddingTop: '15px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setShowQcDownloadModal(false)} className={styles.searchButton} style={{ padding: '10px 20px', backgroundColor: '#e0e0e0', color: '#333', border: 'none' }}>ยกเลิก</button>
                <button
                  disabled={selectedQcPhotoIds.size === 0 || isDownloadingPhotos}
                  onClick={handleDownloadSelectedPhotos}
                  className={styles.generateButton} style={{ padding: '10px 20px', margin: 0 }}
                >
                  {isDownloadingPhotos ? <FiLoader className={styles.iconSpin} /> : <FiDownloadCloud />} ดาวน์โหลด ({selectedQcPhotoIds.size} รูป)
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default Reports;