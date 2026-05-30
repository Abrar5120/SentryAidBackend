const express = require('express');
const User = require('../models/User');
const protect = require('../middleware/authMiddleware');
const adminOnly = require('../middleware/adminMiddleware');
const {
  getAdminUsersDirectory,
  getAdminVolunteersDirectory,
  deleteAdminUserAccount
} = require('../controllers/adminDirectoryController');
const {
  streamUserNidImage,
  getAdminUserDetail
} = require('../controllers/adminNidController');
const { getAdminStats } = require('../controllers/adminAnalyticsController');
const {
  getAdminReviews,
  deleteAdminReview,
  getAdminVolunteerRankings
} = require('../controllers/reviewController');
const sendVolunteerApprovalEmail = require('../utils/sendVolunteerApprovalEmail');

const ADMIN_APPROVAL_DEBUG = 'ADMIN_APPROVAL_DEBUG';
const VOLUNTEER_APPROVAL_EMAIL_DEBUG = 'VOLUNTEER_APPROVAL_EMAIL_DEBUG';

/**
 * Sends approval email only when volunteerApprovalStatus transitions pending → approved.
 * @param {string} statusBefore Value before DB update
 * @param {{ email?: string, name?: string, volunteerApprovalStatus?: string }} user Saved user after update
 */
async function notifyVolunteerApprovedByEmail(statusBefore, user) {
  const before = (statusBefore || '').toLowerCase();
  const after = (user?.volunteerApprovalStatus || '').toLowerCase();

  console.log(VOLUNTEER_APPROVAL_EMAIL_DEBUG, 'status_before=' + before);
  console.log(VOLUNTEER_APPROVAL_EMAIL_DEBUG, 'status_after=' + after);

  if (before !== 'pending' || after !== 'approved') {
    return;
  }

  const email = user?.email;
  try {
    await sendVolunteerApprovalEmail(email, user?.name);
    console.log(VOLUNTEER_APPROVAL_EMAIL_DEBUG, 'success', email);
  } catch (err) {
    console.error(
      VOLUNTEER_APPROVAL_EMAIL_DEBUG,
      'failed',
      email,
      err?.message || err
    );
  }
}

const router = express.Router();

router.get('/reviews', protect, adminOnly, getAdminReviews);
router.delete('/reviews/:id', protect, adminOnly, deleteAdminReview);
router.get('/volunteer-rankings', protect, adminOnly, getAdminVolunteerRankings);

router.get('/users', protect, adminOnly, getAdminUsersDirectory);
router.get('/users/:userId/detail', protect, adminOnly, getAdminUserDetail);
router.get('/users/:userId/nid/:side', protect, adminOnly, streamUserNidImage);
router.get('/volunteers', protect, adminOnly, getAdminVolunteersDirectory);
router.delete('/users/:id', protect, adminOnly, deleteAdminUserAccount);

// PUT /api/admin/approve/:userId
// Approves a volunteer by updating status to "approved"
router.put('/approve/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user by ID
    const user = await User.findById(userId);

    // If user not found
    if (!user) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }

    // Debug logging: before approval
    console.log("ADMIN APPROVAL - User ID:", userId);
    console.log("ADMIN APPROVAL - Current status:", user.status);
    console.log("ADMIN APPROVAL - Current role:", user.role);

    // Update status to "approved"
    user.status = "approved";
    await user.save();

    // Debug logging: after approval
    console.log("ADMIN APPROVAL - Status updated to:", user.status);
    console.log("ADMIN APPROVAL - User can now login");

    // Return success response
    res.json({
      message: "Volunteer approved successfully"
    });
  } catch (error) {
    console.error('Error approving volunteer:', error);
    res.status(500).json({
      message: 'Server error while approving volunteer',
      error: error.message
    });
  }
});

