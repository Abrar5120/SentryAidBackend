const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const PROFILE_DIR = path.join(UPLOADS_ROOT, 'profile');
const NID_DIR = path.join(UPLOADS_ROOT, 'nid');

function ensureUploadDirectories() {
  for (const dir of [UPLOADS_ROOT, PROFILE_DIR, NID_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

module.exports = {
  UPLOADS_ROOT,
  PROFILE_DIR,
  NID_DIR,
  ensureUploadDirectories
};
