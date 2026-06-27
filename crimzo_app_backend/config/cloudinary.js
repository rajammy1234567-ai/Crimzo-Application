const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// === Local dev mode detection ===
// If Cloudinary creds are missing or still the placeholder, use LOCAL file storage.
// This lets you test 100% locally without signing up for Cloudinary yet.
const hasRealCloudinary =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'demo';

if (hasRealCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('✅ Cloudinary configured (production media hosting)');
} else {
  console.log('ℹ️  LOCAL MODE: Using local file storage for uploads (no Cloudinary needed for testing)');
  console.log('   → Media files will be saved to ./uploads/ and served at /uploads/...');
  console.log('   → For production later: sign up free at cloudinary.com and fill CLOUDINARY_* in .env');
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer memory storage (always — we decide where to persist after)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB reels/stories
    fieldSize: 200 * 1024 * 1024,
  },
});

// Helper: upload buffer (works for both Cloudinary and local dev)
const uploadToCloudinary = async (buffer, folder = 'misc', resourceType = 'auto', publicId = null, fileExt = null) => {
  if (hasRealCloudinary) {
    // Real Cloudinary
    return new Promise((resolve, reject) => {
      const options = {
        folder: `crimzo/${folder}`,
        resource_type: resourceType === 'auto' ? (folder === 'reels' || folder === 'stories' ? 'video' : 'image') : resourceType,
      };
      if (publicId) options.public_id = publicId;

      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
      stream.end(buffer);
    });
  }

  // === LOCAL DEV FALLBACK ===
  // Save file to disk and return fake "secure_url" that our server will serve
  const ext = fileExt
    || (folder === 'reels'
      ? '.mp4'
      : folder === 'sounds'
        ? (resourceType === 'raw' ? '.mp3' : '.m4a')
        : folder === 'stories' && resourceType === 'video'
          ? '.mp4'
          : '.jpg');
  const filename = `${folder}_${Date.now()}${ext}`;
  const filepath = path.join(uploadsDir, filename);

  await fs.promises.writeFile(filepath, buffer);

  // Return object that looks like Cloudinary result (our code uses .secure_url)
  // PUBLIC_BASE_URL must be reachable from phones (LAN IP), not localhost
  const publicBase = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, '');
  const localUrl = `${publicBase}/uploads/${filename}`;
  return {
    secure_url: localUrl,
    public_id: filename,
    url: localUrl,
    // extra for debugging
    local_path: filepath,
  };
};

// Delete helper (works for local too)
const deleteFromCloudinary = async (publicIdOrFilename, resourceType = 'image') => {
  if (hasRealCloudinary) {
    try {
      await cloudinary.uploader.destroy(publicIdOrFilename, { resource_type: resourceType });
    } catch (e) {
      console.error('Cloudinary delete error:', e.message);
    }
    return;
  }

  // Local delete
  try {
    const filepath = path.join(uploadsDir, publicIdOrFilename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (e) {
    console.error('Local file delete error:', e.message);
  }
};

module.exports = { cloudinary: hasRealCloudinary ? cloudinary : null, upload, uploadToCloudinary, deleteFromCloudinary, uploadsDir, hasRealCloudinary };
