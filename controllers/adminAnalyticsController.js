const User = require('../models/User');
const SOS = require('../models/SOS');

const ADMIN_ANALYTICS_DEBUG = 'ADMIN_ANALYTICS_DEBUG';

/**
 * GET /api/admin/stats
 * Real-time dashboard counts from MongoDB (parallel countDocuments).
 */
const getAdminStats = async (req, res) => {
  try {
    const [
      totalUsers,
      approvedVolunteers,
      pendingRequests,
      totalSOS,
      pendingSOS,
      acceptedSOS,
      completedSOS,
      cancelledSOS,
      activeSOS
    ] = await Promise.all([
      User.countDocuments({ role: { $in: ['USER', 'BOTH'] } }),
      User.countDocuments({ role: { $in: ['VOLUNTEER', 'BOTH'] } }),
      User.countDocuments({
        role: { $in: ['VOLUNTEER', 'BOTH'] },
        volunteerApprovalStatus: 'pending',
        isEmailVerified: true
      }),
      SOS.countDocuments({}),
      SOS.countDocuments({ status: 'pending' }),
      SOS.countDocuments({ status: 'accepted' }),
      SOS.countDocuments({ status: 'completed' }),
      SOS.countDocuments({ status: 'cancelled' }),
      SOS.countDocuments({
        status: { $in: ['pending', 'accepted', 'awaiting_user_confirmation'] }
      })
    ]);

    const payload = {
      success: true,
      totalUsers,
      approvedVolunteers,
      pendingRequests,
      totalSOS,
      pendingSOS,
      completedSOS,
      cancelledSOS,
      activeSOS,
      acceptedSOS
    };

    console.log(ADMIN_ANALYTICS_DEBUG, 'counts', payload);

    return res.status(200).json(payload);
  } catch (err) {
    console.error(ADMIN_ANALYTICS_DEBUG, 'failure', err?.message || err);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching statistics',
      error: err.message
    });
  }
};

module.exports = {
  getAdminStats,
  ADMIN_ANALYTICS_DEBUG
};
