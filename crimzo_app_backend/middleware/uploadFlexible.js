const { upload } = require('../config/cloudinary');

/**
 * Accept multipart file under any field name (video/media/file/etc).
 * React Native + web clients use different field names; multer.single() throws otherwise.
 * Sets req.file to the first uploaded file for existing controllers.
 */
function flexibleSingle() {
  return (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) return next(err);

      const files = Array.isArray(req.files) ? req.files : [];
      req.file = files[0] || null;

      if (files.length > 1) {
        console.warn(
          'Multiple files in upload, using first:',
          files.map((f) => f.fieldname).join(', '),
        );
      }

      next();
    });
  };
}

module.exports = { flexibleSingle };