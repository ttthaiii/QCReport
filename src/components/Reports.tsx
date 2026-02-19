// Filename: src/components/Reports.tsx (REFACTORED for Search Button & Preview)

import React, { useState, useEffect, useCallback } from 'react';
// ✅ [ใหม่] 1. Import Type ใหม่
import { api, ProjectConfig, MainCategory, SubCategory, GeneratedReportInfo, ChecklistStatusResponse, SharedJob } from '../utils/api';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import styles from './Reports.module.css';
import AutocompleteInput from './AutocompleteInput';

import {
  FiClipboard, FiSun, FiPlus, FiRefreshCw, FiCheckCircle,
  FiAlertTriangle, FiFileText, FiDownload, FiLoader, FiBarChart2,
  FiSearch, FiActivity, FiClock, FiInbox, // <-- [ใหม่]
  FiChevronDown, FiChevronRight
} from 'react-icons/fi';

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

  // ✅ [ใหม่] 3. States สำหรับ Active Feed (SharedJobs)
  const [sharedJobs, setSharedJobs] = useState<any[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);



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

      const response = await api.getChecklistStatus(payload);
      if (response.success && response.data) {
        setPreviewStatus(response.data);
      } else {
        throw new Error(response.error || 'ไม่สามารถโหลดสถานะได้');
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
    await fetchPreviewStatus();
    await fetchGeneratedReports();
  };

  // (6.2) ปุ่ม "สร้างรายงาน" (เหมือนเดิม)
  const generateReport = async () => {
    if (isGenerating || !previewStatus || previewStatus.found === 0) {
      if (!previewStatus) {
        alert('กรุณากด "ค้นหา" เพื่อตรวจสอบข้อมูลก่อนสร้าง');
        return;
      }
      if (previewStatus.found === 0) {
        alert('ไม่พบรูปภาพ จึงไม่สามารถสร้างรายงานได้');
        return;
      }
      return;
    }

    const filterDataFromState = {
      reportType,
      mainCategory: reportType === 'QC' ? formData.mainCategory : undefined,
      subCategory: reportType === 'QC' ? formData.subCategory : undefined,
      dynamicFields: reportType === 'QC' ? dynamicFields : undefined,
      date: reportType === 'Daily' && selectedDate ? selectedDate.toISOString().split('T')[0] : undefined
    };

    await runGenerateReport(filterDataFromState);
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
  }) => {
    setIsGenerating(true);
    setGeneratedReport(null);
    setListError(null);

    try {
      // ✅ แก้ไข: รวม projectId เข้าไปใน object
      const response = await api.generateReport({
        projectId,      // ← เพิ่มบรรทัดนี้
        projectName,    // ← เพิ่มบรรทัดนี้ (optional)
        ...filterData
      });

      if (response.success && response.data) {
        setGeneratedReport(response.data);
        alert('สร้างรายงานสำเร็จ! 🎉');

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
      alert('เกิดข้อผิดพลาด: ' + (error as Error).message);
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


  // ========== Main Render ==========
  return (
    <div className={styles.reportsContainer}>
      {/* <h1><FiBarChart2 style={{ verticalAlign: 'middle', marginRight: '8px' }} /> สร้างรายงาน</h1> */}


      {/* 2. Manual Creation Form (Always Visible) */}
      <div className={styles.formBox} style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 className={styles.formBoxTitle} style={{ marginBottom: 0 }}>ตัวกรอง / สร้างรายงาน (Manual)</h3>
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
            <DatePicker selected={selectedDate} onChange={(date: Date | null) => setSelectedDate(date)} dateFormat="dd/MM/yyyy" className="daily-datepicker" />
          </div>
        )}
      </div>

      {/* 3. Unified List (Accordion) - Always Visible below Form */}
      {(sharedJobs.length > 0 || generatedReportsList.length > 0) && (
        <div className={styles.activeFeedBox}>
          <h3 className={styles.activeFeedTitle}>
            <FiActivity style={{ marginRight: '8px', color: '#ffc107' }} />
            รายการงานทั้งหมด (All Jobs & History)
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
                                            <div className={styles.jobCardActions}>
                                              {(hasReport || isJustGenerated) && (
                                                <a href={item.report?.publicUrl} target="_blank" rel="noopener noreferrer" className={styles.miniSuccessButton} style={{ marginRight: '5px', flex: 1 }} onClick={(e) => e.stopPropagation()}><FiCheckCircle /> ดู PDF</a>
                                              )}
                                              <button className={styles.miniGenerateButton} style={{ flex: 2, backgroundColor: newPhotosCount > 0 ? '#ffc107' : (hasReport ? '#17a2b8' : '#007bff'), color: newPhotosCount > 0 ? '#000' : '#fff' }} onClick={(e) => {
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
                                                  alert(`Error: Missing Category Data! (Main: ${payload.mainCategory}, Sub: ${payload.subCategory})`);
                                                  return;
                                                }

                                                setReportType('QC'); setFormData({ mainCategory: item.mainCategory, subCategory: item.subCategory }); setDynamicFields(item.dynamicFields);
                                                (async () => {
                                                  try {
                                                    const statusRes = await api.getChecklistStatus({ projectId, ...payload });
                                                    if (statusRes.success && statusRes.data && statusRes.data.found > 0) {
                                                      setPreviewStatus(statusRes.data); await runGenerateReport(payload);
                                                    } else { alert('ไม่พบรูปภาพในระบบ'); }
                                                  } catch (err) { alert(err); }
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
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
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

    </div >
  );
};

export default Reports;