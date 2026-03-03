// Filename: src/utils/api.ts (REFACTORED for Auth Token)

// [ใหม่] 1. Import auth จาก firebase.js
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

// --- Type definitions (จากไฟล์เดิมของคุณ) ---
export interface DynamicFieldConfig {
  label: string;
  type?: 'text' | 'autocomplete' | 'dropdown';
  options?: string[];
}

export interface Topic {
  id: string;
  name: string;
  dynamicFields: (string | DynamicFieldConfig)[];
}

export interface SubCategory {
  id: string;
  name: string;
  dynamicFields: (string | DynamicFieldConfig)[];
  fieldDependencies?: Record<string, { targetField: string; mapping: Record<string, string> }>;
  topics: Topic[];
}

export interface MainCategory {
  id: string;
  name: string;
  subCategories: SubCategory[];
}

export type ProjectConfig = MainCategory[];

export interface ReportSettings {
  layoutType: string;
  qcPhotosPerPage: 1 | 2 | 4 | 6;
  dailyPhotosPerPage: 1 | 2 | 4 | 6;
  projectLogos: { // ✅ [แก้ไข] เพิ่มอันนี้
    left?: string;
    center?: string;
    right?: string;
  };
}

export interface Project {
  id: string;
  projectName: string;
  isActive?: boolean;
  reportSettings?: ReportSettings;
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
  jobId?: string;
  replaceDailyPhotoId?: string;
}


export interface SharedJob {
  id: string;
  label: string;
  reportType: 'QC' | 'Daily';
  mainCategory: string;
  subCategory: string;
  dynamicFields: Record<string, string>;
  completedTopics: number;
  totalTopics: number;
  status: 'pending' | 'completed';
  lastUpdatedAt: string;
}

// [แก้ไข] 2. ขยาย Type 'Photo' ให้มี Field ที่ PhotoGallery.tsx ต้องการ
export interface Photo {
  id: string;
  driveUrl: string;
  // (Fields ที่ Error ใน PhotoGallery.tsx)
  createdAt: string; // (หรือ Date)
  reportType: 'QC' | 'Daily';
  topic?: string;
  description?: string;
  filename: string;
  location?: string;
  firepath: string;
  dynamicFields?: Record<string, string>; // ✅ [เพิ่ม] เพื่อให้ Filter ได้
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GeneratedReportInfo {
  reportId: string;
  reportType: 'QC' | 'Daily';
  createdAt: string;
  filename: string;
  publicUrl: string;
  storagePath: string;
  mainCategory?: string;
  subCategory?: string;
  dynamicFields?: Record<string, string>;
  reportDate?: string;
  date?: string; // ← เพิ่มบรรทัดนี้ (alias สำหรับ reportDate)
  photosFound: number;
  totalTopics?: number;
  hasNewPhotos?: boolean;
  firepath?: string;
  hasReport?: boolean;
  newPhotosCount?: number;
  id?: string; // ← เพิ่มบรรทัดนี้
}

const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  layoutType: 'default',
  qcPhotosPerPage: 6,
  dailyPhotosPerPage: 2, // (คุณอาจจะอยากเปลี่ยนเป็น 6 เหมือนใน Config)
  projectLogos: {},
};

export interface AdminUser {
  uid: string;
  email?: string;
  displayName: string;
  role: 'user' | 'admin' | 'god';
  status: 'pending' | 'approved' | 'rejected' | 'unknown';
  assignedProjectId: string | null;
  assignedProjectName?: string;
}

export interface ChecklistStatusResponse {
  found: number;
  total: number;
  statusMap?: Record<string, boolean>; // statusMap มีแค่ใน QC
}

export interface ChecklistStatusResponse {
  found: number;
  total: number;
  statusMap?: Record<string, boolean>; // statusMap มีแค่ใน QC
}

// --- จบ Type definitions ---


// [ใหม่] 2. กำหนด API_BASE_URL
// (อ้างอิงจาก firebase.json และ qc-functions/src/index.ts)
const IS_DEV = process.env.NODE_ENV === 'development';
const NEW_PROJECT_ID = 'tts2004-smart-report-generate';

const API_BASE_URL = IS_DEV
  ? `https://asia-southeast1-${NEW_PROJECT_ID}.cloudfunctions.net/api` // Local: Use Prod Backend
  : '/api'; // Production: Use relative path (Hosting Rewrites)

const pendingRequests = new Map<string, Promise<any>>();

