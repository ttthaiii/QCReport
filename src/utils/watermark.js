// Add watermark to image with multi-line location
export function addWatermark(imageFile, watermarkText, location = '') {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      try {
        // Set canvas size (12.5cm x 8.4cm = ~1476x992px at 300 DPI)
        const targetWidth = 1476;
        const targetHeight = 992;
        
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        // Draw image (scaled to fit)
        const imgAspect = img.width / img.height;
        const canvasAspect = targetWidth / targetHeight;
        
        let drawWidth, drawHeight, offsetX, offsetY;
        
        if (imgAspect > canvasAspect) {
          // Image is wider - fit to height
          drawHeight = targetHeight;
          drawWidth = drawHeight * imgAspect;
          offsetX = (targetWidth - drawWidth) / 2;
          offsetY = 0;
        } else {
          // Image is taller - fit to width
          drawWidth = targetWidth;
          drawHeight = drawWidth / imgAspect;
          offsetX = 0;
          offsetY = (targetHeight - drawHeight) / 2;
        }
        
        // Fill background with white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        
        // Draw image
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        
        // Add watermark with multi-line location
        const fontSize = Math.floor(targetWidth / 45); // ลดขนาดฟอนต์เล็กลง
        ctx.font = `${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        
        // Position watermark at bottom-right
        const padding = 15;
        const lineHeight = fontSize + 3;
        
        // Parse location และแบ่งบรรทัด
        const locationLines = parseLocationToLines(location);
        const lines = [watermarkText, ...locationLines].filter(Boolean);
        
        // วาดข้อความทีละบรรทัด (จากล่างขึ้นบน)
        lines.forEach((line, index) => {
          const y = targetHeight - padding - ((lines.length - 1 - index) * lineHeight);
          const textWidth = ctx.measureText(line).width;
          const x = targetWidth - textWidth - padding;
          
          // Draw text with outline
          ctx.strokeText(line, x, y);
          ctx.fillText(line, x, y);
        });
        
        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, 'image/jpeg', 0.9);
        
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
  const maxLines = 4; // จำกัดไม่เกิน 4 บรรทัด
  
  // ถ้ามีหลายส่วน ให้แบ่งเป็นบรรทัด
  if (parts.length <= maxLines) {
    // ถ้าไม่เกิน 4 ส่วน ให้แสดงทีละบรรทัด
    parts.forEach(part => {
      if (part.length > 25) { // ถ้าบรรทัดยาวเกิน 25 ตัวอักษร
        const words = part.split(' ');
        let currentLine = '';
        
        words.forEach(word => {
          if ((currentLine + ' ' + word).length > 25) {
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
    // ถ้าเกิน 4 ส่วน ให้รวมบางส่วน
    const important = parts.slice(-4); // เอา 4 ส่วนสุดท้าย (สำคัญที่สุด)
    important.forEach(part => {
      if (part.length <= 25) {
        lines.push(part);
      } else {
        // ตัดข้อความยาว
        lines.push(part.substring(0, 22) + '...');
      }
    });
  }
  
  // จำกัดไม่เกิน 4 บรรทัด
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