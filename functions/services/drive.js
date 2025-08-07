// backend/services/drive.js
const { drive, DRIVE_ROOT_ID } = require('../../functions/config/google');
const sharp = require('sharp');
const { formatThaiDateTime } = require('../utils/datetime');
const { Readable } = require('stream');

class DriveService {
  constructor() {
    this.rootFolderId = DRIVE_ROOT_ID;
    this.folderCache = new Map(); // Cache folder IDs to avoid duplicate API calls
  }

  // สร้าง folder structure: /QC-Photos/<อาคาร>/<ฐานราก>/<หมวดงาน>/
  async ensureFolderStructure(building, foundation, category, isReport = false) {
    const basePath = isReport ? 'QC-Reports' : 'QC-Photos';
    const folderPath = isReport 
      ? `${basePath}/${building}/${foundation}`
      : `${basePath}/${building}/${foundation}/${category}`;
    
    // Check cache first
    if (this.folderCache.has(folderPath)) {
      return this.folderCache.get(folderPath);
    }

    try {
      let currentParentId = this.rootFolderId;
      const pathParts = folderPath.split('/');

      for (const folderName of pathParts) {
        const existingFolder = await this.findFolderByName(folderName, currentParentId);
        
        if (existingFolder) {
          currentParentId = existingFolder.id;
        } else {
          // Create new folder - เพิ่ม supportsAllDrives
          const newFolder = await drive.files.create({
            resource: {
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [currentParentId]
            },
            supportsAllDrives: true,  // เพิ่มบรรทัดนี้
            fields: 'id, name'
          });
          
          currentParentId = newFolder.data.id;
          console.log(`📁 Created folder: ${folderName} (${currentParentId})`);
        }
      }

      // Cache the final folder ID
      this.folderCache.set(folderPath, currentParentId);
      console.log(`📂 Folder structure ready: ${folderPath} -> ${currentParentId}`);
      return currentParentId;

    } catch (error) {
      console.error('❌ Error creating folder structure:', error.message);
      throw error;
    }
  }

