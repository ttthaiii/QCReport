// แทนที่ไฟล์ src/utils/watermark.js
// แก้ไขให้รองรับ Portrait และ Landscape อัตโนมัติ + ฟอนต์ใหญ่ขึ้น

export function addWatermark(imageFile, watermarkText, location = '') {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      try {
        // 🔥 รูปที่เข้ามาควรเป็น 1600x1200 แล้ว (มาตรฐาน)
        const imageWidth = img.width;
        const imageHeight = img.height;
        
        console.log(`Watermark input: ${imageWidth}x${imageHeight}`);
        
        // ใช้ขนาดเดิมของรูป (ไม่ต้องปรับ)
        canvas.width = imageWidth;
        canvas.height = imageHeight;
        
        // Fill background with white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, imageWidth, imageHeight);
        
        // Draw image (maintain original size)
        ctx.drawImage(img, 0, 0, imageWidth, imageHeight);
        
        // 🔥 Watermark size ตามขนาดรูป - เพิ่มขนาดให้ใหญ่ขึ้นมาก
        const fontSize = Math.floor(Math.min(imageWidth, imageHeight) / 50); // เปลี่ยนจาก 65 เป็น 50 (ใหญ่ขึ้นอีก ~30%)
        ctx.font = `bold ${fontSize}px Arial, sans-serif`; // เพิ่ม bold
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'; // เข้มขึ้น
        ctx.lineWidth = Math.max(3, Math.floor(fontSize / 8)); // เพิ่มความหนาของ stroke
        
        // Position watermark at bottom-right
        const padding = Math.floor(imageWidth / 50); // ปรับ padding ให้เหมาะสมกับฟอนต์ใหญ่
        const lineHeight = fontSize + 6; // เพิ่มระยะห่างระหว่างบรรทัดเพิ่มเติม
        
        // Parse location และแบ่งบรรทัด
        const locationLines = parseLocationToLines(location);
        const lines = [watermarkText, ...locationLines].filter(Boolean);
        
        // วาดข้อความทีละบรรทัด (จากล่างขึ้นบน)
        lines.forEach((line, index) => {
          const y = imageHeight - padding - ((lines.length - 1 - index) * lineHeight);
          const textWidth = ctx.measureText(line).width;
          const x = imageWidth - textWidth - padding;
          
          // Draw text with outline (stroke ก่อน fill)
          ctx.strokeText(line, x, y);
          ctx.fillText(line, x, y);
        });
        
        // 🔥 เพิ่ม shadow effect เพื่อให้ข้อความเด่นชัดขึ้น
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'; // เข้มขึ้น
        ctx.shadowBlur = 3; // เบลอมากขึ้น
        ctx.shadowOffsetX = 2; // เลื่อนมากขึ้น
        ctx.shadowOffsetY = 2;
        
        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob) {
            console.log(`Watermarked image: ${imageWidth}x${imageHeight}, size: ${blob.size} bytes, fontSize: ${fontSize}px`);
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, 'image/jpeg', 0.92); // คุณภาพสูง
        
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // Create object URL from blob/file
    if (imageFile instanceof Blob || imageFile instanceof File) {
      img.src = URL.createObjectURL(imageFile);
    } else {
      reject(new Error('Invalid image file type'));
    }
  });
}

// แยกที่อยู่เป็นบรรทัดตามลำดับ: หมู่บ้าน, ตำบล, อำเภอ, จังหวัด
function parseLocationToLines(location) {
  if (!location || location.trim() === '') return [];
  
  // ลบข้อความที่ไม่จำเป็น
  let cleanLocation = location
    .replace(/ประเทศไทย|Thailand/gi, '')
    .replace(/\d{5}/, '') // เลขไปรษณีย์
    .trim();
  
  // แยกตามจุลภาค
  const parts = cleanLocation.split(',').map(part => part.trim()).filter(Boolean);
  
  if (parts.length === 0) return [];
  
  // พยายามจัดกลุ่มตามรูปแบบที่อยู่ไทย
  const lines = [];
  const maxLines = 3; // ลดจาก 4 เป็น 3 บรรทัด เพื่อให้ฟอนต์ใหญ่ไม่เกะกะ
  
  // ถ้ามีหลายส่วน ให้แบ่งเป็นบรรทัด
  if (parts.length <= maxLines) {
    // ถ้าไม่เกิน 3 ส่วน ให้แสดงทีละบรรทัด
    parts.forEach(part => {
      if (part.length > 30) { // เพิ่มความยาวสูงสุดต่อบรรทัด
        const words = part.split(' ');
        let currentLine = '';
        
        words.forEach(word => {
          if ((currentLine + ' ' + word).length > 30) {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = currentLine ? currentLine + ' ' + word : word;
          }
        });
        
        if (currentLine) lines.push(currentLine);
      } else {
        lines.push(part);
      }
    });
  } else {
    // ถ้าเกิน 3 ส่วน ให้รวมบางส่วน
    const important = parts.slice(-3); // เอา 3 ส่วนสุดท้าย (สำคัญที่สุด)
    important.forEach(part => {
      if (part.length <= 30) {
        lines.push(part);
      } else {
        // ตัดข้อความยาว
        lines.push(part.substring(0, 27) + '...');
      }
    });
  }
  
  // จำกัดไม่เกิน 3 บรรทัด
  return lines.slice(0, maxLines);
}

// Format current time in Thai
export function formatThaiDateTime() {
  const now = new Date();
  const options = {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  
  const formatter = new Intl.DateTimeFormat('th-TH', options);
  return formatter.format(now).replace(/\//g, '/');
}