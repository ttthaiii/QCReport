// Filename: src/components/AdminConfig.tsx (V3 - Accordion UI)

import React, { useState } from 'react';
// 1. Import ทุกอย่างที่เราต้องการ
import { 
  api, 
  ProjectConfig, 
  MainCategory, 
  SubCategory, 
  Topic 
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
    if (!newName.trim() || isAdding) return;
    setIsAdding(true);
    try {
      const response = await api.addTopic(
        projectId,
        subCat.id,
        mainCat.name,
        subCat.name,
        newName.trim()
      );
      if (response.success) {
        onConfigUpdated();
        cancelAddForm();
      } else { throw new Error(response.error); }
    } catch (error) { alert("Error: " + (error as Error).message); }
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
  ) => (
    <form onSubmit={onSubmit} className="admin-add-form">
      <input
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder={placeholder}
        disabled={isAdding}
        autoFocus
      />
      <button type="submit" className="admin-button submit" disabled={isAdding}>
        {isAdding ? '...' : 'บันทึก'}
      </button>
      <button type="button" className="admin-button secondary" onClick={cancelAddForm}>
        ยกเลิก
      </button>
    </form>
  );

  // ========== Main Render ==========
  return (
    <div className="report-container">
      <h1>⚙️ จัดการ Config (Accordion)</h1>
      <p className="project-name-display">โครงการ: {projectName}</p>
      
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
                          renderAddForm('topic', (e) => handleAddTopic(e, mainCat, subCat), 'ป้อนชื่อหัวข้อใหม่...')
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
                  renderAddForm('sub', (e) => handleAddSub(e, mainCat), 'ป้อนชื่อหมวดงานย่อยใหม่...')
                ) : (
                  <button 
                    className="admin-button add-new" 
                    onClick={() => showAddForm('sub')}
                  >➕ เพิ่มหมวดงานย่อยใหม่</button>
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