  // ค้นหา folder ตามชื่อใน parent folder
  async findFolderByName(name, parentId) {
    try {
      const response = await drive.files.list({
        q: `name='${name}' and parents in '${parentId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        supportsAllDrives: true,        // เพิ่มบรรทัดนี้
        includeItemsFromAllDrives: true // เพิ่มบรรทัดนี้
      });

      return response.data.files.length > 0 ? response.data.files[0] : null;
    } catch (error) {
      console.error(`❌ Error finding folder ${name}:`, error.message);
      return null;
    }
  }

  // ปรับขนาดรูป + ใส่ timestamp overlay
  async processImage(buffer, location, timestamp) {
    try {
      // Convert buffer to sharp image
      let image = sharp(buffer);
      const metadata = await image.metadata();
      
      // Resize to 12.5 × 8.4 cm (≈ 1476×992 px at 300 DPI)
      const targetWidth = 1476;
      const targetHeight = 992;
      
      image = image.resize(targetWidth, targetHeight, {
        fit: 'cover',
        position: 'center'
      });

      // ✅ แก้ไข: สร้าง timestamp overlay แบบไม่มีพื้นหลังดำ
      const overlayText = `${timestamp}\n${location}`;
      
      // ใช้ภาษาไทยและไม่มีพื้นหลัง - เหมือนรูปที่ 2
      const svgOverlay = `
        <svg width="${targetWidth}" height="${targetHeight}">
          <!-- ไม่มี background rectangle -->
          <text x="30" y="60" 
                font-family="Arial, 'Noto Sans Thai', sans-serif" 
                font-size="32" 
                fill="white" 
                font-weight="bold"
                stroke="black" 
                stroke-width="2"
                paint-order="stroke">
            ${timestamp}
          </text>
          <text x="30" y="100" 
                font-family="Arial, 'Noto Sans Thai', sans-serif" 
                font-size="28" 
                fill="white"
                stroke="black" 
                stroke-width="1.5"
                paint-order="stroke">
            ${location.length > 80 ? location.substring(0, 80) + '...' : location}
          </text>
        </svg>
      `;

      // Apply overlay and convert to JPEG
      const processedBuffer = await image
        .composite([{
          input: Buffer.from(svgOverlay),
          top: 0,
          left: 0
        }])
        .jpeg({ quality: 90 })
        .toBuffer();

      console.log(`🖼️ Image processed: ${metadata.width}x${metadata.height} -> ${targetWidth}x${targetHeight}`);
      return processedBuffer;

    } catch (error) {
      console.error('❌ Error processing image:', error.message);
      throw error;
    }
  }

  // อัปโหลดรูป QC
  async uploadPhoto({ buffer, filename, building, foundation, category, mimetype, location, timestamp }) {
    try {
      // 1. Use provided location and timestamp
      const currentTimestamp = timestamp || formatThaiDateTime();
      const currentLocation = location || "Bangkok, Thailand";
      
      // 2. Process image (resize + overlay)
      const processedBuffer = await this.processImage(buffer, currentLocation, currentTimestamp);

      // 3. Ensure folder structure exists
      const folderId = await this.ensureFolderStructure(building, foundation, category);

      // 4. แปลง Buffer เป็น Readable Stream (แก้ไขตรงนี้!)
      const stream = Readable.from(processedBuffer);

      // 5. Upload to Google Drive
      const fileMetadata = {
        name: filename,
        parents: [folderId]
      };

      const media = {
        mimeType: 'image/jpeg',
        body: stream  // ✅ ใช้ stream แทน buffer
      };

      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink',
        supportsAllDrives: true
      });

      const fileId = response.data.id;
      
      console.log(`📤 Photo uploaded: ${filename} -> ${fileId}`);
      
      return {
        fileId: fileId,
        filename: filename,
        viewUrl: response.data.webViewLink,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
        directUrl: `https://drive.google.com/uc?id=${fileId}`,
        folderId: folderId
      };

    } catch (error) {
      console.error('❌ Error uploading photo:', error.message);
      throw error;
    }
  }

  // อัปโหลด PDF รายงาน
  async uploadReport({ buffer, filename, building, foundation }) {
    try {
      // 1. Ensure report folder structure exists
      const folderId = await this.ensureFolderStructure(building, foundation, null, true);

      // 2. แปลง Buffer เป็น Readable Stream (สำคัญมาก!)
      const stream = Readable.from(buffer);

      // 3. Upload PDF to Google Drive
      const fileMetadata = {
        name: filename,
        parents: [folderId]
      };

      const media = {
        mimeType: 'application/pdf',
        body: stream  // ใช้ stream ที่มี .pipe() method
      };

      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink',
        supportsAllDrives: true
      });

      const fileId = response.data.id;
  

      console.log(`📄 Report uploaded: ${filename} -> ${fileId}`);
      
      return {
        fileId: fileId,
        filename: filename,
        viewUrl: response.data.webViewLink,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
        directUrl: `https://drive.google.com/uc?id=${fileId}`,
        folderId: folderId
      };

    } catch (error) {
      console.error('❌ Error uploading report:', error.message);
      throw error;
    }
  }

  // ดึงรายการไฟล์ในโฟลเดอร์
  async listFiles(folderId, mimeType = null) {
    try {
      let query = `parents in '${folderId}' and trashed=false`;
      if (mimeType) {
        query += ` and mimeType='${mimeType}'`;
      }

      const response = await drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, createdTime, webViewLink, webContentLink)',
        orderBy: 'createdTime desc',
        supportsAllDrives: true,        // เพิ่มบรรทัดนี้
        includeItemsFromAllDrives: true // เพิ่มบรรทัดนี้
      });

      return response.data.files.map(file => ({
        fileId: file.id,
        filename: file.name,
        mimeType: file.mimeType,
        createdTime: file.createdTime,
        viewUrl: file.webViewLink,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
        directUrl: `https://drive.google.com/uc?id=${file.id}`
      }));

    } catch (error) {
      console.error('❌ Error listing files:', error.message);
      throw error;
    }
  }

  // ลบไฟล์
  async deleteFile(fileId) {
    try {
      await drive.files.delete({ 
        fileId,
        supportsAllDrives: true  // เพิ่มบรรทัดนี้
      });
      console.log(`🗑️ Deleted file: ${fileId}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting file:', error.message);
      throw error;
    }
  }

  // ดึงข้อมูลไฟล์
  async getFileInfo(fileId) {
    try {
      const response = await drive.files.get({
        fileId: fileId,
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink',
        supportsAllDrives: true  // เพิ่มบรรทัดนี้
      });

      return {
        fileId: response.data.id,
        filename: response.data.name,
        mimeType: response.data.mimeType,
        size: response.data.size,
        createdTime: response.data.createdTime,
        modifiedTime: response.data.modifiedTime,
        viewUrl: response.data.webViewLink,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${response.data.id}`,
        directUrl: `https://drive.google.com/uc?id=${response.data.id}`
      };

    } catch (error) {
      console.error('❌ Error getting file info:', error.message);
      throw error;
    }
  }

  // Download file from Drive (for report generation)
  async downloadFile(fileId) {
    try {
      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media',
        supportsAllDrives: true  // เพิ่มบรรทัดนี้
      }, { responseType: 'arraybuffer' });

      return Buffer.from(response.data);
    } catch (error) {
      console.error('❌ Error downloading file:', error.message);
      throw error;
    }
  }

  // Clear folder cache (useful for testing)
  clearCache() {
    this.folderCache.clear();
    console.log('🧹 Drive folder cache cleared');
  }
}

module.exports = new DriveService();