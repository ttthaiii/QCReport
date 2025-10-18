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
      const response = await fetch(`${API_BASE_URL}/upload-photo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(photoData),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error uploading photo:', error);
      return { 
        success: false, 
        error: 'ไม่สามารถอัปโหลดรูปภาพได้' 
      };
    }
  },

  // Generate report
  async generateReport(projectId: string, startDate: string, endDate: string, reportType: 'QC' | 'Daily'): Promise<ApiResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/generate-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          startDate,
          endDate,
          reportType,
        }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error generating report:', error);
      return { 
        success: false, 
        error: 'ไม่สามารถสร้างรายงานได้' 
      };
    }
  },
};