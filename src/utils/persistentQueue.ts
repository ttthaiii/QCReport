// Filename: src/utils/persistentQueue.ts
// (ไฟล์ใหม่สำหรับจัดการคิวใน localStorage)

import { PhotoQueueItem } from '../components/Camera'; // เราจะไป Export Type นี้จาก Camera.tsx

const getQueueKey = (projectId: string): string => {
  return `photoQueue_${projectId}`;
};

/**
 * บันทึกคิวลงใน localStorage
 */
export const saveQueue = (projectId: string, queue: Map<string, PhotoQueueItem>): void => {
  if (!projectId) return;
  try {
    const queueKey = getQueueKey(projectId);
    // แปลง Map เป็น Array [key, value] เพื่อให้ JSON.stringify ทำงานได้
    const arrayRepresentation = Array.from(queue.entries());
    const jsonString = JSON.stringify(arrayRepresentation);
    localStorage.setItem(queueKey, jsonString);
  } catch (error) {
    console.error("Failed to save persistent queue:", error);
    // อาจจะแจ้งเตือนผู้ใช้ว่า localStorage เต็ม
  }
};

/**
 * โหลดคิวจาก localStorage
 */
export const loadQueue = (projectId: string): Map<string, PhotoQueueItem> => {
  if (!projectId) return new Map();
  try {
    const queueKey = getQueueKey(projectId);
    const jsonString = localStorage.getItem(queueKey);
    
    if (!jsonString) {
      return new Map();
    }
    
    // แปลง Array [key, value] กลับเป็น Map
    const arrayRepresentation = JSON.parse(jsonString);
    if (Array.isArray(arrayRepresentation)) {
      return new Map(arrayRepresentation);
    }
    
    return new Map();
  } catch (error) {
    console.error("Failed to load persistent queue:", error);
    return new Map();
  }
};

/**
 * ล้างคิว (ใช้เมื่อไม่จำเป็นแล้ว)
 */
export const clearQueue = (projectId: string): void => {
  if (!projectId) return;
  try {
    const queueKey = getQueueKey(projectId);
    localStorage.removeItem(queueKey);
  } catch (error) {
    console.error("Failed to clear persistent queue:", error);
  }
};