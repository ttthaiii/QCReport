// Filename: src/utils/api.ts

// Type definitions
export interface Project {
  id: string;
  projectName: string;
  isActive?: boolean;
}

export interface ProjectConfig {
  [mainCategory: string]: {
    [subCategory: string]: string[];
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

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// API configuration
const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:5001/qcreport-54164/asia-southeast1/api'  // ✅ ถูกต้อง
  : 'https://asia-southeast1-qcreport-54164.cloudfunctions.net/api';

// API service
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

  // Upload photo with metadata
  async uploadPhoto(photoData: UploadPhotoData): Promise<ApiResponse> {
    try {
      // แยก photoBase64 ออกจาก photoData
      const { photoBase64, mainCategory, subCategory, ...restData } = photoData;
      
      // ✅ รวม mainCategory + subCategory เป็น category เดียว
      const category = mainCategory && subCategory 
        ? `${mainCategory} > ${subCategory}`  // รวมเป็น string เดียว
        : mainCategory || '';
      
      const response = await fetch(`${API_BASE_URL}/upload-photo-base64`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          photo: photoBase64,  // ✅ ส่งเป็น 'photo'
          category: category,   // ✅ ส่งเป็น 'category'
          ...restData           // topic, projectId, location, dynamicFields
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