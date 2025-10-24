// Filename: src/utils/api.ts

// --- Type definitions ---
export interface Topic {
  id: string;
  name: string;
  dynamicFields: string[];
}

export interface SubCategory {
  id: string;
  name: string;
  dynamicFields: string[];
  topics: Topic[];
}

export interface MainCategory {
  id: string;
  name: string;
  subCategories: SubCategory[];
}

export type ProjectConfig = MainCategory[];

export interface ReportSettings {
  layoutType: string; // "default" | "templateA" | ...
  photosPerPage: number;
  customHeaderText: string;
  customFooterText: string;
  projectLogoUrl: string; // <-- เพิ่ม
}

export interface Project {
  id: string;
  projectName: string;
  isActive?: boolean;
  reportSettings?: ReportSettings; // <-- เพิ่ม Optional field
}

export interface UploadPhotoData {
  projectId: string;
  projectName?: string;
  reportType: 'QC' | 'Daily';
  mainCategory?: string;
  subCategory?: string;
  topic?: string;
  description?: string;
  photoBase64: string;
  latitude?: number;
  longitude?: number;
  timestamp: string;
  location?: string;
  dynamicFields?: object;
}

/**
 * ✅ 1. แก้ไข: ประกาศ Interface Photo ที่นี่
 * เพื่อให้ไฟล์อื่น เช่น PhotoGallery.tsx สามารถ import ไปใช้ได้
 */
