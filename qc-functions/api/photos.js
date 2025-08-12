const { getDriveClient } = require('../services/google-auth');
const { Readable } = require('stream');

// อัปโหลดรูปไป Google Drive (แบบง่าย - ไม่สร้าง folder)
async function uploadPhoto(photoData) {
  try {
    const { imageBuffer, filename, building, foundation, category } = photoData;
    
    console.log(`Starting simple upload: ${filename}`);
    
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
    
    // อัปโหลดไฟล์ลง root (ไม่ระบุ parents)
    console.log('Uploading file to root...');
    const response = await drive.files.create({
      requestBody: {
        name: filename,
        description: `QC Photo: ${building}-${foundation}-${category}`
      },
      media: {
        mimeType: 'image/jpeg',
        body: stream
      },
      fields: 'id, name, webViewLink, webContentLink'
    });
    
    const file = response.data;
    console.log(`Upload successful: ${file.id}`);
    
    // ไม่ต้องทำ public permission ก่อน
    
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