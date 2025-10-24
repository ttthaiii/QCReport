// Filename: src/components/AdminConfig.tsx (V3 - Accordion UI)

import React, { useState, useEffect, useRef } from 'react';
// 1. Import ทุกอย่างที่เราต้องการ
import { 
  api, 
  ProjectConfig, 
  MainCategory, 
  SubCategory, 
  Topic,
  ReportSettings
} from '../utils/api';
// 2. เราจะ Import CSS เดิมมาใช้
// (คุณอาจจะต้องสร้าง/ปรับแต่ง CSS นี้ทีหลังเพื่อให้สวยงามขึ้น)
import './AdminAccordion.css'; 
// (ผมจะให้ CSS พื้นฐานในขั้นตอนถัดไป)

interface AdminConfigProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
  onConfigUpdated: () => void;
}

// [ใหม่] State สำหรับฟอร์มที่กำลังเปิดอยู่
// (ป้องกันการเปิดฟอร์ม "เพิ่ม" ซ้อนกันหลายอัน)
type ActiveForm = 
  | 'main'
  | 'sub'
  | 'topic'
  | null;

const AdminConfig: React.FC<AdminConfigProps> = ({ 
  projectId, 
  projectName, 
  projectConfig,
  onConfigUpdated
}) => {
  
  // [ใหม่] State สำหรับการขยาย (Expand) Accordion
  // เราจะเก็บ ID ของรายการที่ถูกเปิดไว้
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // [ใหม่] State สำหรับฟอร์ม "เพิ่ม"
  // (เราจะใช้ State ชุดเดียวสำหรับทุก Level เพื่อความง่าย)
  const [newName, setNewName] = useState("");
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingSubCat, setEditingSubCat] = useState<SubCategory | null>(null);
  const [tempFields, setTempFields] = useState<string[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [isSavingFields, setIsSavingFields] = useState(false);  

  const [reportSettings, setReportSettings] = useState<ReportSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingReportSettings, setIsSavingReportSettings] = useState(false);

  // ✅ Logo Upload State
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ========== 0. Load Report Settings ==========
  useEffect(() => {
    const loadSettings = async () => {
      if (!projectId) return;
      setIsLoadingSettings(true);
      const response = await api.getReportSettings(projectId);
      // ใช้ data ที่ได้มา หรือ default จาก api.ts ถ้าโหลดล้มเหลว
      setReportSettings(response.data || null);
      if(!response.success) {
         console.error("Failed to load report settings:", response.error);
      }
      setIsLoadingSettings(false);
    };
    loadSettings();
  }, [projectId]);

  // ========== 1. Helper Functions ==========

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // ฟังก์ชันเปิดฟอร์ม "เพิ่ม"
  const showAddForm = (type: ActiveForm) => {
    setActiveForm(type);
    setNewName(""); // เคลียร์ค่าเก่า
    setIsAdding(false);
  };
  
  // ฟังก์ชันปิดฟอร์ม
  const cancelAddForm = () => {
    setActiveForm(null);
    setNewName("");
    setIsAdding(false);
  };

  const openFieldsModal = (subCat: SubCategory) => {
    setEditingSubCat(subCat);
    setTempFields(subCat.dynamicFields || []); // <-- คัดลอก Fields ปัจจุบัน
    setNewFieldName("");
    setIsSavingFields(false);
  };
  
  // [ใหม่] ปิด Modal
  const closeFieldsModal = () => {
    setEditingSubCat(null);
  };

  // [ใหม่] (ใน Modal) เพิ่ม Field ชั่วคราว
  const handleAddField = () => {
    if (newFieldName.trim() && !tempFields.includes(newFieldName.trim())) {
      setTempFields([...tempFields, newFieldName.trim()]);
      setNewFieldName("");
    }
  };
  
  // [ใหม่] (ใน Modal) ลบ Field ชั่วคราว
  const handleRemoveField = (fieldToRemove: string) => {
    setTempFields(tempFields.filter(f => f !== fieldToRemove));
  };
  
  // [ใหม่] (ใน Modal) บันทึก Fields ทั้งหมด (เรียก API)
  const handleSaveChanges = async () => {
    if (!editingSubCat) return;
    
    setIsSavingFields(true);
    try {
      const response = await api.updateDynamicFields(
        projectId, 
        editingSubCat.id, 
        tempFields // <-- ส่ง Array ใหม่
      );
      if (response.success) {
        onConfigUpdated(); // <-- Refresh ข้อมูลทั้งหมด
        closeFieldsModal();
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      alert("Error: " + (error as Error).message);
    }
    setIsSavingFields(false);
  };  

  const handleSettingChange = (field: keyof ReportSettings, value: any) => {
    setReportSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  // ========== 2. API Handlers (รวมทุก Level) ==========

  // --- Level 1: Main Category ---
  const handleAddMain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isAdding) return;
    setIsAdding(true);
    try {
      const response = await api.addMainCategory(projectId, newName.trim());
      if (response.success) {
        onConfigUpdated();
        cancelAddForm();
      } else { throw new Error(response.error); }
    } catch (error) { alert("Error: " + (error as Error).message); }
    setIsAdding(false);
  };

  const handleEditMain = async (id: string, oldName: string) => {
    const name = prompt(`แก้ไขชื่อสำหรับ "${oldName}":`, oldName);
    if (name && name.trim() && name !== oldName) {
      try {
        const response = await api.updateMainCategoryName(projectId, id, name.trim());
        if (response.success) { onConfigUpdated(); } 
        else { throw new Error(response.error); }
      } catch (error) { alert("Error: " + (error as Error).message); }
    }
  };

  const handleDeleteMain = async (id: string, name: string) => {
    if (window.confirm(`แน่ใจว่าต้องการลบ "${name}"?`)) {
      try {
        const response = await api.deleteMainCategory(projectId, id);
        if (response.success) { onConfigUpdated(); }
         else { throw new Error(response.error); }
      } catch (error) { alert("Error: " + (error as Error).message); }
    }
  };

  // --- Level 2: Sub Category ---
  const handleAddSub = async (e: React.FormEvent, mainCat: MainCategory) => {
    e.preventDefault();
    if (!newName.trim() || isAdding) return;
    setIsAdding(true);
    try {
      const response = await api.addSubCategory(
        projectId,
        mainCat.id,
        mainCat.name,
        newName.trim()
      );
      if (response.success) {
        onConfigUpdated();
        cancelAddForm();
      } else { throw new Error(response.error); }
    } catch (error) { alert("Error: " + (error as Error).message); }
    setIsAdding(false);
  };

  const handleEditSub = async (id: string, oldName: string) => {
    const name = prompt(`แก้ไขชื่อสำหรับ "${oldName}":`, oldName);
    if (name && name.trim() && name !== oldName) {
      try {
        const response = await api.updateSubCategoryName(projectId, id, name.trim());
        if (response.success) { onConfigUpdated(); }
         else { throw new Error(response.error); }
      } catch (error) { alert("Error: " + (error as Error).message); }
    }
  };

  const handleDeleteSub = async (id: string, name: string) => {
    if (window.confirm(`แน่ใจว่าต้องการลบ "${name}"?`)) {
      try {
        const response = await api.deleteSubCategory(projectId, id);
        if (response.success) { onConfigUpdated(); }
         else { throw new Error(response.error); }
      } catch (error) { alert("Error: " + (error as Error).message); }
    }
  };
  
  // --- Level 3: Topic ---
  const handleAddTopic = async (e: React.FormEvent, mainCat: MainCategory, subCat: SubCategory) => {
    e.preventDefault();
    if (!newName.trim() || isAdding) return; // 'newName' ตอนนี้คือข้อความใน Text Area
    
    // 1. [ใหม่] Parse Text Area
    const topicNames = newName.split('\n') // 1. แบ่งตามบรรทัด
      .map(line => line.trim())            // 2. ตัดช่องว่าง
      // 3. ลบตัวเลข/สัญลักษณ์นำหน้า (ตามที่คุณขอ)
      .map(line => line.replace(/^(?:\d+\.|\-|\•)\s*/, '').trim())
      .filter(line => line.length > 0);   // 4. กรองบรรทัดว่างออก
      
    if (topicNames.length === 0) {
      alert("ไม่พบชื่อหัวข้อที่ถูกต้อง กรุณาป้อนหัวข้อ (1 หัวข้อต่อ 1 บรรทัด)");
      return;
    }
      
    setIsAdding(true);
    try {
      // 2. [ใหม่] ส่ง Array ทั้งหมดไป
      const response = await api.addTopic(
        projectId,
        subCat.id,
        mainCat.name,
        subCat.name,
        topicNames // <-- ส่ง Array ที่เรา Parse แล้ว
      );
      
      if (response.success) {
        onConfigUpdated();
        cancelAddForm();
      } else { 
        throw new Error(response.error); 
      }
    } catch (error) { 
      // Error 409 (ซ้ำ) จะถูกจับที่นี่
      alert("Error: " + (error as Error).message); 
    }
    setIsAdding(false);
  };
  
  const handleEditTopic = async (id: string, oldName: string) => {
    const name = prompt(`แก้ไขชื่อสำหรับ "${oldName}":`, oldName);
    if (name && name.trim() && name !== oldName) {
      try {
        const response = await api.updateTopicName(projectId, id, name.trim());
        if (response.success) { onConfigUpdated(); }
         else { throw new Error(response.error); }
      } catch (error) { alert("Error: " + (error as Error).message); }
    }
  };

  const handleDeleteTopic = async (id: string, name: string) => {
    if (window.confirm(`แน่ใจว่าต้องการลบ "${name}"?`)) {
      try {
        const response = await api.deleteTopic(projectId, id);
        if (response.success) { onConfigUpdated(); }
         else { throw new Error(response.error); }
      } catch (error) { alert("Error: " + (error as Error).message); }
    }
  };

  const handleLogoFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = ""; // เคลียร์ input
    if (!file) return;

    // (Optional) ตรวจสอบขนาดไฟล์/ประเภทไฟล์เบื้องต้นที่นี่ได้
    if (file.size > 5 * 1024 * 1024) { // > 5MB
        alert("Error: ขนาดไฟล์ Logo ต้องไม่เกิน 5MB");
        return;
    }
    if (!file.type.startsWith('image/')) {
        alert("Error: กรุณาเลือกไฟล์รูปภาพเท่านั้น");
        return;
    }


    setIsUploadingLogo(true);
    try {
      const response = await api.uploadProjectLogo(projectId, file);
      if (response.success && response.data?.logoUrl) {
        // อัปเดต URL ใน State ทันที
        handleSettingChange('projectLogoUrl', response.data.logoUrl);
        alert('✅ อัปโหลด Logo สำเร็จ!');
      } else {
        throw new Error(response.error || 'การอัปโหลด Logo ล้มเหลว');
      }
    } catch (error) {
      alert("Error: " + (error as Error).message);
    }
    setIsUploadingLogo(false);
  };  
  
  const handleSaveReportSettings = async () => {
    if (!reportSettings) return;
    setIsSavingReportSettings(true);
    try {
      const response = await api.saveReportSettings(projectId, reportSettings);
      if (response.success) {
        alert('✅ บันทึกการตั้งค่ารายงานสำเร็จ!');
        // (เราไม่ต้องเรียก onConfigUpdated เพราะ settings นี้ไม่เกี่ยวกับ Accordion)
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      alert("Error: " + (error as Error).message);
    }
    setIsSavingReportSettings(false);
  };

  // ========== 3. Render Functions ==========

  const renderFieldsModal = () => {
    if (!editingSubCat) return null;

    return (
      <div className="admin-modal-overlay" onClick={closeFieldsModal}>
        <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
          <h3>
            จัดการ Fields (Level 4)
            <br/>
            <small>📂 {editingSubCat.name}</small>
          </h3>
          
          <p>Fields เหล่านี้จะถูกใช้ในทุกหัวข้อ (Topics) ภายใต้หมวดงานนี้</p>
          
          {/* รายการ Fields ปัจจุบัน */}
          <div className="admin-fields-list">
            {tempFields.length === 0 && <span className="empty-fields"><i>- ยังไม่มี Dynamic Fields -</i></span>}
            {tempFields.map((field) => (
              <div key={field} className="admin-field-item">
                <span>{field}</span>
                <button 
                  className="admin-button delete" 
                  onClick={() => handleRemoveField(field)}
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
          
          <hr className="admin-divider" />

          {/* ฟอร์มเพิ่ม Field ใหม่ */}
          <div className="admin-add-form" style={{marginTop: 0}}>
            <input 
              type="text" 
              placeholder="ป้อนชื่อ Field ใหม่ (เช่น ชั้น, Zone, ...)"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
            />
            <button 
              className="admin-button" 
              onClick={handleAddField}
            >
              ➕ เพิ่ม
            </button>
          </div>
          
          <hr className="admin-divider" />
          
          {/* ปุ่มควบคุม Modal */}
          <div className="admin-modal-actions">
            <button 
              className="admin-button secondary" 
              onClick={closeFieldsModal}
              disabled={isSavingFields}
            >
              ยกเลิก
            </button>
            <button 
              className="admin-button submit"
              onClick={handleSaveChanges}
              disabled={isSavingFields}
            >
              {isSavingFields ? 'กำลังบันทึก...' : '💾 บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </div>
      </div>
    );
  };  

  // ฟอร์ม "เพิ่ม" ที่ใช้ซ้ำได้
  const renderAddForm = (
    type: ActiveForm, 
    onSubmit: (e: React.FormEvent) => void, 
    placeholder: string
  ) => {
    
    // [ใหม่] ถ้าเป็น 'topic' ให้ใช้ Textarea
    const isTopicForm = type === 'topic';
    
    const inputElement = isTopicForm ? (
      <textarea
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder={placeholder} // <-- Placeholder ใหม่
        disabled={isAdding}
        autoFocus
        rows={6} // <-- กำหนดความสูง
        style={{ fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.6 }}
      />
    ) : (
      <input
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder={placeholder}
        disabled={isAdding}
        autoFocus
      />
    );

    return (
      <form onSubmit={onSubmit} className="admin-add-form">
        {inputElement}
        <button type="submit" className="admin-button submit" disabled={isAdding}>
          {isAdding ? '...' : (isTopicForm ? 'บันทึกทั้งหมด' : 'บันทึก')}
        </button>
        <button type="button" className="admin-button secondary" onClick={cancelAddForm}>
          ยกเลิก
        </button>
      </form>
    );
  };

  // ========== Main Render ==========
  return (
    <div className="report-container">
      <h1>⚙️ จัดการ Config (Accordion)</h1>
      <p className="project-name-display">โครงการ: {projectName}</p>

      <div className="report-settings-box">
        <h3>📊 ตั้งค่ารูปแบบรายงาน</h3>
        {isLoadingSettings ? (
          <p><i>กำลังโหลดการตั้งค่า...</i></p>
        ) : reportSettings ? (
          <>
            {/* --- เลือก Template --- */}
            <div className="setting-group">
              <label htmlFor={`layoutType-${projectId}`}>รูปแบบ Template:</label>
              <select
                id={`layoutType-${projectId}`}
                value={reportSettings.layoutType}
                onChange={(e) => handleSettingChange('layoutType', e.target.value)}
              >
                <option value="default">รูปแบบมาตรฐาน (ปรับแต่งได้)</option>
                {/* <option value="templateA">Template A (โครงการ X)</option> */}
              </select>
            </div>

            {/* --- ตั้งค่าสำหรับ "รูปแบบมาตรฐาน" --- */}
            {reportSettings.layoutType === 'default' && (
              <>
                <div className="setting-group">
                  <label htmlFor={`photosPerPage-${projectId}`}>จำนวนรูปต่อหน้า:</label>
                  <select
                    id={`photosPerPage-${projectId}`}
                    value={reportSettings.photosPerPage}
                    onChange={(e) => handleSettingChange('photosPerPage', parseInt(e.target.value, 10))}
                  >
                    <option value={1}>1 รูป</option>
                    <option value={2}>2 รูป</option>
                    <option value={4}>4 รูป</option>
                    <option value={6}>6 รูป</option> {/* <-- เพิ่ม 6 รูป */}
                  </select>
                </div>

                {/* --- [ลบ] Checkboxes --- */}

                <div className="setting-group">
                  <label htmlFor={`customHeader-${projectId}`}>ข้อความ Header (ไม่บังคับ):</label>
                  <input
                    id={`customHeader-${projectId}`}
                    type="text"
                    value={reportSettings.customHeaderText}
                    onChange={(e) => handleSettingChange('customHeaderText', e.target.value)}
                    placeholder="เช่น ชื่อบริษัท, เลขที่เอกสาร"
                  />
                </div>

                <div className="setting-group">
                  <label htmlFor={`customFooter-${projectId}`}>ข้อความ Footer (ไม่บังคับ):</label>
                  <input
                    id={`customFooter-${projectId}`}
                    type="text"
                    value={reportSettings.customFooterText}
                    onChange={(e) => handleSettingChange('customFooterText', e.target.value)}
                    placeholder="เช่น หมายเหตุ, ผู้ตรวจสอบ"
                  />
                </div>
              </>
            )}

            {/* --- [ใหม่] ส่วนจัดการ Logo --- */}
            <hr className="admin-divider" style={{ margin: '25px 0' }}/>
            <h4>🖼️ Logo โครงการ</h4>
            <div className="setting-group">
              <label htmlFor={`logoUrl-${projectId}`}>URL ของ Logo (ถ้ามี):</label>
              <input
                id={`logoUrl-${projectId}`}
                type="text"
                value={reportSettings.projectLogoUrl}
                onChange={(e) => handleSettingChange('projectLogoUrl', e.target.value)}
                placeholder="วาง URL ของรูป Logo ที่นี่ หรือ อัปโหลดด้านล่าง"
              />
              {/* แสดงตัวอย่าง Logo */}
              {reportSettings.projectLogoUrl && (
                <div className="logo-preview">
                  <img src={reportSettings.projectLogoUrl} alt="Project Logo Preview" onError={(e) => (e.currentTarget.style.display = 'none')} onLoad={(e) => (e.currentTarget.style.display = 'block')} /> {/* Handle broken links */}
                </div>
              )}
            </div>
            {/* ปุ่ม Upload */}
            <div className="setting-group">
                <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }} // ซ่อน input จริง
                    ref={logoInputRef}
                    onChange={handleLogoFileSelected}
                />
                <button
                    className={`admin-button ${isUploadingLogo ? 'secondary' : ''}`}
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    style={{ minWidth: '150px'}}
                >
                    {isUploadingLogo ? 'กำลังอัปโหลด...' : '⬆️ อัปโหลด Logo ใหม่'}
                </button>
                 <span style={{ marginLeft: '10px', fontSize: '0.85em', color: '#666'}}>
                     (ไฟล์รูปภาพเท่านั้น, ขนาดไม่เกิน 5MB)
                 </span>
            </div>
            {/* --- จบส่วน Logo --- */}

            {/* --- ปุ่มบันทึก --- */}
            <div style={{ textAlign: 'right', marginTop: '30px' }}>
              <button
                className="admin-button submit"
                onClick={handleSaveReportSettings}
                disabled={isSavingReportSettings || isUploadingLogo}
              >
                {isSavingReportSettings ? 'กำลังบันทึก...' : '💾 บันทึกการตั้งค่ารายงานทั้งหมด'}
              </button>
            </div>
          </>
        ) : (
          <p style={{ color: 'red' }}><i>ไม่สามารถโหลดการตั้งค่าได้</i></p>
        )}
      </div>

      {renderFieldsModal()}
      <div className="admin-accordion">
        
        {/* Level 1 Map */}
        {projectConfig?.map((mainCat) => (
          <div key={mainCat.id} className="admin-item level1">
            {/* L1 Item Header */}
            <div className="admin-item-header">
              <span className="admin-item-name" onClick={() => toggleExpand(mainCat.id)}>
                {expandedItems[mainCat.id] ? '📂' : '📁'} {mainCat.name}
              </span>
              <div className="admin-item-actions">
                <button 
                  className="admin-button edit"
                  onClick={() => handleEditMain(mainCat.id, mainCat.name)}
                >✏️ แก้ไข</button>
                <button 
                  className="admin-button delete"
                  onClick={() => handleDeleteMain(mainCat.id, mainCat.name)}
                >🗑️ ลบ</button>
              </div>
            </div>
            
            {/* L1 Expanded Content (L2 List) */}
            {expandedItems[mainCat.id] && (
              <div className="admin-item-content">
                
                {/* Level 2 Map */}
                {mainCat.subCategories.map((subCat) => (
                  <div key={subCat.id} className="admin-item level2">
                    {/* L2 Item Header */}
                    <div className="admin-item-header">
                      <span className="admin-item-name" onClick={() => toggleExpand(subCat.id)}>
                        {expandedItems[subCat.id] ? '📄' : '📄'} {subCat.name}
                      </span>
                      <div className="admin-item-actions">
                        {/* นี่คือปุ่ม Level 4 ที่ถูกต้อง! */}
                        <button 
                          className="admin-button manage"
                          onClick={() => openFieldsModal(subCat)} // <-- [แก้ไข] เปิด Modal
                        >➡️ Fields</button>
                        <button 
                          className="admin-button edit"
                          onClick={() => handleEditSub(subCat.id, subCat.name)}
                        >✏️ แก้ไข</button>
                        <button 
                          className="admin-button delete"
                          onClick={() => handleDeleteSub(subCat.id, subCat.name)}
                        >🗑️ ลบ</button>
                      </div>
                    </div>
                    
                    {/* L2 Expanded Content (L3 List) */}
                    {expandedItems[subCat.id] && (
                      <div className="admin-item-content">
                        
                        {/* Level 3 Map */}
                        {subCat.topics.map((topic) => (
                          <div key={topic.id} className="admin-item level3">
                            {/* L3 Item Header */}
                            <div className="admin-item-header">
                              <span className="admin-item-name">
                                • {topic.name}
                              </span>
                              <div className="admin-item-actions">
                                <button 
                                  className="admin-button edit"
                                  onClick={() => handleEditTopic(topic.id, topic.name)}
                                >✏️ แก้ไข</button>
                                <button 
                                  className="admin-button delete"
                                  onClick={() => handleDeleteTopic(topic.id, topic.name)}
                                >🗑️ ลบ</button>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* L3 Add Form/Button */}
                        {activeForm === 'topic' ? (
                          renderAddForm('topic', (e) => handleAddTopic(e, mainCat, subCat), 'วางรายการหัวข้อ (1 หัวข้อ ต่อ 1 บรรทัด)...')
                        ) : (
                          <button 
                            className="admin-button add-new" 
                            onClick={() => showAddForm('topic')}
                          >➕ เพิ่มหัวข้อใหม่</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                {/* L2 Add Form/Button */}
                {activeForm === 'sub' ? (
                  // 1. ถ้าฟอร์ม Sub เปิดอยู่ -> แสดงฟอร์ม Sub (เหมือนเดิม)
                  renderAddForm('sub', (e) => handleAddSub(e, mainCat), 'ป้อนชื่อหมวดงานย่อยใหม่...')
                ) : (
                  // 2. ถ้าไม่มีฟอร์มไหนเปิดอยู่ (activeForm === null)
                  //    และ! ไม่มี SubCategory ไหนเลยใน Main นี้ ที่ถูกขยายอยู่ (!mainCat.subCategories.some(...))
                  //    -> ถึงจะแสดงปุ่ม "เพิ่ม Sub"
                  activeForm === null && !mainCat.subCategories.some(subCat => expandedItems[subCat.id]) && (
                    <button 
                      className="admin-button add-new" 
                      onClick={() => showAddForm('sub')}
                    >➕ เพิ่มหมวดงานย่อยใหม่</button>
                  )
                  // 3. กรณีอื่นๆ (เช่น ฟอร์ม Topic เปิดอยู่ หรือ มี L3 ขยายอยู่) -> ไม่ต้องแสดงอะไรเลย (null)
                )}
              </div>
            )}
          </div>
        ))}
        
        {/* L1 Add Form/Button */}
        <hr className="admin-divider" />
        {activeForm === 'main' ? (
          renderAddForm('main', handleAddMain, 'ป้อนชื่อหมวดงานหลักใหม่...')
        ) : (
          <button 
            className="admin-button add-new" 
            onClick={() => showAddForm('main')}
          >➕ เพิ่มหมวดงานหลักใหม่</button>
        )}
      </div>

    </div>
  );
};

export default AdminConfig;