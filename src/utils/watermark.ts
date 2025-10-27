// Filename: src/utils/watermark.ts

export interface WatermarkOptions {
  projectName?: string;
  mainCategory?: string;
  subCategory?: string;
  topic?: string;
  description?: string;
  // [แก้ไข] เราจะรับ location เป็น string ภาษาไทยแล้ว
  location?: string | null; 
  timestamp: string;
}

export async function addWatermark(
  imageBase64: string,
  options: WatermarkOptions
): Promise<string> {
  // [ลบ] async ออกจาก Promise นี้
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => { // [ลบ] async ออก
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // ---------------------------------------------------
      // [แก้ไข] ส่วนการเตรียมข้อความ Watermark
      // ---------------------------------------------------
      const lines: string[] = [];
      
      // --- 1. จัดรูปแบบ Timestamp (วว/ดด/ปปปป HH:mm:ss) ---
      try {
        const date = new Date(options.timestamp);
        // 1.1 ได้วันที่ (พ.ศ.) -> "22/08/2568"
        const datePart = date.toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric', // th-TH จะให้ปี พ.ศ. อัตโนมัติ
        });
        // 1.2 ได้เวลา (24ชม. + วินาที) -> "15:22:41"
        const timePart = date.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false, // บังคับ 24-hour
        });
        // 1.3 รวมร่าง (ไม่มีคำว่า "Timestamp:")
        lines.push(`${datePart} ${timePart}`);
      } catch (e) {
        lines.push(`Invalid Date`);
      }

      // --- 2. จัดรูปแบบ Location (รับค่าที่แปลแล้วมา) ---
      if (options.location) {
        // รับ string ที่มี \n มา แล้วแยกบรรทัด
        // เช่น "Phra Phrom\nจังหวัดนครศรีธรรมราช"
        options.location.split('\n').forEach(line => {
          if (line) lines.push(line); // เพิ่มทีละบรรทัด
        });
      } else {
        lines.push("ไม่สามารถระบุตำแหน่งได้");
      }
      // ---------------------------------------------------
      // (จบส่วนแก้ไขข้อความ)
      // ---------------------------------------------------
      
      // Configure watermark style (เหมือนเดิม)
      const fontSize = Math.max(24, canvas.width / 60);
      const lineHeight = fontSize * 1.2;
      const padding = fontSize;

      // Draw text (เหมือนเดิม)
      ctx.fillStyle = 'white';
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = 'right';
      ctx.shadowColor = 'rgba(0, 0, 0, 1)';
      ctx.shadowBlur = 3; 
      
      // Logic การวาด (เหมือนเดิม)
      // (บรรทัดแรก (Timestamp) จะอยู่ล่างสุด และบรรทัดต่อๆ ไป (Location) จะอยู่เหนือขึ้นไป)
      lines.forEach((line, index) => {
        const y = canvas.height - padding - ( (lines.length - 1 - index) * lineHeight );
        
        ctx.fillText(line, canvas.width - padding, y); 
      });

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