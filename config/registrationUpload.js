const path = require('path');
const multer = require('multer');
const { PROFILE_DIR, NID_DIR, ensureUploadDirectories } = require('./uploadDirs');

const REGISTER_NID_DEBUG = 'REGISTER_NID_DEBUG';
const NID_UPLOAD_DEBUG = 'NID_UPLOAD_DEBUG';

ensureUploadDirectories();

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/pjpeg',
  'image/heic',
  'image/heif',
  'image/webp'
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function safeFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase() || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext)
    ? ext
    : '.jpg';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === 'nidFrontImage' || file.fieldname === 'nidBackImage') {
      cb(null, NID_DIR);
    } else {
      cb(null, PROFILE_DIR);
    }
  },
  filename(req, file, cb) {
    cb(null, safeFilename(file.originalname));
  }
});

const imageFileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.log(NID_UPLOAD_DEBUG, 'rejected mime type', file.mimetype, 'field', file.fieldname);
    cb(new Error('Only image files are allowed'), false);
  }
};

const registerUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFileFilter
});

const registerUploadFields = registerUpload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'nidFrontImage', maxCount: 1 },
  { name: 'nidBackImage', maxCount: 1 }
]);

function cleanupUploadedFiles(files) {
  const fs = require('fs');
  if (!files) return;
  Object.values(files).forEach((arr) => {
    (arr || []).forEach((f) => {
      if (f?.path) {
        try {
          fs.unlinkSync(f.path);
        } catch (e) {
          console.warn(NID_UPLOAD_DEBUG, 'cleanup failed', f.path, e.message);
        }
      }
    });
  });
}

function fileToRelativePath(file, folder) {
  if (!file) return '';
  return `/uploads/${folder}/${file.filename}`;
}

module.exports = {
  registerUploadFields,
  cleanupUploadedFiles,
  fileToRelativePath,
  REGISTER_NID_DEBUG,
  NID_UPLOAD_DEBUG
};
