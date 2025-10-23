import React, { useState } from 'react';
// ดึง Type มาจาก api.ts
import { ProjectConfig } from '../utils/api'; 
// เราจะใช้ CSS จาก App.css และ Reports.tsx มาประยุกต์ใช้

interface AdminConfigProps {
  projectId: string;
  projectName: string;
  projectConfig: ProjectConfig | null;
  onConfigUpdated: () => void; // ฟังก์ชันสำหรับ Refresh
}

// State สำหรับการนำทางในหน้านี้ (เผื่ออนาคต)
type AdminView = 
  | { view: 'mainCategories' }
  // | { view: 'subCategories', mainCategory: string } 
  // | { view: 'topics', mainCategory: string, subCategory: string };
  // (เราจะเพิ่ม subCategories และ topics ในสเต็ปถัดไป)

const AdminConfig: React.FC<AdminConfigProps> = ({ 
  projectId, 
  projectName, 
  projectConfig,
  onConfigUpdated
}) => {
  
  // State สำหรับการนำทางในหน้านี้
  const [adminView, setAdminView] = useState<AdminView>({ view: 'mainCategories' });
  
  // State สำหรับฟอร์ม "เพิ่มใหม่"
  const [newMainCategory, setNewMainCategory] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  
  // ดึงข้อมูลหมวดงานหลักจาก Prop
  const mainCategories = projectConfig ? Object.keys(projectConfig) : [];

  // ========== ฟังก์ชันสำหรับจัดการ (ยังไม่เชื่อม API) ==========

  const handleAddMainCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMainCategory.trim()) return;
    
    setIsAdding(true);
    alert(`(ยังไม่เชื่อมต่อ API) กำลังเพิ่ม: ${newMainCategory}\nสำหรับ ProjectID: ${projectId}`);
    
    // TODO: ขั้นต่อไป เราจะเรียก API ที่นี่
    // try {
    //   await api.addMainCategory(projectId, newMainCategory);
    //   setNewMainCategory("");
    //   onConfigUpdated(); // สั่งให้ App.tsx โหลด config ใหม่
    // } catch (error) {
    //   alert("เกิดข้อผิดพลาด: " + (error as Error).message);
    // }
    
    setIsAdding(false);
  };
  
  const handleEditMainCategory = (oldName: string) => {
    // หมายเหตุ: การแก้ไขชื่อซับซ้อน (ตามที่เราคุยกัน)
    // เพราะชื่อคือ Key ของ Object
    // ในการใช้งานจริง เราอาจต้องใช้ Document ID แทน
    alert('ฟังก์ชัน "แก้ไขชื่อ" ยังไม่เปิดใช้งาน\n(จำเป็นต้องปรับโครงสร้าง Firestore เพื่อให้แก้ไขได้ง่าย)');
    // const newName = prompt(`แก้ไขชื่อสำหรับ "${oldName}":`, oldName);
    // if (newName && newName.trim() && newName !== oldName) {
    //    alert(`(ยังไม่เชื่อมต่อ API) กำลังเปลี่ยน ${oldName} -> ${newName}`);
    // }
  };

  const handleDeleteMainCategory = (name: string) => {
    if (window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${name}"?\n(คำเตือน: การดำเนินการนี้จะลบหมวดย่อยและหัวข้อทั้งหมดที่อยู่ภายใต้มันด้วย!)`)) {
       alert(`(ยังไม่เชื่อมต่อ API) กำลังลบ: ${name}`);
       // TODO: ขั้นต่อไป เราจะเรียก API ที่นี่
    }
  };

  // ========== UI Rendering ==========

  const renderMainCategories = () => (
    <div className="report-form-box">
      <h3 style={{ marginTop: 0 }}>📂 หมวดงานหลัก (Main Categories)</h3>
      
      {/* --- รายการที่มีอยู่ --- */}
      <ul className="admin-list">
        {mainCategories.length === 0 && <li className="admin-list-item">- ไม่มีหมวดงานหลัก -</li>}
        
        {mainCategories.map((mainName) => (
          <li key={mainName} className="admin-list-item">
            <span className="admin-list-item-name">{mainName}</span>
            <div className="admin-list-item-actions">
              <button 
                className="admin-button edit"
                onClick={() => handleEditMainCategory(mainName)}
              >
                ✏️ แก้ไข
              </button>
              <button 
                className="admin-button manage"
                onClick={() => alert('TODO: ไปยังหน้าหมวดย่อย')}
                // onClick={() => setAdminView({ view: 'subCategories', mainCategory: mainName })}
              >
                ➡️ จัดการ
              </button>
              <button 
                className="admin-button delete"
                onClick={() => handleDeleteMainCategory(mainName)}
              >
                🗑️ ลบ
              </button>
            </div>
          </li>
        ))}
      </ul>
      
      <hr className="admin-divider" />
      
      {/* --- ฟอร์มเพิ่มใหม่ --- */}
      <form onSubmit={handleAddMainCategory}>
        <label className="input-label">➕ เพิ่มหมวดงานหลักใหม่:</label>
        <div className="admin-input-group">
          <input 
            type="text"
            value={newMainCategory}
            onChange={(e) => setNewMainCategory(e.target.value)}
            placeholder="เช่น งานโครงสร้าง, งานสถาปัตย์, ..."
            disabled={isAdding}
          />
          <button type="submit" className="admin-button submit" disabled={isAdding}>
            {isAdding ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );

  // ========== Main Render ==========

  return (
    // เราใช้ className 'report-container' จาก Reports.tsx เพื่อให้หน้าตาคล้ายกัน
    <div className="report-container">
      <h1>⚙️ จัดการ Config</h1>
      <p className="project-name-display">โครงการ: {projectName}</p>
      
      {/* นี่คือส่วนที่เราจะใช้สลับหน้าไปมา (Main -> Sub -> Topic)
        ตอนนี้เรามีแค่ 'mainCategories' 
      */}
      {adminView.view === 'mainCategories' && renderMainCategories()}
      
      {/* {adminView.view === 'subCategories' && (
        <AdminSubCategories 
          projectConfig={projectConfig}
          mainCategory={adminView.mainCategory}
          onBack={() => setAdminView({ view: 'mainCategories' })}
        />
      )} 
      */}
      
    </div>
  );
};

export default AdminConfig;