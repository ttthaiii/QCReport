// Filename: src/utils/watermark.ts

// "พิมพ์เขียว" สำหรับข้อมูลที่จะนำมาสร้างเป็นลายน้ำ
interface WatermarkTextOptions {
  projectName: string;
  category: string;
  topic: string;
  location: string;
}

/**
 * เพิ่มลายน้ำลงบนรูปภาพ (ในรูปแบบ Base64) และ return กลับเป็น Blob
 * @param {string} base64String รูปภาพต้นฉบับในรูปแบบ Base64
 * @param {WatermarkTextOptions} textOptions Object ที่มีข้อความสำหรับสร้างลายน้ำ
 * @returns {Promise<Blob>} Promise ที่จะ resolve เป็น Blob ของรูปภาพใหม่ที่มีลายน้ำ
 */
export function addWatermark(base64String: string, textOptions: WatermarkTextOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // กำหนดขนาด canvas ให้เท่ากับรูปภาพ
      canvas.width = img.width;
      canvas.height = img.height;

      if (!ctx) {
        return reject(new Error('ไม่สามารถสร้าง CanvasRenderingContext2D ได้'));
      }

      // วาดรูปภาพต้นฉบับลงบน canvas
      ctx.drawImage(img, 0, 0);

      // --- ตั้งค่าข้อความลายน้ำ ---
      const timestamp = new Date().toLocaleString('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Bangkok'
      });

      const fontSize = Math.floor(canvas.width / 40); // ขนาด Font แปรผันตามความกว้างของรูป
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.fillStyle = 'rgba(255, 255, 0, 0.9)'; // สีเหลืองกึ่งโปร่งใส
      ctx.textAlign = 'left';

      // --- สร้างข้อความแต่ละบรรทัด ---
      const lines = [
        `โครงการ: ${textOptions.projectName || '-'}`,
        `หมวดงาน: ${textOptions.category}`,
        `หัวข้อ: ${textOptions.topic}`,
        `ตำแหน่ง: ${textOptions.location}`,
        `วัน-เวลา: ${timestamp}`
      ];

      const padding = fontSize;

      // วาดพื้นหลังสีดำโปร่งแสงสำหรับข้อความ
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      const textHeight = lines.length * (fontSize * 1.2);
      ctx.fillRect(0, canvas.height - textHeight - (padding * 2), canvas.width, textHeight + (padding * 2));

      // วาดข้อความลงบน canvas
      ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
      lines.forEach((line, index) => {
        const y = canvas.height - textHeight - padding + (index * (fontSize * 1.2));
        ctx.fillText(line, padding, y);
      });


      // แปลง canvas กลับเป็น Blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('การสร้าง Blob จาก Canvas ล้มเหลว'));
          }
        },
        'image/jpeg',
        0.9 // คุณภาพของรูปภาพ (90%)
      );
    };

    img.onerror = (error) => {
        reject(error);
    };

    // กำหนด src ของ Image ให้เป็น base64 string ที่ได้รับมา
    img.src = base64String;
  });
}