export interface Photo {
  id: string;
  driveUrl: string;
  filename: string;
  reportType: 'QC' | 'Daily';
  topic?: string;
  description?: string;
  createdAt: string; // ISO String
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- API configuration ---
const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:5001/qcreport-54164/asia-southeast1/api'
  : 'https://asia-southeast1-qcreport-54164.cloudfunctions.net/api';

// --- API service ---
export const api = {
  // Get all active projects
  async getProjects(): Promise<ApiResponse<Project[]>> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching projects:', error);
      return { 
        success: false, 
        error: 'ไม่สามารถโหลดข้อมูลโครงการได้' 
      };
    }
  },

  // Get project configuration (QC topics)
  async getProjectConfig(projectId: string): Promise<ApiResponse<ProjectConfig>> {
    try {
      const response = await fetch(`${API_BASE_URL}/project-config/${projectId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching project config:', error);
      return { 
        success: false, 
        error: 'ไม่สามารถโหลดข้อมูลตั้งค่าโครงการได้' 
      };
    }
  },

  async getReportSettings(projectId: string): Promise<ApiResponse<ReportSettings>> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/report-settings`);
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching report settings:', error);
      // คืนค่า Default ที่นี่ด้วย เผื่อ Backend ล้มเหลว
      const defaultSettings: ReportSettings = {
          layoutType: "default", photosPerPage: 6,
          customHeaderText: "", customFooterText: "", projectLogoUrl: ""
      };
      return { success: false, error: (error as Error).message, data: defaultSettings };
    }
  },

  /**
   * ✅ [ใหม่] บันทึกค่าตั้งค่า Report ของ Project
   */
  async saveReportSettings(projectId: string, settings: ReportSettings): Promise<ApiResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/report-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error saving report settings:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  /**
   * ✅ [ใหม่] อัปโหลดไฟล์ Logo ของ Project
   */
  async uploadProjectLogo(projectId: string, file: File): Promise<ApiResponse<{ logoUrl: string }>> {
    try {
      const formData = new FormData();
      formData.append('logo', file); // 'logo' คือ fieldname ที่ Backend (busboy) รออยู่

      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/upload-logo`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; }
        catch (e) { /* Ignore if not JSON */ }
        throw new Error(errorMsg);
      }
      return await response.json();

    } catch (error) {
      console.error('Error uploading project logo:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  async updateMainCategoryName(
    projectId: string, 
    mainCatId: string, 
    newName: string
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/main-category/${mainCatId}`, 
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ newName: newName }), // ส่งชื่อใหม่ไปใน body
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error updating main category name:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'ไม่สามารถอัปเดตชื่อได้' 
      };
    }
  },

  async deleteMainCategory(
    projectId: string, 
    mainCatId: string
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/main-category/${mainCatId}`, 
        {
          method: 'DELETE', // ใช้วิธี DELETE
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error deleting main category name:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'ไม่สามารถลบหมวดหมู่ได้' 
      };
    }
  },

  async addMainCategory(
    projectId: string, 
    newName: string
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/main-categories`, 
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ newName: newName }), // ส่งชื่อใหม่ไปใน body
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error adding main category name:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'ไม่สามารถเพิ่มหมวดหมู่ได้' 
      };
    }
  },

  async addSubCategory(
    projectId: string, 
    mainCategoryId: string, 
    mainCategoryName: string, 
    newName: string
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/sub-categories`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            newName: newName,
            mainCategoryId: mainCategoryId, // <-- ส่ง ID ของ Level 1
            mainCategoryName: mainCategoryName // <-- ส่ง Name ของ Level 1 (เพื่อสร้าง Slug)
          }),
        }
      );
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error adding sub category:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  /**
   * ✅ [ใหม่] ฟังก์ชันสำหรับ "แก้ไข" Sub Category
   */
  async updateSubCategoryName(
    projectId: string, 
    subCatId: string, 
    newName: string
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/sub-category/${subCatId}`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName: newName }),
        }
      );
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error updating sub category name:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  /**
   * ✅ [ใหม่] ฟังก์ชันสำหรับ "ลบ" Sub Category
   */
  async deleteSubCategory(
    projectId: string, 
    subCatId: string
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/sub-category/${subCatId}`, 
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error deleting sub category:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  /**
   * ✅ [ใหม่] ฟังก์ชันสำหรับ "เพิ่ม" Topic (Level 3)
   */
  async addTopic(
    projectId: string, 
    subCategoryId: string, 
    mainCategoryName: string,
    subCategoryName: string,
    newTopicNames: string[] // <-- [แก้ไข] รับ Array
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/topics`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            newTopicNames: newTopicNames, // <-- [แก้ไข] ส่ง Array
            subCategoryId: subCategoryId,
            mainCategoryName: mainCategoryName,
            subCategoryName: subCategoryName
          }),
        }
      );
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error adding bulk topics:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  /**
   * ✅ [ใหม่] ฟังก์ชันสำหรับ "แก้ไข" Topic
   */
  async updateTopicName(
    projectId: string, 
    topicId: string, 
    newName: string
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/topic/${topicId}`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName: newName }),
        }
      );
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error updating topic name:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  /**
   * ✅ [ใหม่] ฟังก์ชันสำหรับ "ลบ" Topic
   */
  async deleteTopic(
    projectId: string, 
    topicId: string
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/topic/${topicId}`, 
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error deleting topic:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  /**
   * ✅ [ใหม่] ฟังก์ชันสำหรับ "อัปเดต" Dynamic Fields (Level 4)
   */
  async updateDynamicFields(
    projectId: string, 
    subCatId: string, 
    fields: string[] // <-- ส่ง Array
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project-config/${projectId}/sub-category/${subCatId}/fields`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fields }), // <-- ส่ง Array
        }
      );
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error updating dynamic fields:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  /**
   * ✅ เพิ่มฟังก์ชันใหม่นี้เข้าไป
   * ดึงรูปภาพทั้งหมด (ทั้ง QC และ Daily) จากโปรเจกต์ที่ระบุ
   */
  async getPhotosByProject(projectId: string): Promise<ApiResponse<Photo[]>> {
    try {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      
      // ✅ 2. แก้ไข: ใช้ตัวแปร API_BASE_URL ที่ถูกต้อง
      const response = await fetch(`${API_BASE_URL}/photos/${projectId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // ✅ 3. แก้ไข: ตอนนี้ TypeScript รู้จัก 'Photo' แล้ว
      const result: ApiResponse<Photo[]> = await response.json();
      return result;

    } catch (error) {
      console.error('Error fetching photos by project:', error);
      return { success: false, error: (error as Error).message, data: [] };
    }
  },

  // Upload photo with metadata
  async uploadPhoto(photoData: UploadPhotoData): Promise<ApiResponse> {
    try {
      const { photoBase64, mainCategory, subCategory, ...restData } = photoData;
      
      const category = mainCategory && subCategory 
        ? `${mainCategory} > ${subCategory}`
        : mainCategory || '';
      
      const response = await fetch(`${API_BASE_URL}/upload-photo-base64`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          photo: photoBase64,
          category: category,
          ...restData
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error uploading photo:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'ไม่สามารถอัปโหลดรูปภาพได้' 
      };
    }
  },

  // Generate report
  async generateReport(reportData: {
    projectId: string;
    projectName: string;
    reportType: 'QC' | 'Daily'; // <-- [ใหม่]
    mainCategory?: string;       // <-- [ใหม่] optional
    subCategory?: string;        // <-- [ใหม่] optional
    date?: string;               // <-- [ใหม่]
    dynamicFields?: { [key: string]: string };
  }): Promise<ApiResponse> { // <-- [แก้ไข] Type ของ reportData
    try {
      const response = await fetch(`${API_BASE_URL}/generate-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportData), // <-- ส่ง reportData ไปตรงๆ
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error generating report:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'ไม่สามารถสร้างรายงานได้' 
      };
    }
  },
  
  getChecklistStatus: async (
      projectId: string,
      mainCategory: string,
      subCategory: string,
      dynamicFields: Record<string, string>
    ): Promise<{ success: boolean; data?: Record<string, boolean>; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/checklist-status`, { // <-- ✨ แก้ไข
        method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            mainCategory,
            subCategory,
            dynamicFields,
          }),
        });
        const result = await response.json();
        return result;
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },  
};