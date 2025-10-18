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
      
      // Add project name
      if (options.projectName) {
        lines.push(`โครงการ: ${options.projectName}`);
      }
      
      // Add QC information or description
      if (options.mainCategory && options.subCategory && options.topic) {
        lines.push(`หมวดงานหลัก: ${options.mainCategory}`);
        lines.push(`หมวดงานย่อย: ${options.subCategory}`);
        lines.push(`หัวข้อ: ${options.topic}`);
      } else if (options.description) {
        // For daily report
        lines.push(`คำอธิบาย: ${options.description}`);
      }
      
      // Add location
      if (options.location) {
        if (typeof options.location === 'string') {
          lines.push(`ตำแหน่ง: ${options.location}`);
        } else {
          lines.push(`ตำแหน่ง: ${options.location.latitude.toFixed(6)}, ${options.location.longitude.toFixed(6)}`);
        }
      }
      
      // Add timestamp
      const date = new Date(options.timestamp);
      const formattedDate = date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      lines.push(`วันที่: ${formattedDate}`);
      
      // Configure watermark style
      const fontSize = Math.max(16, canvas.width / 50);
      const lineHeight = fontSize * 1.5;
      const padding = fontSize;
      const bgHeight = (lines.length * lineHeight) + (padding * 2);
      
      // Draw semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, canvas.height - bgHeight, canvas.width, bgHeight);
      
      // Draw text
      ctx.fillStyle = 'white';
      ctx.font = `${fontSize}px Arial, sans-serif`;
      ctx.textAlign = 'left';
      
      lines.forEach((line, index) => {
        const y = canvas.height - bgHeight + padding + (index * lineHeight) + fontSize;
        ctx.fillText(line, padding, y);
      });
      
      // Add semi-transparent logo or watermark pattern (optional)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.font = `bold ${canvas.width / 10}px Arial`;
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.fillText('QC REPORT', 0, 0);
      ctx.restore();
      
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