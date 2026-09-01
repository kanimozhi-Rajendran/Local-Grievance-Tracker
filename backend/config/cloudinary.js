const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

const isCloudinaryConfigured = 
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && 
          process.env.CLOUDINARY_API_KEY && 
          process.env.CLOUDINARY_API_SECRET);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('[Storage] Cloudinary configured and ready.');
} else {
  console.log('[Storage] Cloudinary credentials not detected in .env. Using local uploads directory fallback.');
}

/**
 * Upload an image either to Cloudinary or local server storage
 * @param {Object} file - Multer file object
 * @param {string} reqHost - Hostname with protocol from request (e.g., http://localhost:5000)
 * @returns {Promise<string>} - The accessible image URL
 */
const uploadImage = async (file, reqHost = 'http://localhost:5000') => {
  if (!file) return null;

  if (isCloudinaryConfigured) {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'grievance_tracker',
            transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
          },
          (error, res) => {
            if (error) return reject(error);
            resolve(res);
          }
        );
        stream.end(file.buffer);
      });
      return result.secure_url;
    } catch (err) {
      console.error('[Cloudinary Upload Error]', err.message);
      // Fallback to local file saving if Cloudinary call fails
    }
  }

  // Fallback: save to backend/uploads
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const extension = (file.mimetype && file.mimetype.split('/')[1]) || 'jpg';
  const fileName = `complaint_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
  const filePath = path.join(uploadsDir, fileName);

  fs.writeFileSync(filePath, file.buffer);
  return `${reqHost}/uploads/${fileName}`;
};

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  uploadImage,
};