// [ใหม่] 3. สร้าง Wrapper 'fetch' ที่ปลอดภัย (ตัวหุ้ม)
const fetchWithAuth = async (path: string, options: RequestInit = {}, useCache = true) => {
  const user = auth.currentUser;

  // 1. Check cache
  if (useCache && (!options.method || options.method === 'GET')) {
    const cacheKey = `${path}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      console.log(`📦 Using cache for: ${path}`);
      return cachedData;
    }

    // 2. Check pending requests (deduplication)
    if (pendingRequests.has(cacheKey)) {
      console.log(`⏳ Waiting for existing request: ${path}`);
      return pendingRequests.get(cacheKey)!;
    }
  }

  // Headers
  const headers = new Headers(options.headers || {});

  // ✅ [เพิ่ม] Cache Control Headers สำหรับ POST requests
  if (options.method === 'POST' && path.includes('/generate-report')) {
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
  }

  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // 3. Create promise for deduplication
  const requestPromise = (async () => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: headers
    });

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) { /* Ignore */ }
      throw new Error(errorMsg);
    }

    return response.json();
  })();

  // Store in pending requests
  if (useCache && (!options.method || options.method === 'GET')) {
    const cacheKey = `${path}`;
    pendingRequests.set(cacheKey, requestPromise);
  }

  try {
    const data = await requestPromise;

    // Cache result
    if (useCache && (!options.method || options.method === 'GET')) {
      const cacheKey = `${path}`;
      setCachedData(cacheKey, data);
      console.log(`💾 Cached: ${path}`);
    }

    return data;
  } finally {
    // Clean up pending request
    if (useCache && (!options.method || options.method === 'GET')) {
      const cacheKey = `${path}`;
      pendingRequests.delete(cacheKey);
    }
  }
};

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 นาที
function getCachedData(key: string): any | null {
  const cached = cache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > CACHE_DURATION) {
    cache.delete(key); // ลบ cache ที่หมดอายุ
    return null;
  }

  return cached.data;
}

function setCachedData(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function invalidateCache(pattern?: string | RegExp): void {
  if (!pattern) {
    // ลบทั้งหมด
    cache.clear();
    console.log('🗑️ Cleared ALL cache');
    return;
  }

  const keysToDelete: string[] = [];

  cache.forEach((_, key) => {
    const matches = typeof pattern === 'string'
      ? key.includes(pattern)
      : pattern.test(key);

    if (matches) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => {
    cache.delete(key);
    console.log(`🗑️ Invalidated cache: ${key}`);
  });
}


// [แก้ไข] 4. อัปเดต 'api' object ทั้งหมดให้ใช้ 'fetchWithAuth'
export const api = {

  // --- Projects & Config (สำหรับหน้าเลือกโครงการ และ Admin) ---
  getProjects: async (): Promise<ApiResponse<Project[]>> => {
    try {
      const data = await fetchWithAuth('/projects', { method: 'GET' }, true); // ← เปิด cache
      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  addProject: async (projectName: string): Promise<ApiResponse<Project>> => {
    try {
      const data = await fetchWithAuth('/projects', {
        method: 'POST',
        body: JSON.stringify({ projectName })
      });

      // ล้าง cache ของ /projects เพื่อให้ list โหลดใหม่
      if (data.success) {
        invalidateCache('/projects');
      }

      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  getProjectConfig: async (projectId: string): Promise<ApiResponse<ProjectConfig>> => {
    try {
      // 1. [NEW] Try fetching from Firestore 'projectConfigs' (Direct Read)
      // This fixes the 404 error for new projects that are saved to Firestore but not yet known by the API
      // or if we want to bypass the API for performance/cost.
      const configRef = doc(db, 'projectConfigs', projectId);
      const configSnap = await getDoc(configRef);

      if (configSnap.exists()) {
        const data = configSnap.data();
        console.log("✅ Config found in 'projectConfigs' (Direct Read):", data);

        // Map Firestore data to ProjectConfig interface
        // Assuming the document contains a key 'mainCategories' or similar that holds the array
        // OR the document *is* the config wrapper.
        // Based on common patterns, if ProjectConfig is an Array, it's likely wrapped in a field.
        let config: ProjectConfig = [];

        if (Array.isArray(data.mainCategories)) {
          config = data.mainCategories as ProjectConfig;
        } else if (Array.isArray(data.config)) {
          config = data.config as ProjectConfig;
        } else if (Array.isArray(data.data)) {
          config = data.data as ProjectConfig;
        } else {
          // Fallback: If the document keys act as indexes or something unexpected
          console.warn("⚠️ 'projectConfigs' doc found but structure is unknown:", data);
          // We might want to try API if structure is weird, or return empty?
          // Let's assume if it exists, it's the right one.
          // If we can't find array, return as is if it looks like one, or empty.
        }

        if (config.length > 0) {
          return { success: true, data: config };
        }
      }

      console.warn(`⚠️ Config not found in 'projectConfigs' for ${projectId}. Trying API (Legacy)...`);

      // 2. Fallback to API (Legacy Support)
      // For old projects that might still be in 'projectConfig' (singular) subcollections
      // and not yet migrated to 'projectConfigs' (plural).
      const data = await fetchWithAuth(`/project-config/${projectId}`, { method: 'GET' });
      return data;

    } catch (error: any) {
      console.error("❌ Error fetching project config:", error);
      return { success: false, error: error.message };
    }
  },

  getUsers: async (): Promise<ApiResponse<AdminUser[]>> => {
    try {
      const data = await fetchWithAuth('/admin/users', { method: 'GET' });
      return data;
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  },

  getDynamicFieldValues: async (
    projectId: string,
    subCategoryId: string
  ): Promise<ApiResponse<Record<string, string[]>>> => {
    try {
      const data = await fetchWithAuth(
        `/projects/${projectId}/dynamic-field-values?subCategoryId=${encodeURIComponent(subCategoryId)}`,
        { method: 'GET' },
        false // ✅ เปลี่ยนจาก true เป็น false (ปิด cache)
      );
      return data;
    } catch (error: any) {
      return { success: false, error: error.message, data: {} };
    }
  },

  /**
   * (Admin) อัปเดตสถานะผู้ใช้ (อนุมัติ/ปฏิเสธ)
   */
  updateUserStatus: async (uid: string, status: 'approved' | 'rejected'): Promise<ApiResponse<any>> => {
    try {
      return await fetchWithAuth(`/admin/update-status/${uid}`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  setUserRole: async (uid: string, role: 'user' | 'admin' | 'god'): Promise<ApiResponse<any>> => {
    try {
      return await fetchWithAuth(`/admin/set-role/${uid}`, {
        method: 'POST',
        body: JSON.stringify({ role })
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  reverseGeocode: async (lat: number, lon: number): Promise<string> => {
    try {
      const response = await fetchWithAuth(`/proxy-geocode?lat=${lat}&lon=${lon}`, { method: 'GET' }, true); // Use cache for geocoding

      if (response.success && response.data) {
        const data = response.data;
        if (data.address) {
          const addr = data.address;
          const parts: string[] = [];
          const road = addr.road || addr.street;
          if (road) { parts.push(road); }
          const subdistrict = addr.suburb || addr.village || addr.hamlet;
          if (subdistrict) { parts.push(subdistrict); }
          const district = addr.district || addr.city_district || addr.town || addr.municipality;
          if (district) { parts.push(district); }
          const province = addr.state || addr.province;
          if (province) { parts.push(province); }

          if (parts.length > 0) { return parts.join('\n'); }

          if (data.display_name) {
            const displayParts = data.display_name.split(',').slice(0, 3).map((s: string) => s.trim());
            return displayParts.join('\n');
          }
        }
      }
      // Fallback
      return `พิกัด:\n${lat.toFixed(4)},\n${lon.toFixed(4)}`;
    } catch (error) {
      console.error('Error reverse geocoding via proxy:', error);
      return `พิกัด:\n${lat.toFixed(4)},\n${lon.toFixed(4)}`;
    }
  },

  // --- Photo Upload (สำหรับหน้า Camera) ---
  uploadPhoto: async (data: UploadPhotoData): Promise<ApiResponse<any>> => {
    try {
      // 1. [FIX] สร้าง Payload ใหม่ที่ Backend (index.ts) คาดหวัง
      const payload = {
        projectId: data.projectId,
        reportType: data.reportType,

        // ✅ [แก้ไข] Key ต้องเป็น 'photoBase64' ให้ตรงกับ index.ts
        photoBase64: data.photoBase64,



        // [FIX] รวม 'mainCategory' และ 'subCategory' เป็น 'category'
        category: data.reportType === 'QC' ? `${(data.mainCategory || '').trim()} > ${(data.subCategory || '').trim()}` : undefined,

        topic: data.topic,
        description: data.description,
        location: data.location,
        dynamicFields: data.dynamicFields,
        replaceDailyPhotoId: data.replaceDailyPhotoId, // ✅ [เพิ่ม] ส่ง ID ไป Backend
        // (เราไม่ต้องส่ง 'jobId', 'projectName' หรือ 'timestamp' ไป
        // เพราะ Backend ตัวเก่าไม่ได้ใช้)
      };

      // 2. ส่ง Payload ที่ "แปลง" แล้ว
      const responseData = await fetchWithAuth('/upload-photo-base64', {
        method: 'POST',
        body: JSON.stringify(payload) // <-- ส่ง payload ที่ถูกต้อง
      });
      return responseData;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // --- Reports (สำหรับหน้า Reports) ---
  generateReport: async (reportData: any): Promise<ApiResponse<any>> => {
    try {
      const data = await fetchWithAuth('/generate-report', {
        method: 'POST',
        body: JSON.stringify(reportData)
      });

      // ✅ [เพิ่ม] Invalidate cache หลังสร้างรายงานสำเร็จ
      if (data.success) {
        const { projectId } = reportData;

        // ลบ cache ของ generated reports
        invalidateCache(`/projects/${projectId}/generated-reports`);

        // ลบ cache ของ checklist status (เพราะมีรูปใหม่แล้ว)
        invalidateCache('/checklist-status');

        console.log('✅ Cache invalidated after report generation');
      }

      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },


  getChecklistStatus: async (payload: {
    projectId: string;
    reportType: 'QC' | 'Daily'; // <-- [ใหม่]
    mainCategory?: string;      // <-- [ใหม่] optional
    subCategory?: string;       // <-- [ใหม่] optional
    dynamicFields?: Record<string, string>;
    date?: string; // <-- [ใหม่]
  }): Promise<ApiResponse<ChecklistStatusResponse>> => { // <-- [แก้ไข] ใช้ Type ใหม่
    try {
      const data = await fetchWithAuth('/checklist-status', {
        method: 'POST',
        body: JSON.stringify(payload)
      }, false); // ✅ Disable cache
      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  getQcPhotosPreview: async (
    projectId: string,
    mainCategory: string,
    subCategory: string,
    dynamicFields: Record<string, string>
  ): Promise<ApiResponse<Photo[]>> => {
    try {
      const dynamicFieldsStr = JSON.stringify(dynamicFields);
      const queryParams = new URLSearchParams({
        mainCategory,
        subCategory,
        dynamicFields: dynamicFieldsStr
      }).toString();
      const data = await fetchWithAuth(`/projects/${projectId}/qc-photos?${queryParams}`, { method: 'GET' }, false);
      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // --- Report Settings (สำหรับหน้า Admin) ---
  getReportSettings: async (projectId: string): Promise<ApiResponse<ReportSettings>> => {
    try {
      const data = await fetchWithAuth(`/projects/${projectId}/report-settings`, { method: 'GET' }, false); // ✅ Disable cache for settings too
      return data;
    } catch (error: any) {
      return { success: false, error: error.message, data: DEFAULT_REPORT_SETTINGS };
    }
  },

  saveReportSettings: async (projectId: string, settings: ReportSettings): Promise<ApiResponse<any>> => {
    try {
      const data = await fetchWithAuth(`/projects/${projectId}/report-settings`, {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  uploadProjectLogo: async (
    projectId: string,
    logoBase64: string,
    slot: 'left' | 'center' | 'right' // ✅ [แก้ไข] เพิ่ม slot
  ): Promise<ApiResponse<{ logoUrl: string }>> => {
    try {
      // ✅ [แก้ไข] เพิ่ม slot เข้าไปใน URL
      const data = await fetchWithAuth(`/projects/${projectId}/upload-logo/${slot}`, {
        method: 'POST',
        body: JSON.stringify({ logoBase64 })
      });
      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // --- Config CRUD (สำหรับหน้า Admin) ---
  addMainCategory: async (projectId: string, newName: string): Promise<ApiResponse<any>> => {
    try {
      // 1. เก็บผลลัพธ์ไว้ในตัวแปร
      const response = await fetchWithAuth(`/project-config/${projectId}/main-categories`, {
        method: 'POST',
        body: JSON.stringify({ newName })
      });

      // 2. ถ้าสำเร็จ ให้ล้าง Cache ของหน้านี้!
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }

      // 3. คืนค่าผลลัพธ์
      return response;

    } catch (error: any) { return { success: false, error: error.message }; }
  },

  updateMainCategoryName: async (projectId: string, mainCatId: string, newName: string): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/main-category/${mainCatId}`, {
        method: 'POST',
        body: JSON.stringify({ newName })
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  deleteMainCategory: async (projectId: string, mainCatId: string): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/main-category/${mainCatId}`, {
        method: 'DELETE'
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  addSubCategory: async (projectId: string, mainCategoryId: string, mainCategoryName: string, newName: string): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/sub-categories`, {
        method: 'POST',
        body: JSON.stringify({ newName, mainCategoryId, mainCategoryName })
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  updateSubCategoryName: async (projectId: string, subCatId: string, newName: string): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/sub-category/${subCatId}`, {
        method: 'POST',
        body: JSON.stringify({ newName })
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  deleteSubCategory: async (projectId: string, subCatId: string): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/sub-category/${subCatId}`, {
        method: 'DELETE'
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  addTopic: async (projectId: string, subCategoryId: string, mainCategoryName: string, subCategoryName: string, newTopicNames: string[]): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/topics`, {
        method: 'POST',
        body: JSON.stringify({ newTopicNames, subCategoryId, mainCategoryName, subCategoryName })
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  updateTopicName: async (projectId: string, topicId: string, newName: string): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/topic/${topicId}`, {
        method: 'POST',
        body: JSON.stringify({ newName })
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  deleteTopic: async (projectId: string, topicId: string): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/topic/${topicId}`, {
        method: 'DELETE'
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  updateDynamicFields: async (projectId: string, subCatId: string, fields: string[]): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/sub-category/${subCatId}/fields`, {
        method: 'POST',
        body: JSON.stringify({ fields })
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  updateTopicOrder: async (projectId: string, subCatId: string, topicOrder: string[]): Promise<ApiResponse<any>> => {
    try {
      const response = await fetchWithAuth(`/project-config/${projectId}/sub-category/${subCatId}/topic-order`, {
        method: 'POST',
        body: JSON.stringify({ topicOrder })
      });
      // ✅ [แก้ไข] ล้าง Cache ถ้าสำเร็จ
      if (response.success) {
        invalidateCache(`/project-config/${projectId}`);
      }
      return response;
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  // --- Generated Reports (หน้า Reports) ---
  // (นี่คือฟังก์ชันจากไฟล์เดิมของคุณ ที่แก้ไขแล้ว)
  getGeneratedReports: async (projectId: string, filterCriteria: any): Promise<ApiResponse<GeneratedReportInfo[]>> => {
    try {
      const params = new URLSearchParams();
      params.append('reportType', filterCriteria.reportType);
      if (filterCriteria.reportType === 'QC') {
        if (filterCriteria.mainCategory) params.append('mainCategory', filterCriteria.mainCategory);
        if (filterCriteria.subCategory) params.append('subCategory', filterCriteria.subCategory);
        if (filterCriteria.dynamicFields) {
          Object.entries(filterCriteria.dynamicFields).forEach(([key, value]) => {
            if (value) params.append(`dynamicFields[${key}]`, value as string);
          });
        }
      } else if (filterCriteria.reportType === 'Daily') {
        if (filterCriteria.date) params.append('date', filterCriteria.date);
      }

      // [แก้ไข] เรียกใช้ fetchWithAuth
      const data = await fetchWithAuth(`/projects/${projectId}/generated-reports?${params.toString()}`, {
        method: 'GET'
      }, false); // ✅ Disable cache

      // (Error handling และ .json() ถูกย้ายไปใน fetchWithAuth แล้ว)
      return data;

    } catch (error) {
      console.error('Error fetching generated reports:', error);
      return {
        success: false,
        error: (error as Error).message,
        data: []
      };
    }
  },

  getSharedJobs: async (projectId: string): Promise<ApiResponse<SharedJob[]>> => {
    try {
      const data = await fetchWithAuth(`/projects/${projectId}/shared-jobs`, { method: 'GET' }, false); // ✅ Disable cache
      return data;
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  },

  saveSharedJob: async (projectId: string, jobData: SharedJob): Promise<ApiResponse<any>> => {
    try {
      return await fetchWithAuth(`/projects/${projectId}/shared-jobs`, {
        method: 'POST',
        body: JSON.stringify(jobData)
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  deleteSharedJob: async (projectId: string, jobId: string): Promise<ApiResponse<any>> => {
    try {
      return await fetchWithAuth(`/projects/${projectId}/shared-jobs/${jobId}`, {
        method: 'DELETE'
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  },

  // [ใหม่] 6. เพิ่มฟังก์ชัน 'getPhotosByProject' ที่หายไป
  getPhotosByProject: async (projectId: string): Promise<ApiResponse<Photo[]>> => {
    try {
      // (Endpoint นี้อ้างอิงจาก index.ts ของคุณ `app.get("/photos/:projectId", ...)` )
      const data = await fetchWithAuth(`/photos/${projectId}`, { method: 'GET' });
      return data;
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  },

  // [ใหม่] ดึงรูปภาพ Daily ของวันใดวันหนึ่ง
  getDailyPhotos: async (projectId: string, date: string): Promise<ApiResponse<Photo[]>> => {
    try {
      const data = await fetchWithAuth(`/projects/${projectId}/daily-photos?date=${date}`, { method: 'GET' }, false); // Disable cache for fresh data
      return data;
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  },

  // ✅ [ใหม่] อัปเดตคำอธิบาย (Description) ของรูปภาพ Daily (Resume Work)
  updateDailyPhotoDescription: async (projectId: string, photoId: string, description: string): Promise<ApiResponse<any>> => {
    try {
      return await fetchWithAuth(`/projects/${projectId}/daily-photos/${photoId}`, {
        method: 'PUT',
        body: JSON.stringify({ description })
      });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // ✅ [ใหม่] ลบรูปภาพ Daily (Resume Work)
  deleteDailyPhoto: async (projectId: string, photoId: string): Promise<ApiResponse<any>> => {
    try {
      return await fetchWithAuth(`/projects/${projectId}/daily-photos/${photoId}`, {
        method: 'DELETE'
      });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // ดึงรายงานทั้งหมด (ทั้งที่มีและยังไม่มี)
  getAllPossibleReports: async (payload: {
    projectId: string;
    reportType: 'QC' | 'Daily';
    mainCategory?: string;
    subCategory?: string;
    dynamicFields?: { [key: string]: string };
    date?: string;
  }): Promise<ApiResponse<GeneratedReportInfo[]>> => {
    try {
      const data = await fetchWithAuth('/reports/all-possible', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // [ใหม่] 7. ดึงรูปภาพล่าสุดของ Topic (สำหรับปุ่ม "ดูรูป" ใน Camera)
  getLatestPhotoForTopic: async (projectId: string, topicName: string, category: string, dynamicFields: Record<string, string> = {}): Promise<ApiResponse<Photo>> => {
    try {
      const allPhotosRes = await api.getPhotosByProject(projectId);
      if (!allPhotosRes.success || !allPhotosRes.data) {
        throw new Error(allPhotosRes.error || 'Failed to fetch photos');
      }

      // หา Topic ที่ตรงกัน และใหม่ที่สุด
      // หมายเหตุ: category ใน Photo saved format คือ "Main > Sub"
      const matchedPhotos = allPhotosRes.data.filter((p: any) => { // Cast as any because dynamicFields might not be fully typed in allPhotosRes yet
        const isTopicMatch = p.topic === topicName;
        const isCategoryMatch = p.reportType === 'QC' ? (p.category === category) : true;

        // ✅ [แก้ไข] Check Dynamic Fields
        let isFieldsMatch = true;
        if (p.reportType === 'QC' && p.dynamicFields) {
          // Compare provided dynamicFields with photo's dynamicFields
          const photoFields = p.dynamicFields as Record<string, string>;
          const requestFields = dynamicFields;

          // Check if all requested fields match the photo's fields
          // (Simple JSON stringify comparison might work if keys are sorted, but strict key checking is safer)
          if (Object.keys(requestFields).length > 0) {
            for (const key of Object.keys(requestFields)) {
              if (photoFields[key] !== requestFields[key]) {
                isFieldsMatch = false;
                break;
              }
            }
          }
        }

        return isTopicMatch && isCategoryMatch && isFieldsMatch;
      });

      if (matchedPhotos.length === 0) {
        return { success: false, error: 'Photo not found' };
      }

      // เรียงจากใหม่ไปเก่า
      matchedPhotos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return { success: true, data: matchedPhotos[0] };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // [ใหม่] 8. Proxy Image (แก้ CORS)
  proxyImage: async (url: string): Promise<ApiResponse<string>> => {
    try {
      const data = await fetchWithAuth('/proxy-image', {
        method: 'POST',
        body: JSON.stringify({ url })
      });
      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};