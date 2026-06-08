const User = require('../models/User');
const sendVolunteerTerminationEmail = require('../utils/sendVolunteerTerminationEmail');
const {
  APPROVED_VOLUNTEER_FILTER,
  logApprovedVolunteerIncluded,
  logPendingApplicantExcluded
} = require('../utils/volunteerApprovalFilters');

const ADMIN_TERMINATE_DEBUG = 'ADMIN_TERMINATE_DEBUG';
const VOLUNTEER_TERMINATION_EMAIL_DEBUG = 'VOLUNTEER_TERMINATION_EMAIL_DEBUG';

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
    volunteerApprovalStatus: u.volunteerApprovalStatus || 'pending',
    terminationReason: u.terminationReason || null,
    terminatedAt: u.terminatedAt || null,
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
    const filter = search ? { $and: [APPROVED_VOLUNTEER_FILTER, search] } : APPROVED_VOLUNTEER_FILTER;

    const rows = await User.find(filter).select('-password').sort({ createdAt: -1 }).lean();
    const volunteers = rows.map(mapUserPublic);

    const pendingExcluded = await User.countDocuments({
      role: { $in: ['VOLUNTEER', 'BOTH'] },
      volunteerApprovalStatus: { $ne: 'approved' }
    });
    if (pendingExcluded > 0) {
      logPendingApplicantExcluded('volunteer directory', `excludedCount=${pendingExcluded}`);
    }
    logApprovedVolunteerIncluded('volunteer directory', `count=${volunteers.length}`);

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

/**
 * POST /api/admin/volunteers/:id/terminate
 * Soft-terminate volunteer access with audit reason (does not delete the user record).
 */
const terminateVolunteerAccount = async (req, res) => {
  try {
    const adminId = req.user?._id ?? req.user?.id;
    const { id } = req.params;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Termination reason is required'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Volunteer not found'
      });
    }

    if (!['VOLUNTEER', 'BOTH'].includes(user.role)) {
      return res.status(400).json({
        success: false,
        message: 'Account is not a volunteer account'
      });
    }

    if (user.volunteerApprovalStatus === 'terminated') {
      return res.status(400).json({
        success: false,
        message: 'Volunteer account is already terminated'
      });
    }

    const terminatedAt = new Date();
    user.volunteerApprovalStatus = 'terminated';
    user.volunteerAvailabilityStatus = 'inactive';
    user.terminationReason = reason;
    user.terminatedAt = terminatedAt;
    user.terminatedBy = adminId;
    await user.save();

    console.log(ADMIN_TERMINATE_DEBUG, 'volunteer terminated id=', String(id), 'reason=', reason);

    try {
      await sendVolunteerTerminationEmail(user.email, user.name, terminatedAt, reason);
      console.log(VOLUNTEER_TERMINATION_EMAIL_DEBUG, 'success', user.email);
    } catch (emailErr) {
      console.error(
        VOLUNTEER_TERMINATION_EMAIL_DEBUG,
        'failed',
        user.email,
        emailErr?.message || emailErr
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Volunteer account terminated successfully.',
      volunteer: {
        id: String(user._id),
        volunteerApprovalStatus: user.volunteerApprovalStatus,
        terminationReason: user.terminationReason,
        terminatedAt: user.terminatedAt
      }
    });
  } catch (err) {
    console.error(ADMIN_TERMINATE_DEBUG, 'terminateVolunteerAccount', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to terminate volunteer account'
    });
  }
};

module.exports = {
  getAdminUsersDirectory,
  getAdminVolunteersDirectory,
  deleteAdminUserAccount,
  terminateVolunteerAccount,
  ADMIN_TERMINATE_DEBUG
};
