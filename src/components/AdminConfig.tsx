// Filename: src/components/AdminConfig.tsx (REFACTORED for CSS Modules)

import React, { useState, useEffect, useRef } from 'react';
import { 
  api, 
  ProjectConfig, 
  MainCategory, 
  SubCategory, 
  Topic,
  ReportSettings 
} from '../utils/api';
// [แก้ไข] 1. เปลี่ยนวิธี Import CSS
import styles from './AdminConfig.module.css'; 

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
  
  // (State ทั้งหมดเหมือนเดิม)
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

  // (useEffect และ Helper Functions ทั้งหมดเหมือนเดิม)
  useEffect(() => {
    const loadSettings = async () => {
      if (!projectId) return;
      setIsLoadingSettings(true);
      const response = await api.getReportSettings(projectId);
      const settingsData = response.data || DEFAULT_REPORT_SETTINGS;
      setReportSettings({ ...DEFAULT_REPORT_SETTINGS, ...settingsData });
      if(!response.success) {
         console.error("Failed to load report settings:", response.error);
      }
      setIsLoadingSettings(false);
    };
    loadSettings();
  }, [projectId]);

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
  const handleSaveChanges = async () => {
    if (!editingSubCat) return;
    setIsSavingFields(true);
    try {
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
  const handleSettingChange = (field: keyof ReportSettings, value: any) => {
    setReportSettings(prev => prev ? { ...prev, [field]: value } : null);
  };
  
  // (API Handlers ทั้งหมดเหมือนเดิม)
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
  const handleAddSub = async (e: React.FormEvent, mainCat: MainCategory) => {
    e.preventDefault();
    if (!newName.trim() || isAdding) return;
    setIsAdding(true);
    try {
      const response = await api.addSubCategory(
        projectId, mainCat.id, mainCat.name, newName.trim()
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
        projectId, subCat.id, mainCat.name, subCat.name, topicNames
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
    if (event.target) event.target.value = ""; 
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        alert("Error: ขนาดไฟล์ Logo ต้องไม่เกิน 5MB"); return;
    }
    if (!file.type.startsWith('image/')) {
        alert("Error: กรุณาเลือกไฟล์รูปภาพเท่านั้น"); return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64String = e.target?.result as string;
      if (!base64String) {
        alert("Error: ไม่สามารถอ่านไฟล์ได้");
        return;
      }
      setIsUploadingLogo(true);
      try {
        const response = await api.uploadProjectLogo(projectId, base64String);
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
    reader.readAsDataURL(file);
  };
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
  
  // --- Render Functions (มีการแก้ไข className) ---

  // [แก้ไข] 2. เปลี่ยน className ทั้งหมด
  const renderFieldsModal = () => {
    if (!editingSubCat) return null;
    return (
      <div className={styles.adminModalOverlay} onClick={closeFieldsModal}>
        <div className={styles.adminModalContent} onClick={(e) => e.stopPropagation()}>
          <h3>
            จัดการ Fields (Level 4) <br/>
            <small>📂 {editingSubCat.name}</small>
          </h3>
          <p>Fields เหล่านี้จะถูกใช้ในทุกหัวข้อ (Topics) ภายใต้หมวดงานนี้</p>
          <div className={styles.adminFieldsList}>
            {tempFields.length === 0 && <span className={styles.emptyFields}><i>- ยังไม่มี Dynamic Fields -</i></span>}
            {tempFields.map((field) => (
              <div key={field} className={styles.adminFieldItem}>
                <span>{field}</span>
                <button className={`${styles.adminButton} ${styles.delete}`} onClick={() => handleRemoveField(field)}>ลบ</button>
              </div>
            ))}
          </div>
          <hr className={styles.adminDivider} />
          <div className={styles.adminAddForm} style={{marginTop: 0}}>
            <input type="text" placeholder="ป้อนชื่อ Field ใหม่ (เช่น ชั้น, Zone, ...)" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} />
            <button className={styles.adminButton} onClick={handleAddField}>➕ เพิ่ม</button>
          </div>
          <hr className={styles.adminDivider} />
          <div className={styles.adminModalActions}>
            <button className={`${styles.adminButton} ${styles.secondary}`} onClick={closeFieldsModal} disabled={isSavingFields}>ยกเลิก</button>
            <button className={`${styles.adminButton} ${styles.submit}`} onClick={handleSaveChanges} disabled={isSavingFields}>
              {isSavingFields ? 'กำลังบันทึก...' : '💾 บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </div>
      </div>
    );
  };  

  // [แก้ไข] 3. เปลี่ยน className ทั้งหมด
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
      <form onSubmit={onSubmit} className={styles.adminAddForm}>
        {inputElement}
        <button type="submit" className={`${styles.adminButton} ${styles.submit}`} disabled={isAdding}>
          {isAdding ? '...' : (isTopicForm ? 'บันทึกทั้งหมด' : 'บันทึก')}
        </button>
        <button type="button" className={`${styles.adminButton} ${styles.secondary}`} onClick={cancelAddForm}>
          ยกเลิก
        </button>
      </form>
    );
  };

  // ========== Main Render (มีการแก้ไข className) ==========
  return (
    // [แก้ไข] 4. เปลี่ยน className ทั้งหมด
    <div className={styles.reportContainer}>
      <h1>⚙️ จัดการ Config (Accordion)</h1>
      <p className={styles.projectNameDisplay}>โครงการ: {projectName}</p>

      <div className={styles.reportSettingsBox}>
        <h3>📊 ตั้งค่ารูปแบบรายงาน</h3>
        {isLoadingSettings ? (
          <p><i>กำลังโหลดการตั้งค่า...</i></p>
        ) : reportSettings ? (
          <>
            <div className={styles.settingGroup}>
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
                <hr className={styles.adminDivider} style={{ margin: '20px 0' }}/>
                
                <h4>ตั้งค่า QC Report (แบบตาราง)</h4>
                <div className={styles.settingGroup}>
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
                
                <hr className={styles.adminDivider} style={{ margin: '20px 0' }}/>
                
                <h4>ตั้งค่า Daily Report (แบบตาราง)</h4>
                <div className={styles.settingGroup}>
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

            <hr className={styles.adminDivider} style={{ margin: '25px 0' }}/>
            <h4>🖼️ Logo โครงการ</h4>
            <div className={styles.settingGroup}>
              <label htmlFor={`logoUrl-${projectId}`}>URL ของ Logo (ถ้ามี):</label>
              <input
                id={`logoUrl-${projectId}`}
                type="text"
                value={reportSettings.projectLogoUrl}
                onChange={(e) => handleSettingChange('projectLogoUrl', e.target.value)}
                placeholder="วาง URL ของรูป Logo ที่นี่ หรือ อัปโหลดด้านล่าง"
              />
              {reportSettings.projectLogoUrl && (
                <div className={styles.logoPreview}>
                  <img src={reportSettings.projectLogoUrl} alt="Project Logo Preview" onError={(e) => (e.currentTarget.style.display = 'none')} onLoad={(e) => (e.currentTarget.style.display = 'block')} />
                </div>
              )}
            </div>
            <div className={styles.settingGroup}>
                <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    ref={logoInputRef}
                    onChange={handleLogoFileSelected}
                />
                <button
                    className={`${styles.adminButton} ${isUploadingLogo ? styles.secondary : ''}`}
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
            
            <div style={{ textAlign: 'right', marginTop: '30px' }}>
              <button
                className={`${styles.adminButton} ${styles.submit}`}
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

      {/* --- Accordion --- */}
      {renderFieldsModal()}
      <div className={styles.adminAccordion}>
        
        {projectConfig?.map((mainCat) => (
          <div key={mainCat.id} className={`${styles.adminItem} ${styles.level1}`}>
            <div className={styles.adminItemHeader}>
              <span className={styles.adminItemName} onClick={() => toggleExpand(mainCat.id)}>
                {expandedItems[mainCat.id] ? '📂' : '📁'} {mainCat.name}
              </span>
              <div className={styles.adminItemActions}>
                <button className={`${styles.adminButton} ${styles.edit}`} onClick={() => handleEditMain(mainCat.id, mainCat.name)}>✏️ แก้ไข</button>
                <button className={`${styles.adminButton} ${styles.delete}`} onClick={() => handleDeleteMain(mainCat.id, mainCat.name)}>🗑️ ลบ</button>
              </div>
            </div>
            
            {expandedItems[mainCat.id] && (
              <div className={styles.adminItemContent}>
                
                {mainCat.subCategories.map((subCat) => (
                  <div key={subCat.id} className={`${styles.adminItem} ${styles.level2}`}>
                    <div className={styles.adminItemHeader}>
                      <span className={styles.adminItemName} onClick={() => toggleExpand(subCat.id)}>
                        {expandedItems[subCat.id] ? '📄' : '📄'} {subCat.name}
                      </span>
                      <div className={styles.adminItemActions}>
                        <button className={`${styles.adminButton} ${styles.manage}`} onClick={() => openFieldsModal(subCat)}>➡️ Fields</button>
                        <button className={`${styles.adminButton} ${styles.edit}`} onClick={() => handleEditSub(subCat.id, subCat.name)}>✏️ แก้ไข</button>
                        <button className={`${styles.adminButton} ${styles.delete}`} onClick={() => handleDeleteSub(subCat.id, subCat.name)}>🗑️ ลบ</button>
                      </div>
                    </div>
                    
                    {expandedItems[subCat.id] && (
                      <div className={styles.adminItemContent}>
                        
                        {subCat.topics.map((topic) => (
                          <div key={topic.id} className={`${styles.adminItem} ${styles.level3}`}>
                            <div className={styles.adminItemHeader}>
                              <span className={styles.adminItemName}>• {topic.name}</span>
                              <div className={styles.adminItemActions}>
                                <button className={`${styles.adminButton} ${styles.edit}`} onClick={() => handleEditTopic(topic.id, topic.name)}>✏️ แก้ไข</button>
                                <button className={`${styles.adminButton} ${styles.delete}`} onClick={() => handleDeleteTopic(topic.id, topic.name)}>🗑️ ลบ</button>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {activeForm === 'topic' ? (
                          renderAddForm('topic', (e) => handleAddTopic(e, mainCat, subCat), 'วางรายการหัวข้อ (1 หัวข้อ ต่อ 1 บรรทัด)...')
                        ) : (
                          <button className={`${styles.adminButton} ${styles.addNew}`} onClick={() => showAddForm('topic')}>➕ เพิ่มหัวข้อใหม่</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                {activeForm === 'sub' ? (
                  renderAddForm('sub', (e) => handleAddSub(e, mainCat), 'ป้อนชื่อหมวดงานย่อยใหม่...')
                ) : (
                  activeForm === null && !mainCat.subCategories.some(subCat => expandedItems[subCat.id]) && (
                    <button className={`${styles.adminButton} ${styles.addNew}`} onClick={() => showAddForm('sub')}>➕ เพิ่มหมวดงานย่อยใหม่</button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
        
        <hr className={styles.adminDivider} />
        {activeForm === 'main' ? (
          renderAddForm('main', handleAddMain, 'ป้อนชื่อหมวดงานหลักใหม่...')
        ) : (
          <button className={`${styles.adminButton} ${styles.addNew}`} onClick={() => showAddForm('main')}>➕ เพิ่มหมวดงานหลักใหม่</button>
        )}
      </div>

    </div>
  );
};

export default AdminConfig;