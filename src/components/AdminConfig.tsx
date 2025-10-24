// Filename: src/components/AdminConfig.tsx (V11 - Separate UI + V3 Logic)

import React, { useState, useEffect, useRef } from 'react';
import { 
  api, 
  ProjectConfig, 
  MainCategory, 
  SubCategory, 
  Topic,
  ReportSettings // <-- [V11] Import Interface ใหม่
} from '../utils/api';
import './AdminAccordion.css'; 

interface AdminConfigProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
  onConfigUpdated: () => void;
}

type ActiveForm = 
  | 'main'
  | 'sub'
  | 'topic'
  | null;

// ✅ [ใหม่ V11] สร้าง Default Settings ที่ถูกต้อง
const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  layoutType: 'default',
  qcPhotosPerPage: 6,
  dailyPhotosPerPage: 2,
  projectLogoUrl: '',
};

const AdminConfig: React.FC<AdminConfigProps> = ({ 
  projectId, 
  projectName, 
  projectConfig,
  onConfigUpdated
}) => {
  
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
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

  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ✅ [แก้ไข V11] Load Report Settings (ปรับปรุงการ Merge)
  useEffect(() => {
    const loadSettings = async () => {
      if (!projectId) return;
      setIsLoadingSettings(true);
      const response = await api.getReportSettings(projectId);
      
      // (ใช้ Data ที่ได้ หรือ Default จาก api.ts)
      const settingsData = response.data || DEFAULT_REPORT_SETTINGS;
      
      // [ใหม่] Merge ค่าที่ดึงได้ ทับ ค่า Default
      setReportSettings({ ...DEFAULT_REPORT_SETTINGS, ...settingsData });
        
      if(!response.success) {
         console.error("Failed to load report settings:", response.error);
      }
      setIsLoadingSettings(false);
    };
    loadSettings();
  }, [projectId]);

  // ========== 1. Helper Functions (V3) ==========

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const showAddForm = (type: ActiveForm) => {
    setActiveForm(type); setNewName(""); setIsAdding(false);
  };
  
  const cancelAddForm = () => {
    setActiveForm(null); setNewName(""); setIsAdding(false);
  };

  const openFieldsModal = (subCat: SubCategory) => {
    setEditingSubCat(subCat);
    setTempFields(subCat.dynamicFields || []);
    setNewFieldName(""); setIsSavingFields(false);
  };
  
  const closeFieldsModal = () => {
    setEditingSubCat(null);
  };

  const handleAddField = () => {
    if (newFieldName.trim() && !tempFields.includes(newFieldName.trim())) {
      setTempFields([...tempFields, newFieldName.trim()]);
      setNewFieldName("");
    }
  };
  
  const handleRemoveField = (fieldToRemove: string) => {
    setTempFields(tempFields.filter(f => f !== fieldToRemove));
  };
  
  // ✅ [คืนค่า V3]
  const handleSaveChanges = async () => {
    if (!editingSubCat) return;
    
    setIsSavingFields(true);
    try {
      // (ใช้ api.ts V11)
      const response = await api.updateDynamicFields(
        projectId, 
        editingSubCat.id, 
        tempFields
      );
      if (response.success) {
        onConfigUpdated();
        closeFieldsModal();
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      alert("Error: " + (error as Error).message);
    }
    setIsSavingFields(false);
  };  

  // [แก้ไข V11]
  const handleSettingChange = (field: keyof ReportSettings, value: any) => {
    setReportSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  // ========== 2. API Handlers (V3) ==========

  // ✅ [คืนค่า V3]
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

  // ✅ [คืนค่า V3]
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

  // ✅ [คืนค่า V3]
  const handleDeleteMain = async (id: string, name: string) => {
    if (window.confirm(`แน่ใจว่าต้องการลบ "${name}"?`)) {
      try {
        const response = await api.deleteMainCategory(projectId, id);
        if (response.success) { onConfigUpdated(); }
         else { throw new Error(response.error); }
      } catch (error) { alert("Error: " + (error as Error).message); }
    }
  };

  // ✅ [คืนค่า V3]
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

  // ✅ [คืนค่า V3]
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

  // ✅ [คืนค่า V3]
  const handleDeleteSub = async (id: string, name: string) => {
    if (window.confirm(`แน่ใจว่าต้องการลบ "${name}"?`)) {
      try {
        const response = await api.deleteSubCategory(projectId, id);
        if (response.success) { onConfigUpdated(); }
         else { throw new Error(response.error); }
      } catch (error) { alert("Error: " + (error as Error).message); }
    }
  };
  
  // ✅ [คืนค่า V3]
  const handleAddTopic = async (e: React.FormEvent, mainCat: MainCategory, subCat: SubCategory) => {
    e.preventDefault();
    if (!newName.trim() || isAdding) return;
    
    const topicNames = newName.split('\n')
      .map(line => line.trim())
      .map(line => line.replace(/^(?:\d+\.|\-|\•)\s*/, '').trim())
      .filter(line => line.length > 0);   
      
    if (topicNames.length === 0) {
      alert("ไม่พบชื่อหัวข้อที่ถูกต้อง กรุณาป้อนหัวข้อ (1 หัวข้อต่อ 1 บรรทัด)");
      return;
    }
      
    setIsAdding(true);
    try {
      const response = await api.addTopic(
        projectId,
        subCat.id,
        mainCat.name,
        subCat.name,
        topicNames
      );
      
      if (response.success) {
        onConfigUpdated();
        cancelAddForm();
      } else { 
        throw new Error(response.error); 
      }
    } catch (error) { 
      alert("Error: " + (error as Error).message); 
    }
    setIsAdding(false);
  };
  
  // ✅ [คืนค่า V3]
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

  // ✅ [คืนค่า V3]
  const handleDeleteTopic = async (id: string, name: string) => {
    if (window.confirm(`แน่ใจว่าต้องการลบ "${name}"?`)) {
      try {
        const response = await api.deleteTopic(projectId, id);
        if (response.success) { onConfigUpdated(); }
         else { throw new Error(response.error); }
      } catch (error) { alert("Error: " + (error as Error).message); }
    }
  };

  // ✅ [คืนค่า V3] (Logic เดิม)
  const handleLogoFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = "";
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("Error: ขนาดไฟล์ Logo ต้องไม่เกิน 5MB"); return;
    }
    if (!file.type.startsWith('image/')) {
        alert("Error: กรุณาเลือกไฟล์รูปภาพเท่านั้น"); return;
    }

    setIsUploadingLogo(true);
    try {
      // (ใช้ api.ts V11)
      const response = await api.uploadProjectLogo(projectId, file);
      if (response.success && response.data?.logoUrl) {
        handleSettingChange('projectLogoUrl', response.data.logoUrl);
        alert('✅ อัปโหลด Logo สำเร็จ! (อย่าลืมกดบันทึก Settings)');
      } else {
        throw new Error(response.error || 'การอัปโหลด Logo ล้มเหลว');
      }
    } catch (error) {
      alert("Error: " + (error as Error).message);
    }
    setIsUploadingLogo(false);
  };  
  
  // ✅ [คืนค่า V3] (Logic เดิม)
  const handleSaveReportSettings = async () => {
    if (!reportSettings) return;
    setIsSavingReportSettings(true);
    try {
      const response = await api.saveReportSettings(projectId, reportSettings);
      if (response.success) {
        alert('✅ บันทึกการตั้งค่ารายงานสำเร็จ!');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      alert("Error: " + (error as Error).message);
    }
    setIsSavingReportSettings(false);
  };

  // ========== 3. Render Functions (V3) ==========

  // ✅ [คืนค่า V3]
  const renderFieldsModal = () => {
    if (!editingSubCat) return null;
    return (
      <div className="admin-modal-overlay" onClick={closeFieldsModal}>
        <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
          <h3>
            จัดการ Fields (Level 4) <br/>
            <small>📂 {editingSubCat.name}</small>
          </h3>
          <p>Fields เหล่านี้จะถูกใช้ในทุกหัวข้อ (Topics) ภายใต้หมวดงานนี้</p>
          <div className="admin-fields-list">
            {tempFields.length === 0 && <span className="empty-fields"><i>- ยังไม่มี Dynamic Fields -</i></span>}
            {tempFields.map((field) => (
              <div key={field} className="admin-field-item">
                <span>{field}</span>
                <button className="admin-button delete" onClick={() => handleRemoveField(field)}>ลบ</button>
              </div>
            ))}
          </div>
          <hr className="admin-divider" />
          <div className="admin-add-form" style={{marginTop: 0}}>
            <input type="text" placeholder="ป้อนชื่อ Field ใหม่ (เช่น ชั้น, Zone, ...)" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} />
            <button className="admin-button" onClick={handleAddField}>➕ เพิ่ม</button>
          </div>
          <hr className="admin-divider" />
          <div className="admin-modal-actions">
            <button className="admin-button secondary" onClick={closeFieldsModal} disabled={isSavingFields}>ยกเลิก</button>
            <button className="admin-button submit" onClick={handleSaveChanges} disabled={isSavingFields}>
              {isSavingFields ? 'กำลังบันทึก...' : '💾 บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </div>
      </div>
    );
  };  

  // ✅ [คืนค่า V3]
  const renderAddForm = (
    type: ActiveForm, 
    onSubmit: (e: React.FormEvent) => void, 
    placeholder: string
  ) => {
    const isTopicForm = type === 'topic';
    const inputElement = isTopicForm ? (
      <textarea
        value={newName} onChange={(e) => setNewName(e.target.value)}
        placeholder={placeholder} disabled={isAdding} autoFocus rows={6}
        style={{ fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.6 }}
      />
    ) : (
      <input
        type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
        placeholder={placeholder} disabled={isAdding} autoFocus
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

      {/* ✅ [แก้ไข V11] UI ส่วน Settings */}
      <div className="report-settings-box">
        <h3>📊 ตั้งค่ารูปแบบรายงาน</h3>
        {isLoadingSettings ? (
          <p><i>กำลังโหลดการตั้งค่า...</i></p>
        ) : reportSettings ? (
          <>
            <div className="setting-group">
              <label htmlFor={`layoutType-${projectId}`}>รูปแบบ Template:</label>
              <select
                id={`layoutType-${projectId}`}
                value={reportSettings.layoutType}
                onChange={(e) => handleSettingChange('layoutType', e.target.value)}
              >
                <option value="default">รูปแบบมาตรฐาน (Grid 2 คอลัมน์)</option>
              </select>
            </div>

            {reportSettings.layoutType === 'default' && (
              <>
                {/* ✅ [ใหม่ V11] แยก Dropdown */}
                <hr className="admin-divider" style={{ margin: '20px 0' }}/>
                
                <h4>ตั้งค่า QC Report (แบบตาราง)</h4>
                <div className="setting-group">
                  <label htmlFor={`qcPhotosPerPage-${projectId}`}>จำนวนรูป QC ต่อหน้า:</label>
                  <select
                    id={`qcPhotosPerPage-${projectId}`}
                    value={reportSettings.qcPhotosPerPage}
                    onChange={(e) => handleSettingChange('qcPhotosPerPage', parseInt(e.target.value, 10))}
                  >
                    <option value={1}>1 รูป</option>
                    <option value={2}>2 รูป</option>
                    <option value={4}>4 รูป</option>
                    <option value={6}>6 รูป</option>
                  </select>
                </div>
                
                <hr className="admin-divider" style={{ margin: '20px 0' }}/>
                
                <h4>ตั้งค่า Daily Report (แบบตาราง)</h4>
                <div className="setting-group">
                  <label htmlFor={`dailyPhotosPerPage-${projectId}`}>จำนวนรูป Daily ต่อหน้า:</label>
                  <select
                    id={`dailyPhotosPerPage-${projectId}`}
                    value={reportSettings.dailyPhotosPerPage}
                    onChange={(e) => handleSettingChange('dailyPhotosPerPage', parseInt(e.target.value, 10))}
                  >
                    <option value={1}>1 รูป</option>
                    <option value={2}>2 รูป</option>
                    <option value={4}>4 รูป</option>
                    <option value={6}>6 รูป</option>
                  </select>
                </div>
              </>
            )}

            {/* --- ส่วนจัดการ Logo (เหมือนเดิม V3) --- */}
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
              {reportSettings.projectLogoUrl && (
                <div className="logo-preview">
                  <img src={reportSettings.projectLogoUrl} alt="Project Logo Preview" onError={(e) => (e.currentTarget.style.display = 'none')} onLoad={(e) => (e.currentTarget.style.display = 'block')} />
                </div>
              )}
            </div>
            <div className="setting-group">
                <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
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
            
            {/* --- ปุ่มบันทึก (เหมือนเดิม V3) --- */}
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

      {/* --- Accordion (V3) --- */}
      {renderFieldsModal()}
      <div className="admin-accordion">
        
        {projectConfig?.map((mainCat) => (
          <div key={mainCat.id} className="admin-item level1">
            <div className="admin-item-header">
              <span className="admin-item-name" onClick={() => toggleExpand(mainCat.id)}>
                {expandedItems[mainCat.id] ? '📂' : '📁'} {mainCat.name}
              </span>
              <div className="admin-item-actions">
                <button className="admin-button edit" onClick={() => handleEditMain(mainCat.id, mainCat.name)}>✏️ แก้ไข</button>
                <button className="admin-button delete" onClick={() => handleDeleteMain(mainCat.id, mainCat.name)}>🗑️ ลบ</button>
              </div>
            </div>
            
            {expandedItems[mainCat.id] && (
              <div className="admin-item-content">
                
                {mainCat.subCategories.map((subCat) => (
                  <div key={subCat.id} className="admin-item level2">
                    <div className="admin-item-header">
                      <span className="admin-item-name" onClick={() => toggleExpand(subCat.id)}>
                        {expandedItems[subCat.id] ? '📄' : '📄'} {subCat.name}
                      </span>
                      <div className="admin-item-actions">
                        <button className="admin-button manage" onClick={() => openFieldsModal(subCat)}>➡️ Fields</button>
                        <button className="admin-button edit" onClick={() => handleEditSub(subCat.id, subCat.name)}>✏️ แก้ไข</button>
                        <button className="admin-button delete" onClick={() => handleDeleteSub(subCat.id, subCat.name)}>🗑️ ลบ</button>
                      </div>
                    </div>
                    
                    {expandedItems[subCat.id] && (
                      <div className="admin-item-content">
                        
                        {subCat.topics.map((topic) => (
                          <div key={topic.id} className="admin-item level3">
                            <div className="admin-item-header">
                              <span className="admin-item-name">• {topic.name}</span>
                              <div className="admin-item-actions">
                                <button className="admin-button edit" onClick={() => handleEditTopic(topic.id, topic.name)}>✏️ แก้ไข</button>
                                <button className="admin-button delete" onClick={() => handleDeleteTopic(topic.id, topic.name)}>🗑️ ลบ</button>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {activeForm === 'topic' ? (
                          renderAddForm('topic', (e) => handleAddTopic(e, mainCat, subCat), 'วางรายการหัวข้อ (1 หัวข้อ ต่อ 1 บรรทัด)...')
                        ) : (
                          <button className="admin-button add-new" onClick={() => showAddForm('topic')}>➕ เพิ่มหัวข้อใหม่</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                {activeForm === 'sub' ? (
                  renderAddForm('sub', (e) => handleAddSub(e, mainCat), 'ป้อนชื่อหมวดงานย่อยใหม่...')
                ) : (
                  activeForm === null && !mainCat.subCategories.some(subCat => expandedItems[subCat.id]) && (
                    <button className="admin-button add-new" onClick={() => showAddForm('sub')}>➕ เพิ่มหมวดงานย่อยใหม่</button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
        
        <hr className="admin-divider" />
        {activeForm === 'main' ? (
          renderAddForm('main', handleAddMain, 'ป้อนชื่อหมวดงานหลักใหม่...')
        ) : (
          <button className="admin-button add-new" onClick={() => showAddForm('main')}>➕ เพิ่มหมวดงานหลักใหม่</button>
        )}
      </div>

    </div>
  );
};

export default AdminConfig;