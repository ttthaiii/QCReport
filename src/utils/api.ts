// Filename: src/utils/api.ts

// --- Type definitions ---
export interface Project {
  id: string;
  projectName: string;
  isActive?: boolean;
}

export interface ProjectConfig {
  [mainCategory: string]: {
    [subCategory: string]: {
      topics: string[];
      dynamicFields: string[]; // <-- เพิ่ม Field นี้เข้ามา
    };
  };
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
    mainCategory: string;
    subCategory: string;
    dynamicFields?: { [key: string]: string };
  }): Promise<ApiResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/generate-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportData),
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
};