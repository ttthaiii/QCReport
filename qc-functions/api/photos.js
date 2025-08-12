const { getDriveClient } = require('../services/google-auth');
const { Readable } = require('stream');

// อัปโหลดรูปไป Google Shared Drive
async function uploadPhoto(photoData) {
  try {
    const { imageBuffer, filename, building, foundation, category } = photoData;
    
    console.log(`Starting upload to shared drive: ${filename}`);
    
    // สร้าง readable stream จาก buffer
    const stream = new Readable();
    stream.push(imageBuffer);
    stream.push(null);
    
    const drive = getDriveClient();
    
    // ทดสอบเข้าถึง Drive ก่อน
    try {
      const aboutResponse = await drive.about.get({ fields: 'user' });
      console.log('Drive accessible, user:', aboutResponse.data.user?.emailAddress);
    } catch (aboutError) {
      console.error('Cannot access Drive:', aboutError.message);
      throw new Error('Drive access denied');
    }
    
    // SOLUTION 1: อัปโหลดไปยัง Shared Drive
    const SHARED_DRIVE_ID = '0AAtwqQRo9hyoUk9PVA'; // Your actual Shared Drive ID
    const FOLDER_ID = '1abU3Kp24IjOyu6wMxQ-TFcoPirhoum2o'; // Your folder inside Shared Drive
    
    console.log('Uploading file to shared drive folder...');
    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [FOLDER_ID], // อัปโหลดไปยัง folder ใน Shared Drive
        description: `QC Photo: ${building}-${foundation}-${category}`
      },
      media: {
        mimeType: 'image/jpeg',
        body: stream
      },
      supportsAllDrives: true, // สำคัญ: รองรับ Shared Drive
      fields: 'id, name, webViewLink, webContentLink'
    });
    
    const file = response.data;
    console.log(`Upload successful to shared drive: ${file.id}`);
    
    // ตั้งค่า permission (ถ้าต้องการ)
    try {
      await drive.permissions.create({
        fileId: file.id,
        supportsAllDrives: true,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
      console.log('Permission set to public');
    } catch (permError) {
      console.log('Permission setting failed:', permError.message);
      // ไม่เป็นปัญหาร้ายแรง
    }
    
    return {
      fileId: file.id,
      filename: file.name,
      viewLink: file.webViewLink,
      downloadLink: file.webContentLink,
      driveUrl: `https://drive.google.com/file/d/${file.id}/view`
    };
    
  } catch (error) {
    console.error('Error uploading photo:', error);
    throw error;
  }
}

module.exports = {
  uploadPhoto
};