// GET /api/admin/pending-volunteers
// Returns all users with volunteer approval pending.
router.get('/pending-volunteers', protect, adminOnly, async (req, res) => {
  try {
    const volunteerRoleFilter = { $in: ['VOLUNTEER', 'BOTH'] };

    const users = await User.find({
      volunteerApprovalStatus: 'pending',
      isEmailVerified: true,
      role: volunteerRoleFilter
    });

    const excludedUsersCount = await User.countDocuments({
      volunteerApprovalStatus: 'pending',
      isEmailVerified: true,
      role: 'USER'
    });

    console.log(ADMIN_APPROVAL_DEBUG, 'Pending volunteers count', users.length);
    console.log(ADMIN_APPROVAL_DEBUG, 'Excluded users count', excludedUsersCount);

    // Map users to return required fields: id, name, email, role, nid, profileImage
    const volunteers = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      nid: user.nid || "",
      profileImage: user.profileImage || "",
      hasNidFront: Boolean(user.nidFrontImage),
      hasNidBack: Boolean(user.nidBackImage)
    }));

    // Return success response with pending volunteers
    res.status(200).json({
      success: true,
      volunteers: volunteers
    });
  } catch (error) {
    console.error('Error fetching pending volunteers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pending volunteers',
      error: error.message
    });
  }
});

// PUT /api/admin/approve-volunteer/:id
// Approves a volunteer by setting their status to "approved"
router.put('/approve-volunteer/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find user by id
    const user = await User.findById(id);

    // If user not found
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const statusBefore = user.volunteerApprovalStatus;

    // Set status to "approved"
    user.status = "approved";
    user.volunteerStatus = "approved";
    user.volunteerApprovalStatus = "approved";

    // Save user
    await user.save();

    await notifyVolunteerApprovedByEmail(statusBefore, user);

    // Return success message
    res.status(200).json({
      success: true,
      message: "Volunteer approved successfully"
    });
  } catch (error) {
    console.error('Error approving volunteer:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while approving volunteer',
      error: error.message
    });
  }
});

// PUT /api/admin/reject-volunteer/:id
// Rejects a volunteer by setting their status to "rejected"
router.put('/reject-volunteer/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find user by id
    const user = await User.findById(id);

    // If user not found
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Set status to "rejected"
    user.status = "pending";
    user.volunteerStatus = "rejected";
    user.volunteerApprovalStatus = "rejected";

    // Save user
    await user.save();

    // Return success message
    res.status(200).json({
      success: true,
      message: "Volunteer rejected successfully"
    });
  } catch (error) {
    console.error('Error rejecting volunteer:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting volunteer',
      error: error.message
    });
  }
});

// POST /api/admin/approve-volunteer/:id
// Approves a volunteer by setting their status and volunteerStatus to "approved"
router.post('/approve-volunteer/:id', protect, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const statusBefore = user.volunteerApprovalStatus;

    user.status = 'approved';
    user.volunteerStatus = 'approved';
    user.volunteerApprovalStatus = 'approved';
    await user.save();

    await notifyVolunteerApprovedByEmail(statusBefore, user);

    res.status(200).json({
      success: true,
      message: 'Volunteer approved successfully'
    });
  } catch (error) {
    console.error('Error approving volunteer:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while approving volunteer',
      error: error.message
    });
  }
});

// POST /api/admin/reject-volunteer/:id
// Rejects a volunteer by setting their status and volunteerStatus to "rejected"
router.post('/reject-volunteer/:id', protect, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Find user by id and update both status and volunteerStatus
    const user = await User.findByIdAndUpdate(
      id,
      { 
        status: "pending",
        volunteerStatus: "rejected",
        volunteerApprovalStatus: "rejected"
      },
      { new: true }
    );

    // If user not found
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Return success message
    res.status(200).json({
      success: true,
      message: "Volunteer rejected successfully"
    });
  } catch (error) {
    console.error('Error rejecting volunteer:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting volunteer',
      error: error.message
    });
  }
});

router.get('/stats', protect, adminOnly, getAdminStats);

module.exports = router;
