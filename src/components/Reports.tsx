// Filename: src/components/Reports.tsx (REFACTORED for Generated Reports List)

import React, { useState, useEffect, useCallback } from 'react';
// [ใหม่] Import GeneratedReportInfo เพิ่ม
import { api, ProjectConfig, MainCategory, SubCategory, GeneratedReportInfo } from '../utils/api';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import styles from './Reports.module.css';

interface ReportsProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
}

const Reports: React.FC<ReportsProps> = ({ projectId, projectName, projectConfig }) => {
  
  // --- 1. STATES ---
  // (วาง State ทั้งหมดไว้ที่นี่)
  const [qcTopics, setQcTopics] = useState<ProjectConfig>(projectConfig || []);
  const [reportType, setReportType] = useState<'QC' | 'Daily'>('QC');
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [formData, setFormData] = useState({
    mainCategory: '',
    subCategory: '',
  });
  const [dynamicFields, setDynamicFields] = useState<{ [key: string]: string }>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);
  const [generatedReportsList, setGeneratedReportsList] = useState<GeneratedReportInfo[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);


  // --- useEffects for Filters (เหมือนเดิม + แก้ไขเล็กน้อย) ---
  useEffect(() => {
    if (projectConfig) {
      setQcTopics(projectConfig);
      const mainCategories = projectConfig;
      if (mainCategories.length > 0 && reportType === 'QC') { // [แก้ไข] เช็ค reportType ด้วย
        // ตั้งค่า default main category เฉพาะตอนเปลี่ยนเป็น QC และมี config
        if (!formData.mainCategory) {
            setFormData(prev => ({ ...prev, mainCategory: mainCategories[0].name }));
        }
      } else if (reportType !== 'QC') {
        setFormData({ mainCategory: '', subCategory: '' }); // Reset ถ้าไม่ใช่ QC
      }
    }
  }, [projectConfig, reportType, formData.mainCategory]); // [แก้ไข] เพิ่ม formData.mainCategory dependency

  useEffect(() => {
    if (reportType === 'QC' && formData.mainCategory && qcTopics.length > 0) {
      const selectedMainCat = qcTopics.find(m => m.name === formData.mainCategory);
      if (selectedMainCat && selectedMainCat.subCategories.length > 0) {
        // ตั้งค่า default sub category เฉพาะตอนเปลี่ยน main category หรือ sub category ยังว่าง
         if (!formData.subCategory || !selectedMainCat.subCategories.find(s => s.name === formData.subCategory)) {
            setDynamicFields({}); // Reset dynamic fields เมื่อ Sub Category เปลี่ยน
            setFormData(prev => ({ ...prev, subCategory: selectedMainCat.subCategories[0].name }));
         }
      } else {
        setFormData(prev => ({ ...prev, subCategory: '' }));
        setDynamicFields({}); // เคลียร์ dynamic fields ด้วย
      }
    } else if (reportType !== 'QC') {
       setFormData(prev => ({ ...prev, subCategory: '' })); // Reset SubCategory ถ้าไม่ใช่ QC
       setDynamicFields({}); // เคลียร์ dynamic fields ด้วย
    }
  }, [formData.mainCategory, formData.subCategory, qcTopics, reportType]); // [แก้ไข] เพิ่ม formData.subCategory dependency


  // --- [ใหม่] useEffect for Fetching Generated Reports List ---
  const fetchGeneratedReports = useCallback(async () => {
    // ไม่ต้อง fetch ถ้ายังเลือก Filter ไม่ครบ (สำหรับ QC)
    if (reportType === 'QC' && (!formData.mainCategory || !formData.subCategory)) {
        setGeneratedReportsList([]); // เคลียร์รายการเก่าถ้า filter ไม่ครบ
        setIsLoadingList(false); // [แก้ไข] หยุด loading ด้วย
        setListError(null); // เคลียร์ error
        return;
    }
    // ไม่ต้อง fetch ถ้ายังไม่ได้เลือกวัน (สำหรับ Daily)
    if (reportType === 'Daily' && !selectedDate) {
        setGeneratedReportsList([]);
        setIsLoadingList(false); // [แก้ไข] หยุด loading ด้วย
        setListError(null); // เคลียร์ error
        return;
    }

    setIsLoadingList(true);
    setListError(null);
    setGeneratedReport(null); // เคลียร์ผลการสร้าง report เก่า เมื่อ filter เปลี่ยน

    const filterCriteria = {
      reportType,
      mainCategory: reportType === 'QC' ? formData.mainCategory : undefined,
      subCategory: reportType === 'QC' ? formData.subCategory : undefined,
      dynamicFields: reportType === 'QC' ? dynamicFields : undefined,
      date: reportType === 'Daily' && selectedDate ? selectedDate.toISOString().split('T')[0] : undefined
    };

    console.log("Fetching generated reports with filter:", filterCriteria); // DEBUG Log
    const response = await api.getGeneratedReports(projectId, filterCriteria);
    console.log("API Response:", response); // DEBUG Log

    if (response.success && response.data) {
      // [แก้ไข] เพิ่ม Type ให้ a และ b
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

  useEffect(() => {
    // Debounce การ fetch เล็กน้อย เผื่อ User กรอก dynamic fields เร็วๆ
    const handler = setTimeout(() => {
        fetchGeneratedReports();
    }, 300); // รอ 300ms หลัง User หยุดพิมพ์/เปลี่ยนค่า

    return () => {
        clearTimeout(handler); // Clear timeout ถ้า dependency เปลี่ยนก่อนครบ 300ms
    };
  }, [fetchGeneratedReports]);
  // --- จบ useEffect ใหม่ ---


  // --- Helper Functions (เหมือนเดิม + แก้ไขเล็กน้อย) ---
  const handleDynamicFieldChange = (fieldName: string, value: string) => {
    setDynamicFields(prev => ({ ...prev, [fieldName]: value }));
  };

  const isFieldsComplete = () => {
    if (reportType === 'QC') {
      // QC ต้องเลือก Main และ Sub เสมอ
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
    date?: string; // YYYY-MM-DD
  }) => {
    
    setIsGenerating(true);
    setGeneratedReport(null); // เคลียร์ผลลัพธ์เก่า

    try {
      // สร้าง reportData ที่จะส่งให้ API
      const reportData = {
        projectId,
        projectName,
        reportType: filterData.reportType,
        mainCategory: filterData.mainCategory,
        subCategory: filterData.subCategory,
        dynamicFields: filterData.dynamicFields,
        date: filterData.date
      };

      console.log("Generating report with data:", reportData);
      const response = await api.generateReport(reportData);

      if (response.success && response.data) {
        setGeneratedReport(response.data);
        alert(`✅ สร้างรายงานสำเร็จ!\nไฟล์: ${response.data.filename}`);
        // เรียก fetch รายการใหม่ หลังจากสร้างสำเร็จ
        fetchGeneratedReports();
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

  // --- generateReport Function (เหมือนเดิม + เพิ่ม fetch list หลังสร้างเสร็จ) ---
  const generateReport = async () => {
    if (!isFieldsComplete()) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    // สร้าง filterData จาก State ของ Form
    const filterDataFromState = {
      reportType,
      mainCategory: reportType === 'QC' ? formData.mainCategory : undefined,
      subCategory: reportType === 'QC' ? formData.subCategory : undefined,
      dynamicFields: reportType === 'QC' ? dynamicFields : undefined,
      date: reportType === 'Daily' && selectedDate ? selectedDate.toISOString().split('T')[0] : undefined
    };
    
    await runGenerateReport(filterDataFromState);
  };

  // --- Logic for getting dropdown options (เหมือนเดิม + แก้ไขเล็กน้อย) ---
  const mainCategories: MainCategory[] = qcTopics;
  const selectedMainCat = mainCategories.find(m => m.name === formData.mainCategory);
  const subCategories: SubCategory[] = selectedMainCat ? selectedMainCat.subCategories : [];
  // [แก้ไข] ดึง required fields ออกมานอก useEffect
  const requiredDynamicFields: string[] = subCategories.find(s => s.name === formData.subCategory)?.dynamicFields || [];
  const handleRegenerateReport = async (report: GeneratedReportInfo) => {
    // สร้าง filterData จาก Object ของ report ที่คลิก
    const filterDataFromReport = {
      reportType: report.reportType,
      mainCategory: report.mainCategory,
      subCategory: report.subCategory,
      dynamicFields: report.dynamicFields,
      date: report.reportDate // reportDate ใน object เป็น YYYY-MM-DD อยู่แล้ว
    };
    
    await runGenerateReport(filterDataFromReport);
  };

  // --- [ใหม่] Render Function for Generated Report Item ---
  const renderReportItem = (report: GeneratedReportInfo) => {
    const createdAtDate = new Date(report.createdAt);
    // [แก้ไข] Format วันที่ให้สั้นลง และแสดง พ.ศ.
    const formattedDate = createdAtDate.toLocaleDateString('th-TH', {
        day: '2-digit', month: 'short', year: 'numeric', // ใช้ numeric จะได้ พ.ศ.
        hour: '2-digit', minute: '2-digit'
    }) + ' น.';

    return (
        <div key={report.reportId} className={styles.reportListItem}>
            <div className={styles.reportInfo}>
                <span className={styles.reportFilename} title={report.filename}>
                    📄 {report.filename}
                </span>
                <span className={styles.reportDate}>
                    สร้างเมื่อ: {formattedDate}
                </span>
                <span className={styles.reportPhotoCount}>
                  (มี {report.photosFound} รูป {report.reportType === 'QC' && report.totalTopics ? ` / ${report.totalTopics} หัวข้อ` : ''})
                </span>
            </div>
            <div className={styles.reportActions}>
                {report.hasNewPhotos && (
                  <button
                    onClick={() => handleRegenerateReport(report)}
                    className={styles.reportButtonRegenerate} // <-- Style ใหม่
                    title="สร้างรายงานนี้ใหม่อีกครั้ง"
                    disabled={isGenerating} // Disable ถ้ากำลังสร้างฉบับอื่นอยู่
                  >
                    {/* เช็ค isGenerating เพื่อเปลี่ยนข้อความ
                      (เราใช้ isGenerating ร่วมกันทั้ง 2 ปุ่ม)
                    */}
                    {isGenerating ? '🔄...' : '✨ สร้างใหม่'}
                  </button>
                )}

                <a
                  href={`${report.publicUrl}?v=${new Date(report.createdAt).getTime()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.reportButtonView}
                  title="เปิดดู PDF"
                >
                  📄 ดู
                </a>
                <a
                  href={`${report.publicUrl}?v=${new Date(report.createdAt).getTime()}`}
                  download={report.filename}
                  className={styles.reportButtonDownload}
                  title="ดาวน์โหลด PDF"
                >
                  💾 โหลด
                </a>
            </div>
        </div>
    );
  };
  // --- จบ Render Function ใหม่ ---


  // ========== Main Render ==========
  return (
    <div className={styles.reportsContainer}>
      <h1>📋 สร้างรายงาน</h1>

      {/* --- Filter Form Box (เหมือนเดิม) --- */}
      <div className={styles.formBox}>
        <h3 className={styles.formBoxTitle}>1. เลือกเงื่อนไขสำหรับรายงาน</h3>

        {/* Report Type Toggle */}
        <div className={styles.reportTypeToggle}>
          <button
            onClick={() => { setReportType('QC'); setGeneratedReport(null); /* เคลียร์ผลลัพธ์เก่า */ }}
            className={`${styles.reportTypeButton} ${reportType === 'QC' ? styles.activeQc : ''}`}
          >
            📋 รายงาน QC (ตามหัวข้อ)
          </button>
          <button
            onClick={() => { setReportType('Daily'); setGeneratedReport(null); /* เคลียร์ผลลัพธ์เก่า */ }}
            className={`${styles.reportTypeButton} ${reportType === 'Daily' ? styles.activeDaily : ''}`}
          >
            ☀️ รายงานประจำวัน (Daily)
          </button>
        </div>

        {/* QC Filters */}
        {reportType === 'QC' && (
          <div>
            <div className={styles.gridContainer}>
              {/* Main Category */}
              <div>
                <label className={styles.label}>หมวดงานหลัก:</label>
                <select
                  value={formData.mainCategory}
                  onChange={(e) => setFormData(prev => ({ subCategory: '', mainCategory: e.target.value }))}
                  className={styles.formInput}
                  disabled={mainCategories.length === 0}
                >
                  {mainCategories.length === 0 && <option>-- กำลังโหลด... --</option>}
                  {mainCategories.map(category => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </div>
              {/* Sub Category */}
              <div>
                <label className={styles.label}>หมวดงานย่อย:</label>
                <select
                  value={formData.subCategory}
                  onChange={(e) => {
                    setDynamicFields({}); // Reset dynamic fields เมื่อ Sub Category เปลี่ยน
                    setFormData(prev => ({ ...prev, subCategory: e.target.value }));
                  }}
                  className={styles.formInput}
                  disabled={!formData.mainCategory || subCategories.length === 0} // Disable ถ้ายังไม่เลือก Main Cat
                >
                   {!formData.mainCategory ? <option>-- กรุณาเลือกหมวดหลักก่อน --</option> :
                    subCategories.length === 0 ? <option>-- ไม่มีหมวดงานย่อย --</option> :
                    subCategories.map(subcategory => (
                      <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>
                   ))}
                </select>
              </div>
            </div>
            {/* Dynamic Fields */}
            {requiredDynamicFields.length > 0 && (
              <div className={styles.formGroup}>
                <h4 className={styles.subheading}>ข้อมูลเพิ่มเติม (กรอกเพื่อ Filter รูปและรายงาน):</h4>
                <div className={styles.smallGridContainer}>
                  {requiredDynamicFields.map((fieldName: string) => (
                    <div key={fieldName}>
                      <label className={styles.smallLabel}>{fieldName}:</label>
                      <input
                        type="text"
                        value={dynamicFields[fieldName] || ''}
                        onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
                        placeholder={`ระบุ${fieldName}...`}
                        className={styles.formInput}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Daily Filter */}
        {reportType === 'Daily' && (
          <div className={styles.formGroup}>
            <label className={styles.label}>เลือกวันที่:</label>
            <DatePicker
              selected={selectedDate}
              onChange={(date: Date | null) => setSelectedDate(date)}
              dateFormat="dd/MM/yyyy"
              className="daily-datepicker" // Global Class
            />
          </div>
        )}

        {/* Generate Button */}
        <div className={styles.centerAlign} style={{marginTop: '30px'}}>
          <button
            onClick={generateReport}
            disabled={isGenerating || !isFieldsComplete()}
            className={styles.generateButton}
          >
            {isGenerating ? '🔄 กำลังสร้าง...' : '➕ สร้างรายงาน PDF ใหม่'}
          </button>
        </div>
      </div>
      {/* --- จบ Filter Form Box --- */}


      {/* --- [ใหม่] Generated Reports List Box --- */}
      <div className={styles.generatedReportsBox}>
        <h3 className={styles.generatedReportsTitle}>
          2. รายงานที่เคยสร้าง ({generatedReportsList.length} ฉบับล่าสุด)
        </h3>
        {isLoadingList && <p className={styles.loadingText}>🔄 กำลังโหลดรายการ...</p>}
        {listError && <p className={styles.errorText}>❌ {listError}</p>}
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
      {/* --- จบ Generated Reports List Box --- */}


      {/* --- Generated Result Box (แสดงผลหลังกดสร้าง) --- */}
      {generatedReport && !isGenerating && (
        <div className={styles.generatedBox}>
          <h3 className={styles.generatedTitle}>✅ สร้างรายงานใหม่สำเร็จ!</h3>
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
            <a href={generatedReport.publicUrl} target="_blank" rel="noopener noreferrer" className={styles.generatedButton}>📄 เปิดดู PDF</a>
            <a href={generatedReport.publicUrl} download={generatedReport.filename} className={styles.generatedButtonDownload}>💾 ดาวน์โหลด PDF</a>
          </div>
        </div>
      )}
      {/* --- จบ Generated Result Box --- */}

    </div>
  );
};

export default Reports;