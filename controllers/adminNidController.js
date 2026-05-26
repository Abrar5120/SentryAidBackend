const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { UPLOADS_ROOT, NID_DIR } = require('../config/uploadDirs');

const ADMIN_NID_DEBUG = 'ADMIN_NID_DEBUG';

function resolveSafeNidAbsolutePath(storedPath) {
  if (!storedPath || typeof storedPath !== 'string') {
    return null;
  }
  const normalized = storedPath.replace(/\\/g, '/').trim();
  if (!normalized.startsWith('/uploads/nid/')) {
    console.warn(ADMIN_NID_DEBUG, 'blocked non-nid path', storedPath);
    return null;
  }
  const filename = path.basename(normalized);
  const absolute = path.join(NID_DIR, filename);
  const resolved = path.resolve(absolute);
  const nidRoot = path.resolve(NID_DIR);
  if (!resolved.startsWith(nidRoot)) {
    console.warn(ADMIN_NID_DEBUG, 'path traversal blocked', storedPath);
    return null;
  }
  if (!fs.existsSync(resolved)) {
    return null;
  }
  return resolved;
}

/**
 * GET /api/admin/users/:userId/nid/:side  (side = front | back)
 * Admin-only stream of NID image file.
 */
const streamUserNidImage = async (req, res) => {
  try {
    const { userId, side } = req.params;
    const sideNorm = String(side || '').toLowerCase();
    if (sideNorm !== 'front' && sideNorm !== 'back') {
      return res.status(400).json({ success: false, message: 'Invalid NID side' });
    }

    const user = await User.findById(userId).select('nidFrontImage nidBackImage name email');
    if (!user) {
      console.log(ADMIN_NID_DEBUG, 'user not found', userId);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const storedPath = sideNorm === 'front' ? user.nidFrontImage : user.nidBackImage;
    if (!storedPath) {
      console.log(ADMIN_NID_DEBUG, 'no nid image', userId, sideNorm);
      return res.status(404).json({ success: false, message: 'NID image not uploaded' });
    }

    const absolute = resolveSafeNidAbsolutePath(storedPath);
    if (!absolute) {
      console.log(ADMIN_NID_DEBUG, 'file missing on disk', userId, sideNorm, storedPath);
      return res.status(404).json({ success: false, message: 'NID file not found' });
    }

    console.log(ADMIN_NID_DEBUG, 'serving nid', userId, sideNorm, 'admin=', req.user?.email || req.user?.id);
    res.sendFile(absolute);
  } catch (err) {
    console.error(ADMIN_NID_DEBUG, 'stream failure', err?.message || err);
    return res.status(500).json({ success: false, message: 'Failed to load NID image' });
  }
};

/**
 * GET /api/admin/users/:userId/detail
 */
const getAdminUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password -emailOTP -resetPasswordToken');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(ADMIN_NID_DEBUG, 'detail fetch success', String(user._id));

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        nid: user.nid,
        role: user.role,
        status: user.status,
        volunteerApprovalStatus: user.volunteerApprovalStatus,
        userApprovalStatus: user.userApprovalStatus,
        profileImage: user.profileImage || '',
        hasNidFront: Boolean(user.nidFrontImage),
        hasNidBack: Boolean(user.nidBackImage),
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error(ADMIN_NID_DEBUG, 'detail failure', err?.message || err);
    return res.status(500).json({ success: false, message: 'Failed to load user detail' });
  }
};

module.exports = {
  streamUserNidImage,
  getAdminUserDetail,
  ADMIN_NID_DEBUG,
  resolveSafeNidAbsolutePath
};
