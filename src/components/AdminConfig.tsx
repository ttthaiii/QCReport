// Filename: src/components/AdminConfig.tsx
// (ฉบับสมบูรณ์ - ภาษาไทย + ตั้งค่ารายงานแบบเปิด-ปิด)

import React, { useState, useEffect, useRef } from 'react';
import { 
  api, 
  ProjectConfig, 
  MainCategory, 
  SubCategory, 
  Topic,
  ReportSettings 
} from '../utils/api';
import styles from './AdminConfig.module.css'; 

// [ใหม่] 1. Import Component ใหม่ และ Type จาก App.tsx
import UserManagement from './UserManagement';
// (คุณต้องไป export 'interface UserProfile' ใน App.tsx)
import { UserProfile } from '../App'; 

interface AdminConfigProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
  onConfigUpdated: () => void;
  currentUserProfile: UserProfile; // [ใหม่] เพิ่ม Prop นี้
}

// (Type เดิมของคุณ)
type ActiveForm = 
  | 'main'
  | 'sub'
  | 'topic'
  | null;

// (โค้ดเดิมของคุณ)
const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  layoutType: 'default',
  qcPhotosPerPage: 6,
  dailyPhotosPerPage: 2,
  projectLogoUrl: '',
};

// [ใหม่] 2. State สำหรับสลับ Tab
type AdminView = 'config' | 'users';

