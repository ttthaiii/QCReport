// Filename: src/components/Reports.tsx (REFACTORED for Search Button & Preview)

import React, { useState, useEffect, useCallback } from 'react';
// ✅ [ใหม่] 1. Import Type ใหม่
import { api, ProjectConfig, MainCategory, SubCategory, GeneratedReportInfo, ChecklistStatusResponse } from '../utils/api'; 
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import styles from './Reports.module.css';

import { 
  FiClipboard, FiSun, FiPlus, FiRefreshCw, FiCheckCircle, 
  FiAlertTriangle, FiFileText, FiDownload, FiLoader, FiBarChart2,
  FiSearch // <-- [ใหม่]
} from 'react-icons/fi';

interface ReportsProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
}

const cdnUrl = (process.env.REACT_APP_CDN_URL || '').replace(/\/$/, '');
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


  // --- 3. useEffects for Filters (ปรับปรุงเล็กน้อย) ---
  useEffect(() => {
    if (projectConfig) {
      setQcTopics(projectConfig);
      const mainCategories = projectConfig;
      if (mainCategories.length > 0 && reportType === 'QC') { 
        if (!formData.mainCategory) {
            setFormData(prev => ({ ...prev, mainCategory: mainCategories[0].name }));
        }
      } else if (reportType !== 'QC') {
        setFormData({ mainCategory: '', subCategory: '' }); 
      }
    }
  }, [projectConfig, reportType, formData.mainCategory]); 

  useEffect(() => {
    if (reportType === 'QC' && formData.mainCategory && qcTopics.length > 0) {
      const selectedMainCat = qcTopics.find(m => m.name === formData.mainCategory);
      if (selectedMainCat && selectedMainCat.subCategories.length > 0) {
         if (!formData.subCategory || !selectedMainCat.subCategories.find(s => s.name === formData.subCategory)) {
            setDynamicFields({}); 
            setFormData(prev => ({ ...prev, subCategory: selectedMainCat.subCategories[0].name }));
         }
      } else {
        setFormData(prev => ({ ...prev, subCategory: '' }));
        setDynamicFields({}); 
      }
    } else if (reportType !== 'QC') {
       setFormData(prev => ({ ...prev, subCategory: '' })); 
       setDynamicFields({}); 
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

  // (5.1) โหลด "รายการรายงานที่เคยสร้าง" (List #2)
  const fetchGeneratedReports = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    setGeneratedReport(null); 

    const filterCriteria = {
      reportType,
      mainCategory: reportType === 'QC' ? formData.mainCategory : undefined,
      subCategory: reportType === 'QC' ? formData.subCategory : undefined,
      dynamicFields: reportType === 'QC' ? dynamicFields : undefined,
      date: reportType === 'Daily' && selectedDate ? selectedDate.toISOString().split('T')[0] : undefined
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

  const handleAutoSearch = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    setGeneratedReport(null);

    const filterCriteria = {
      reportType,
      mainCategory: reportType === 'QC' ? formData.mainCategory : undefined,
      subCategory: reportType === 'QC' ? formData.subCategory : undefined,
      // ไม่ส่ง dynamicFields → แสดงทั้งหมด
      date: reportType === 'Daily' && selectedDate ? selectedDate.toISOString().split('T')[0] : undefined
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
    
  // ✅ [ใหม่] (5.2) โหลด "สถานะรูปภาพ" (Preview Box #1.5)
  const fetchPreviewStatus = useCallback(async () => {
    setIsPreviewLoading(true);
    setPreviewStatus(null);
    setPreviewError(null);

    const payload = {
      projectId,
      reportType,
      mainCategory: reportType === 'QC' ? formData.mainCategory : undefined,
      subCategory: reportType === 'QC' ? formData.subCategory : undefined,
      dynamicFields: reportType === 'QC' ? dynamicFields : undefined,
      date: reportType === 'Daily' && selectedDate ? selectedDate.toISOString().split('T')[0] : undefined
    };

    try {
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

  // ✅ [ใหม่] (6.1) ปุ่ม "ค้นหา" (จะรัน 2 ฟังก์ชัน)
  const handleSearch = async () => {
    await fetchPreviewStatus();    // เช็ครูปก่อน
    await fetchGeneratedReports(); // แล้วค่อยโหลดรายงาน
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
  const handleDynamicFieldChange = (fieldName: string, value: string) => {
    setDynamicFields(prev => ({ ...prev, [fieldName]: value }));
  };
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
    try {
      const reportData = { projectId, projectName, ...filterData };
      const response = await api.generateReport(reportData);
      if (response.success && response.data) {
        setGeneratedReport(response.data);
        alert(`✅ สร้างรายงานสำเร็จ!\nไฟล์: ${response.data.filename}`);
        fetchGeneratedReports(); // โหลด List ใหม่
      } else {
        throw new Error(response.error || 'Failed to generate report');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('เกิดข้อผิดพลาดในการสร้างรายงาน: ' + (error as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };
  const mainCategories: MainCategory[] = qcTopics;
  const selectedMainCat = mainCategories.find(m => m.name === formData.mainCategory);
  const subCategories: SubCategory[] = selectedMainCat ? selectedMainCat.subCategories : [];
  const requiredDynamicFields: string[] = subCategories.find(s => s.name === formData.subCategory)?.dynamicFields || [];
  const handleRegenerateReport = async (report: GeneratedReportInfo) => {
    const filterDataFromReport = {
      reportType: report.reportType,
      mainCategory: report.mainCategory,
      subCategory: report.subCategory,
      dynamicFields: report.dynamicFields,
      date: report.reportDate 
    };
    await runGenerateReport(filterDataFromReport);
  };
  
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
                {report.hasNewPhotos && (
                  <button onClick={() => handleRegenerateReport(report)} className={styles.reportButtonRegenerate} title="สร้างรายงานนี้ใหม่อีกครั้ง" disabled={isGenerating} >
                    {isGenerating ? <FiLoader className={styles.iconSpin} /> : <FiRefreshCw />} 
                  </button>
                )}
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={styles.reportButtonView} title="เปิดดู PDF" >
                  <FiFileText /> 
                </a>
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
          <p className={styles.loadingText} style={{margin: 0}}>
            <FiLoader className={styles.iconSpin} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> 
            กำลังค้นหาข้อมูลรูปภาพ...
          </p>
        </div>
      );
    }
    
    if (previewError) {
       return (
        <div className={styles.previewBox}>
          <p className={styles.errorText} style={{margin: 0}}>
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
      <h1><FiBarChart2 style={{ verticalAlign: 'middle', marginRight: '8px' }} /> สร้างรายงาน</h1>

      {/* --- Filter Form Box (แก้ไข) --- */}
      <div className={styles.formBox}>
        <h3 className={styles.formBoxTitle}>1. เลือกเงื่อนไขสำหรับรายงาน</h3>

        {/* Report Type Toggle */}
        <div className={styles.reportTypeToggle}>
          <button onClick={() => { setReportType('QC'); setGeneratedReport(null); setPreviewStatus(null); }} className={`${styles.reportTypeButton} ${reportType === 'QC' ? styles.activeQc : ''}`} >
            <FiClipboard style={{ verticalAlign: 'middle', marginRight: '4px' }} /> รายงาน QC 
          </button>
          <button onClick={() => { setReportType('Daily'); setGeneratedReport(null); setPreviewStatus(null); }} className={`${styles.reportTypeButton} ${reportType === 'Daily' ? styles.activeDaily : ''}`} >
            <FiSun style={{ verticalAlign: 'middle', marginRight: '4px' }} /> รายงานประจำวัน 
          </button>
        </div>

        {/* ... (ฟอร์ม QC และ Daily Filters เหมือนเดิม) ... */}
        {reportType === 'QC' && (
          <div>
            <div className={styles.gridContainer}>
              {/* Main Category */}
              <div>
                <label className={styles.label}>หมวดงานหลัก:</label>
                <select value={formData.mainCategory} onChange={(e) => setFormData(prev => ({ subCategory: '', mainCategory: e.target.value }))} className={styles.formInput} disabled={mainCategories.length === 0} >
                  {mainCategories.length === 0 && <option>-- กำลังโหลด... --</option>}
                  {mainCategories.map(category => ( <option key={category.id} value={category.name}>{category.name}</option> ))}
                </select>
              </div>
              {/* Sub Category */}
              <div>
                <label className={styles.label}>หมวดงานย่อย:</label>
                <select value={formData.subCategory} onChange={(e) => { setDynamicFields({}); setFormData(prev => ({ ...prev, subCategory: e.target.value })); }} className={styles.formInput} disabled={!formData.mainCategory || subCategories.length === 0} >
                   {!formData.mainCategory ? <option>-- กรุณาเลือกหมวดหลักก่อน --</option> :
                    subCategories.length === 0 ? <option>-- ไม่มีหมวดงานย่อย --</option> :
                    subCategories.map(subcategory => ( <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option> ))}
                </select>
              </div>
            </div>
            {/* Dynamic Fields */}
            {requiredDynamicFields.length > 0 && (
              <div className={styles.formGroup}>
                <h4 className={styles.subheading}>ข้อมูลเพิ่มเติม:</h4>
                <div className={styles.smallGridContainer}>
                  {requiredDynamicFields.map((fieldName: string) => (
                    <div key={fieldName}>
                      <label className={styles.smallLabel}>{fieldName}:</label>
                      <input type="text" value={dynamicFields[fieldName] || ''} onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)} placeholder={`ระบุ${fieldName}...`} className={styles.formInput} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {reportType === 'Daily' && (
          <div className={styles.formGroup}>
            <label className={styles.label}>เลือกวันที่:</label>
            <DatePicker selected={selectedDate} onChange={(date: Date | null) => setSelectedDate(date)} dateFormat="dd/MM/yyyy" className="daily-datepicker" />
          </div>
        )}

        {/* ✅ [ใหม่] 8. ปุ่ม Search และปุ่ม Generate (แยกกัน) */}
        <div className={styles.buttonContainer}>
          <button
            onClick={handleSearch}
            disabled={isPreviewLoading || !isFieldsComplete()}
            className={styles.searchButton}
          >
            <FiSearch style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            {isPreviewLoading ? 'กำลังค้นหา...' : 'ค้นหา'}
          </button>
          
          <button
            onClick={generateReport}
            disabled={isGenerating || !previewStatus || previewStatus.found === 0}
            className={styles.generateButton}
          >
            {isGenerating ? 
              <><FiLoader className={styles.iconSpin} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> กำลังสร้าง...</> : 
              <><FiPlus style={{ verticalAlign: 'middle', marginRight: '8px' }} /> สร้างรายงาน PDF</> 
            }
          </button>
        </div>
      </div>
      
      {/* ✅ [ใหม่] 9. แสดงผล Preview Box */}
      {renderPreviewBox()}

      {/* --- Generated Reports List Box (เหมือนเดิม) --- */}
      <div className={styles.generatedReportsBox}>
        <h3 className={styles.generatedReportsTitle}>
          2. รายงานที่เคยสร้าง ({generatedReportsList.length} ฉบับล่าสุด)
        </h3>
        {isLoadingList && <p className={styles.loadingText}><FiLoader className={styles.iconSpin} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> กำลังโหลดรายการ...</p>} 
        {listError && <p className={styles.errorText}><FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: '8px' }} /> {listError}</p>} 
        {!isLoadingList && !listError && generatedReportsList.length === 0 && (
          <p className={styles.noReportsText}>
            <i>-- ไม่พบรายงานที่เคยสร้างสำหรับเงื่อนไขนี้ --</i>
          </p>
        )}
        {!isLoadingList && !listError && generatedReportsList.length > 0 && (
          <div className={styles.reportListContainer}>
            {generatedReportsList.map(renderReportItem)}
          </div>
        )}
      </div>

      {/* --- Generated Result Box (เหมือนเดิม) --- */}
      {generatedReport && !isGenerating && (
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
                <p><strong>วันที่:</strong> {selectedDate ? selectedDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric'}) : 'N/A'}</p>
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
      )}

    </div>
  );
};

export default Reports;