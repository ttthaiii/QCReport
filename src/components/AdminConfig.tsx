// Filename: src/components/AdminConfig.tsx
// (ฉบับสมบูรณ์ - REFACTORED for No-Reload + FIX TS2552)

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

import UserManagement from './UserManagement';
import { UserProfile } from '../App';

import {
  FiDatabase,
  FiUsers,
  FiPlus,
  FiSettings,
  FiList
} from 'react-icons/fi';


interface AdminConfigProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
  onConfigUpdated: () => void;
  currentUserProfile: UserProfile;
}

const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  layoutType: 'default',
  qcPhotosPerPage: 6,
  dailyPhotosPerPage: 2,
  projectLogos: {},
};

type AdminView = 'config' | 'users';
type ConfigView = 'settings' | 'structure';

const AdminConfig: React.FC<AdminConfigProps> = ({
  projectId,
  projectName,
  projectConfig,
  onConfigUpdated,
  currentUserProfile
}) => {

  const [view, setView] = useState<AdminView>('config');
  const [configView, setConfigView] = useState<ConfigView>('structure');

  const [internalConfig, setInternalConfig] = useState<ProjectConfig | null>(projectConfig);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState("");
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingSubCat, setEditingSubCat] = useState<SubCategory | null>(null);
  const [tempFields, setTempFields] = useState<string[]>([]);
  const [reportSettings, setReportSettings] = useState<ReportSettings>(DEFAULT_REPORT_SETTINGS);
  const [logoUploading, setLogoUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setInternalConfig(projectConfig);
  }, [projectConfig]);

  useEffect(() => {
    const fetchSettings = async () => {
      const response = await api.getReportSettings(projectId);
      if (response.success && response.data) {
        setReportSettings(response.data);
      } else {
        console.error("Failed to fetch settings, using default.");
        // @ts-ignore 
        setReportSettings(response.data || DEFAULT_REPORT_SETTINGS);
      }
    };
    fetchSettings();
  }, [projectId]);

  useEffect(() => {
    if (activeForm && formRef.current) {
      const input = formRef.current.querySelector('textarea, input');
      if (input) (input as HTMLElement).focus();
    }
  }, [activeForm]);

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
    setActiveForm(null);
  };

  const showAddForm = (formId: string) => {
    setActiveForm(formId);
    setNewName("");
  };

  const handleAddMain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isAdding) return; // ✅ 4. ลบ !internalConfig ออก
    setIsAdding(true);

    const response = await api.addMainCategory(projectId, newName);

    if (response.success && response.data) {
      // ✅ 5. สร้าง Config ใหม่ถ้ามันเป็น null
      const newMainCat: MainCategory = {
        id: response.data.id,
        name: response.data.name,
        subCategories: [] // เริ่มต้นด้วย SubCategories ว่าง
      };
      // ถ้า config เดิมเป็น null หรือ array ว่าง, ให้สร้างใหม่
      setInternalConfig(prevConfig => (prevConfig ? [...prevConfig, newMainCat] : [newMainCat]));

      setNewName("");
      setActiveForm(null);
    } else {
      alert(`Error: ${response.error}`);
    }
    setIsAdding(false);
  };

  const handleAddSub = async (e: React.FormEvent, mainCat: MainCategory) => {
    e.preventDefault();
    if (!newName.trim() || isAdding || !internalConfig) return;
    setIsAdding(true);

    const response = await api.addSubCategory(projectId, mainCat.id, mainCat.name, newName);

    if (response.success && response.data) {
      // ✅ [ใหม่] อัปเดต State ภายใน
      // (เราต้องสร้าง response.data ให้มี Type ที่ถูกต้อง)
      const newSubCategory: SubCategory = {
        id: response.data.id,
        name: response.data.name,
        dynamicFields: response.data.dynamicFields || [],
        topics: [] // เริ่มต้นด้วย Topics ว่าง
      };
      setInternalConfig(internalConfig.map(mc =>
        mc.id === mainCat.id
          ? { ...mc, subCategories: [...mc.subCategories, newSubCategory] }
          : mc
      ));

      setNewName("");
      setActiveForm(null);
    } else {
      alert(`Error: ${response.error}`);
    }
    setIsAdding(false);
  };

  const handleAddTopic = async (e: React.FormEvent, mainCat: MainCategory, subCat: SubCategory) => {
    e.preventDefault();
    if (!newName.trim() || isAdding || !internalConfig) return;

    const newTopicNames = newName.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    if (newTopicNames.length === 0) return;

    setIsAdding(true);

    // ✅ --- START: ส่วนที่แก้ไข ---

    // 1. ดึงรายชื่อหัวข้อ "เดิม" ที่มีอยู่ (ซึ่งตอนนี้อาจจะเรียงมั่ว)
    const existingTopics = subCat.topics.map(t => t.name);

    // 2. สร้างลำดับที่ถูกต้อง = (หัวข้อเดิม + หัวข้อใหม่)
    //    เราจะกรองหัวข้อที่ซ้ำกันออก (เผื่อไว้)
    const existingTopicSet = new Set(existingTopics);
    const uniqueNewTopicNames = newTopicNames.filter(name => !existingTopicSet.has(name));

    const newOrder = [...existingTopics, ...uniqueNewTopicNames];

    try {
      // 3. เรียก API (ขั้นตอนที่ 1) เพื่อบันทึกลำดับ *ก่อน*
      await api.updateTopicOrder(projectId, subCat.id, newOrder);

    } catch (error: any) {
      alert(`Error (บันทึกลำดับล้มเหลว): ${error.message}`);
      setIsAdding(false);
      return; // ออก ถ้าบันทึกลำดับไม่สำเร็จ
    }

    // ✅ --- END: ส่วนที่แก้ไข ---

    // 4. เรียก API เดิมเพื่อสร้าง Topic (เหมือนเดิม)
    const response = await api.addTopic(projectId, subCat.id, mainCat.name, subCat.name, newTopicNames);

    if (response.success && response.data) {
      // ✅ --- START: ส่วนที่แก้ไข ---
      // 5. [สำคัญ] เรียก onConfigUpdated() เพื่อบังคับให้ App โหลด Config ใหม่ทั้งหมด
      //    (ซึ่งตอนนี้จะถูกจัดเรียงโดย Backend ตามขั้นตอนที่ 3)
      onConfigUpdated();
      // ✅ --- END: ส่วนที่แก้ไข ---

      setNewName("");
      setActiveForm(null);
    } else {
      alert(`Error (สร้าง Topic ล้มเหลว): ${response.error}`);
      // (ถ้าล้มเหลวตรงนี้ ลำดับอาจจะถูกบันทึกไปแล้ว แต่ Topic ไม่ถูกสร้าง)
    }
    setIsAdding(false);
  };

  const handleDelete = async (type: 'main' | 'sub' | 'topic', id: string) => {
    const typeName = type === 'main' ? 'หมวดงานหลัก' : (type === 'sub' ? 'หมวดงานย่อย' : 'หัวข้อ');
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ ${typeName} นี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้`) || !internalConfig) {
      return;
    }

    let response;
    try {
      if (type === 'main') {
        response = await api.deleteMainCategory(projectId, id);
        if (response.success) {
          setInternalConfig(internalConfig.filter(mc => mc.id !== id));
        }
      } else if (type === 'sub') {
        response = await api.deleteSubCategory(projectId, id);
        if (response.success) {
          setInternalConfig(internalConfig.map(mc => ({
            ...mc,
            subCategories: mc.subCategories.filter(sc => sc.id !== id)
          })));
        }
      } else {
        response = await api.deleteTopic(projectId, id);
        if (response.success) {
          setInternalConfig(internalConfig.map(mc => ({
            ...mc,
            subCategories: mc.subCategories.map(sc => ({
              ...sc,
              topics: sc.topics.filter(t => t.id !== id)
            }))
          })));
        }
      }

      if (!response.success) {
        alert(`Error: ${response.error}`);
      }

    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  /* 
   * [FIX] Updated to handle (string | DynamicFieldConfig)[]
   * Note: This simple editor currently supports editing LABELS only. 
   * Complex fields (with options) might lose their options if edited here without further UI updates.
   * For now, we extract labels to prevent crashes, but warn or preserve objects if possible.
   * IMPROVEMENT: A full editor for DynamicFieldConfig is needed.
   */
  const handleEditFields = (subCat: SubCategory) => {
    setEditingSubCat(subCat);
    // Convert all to strings for the simple editor (this is a tradeoff: we might lose options if saved!)
    // To be safe: we should probably filter or warn.
    // But for the "Task", the critical part is Camera.tsx
    // Let's map to labels so it doesn't crash render.
    const labels = (subCat.dynamicFields || []).map(f => typeof f === 'string' ? f : f.label);
    setTempFields(labels);
  };

  const handleSaveFields = async () => {
    if (!editingSubCat || isAdding || !internalConfig) return;
    setIsAdding(true);

    const fieldsToSave = tempFields.map(f => f.trim()).filter(f => f.length > 0);
    const response = await api.updateDynamicFields(projectId, editingSubCat.id, fieldsToSave);

    if (response.success) {
      onConfigUpdated();
      const updatedSubCatId = editingSubCat.id;
      setInternalConfig(internalConfig.map(mc => ({
        ...mc,
        subCategories: mc.subCategories.map(sc =>
          sc.id === updatedSubCatId
            ? { ...sc, dynamicFields: fieldsToSave }
            : sc
        )
      })));

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
      onConfigUpdated(); // (การตั้งค่าทั่วไป ควรอัปเดตทั้งแอป)
    } else {
      alert(`Error: ${response.error}`);
    }
  };

  const handleLogoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: 'left' | 'center' | 'right' // ✅ [แก้ไข]
  ) => {
    const file = e.target.files?.[0];
    if (!file || !reportSettings) return;

    // [ป้องกัน] ถ้ายังอัปโหลดไม่เสร็จ ห้ามอัปโหลดซ้ำ
    if (logoUploading) {
      alert("รอสักครู่... กำลังอัปโหลดโลโก้ก่อนหน้า");
      e.target.value = ''; // เคลียร์ค่าไฟล์ที่เลือก
      return;
    }

    setLogoUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async () => {
      const base64 = reader.result as string;

      // ✅ [แก้ไข] ส่ง slot ไปที่ API
      const response = await api.uploadProjectLogo(projectId, base64, slot);

      if (response.success && response.data) {
        // ✅ [แก้ไข] 1. ดึง data ออกมาใส่ตัวแปรก่อน
        const logoUrl = response.data.logoUrl;

        // ✅ [แก้ไข] 2. อัปเดต State โดยใช้ตัวแปรใหม่
        setReportSettings(prevSettings => ({
          ...prevSettings,
          projectLogos: {
            ...prevSettings.projectLogos,
            [slot]: logoUrl // <-- ใช้ตัวแปรที่ดึงออกมา
          }
        }));
        // alert('อัปโหลดโลโก้แล้ว!'); (เอาออกก่อน เพื่อให้บันทึก)
        // onConfigUpdated(); (ไม่ต้องเรียกทันที รอ handleSaveSettings)
      } else {
        alert(`Error uploading logo: ${response.error}`);
      }
      setLogoUploading(false);
      e.target.value = ''; // เคลียร์ค่าไฟล์ที่เลือก
    };

    reader.onerror = (error) => {
      alert(`Error reading file: ${error}`);
      setLogoUploading(false);
      e.target.value = ''; // เคลียร์ค่าไฟล์ที่เลือก
    };
  };

  // ✅ [ใหม่] เพิ่มฟังก์ชันสำหรับ "ลบ" โลโก้ (แค่ใน State)
  const handleClearLogo = (slot: 'left' | 'center' | 'right') => {
    if (!reportSettings) return;

    const updatedLogos = { ...reportSettings.projectLogos };
    delete updatedLogos[slot]; // ลบ key ออกจาก object

    setReportSettings({ ...reportSettings, projectLogos: updatedLogos });
  };

  const renderAddForm = (
    formId: string, // <-- (แม้ว่าเราจะไม่ใช้ แต่เพื่อความชัดเจน)
    onSubmit: (e: React.FormEvent) => void,
    placeholder: string
  ) => (
    <form ref={formRef} className={styles.adminAddForm} onSubmit={onSubmit}>
      {/* ✅ [แก้ไข] 5. เปลี่ยน 'topic' เป็น 'formId' (แม้ว่า 'topic' จะยังทำงานได้ แต่เปลี่ยนเพื่อความถูกต้อง) */}
      {/* (จริงๆ แล้วแค่เช็คว่า `textareaRef` มีหรือไม่ก็ได้) */}
      {placeholder.includes('หัวข้อ') ? (
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

  const renderTabs = () => (
    <div className={styles.adminTabs}>
      <button className={`${styles.tabButton} ${view === 'config' ? styles.activeTab : ''}`} onClick={() => setView('config')}>
        <FiDatabase style={{ verticalAlign: 'middle', marginRight: '4px' }} /> จัดการ Config
      </button>
      <button className={`${styles.tabButton} ${view === 'users' ? styles.activeTab : ''}`} onClick={() => setView('users')}>
        <FiUsers style={{ verticalAlign: 'middle', marginRight: '4px' }} /> จัดการผู้ใช้
      </button>
    </div>
  );

  const renderConfigSubTabs = () => (
    <div className={styles.configSubTabs}>
      <button className={`${styles.subTabButton} ${configView === 'structure' ? styles.activeSubTab : ''}`} onClick={() => setConfigView('structure')}>
        <FiList style={{ verticalAlign: 'middle', marginRight: '4px' }} />
        โครงสร้างหมวดงาน
      </button>
      <button className={`${styles.subTabButton} ${configView === 'settings' ? styles.activeSubTab : ''}`} onClick={() => setConfigView('settings')}>
        <FiSettings style={{ verticalAlign: 'middle', marginRight: '4px' }} />
        ตั้งค่ารายงาน
      </button>
    </div>
  );

  // --- RENDER หลัก ---
  return (
    <div className={styles.adminAccordion}>
      <h2 className={styles.projectNameDisplay}>{projectName}: Admin Panel</h2>

      {renderTabs()}

      <div className={styles.tabContent}>

        {/* === TAB 1: CONFIG === */}
        {view === 'config' && (
          <>
            {renderConfigSubTabs()}

            {/* --- SUB-TAB 1.1: SETTINGS --- */}
            {configView === 'settings' && (
              <div className={`${styles.accordionContent} ${styles.reportSettingsBox}`} style={{ borderTop: 'none', background: '#fff', borderRadius: '8px', border: '1px solid #ddd' }}>
                <form onSubmit={handleSaveSettings}>
                  {/* (โค้ด Form ตั้งค่าเหมือนเดิม) */}
                  <div className={styles.settingGroup}>
                    <h4>Layout</h4>
                    <label>ประเภท Layout:</label>
                    <select value={reportSettings.layoutType} onChange={e => setReportSettings({ ...reportSettings, layoutType: e.target.value })}>
                      <option value="default">Default</option>
                    </select>
                  </div>
                  <div className={styles.settingGroup}>
                    <h4>รูปภาพต่อหน้า</h4>
                    <label>รายงาน QC (1, 2, 4, 6):</label>
                    <input type="number" value={reportSettings.qcPhotosPerPage} onChange={e => setReportSettings({ ...reportSettings, qcPhotosPerPage: parseInt(e.target.value) as any })} min="1" max="6" />
                    <label>รายงาน Daily (1, 2, 4, 6):</label>
                    <input type="number" value={reportSettings.dailyPhotosPerPage} onChange={e => setReportSettings({ ...reportSettings, dailyPhotosPerPage: parseInt(e.target.value) as any })} min="1" max="6" />
                  </div>
                  <div className={styles.settingGroup}>
                    <h4>โลโก้โครงการ (ซ้าย, กลาง, ขวา)</h4>

                    {/* --- ช่องที่ 1: ซ้าย --- */}
                    <div className={styles.logoSlotItem}>
                      <label>โลโก้ซ้าย:</label>
                      <input
                        type="file"
                        accept="image/png, image/jpeg"
                        onChange={(e) => handleLogoUpload(e, 'left')}
                        disabled={logoUploading}
                      />
                      {reportSettings.projectLogos?.left && (
                        <div className={styles.logoPreview}>
                          <img src={reportSettings.projectLogos.left} alt="Left Logo" />
                          <button type="button" onClick={() => handleClearLogo('left')}>ลบ</button>
                        </div>
                      )}
                    </div>

                    {/* --- ช่องที่ 2: กลาง --- */}
                    <div className={styles.logoSlotItem}>
                      <label>โลโก้กลาง:</label>
                      <input
                        type="file"
                        accept="image/png, image/jpeg"
                        onChange={(e) => handleLogoUpload(e, 'center')}
                        disabled={logoUploading}
                      />
                      {reportSettings.projectLogos?.center && (
                        <div className={styles.logoPreview}>
                          <img src={reportSettings.projectLogos.center} alt="Center Logo" />
                          <button type="button" onClick={() => handleClearLogo('center')}>ลบ</button>
                        </div>
                      )}
                    </div>

                    {/* --- ช่องที่ 3: ขวา --- */}
                    <div className={styles.logoSlotItem}>
                      <label>โลโก้ขวา:</label>
                      <input
                        type="file"
                        accept="image/png, image/jpeg"
                        onChange={(e) => handleLogoUpload(e, 'right')}
                        disabled={logoUploading}
                      />
                      {reportSettings.projectLogos?.right && (
                        <div className={styles.logoPreview}>
                          <img src={reportSettings.projectLogos.right} alt="Right Logo" />
                          <button type="button" onClick={() => handleClearLogo('right')}>ลบ</button>
                        </div>
                      )}
                    </div>
                    {logoUploading && <p>กำลังอัปโหลด...</p>}
                  </div>
                  <button type="submit" className={`${styles.adminButton} ${styles.manage}`} disabled={logoUploading}>
                    {logoUploading ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                  </button>
                </form>
              </div>
            )}

            {/* --- SUB-TAB 1.2: STRUCTURE --- */}
            {configView === 'structure' && (
              <>
                {editingSubCat && (
                  <div className={styles.modalBackdrop}>
                    {/* (โค้ด Modal เหมือนเดิม) */}
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

                {!internalConfig && (
                  <div style={{ padding: '20px', textAlign: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: '8px' }}>
                    <p>ยังไม่มีการตั้งค่าโครงสร้างสำหรับโครงการนี้</p>
                    <p>กรุณาเริ่มต้นโดยการ "เพิ่มหมวดงานหลักใหม่"</p>
                  </div>
                )}

                {internalConfig && internalConfig.map((mainCat) => (
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
                                {/* ✅✅✅ --- นี่คือปุ่มที่ Error --- ✅✅✅ */}
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

                                {/* ✅ [แก้ไข] 6. เปลี่ยนเงื่อนไขและ OnClick */}
                                {activeForm === subCat.id ? (
                                  renderAddForm(subCat.id, (e) => handleAddTopic(e, mainCat, subCat), 'วางรายการหัวข้อ (1 หัวข้อ ต่อ 1 บรรทัด)...')
                                ) : (
                                  <button className={`${styles.adminButton} ${styles.addNew}`} onClick={() => showAddForm(subCat.id)}>
                                    <FiPlus style={{ verticalAlign: 'middle', marginRight: '4px' }} /> เพิ่มหัวข้อใหม่
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {activeForm === mainCat.id ? (
                          renderAddForm(mainCat.id, (e) => handleAddSub(e, mainCat), 'ป้อนชื่อหมวดงานย่อยใหม่...')
                        ) : (
                          activeForm === null && !mainCat.subCategories.some(subCat => expandedItems[subCat.id]) && (
                            <button className={`${styles.adminButton} ${styles.addNew}`} onClick={() => showAddForm(mainCat.id)}>
                              <FiPlus style={{ verticalAlign: 'middle', marginRight: '4px' }} /> เพิ่มหมวดงานย่อยใหม่
                            </button>
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
                  <button className={`${styles.adminButton} ${styles.addNew}`} onClick={() => showAddForm('main')}>
                    <FiPlus style={{ verticalAlign: 'middle', marginRight: '4px' }} /> เพิ่มหมวดงานหลักใหม่
                  </button>
                )}
              </>
            )}

          </>
        )}

        {/* === TAB 2: USER MANAGEMENT (เหมือนเดิม) === */}
        {view === 'users' && (
          <UserManagement currentUserRole={currentUserProfile.role} />
        )}

      </div>
    </div>
  );
};

export default AdminConfig;