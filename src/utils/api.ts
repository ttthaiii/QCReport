// Filename: src/utils/api.ts (REPLACE ALL)

// --- STEP 1: Define the "Blueprints" for our API data ---

// โครงสร้างข้อมูลของ Project ที่ได้รับจาก API /projects
export interface Project {
  id: string;
  projectName: string;
  projectCode: string;
  isActive: boolean;
  createdAt: any;
}

// ✅ UPDATED: "พิมพ์เขียว" สำหรับ Project Config ที่อัปเกรดเป็น 3 ชั้น
export interface ProjectConfig {
  [mainCategory: string]: {
    [subCategory: string]: string[];
  };
}

// ✅ UPDATED: "พิมพ์เขียว" สำหรับข้อมูลอัปโหลดที่เพิ่ม mainCategory และ subCategory
export interface UploadPhotoData {
  type: 'QC' | 'Daily';
  projectId: string;
  location: string;
  dynamicFields: object;
  description?: string;
  mainCategory?: string; // สำหรับหมวดงานหลัก
  subCategory?: string;  // สำหรับหมวดงานย่อย
  topic?: string;        // สำหรับหัวข้อ (ยังคงไว้)
}

// โครงสร้างข้อมูลที่ได้รับกลับมาหลังอัปโหลดสำเร็จ
interface UploadResponse {
  success: boolean;
  data: {
    fileId: string;
    filename: string;
    driveUrl: string;
    firestoreId: string;
    message: string;
  };
}

// โครงสร้างข้อมูลทั่วไปสำหรับ API response
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// --- STEP 2: Create a typed apiCall function ---

const API_BASE = process.env.NODE_ENV === 'development'
  ? 'http://127.0.0.1:5001/qcreport-54164/asia-southeast1/api'
  : 'https://asia-southeast1-qcreport-54164.cloudfunctions.net/api';

async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${endpoint}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `API Error: ${response.status} ${response.statusText}` }));
      throw new Error(errorData.error || `API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error(`API Call failed: ${endpoint}`, error);
    return {
        success: false,
        error: (error as Error).message,
        data: null as T
    };
  }
}

// Helper function to convert blob to base64
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

// --- STEP 3: Define the typed api object ---

export const api = {
  getProjects: () => apiCall<Project[]>('/projects'),
  getProjectConfig: (projectId: string) => apiCall<ProjectConfig>(`/project-config/${projectId}`),
  uploadPhoto: async (photoBlob: Blob, photoData: UploadPhotoData): Promise<ApiResponse<UploadResponse['data']>> => {
    try {
        const base64 = await blobToBase64(photoBlob);
        return apiCall<UploadResponse['data']>('/upload-photo-base64', {
            method: 'POST',
            body: JSON.stringify({
                photo: base64,
                ...photoData,
            }),
        });
    } catch (error) {
        console.error('Upload error:', error);
        return {
            success: false,
            error: (error as Error).message,
            data: null as any
        };
    }
  },
};