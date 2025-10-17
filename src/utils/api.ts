// Filename: src/utils/api.ts

// --- STEP 1: Define the "Blueprints" for our API data ---

// โครงสร้างข้อมูลของ Project ที่ได้รับจาก API /projects
export interface Project {
  id: string;
  projectName: string;
  projectCode: string;
  isActive: boolean;
  createdAt: any; // สามารถกำหนดให้ละเอียดกว่านี้ได้ เช่น { _seconds: number, _nanoseconds: number }
}

// โครงสร้างข้อมูลของ Project Config ที่ได้รับจาก API /project-config/:projectId
// เป็น object ที่มี key เป็น string (ชื่อหมวดงาน) และ value เป็น array ของ string (ชื่อหัวข้อ)
export interface ProjectConfig {
  [category: string]: string[];
}

// โครงสร้างข้อมูลสำหรับอัปโหลดรูปภาพ
interface UploadPhotoData {
  projectId: string;
  category: string;
  topic: string;
  location: string;
  dynamicFields: object;
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

// ฟังก์ชัน fetch ที่ปรับปรุงด้วย TypeScript Generics (<T>)
// ทำให้เรารู้ชนิดข้อมูลที่จะได้รับกลับมาล่วงหน้า
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
      // พยายามอ่าน error message จาก backend
      const errorData = await response.json().catch(() => ({ error: `API Error: ${response.status} ${response.statusText}` }));
      throw new Error(errorData.error || `API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error(`API Call failed: ${endpoint}`, error);
    // สร้างโครงสร้าง error response ให้สอดคล้องกัน
    return {
        success: false,
        error: (error as Error).message,
        data: null as T // TypeScript จะเข้าใจว่า data เป็น null ในกรณีที่เกิด error
    };
  }
}

// Helper function to convert blob to base64
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // reader.result คือ base64 string ทั้งหมด (รวม data:image/jpeg;base64,)
        // เราจะตัดแค่ส่วน base64 เพียวๆ ออกมา
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }


// --- STEP 3: Define the typed api object ---

export const api = {
  // ดึงรายชื่อโครงการทั้งหมด และบอกว่าข้อมูลที่คาดหวังคือ Project[] (Array ของ Project)
  getProjects: () => apiCall<Project[]>('/projects'),

  // ดึง Config ของโครงการ และบอกว่าข้อมูลที่คาดหวังคือ ProjectConfig
  getProjectConfig: (projectId: string) => apiCall<ProjectConfig>(`/project-config/${projectId}`),

  // อัปโหลดรูปภาพ
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