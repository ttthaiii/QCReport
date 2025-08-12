// Add watermark to image
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
        
        // Add watermark
        const fontSize = Math.floor(targetWidth / 40); // Responsive font size
        ctx.font = `${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        
        // Position watermark at bottom-right
        const padding = 20;
        const lines = [
          watermarkText,
          location
        ].filter(Boolean);
        
        lines.forEach((line, index) => {
          const y = targetHeight - padding - ((lines.length - 1 - index) * (fontSize + 5));
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