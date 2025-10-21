// Filename: src/utils/watermark.ts

export interface WatermarkOptions {
  projectName?: string;
  mainCategory?: string;
  subCategory?: string;
  topic?: string;
  description?: string;
  location?: { latitude: number; longitude: number } | string | null;
  timestamp: string;
}

export async function addWatermark(
  imageBase64: string,
  options: WatermarkOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw the image
      ctx.drawImage(img, 0, 0);
      
      // Prepare watermark text
      const lines: string[] = [];
      
      // Add location
      if (options.location) {
        if (typeof options.location === 'string') {
          lines.push(`Location: ${options.location}`); // <-- เปลี่ยนจาก "ตำแหน่ง:"
        } else {
          lines.push(`Location: ${options.location.latitude.toFixed(6)}, ${options.location.longitude.toFixed(6)}`); // <-- เปลี่ยนจาก "ตำแหน่ง:"
        }
      }
      
      // Add timestamp
      const date = new Date(options.timestamp);
      const formattedDate = date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: '2-digit', // <-- เปลี่ยนเป็นตัวเลข 2 หลัก
        day: '2-digit', // <-- เปลี่ยนเป็นตัวเลข 2 หลัก
        hour: '2-digit',
        minute: '2-digit',
      });
      lines.push(`Timestamp: ${formattedDate}`); // <-- เปลี่ยนจาก "วันที่:"
      
      // Configure watermark style
      const fontSize = Math.max(24, canvas.width / 60); // <-- ปรับขนาด Font
      const lineHeight = fontSize * 1.2; // <-- ปรับระยะห่างบรรทัด
      const padding = fontSize;

      // Draw text
      ctx.fillStyle = 'white';
      ctx.font = `bold ${fontSize}px Arial, sans-serif`; // <-- เพิ่มความหนา
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0, 0, 0, 1)'; // <-- เพิ่มเงาสีดำ
      ctx.shadowBlur = 3; // <-- ความเบลอของเงา
      
      lines.forEach((line, index) => {
        // จัดตำแหน่ง Y ใหม่ ให้อยู่มุมซ้ายล่าง
        const y = canvas.height - padding - ( (lines.length - 1 - index) * lineHeight );
        ctx.fillText(line, padding, y);
      });

      // Convert canvas back to base64
      const watermarkedImage = canvas.toDataURL('image/jpeg', 0.9);
      resolve(watermarkedImage);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageBase64;
  });
}
// Utility function to resize image if needed
export async function resizeImage(
  imageBase64: string,
  maxWidth: number = 1920,
  maxHeight: number = 1080
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      let { width, height } = img;
      
      // Calculate new dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw resized image
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to base64
      const resizedImage = canvas.toDataURL('image/jpeg', 0.9);
      resolve(resizedImage);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for resizing'));
    };
    
    img.src = imageBase64;
  });
}