const AdminConfig: React.FC<AdminConfigProps> = ({ 
  projectId, 
  projectName, 
  projectConfig,
  onConfigUpdated,
  currentUserProfile // [ใหม่] รับ Prop นี้
}) => {
  
  // [ใหม่] 3. State สำหรับ Tab
  const [view, setView] = useState<AdminView>('config');

  // --- ( Logic เดิมทั้งหมดจาก AdminConfig.tsx ของคุณ ) ---
  //
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState("");
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingSubCat, setEditingSubCat] = useState<SubCategory | null>(null);
  const [tempFields, setTempFields] = useState<string[]>([]);
  const [reportSettings, setReportSettings] = useState<ReportSettings>(DEFAULT_REPORT_SETTINGS);
  const [logoUploading, setLogoUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // (โค้ดเดิม)
  useEffect(() => {
    // (Logic เดิม)
  }, [projectConfig]);

  // (โค้ดเดิม)
  useEffect(() => {
    const fetchSettings = async () => {
      const response = await api.getReportSettings(projectId);
      if (response.success && response.data) {
        setReportSettings(response.data);
      } else {
        console.error("Failed to fetch settings, using default.");
        // @ts-ignore (ใน api.ts, data: DEFAULT_REPORT_SETTINGS ถูกส่งมาตอน error)
        setReportSettings(response.data || DEFAULT_REPORT_SETTINGS);
      }
    };
    fetchSettings();
  }, [projectId]);

  // (โค้ดเดิม)
  useEffect(() => {
    if (activeForm && formRef.current) {
      const input = formRef.current.querySelector('textarea, input');
      if (input) (input as HTMLElement).focus();
    }
  }, [activeForm]);

  // --- (ฟังก์ชันเดิมทั้งหมดของคุณ: toggleExpand, showAddForm, handle... ) ---
  //
  
  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
    setActiveForm(null); // ปิดฟอร์มเมื่อสลับ
  };

  const showAddForm = (formType: ActiveForm) => {
    setActiveForm(formType);
    setNewName("");
  };

  const handleAddMain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isAdding) return;
    setIsAdding(true);
    const response = await api.addMainCategory(projectId, newName);
    if (response.success) {
      onConfigUpdated();
      setNewName("");
      setActiveForm(null);
    } else {
      alert(`Error: ${response.error}`);
    }
    setIsAdding(false);
  };

  const handleAddSub = async (e: React.FormEvent, mainCat: MainCategory) => {
    e.preventDefault();
    if (!newName.trim() || isAdding) return;
    setIsAdding(true);
    const response = await api.addSubCategory(projectId, mainCat.id, mainCat.name, newName);
     if (response.success) {
      onConfigUpdated();
      setNewName("");
      setActiveForm(null);
    } else {
      alert(`Error: ${response.error}`);
    }
    setIsAdding(false);
  };
  
  const handleAddTopic = async (e: React.FormEvent, mainCat: MainCategory, subCat: SubCategory) => {
    e.preventDefault();
    if (!newName.trim() || isAdding) return;
    
    // (ใช้ \n ตามโค้ดเดิมของคุณ)
    const newTopicNames = newName.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    if (newTopicNames.length === 0) return;

    setIsAdding(true);
    const response = await api.addTopic(projectId, subCat.id, mainCat.name, subCat.name, newTopicNames);
    if (response.success) {
      onConfigUpdated();
      setNewName("");
      setActiveForm(null);
    } else {
      alert(`Error: ${response.error}`);
    }
    setIsAdding(false);
  };

  const handleDelete = async (type: 'main' | 'sub' | 'topic', id: string) => {
    const typeName = type === 'main' ? 'หมวดงานหลัก' : (type === 'sub' ? 'หมวดงานย่อย' : 'หัวข้อ');
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ ${typeName} นี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้`)) {
      return;
    }
    
    let response;
    try {
      if (type === 'main') {
        response = await api.deleteMainCategory(projectId, id);
      } else if (type === 'sub') {
        response = await api.deleteSubCategory(projectId, id);
      } else {
        response = await api.deleteTopic(projectId, id);
      }
      
      if (response.success) {
        onConfigUpdated();
      } else {
        alert(`Error: ${response.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleEditFields = (subCat: SubCategory) => {
    setEditingSubCat(subCat);
    setTempFields(subCat.dynamicFields || []);
  };

  const handleSaveFields = async () => {
    if (!editingSubCat || isAdding) return;
    setIsAdding(true);
    // (ใช้ \n ตามโค้ดเดิมของคุณ)
    const fieldsToSave = tempFields.map(f => f.trim()).filter(f => f.length > 0);
    const response = await api.updateDynamicFields(projectId, editingSubCat.id, fieldsToSave);
    if (response.success) {
      onConfigUpdated();
      setEditingSubCat(null);
    } else {
      alert(`Error: ${response.error}`);
    }
    setIsAdding(false);
  };
  
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportSettings) return;
    const response = await api.saveReportSettings(projectId, reportSettings);
    if (response.success) {
      alert('บันทึกการตั้งค่ารายงานแล้ว!');
    } else {
      alert(`Error: ${response.error}`);
    }
  };
  
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !reportSettings) return;

    setLogoUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = reader.result as string;
      const response = await api.uploadProjectLogo(projectId, base64);
      if (response.success && response.data) {
        setReportSettings({ ...reportSettings, projectLogoUrl: response.data.logoUrl });
        alert('อัปโหลดโลโก้แล้ว!');
      } else {
        alert(`Error uploading logo: ${response.error}`);
      }
      setLogoUploading(false);
    };
    reader.onerror = (error) => {
      alert(`Error reading file: ${error}`);
      setLogoUploading(false);
    };
  };

  // (renderAddForm เดิมของคุณ)
  const renderAddForm = (
    formType: ActiveForm, 
    onSubmit: (e: React.FormEvent) => void,
    placeholder: string
  ) => (
    <form ref={formRef} className={styles.adminAddForm} onSubmit={onSubmit}>
      {formType === 'topic' ? (
        <textarea
          ref={textareaRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={placeholder}
          rows={5}
          disabled={isAdding}
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
      )}
      <div className={styles.formActions}>
        <button type="submit" className={`${styles.adminButton} ${styles.submit}`} disabled={isAdding}>
          {isAdding ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <button type="button" className={`${styles.adminButton} ${styles.secondary}`} onClick={() => setActiveForm(null)} disabled={isAdding}>
          ยกเลิก
        </button>
      </div>
    </form>
  );

  // --- ( จบส่วน Logic เดิม ) ---


  // [ใหม่] 4. Function สำหรับ Render Tabs
  const renderTabs = () => (
    <div className={styles.adminTabs}>
      <button 
        className={`${styles.tabButton} ${view === 'config' ? styles.activeTab : ''}`}
        onClick={() => setView('config')}
      >
        🏗️ จัดการ Config โครงการ
      </button>
      <button 
        className={`${styles.tabButton} ${view === 'users' ? styles.activeTab : ''}`}
        onClick={() => setView('users')}
      >
        👥 จัดการผู้ใช้ (Users)
      </button>
    </div>
  );

  // --- RENDER หลัก ---
  return (
    // (ใช้ Root .adminAccordion เดิมของคุณ)
    <div className={styles.adminAccordion}> 
      <h2 className={styles.projectNameDisplay}>{projectName}: Admin Panel</h2>
      
      {/* [ใหม่] 5. แสดง Tabs ที่นี่ */}
      {renderTabs()}

      {/* [ใหม่] 6. สลับการแสดงผลตาม Tab ที่เลือก */}
      <div className={styles.tabContent}>

        {/* === TAB 1: CONFIG (โค้ด JSX เดิมของคุณ) === */}
        {view === 'config' && (
          <>
            {/* (โค้ด JSX เดิมทั้งหมดจาก AdminConfig.tsx) */}
            {/* */}

            {/* [แก้ไข] 7. ย้าย Report Settings มาอยู่ใน Accordion Item */}
            <div className={styles.accordionItem}>
              <div className={styles.accordionHeader} onClick={() => toggleExpand('reportSettings')}>
                <span>{expandedItems['reportSettings'] ? '▼' : '►'} ตั้งค่ารายงาน (Report Settings)</span>
              </div>
              {expandedItems['reportSettings'] && (
                <div className={`${styles.accordionContent} ${styles.reportSettingsBox}`}> 
                  {/* (ใช้ class เดิมเพื่อให้ style บางส่วนยังทำงาน) */}
                  <form onSubmit={handleSaveSettings}>
                    <div className={styles.settingGroup}>
                      <h4>Layout</h4>
                      <label>ประเภท Layout:</label>
                      <select value={reportSettings.layoutType} onChange={e => setReportSettings({...reportSettings, layoutType: e.target.value})}>
                        <option value="default">Default</option>
                      </select>
                    </div>
                    <div className={styles.settingGroup}>
                      <h4>รูปภาพต่อหน้า</h4>
                      <label>รายงาน QC (1, 2, 4, 6):</label>
                      <input
                        type="number"
                        value={reportSettings.qcPhotosPerPage}
                        onChange={e => setReportSettings({...reportSettings, qcPhotosPerPage: parseInt(e.target.value) as any})}
                        min="1" max="6"
                      />
                      <label>รายงาน Daily (1, 2, 4, 6):</label>
                      <input
                        type="number"
                        value={reportSettings.dailyPhotosPerPage}
                        onChange={e => setReportSettings({...reportSettings, dailyPhotosPerPage: parseInt(e.target.value) as any})}
                        min="1" max="6"
                      />
                    </div>
                    <div className={styles.settingGroup}>
                      <h4>โลโก้โครงการ</h4>
                      <input type="file" accept="image/png, image/jpeg" onChange={handleLogoUpload} />
                      {logoUploading && <p>กำลังอัปโหลด...</p>}
                      {reportSettings.projectLogoUrl && (
                        <div className={styles.logoPreview}>
                          <img src={reportSettings.projectLogoUrl} alt="Project Logo" style={{ display: 'block' }} />
                        </div>
                      )}
                    </div>
                    <button type="submit" className={`${styles.adminButton} ${styles.manage}`} disabled={logoUploading}>
                      {logoUploading ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                    </button>
                  </form>
                </div>
              )}
            </div>
            {/* [แก้ไข] 7. จบส่วน Report Settings */}


            {editingSubCat && (
              <div className={styles.modalBackdrop}>
                <div className={styles.modalContent}>
                  <h3>แก้ไข Dynamic Fields สำหรับ {editingSubCat.name}</h3>
                  <p>ป้อนชื่อ Field (1 ชื่อ ต่อ 1 บรรทัด)</p>
                  <textarea
                    rows={5}
                    value={tempFields.join('\n')}
                    onChange={(e) => setTempFields(e.target.value.split('\n'))}
                  />
                  <div className={styles.formActions}>
                    <button className={`${styles.adminButton} ${styles.submit}`} onClick={handleSaveFields} disabled={isAdding}>
                      {isAdding ? 'กำลังบันทึก...' : 'บันทึก Fields'}
                    </button>
                    <button className={`${styles.adminButton} ${styles.secondary}`} onClick={() => setEditingSubCat(null)} disabled={isAdding}>
                      ยกเลิก
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {!projectConfig && <p>Loading config...</p>}

            {projectConfig && projectConfig.map((mainCat) => (
              <div key={mainCat.id} className={styles.accordionItem}>
                <div className={styles.accordionHeader} onClick={() => toggleExpand(mainCat.id)}>
                  <span>{expandedItems[mainCat.id] ? '▼' : '►'} {mainCat.name}</span>
                  <button className={`${styles.adminButton} ${styles.delete}`} onClick={(e) => { e.stopPropagation(); handleDelete('main', mainCat.id); }}>ลบ</button>
                </div>
                {expandedItems[mainCat.id] && (
                  <div className={styles.accordionContent}>
                    {mainCat.subCategories.map((subCat) => (
                      <div key={subCat.id} className={styles.accordionItem}>
                        
                        <div className={styles.accordionHeader} onClick={() => toggleExpand(subCat.id)}>
                          <span>{expandedItems[subCat.id] ? '▽' : '▷'} {subCat.name}</span>
                          <div>
                            <button className={`${styles.adminButton} ${styles.edit}`} onClick={(e) => { e.stopPropagation(); handleEditFields(subCat); }}>Fields</button>
                            <button className={`${styles.adminButton} ${styles.delete}`} onClick={(e) => { e.stopPropagation(); handleDelete('sub', subCat.id); }}>ลบ</button>
                          </div>
                        </div>

                        {expandedItems[subCat.id] && (
                          <div className={styles.accordionContent}>
                            {subCat.topics.map((topic) => (
                              <div key={topic.id} className={styles.topicItem}>
                                <span>{topic.name}</span>
                                <button className={`${styles.adminButton} ${styles.delete}`} onClick={(e) => { e.stopPropagation(); handleDelete('topic', topic.id); }}>ลบ</button>
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
          </>
        )}
        
        {/* === TAB 2: USER MANAGEMENT (ของใหม่) === */}
        {view === 'users' && (
          <UserManagement currentUserRole={currentUserProfile.role} />
        )}

      </div>
    </div>
  );
};

export default AdminConfig;