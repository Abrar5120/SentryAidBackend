const User = require('../models/User');

const ADMIN_TERMINATE_DEBUG = 'ADMIN_TERMINATE_DEBUG';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchFilter(q) {
  if (q == null || typeof q !== 'string' || !q.trim()) {
    return null;
  }
  const safe = escapeRegex(q.trim());
  const rx = new RegExp(safe, 'i');
  return {
    $or: [{ name: rx }, { email: rx }]
  };
}

function mapUserPublic(u) {
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    phone: u.phone || '',
    nid: u.nid || '',
    role: u.role,
    status: u.status,
    volunteerAvailabilityStatus: u.volunteerAvailabilityStatus,
    profileImage: u.profileImage || '',
    hasNidFront: Boolean(u.nidFrontImage),
    hasNidBack: Boolean(u.nidBackImage),
    createdAt: u.createdAt
  };
}

const getAdminUsersDirectory = async (req, res) => {
  try {
    const search = buildSearchFilter(req.query.q);
    const roleFilter = { role: { $in: ['USER', 'BOTH'] } };
    const filter = search ? { $and: [roleFilter, search] } : roleFilter;

    const rows = await User.find(filter).select('-password').sort({ createdAt: -1 }).lean();
    const users = rows.map(mapUserPublic);

    return res.status(200).json({
      success: true,
      users
    });
  } catch (err) {
    console.error('getAdminUsersDirectory', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load users'
    });
  }
};

const getAdminVolunteersDirectory = async (req, res) => {
  try {
    const search = buildSearchFilter(req.query.q);
    const roleFilter = { role: { $in: ['VOLUNTEER', 'BOTH'] } };
    const filter = search ? { $and: [roleFilter, search] } : roleFilter;

    const rows = await User.find(filter).select('-password').sort({ createdAt: -1 }).lean();
    const volunteers = rows.map(mapUserPublic);

    return res.status(200).json({
      success: true,
      volunteers
    });
  } catch (err) {
    console.error('getAdminVolunteersDirectory', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load volunteers'
    });
  }
};

const deleteAdminUserAccount = async (req, res) => {
  try {
    const adminId = req.user?._id ?? req.user?.id;
    const { id } = req.params;

    if (String(id) === String(adminId)) {
      console.log(ADMIN_TERMINATE_DEBUG, 'blocked self-delete attempt');
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role === 'ADMIN') {
      console.log(ADMIN_TERMINATE_DEBUG, 'blocked delete admin account id=', String(id));
      return res.status(403).json({
        success: false,
        message: 'Cannot delete administrator accounts'
      });
    }

    await User.findByIdAndDelete(id);
    console.log(ADMIN_TERMINATE_DEBUG, 'terminated user id=', String(id));

    return res.status(200).json({
      success: true,
      message: 'Account terminated successfully.'
    });
  } catch (err) {
    console.error(ADMIN_TERMINATE_DEBUG, 'deleteAdminUserAccount', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
};

module.exports = {
  getAdminUsersDirectory,
  getAdminVolunteersDirectory,
  deleteAdminUserAccount,
  ADMIN_TERMINATE_DEBUG
};
