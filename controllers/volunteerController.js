const User = require('../models/User');

// PUT /api/volunteer/status
const updateVolunteerStatus = async (req, res) => {
  try {
    const userId = req?.user?._id;
    const role = (req?.user?.role || '').toUpperCase();
    const { status } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    if (role !== 'VOLUNTEER' && role !== 'BOTH') {
      return res.status(403).json({
        success: false,
        message: 'Only volunteers can update availability status'
      });
    }

    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({
        success: false,
        message: 'status must be active or inactive'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Volunteer not found'
      });
    }

    user.volunteerAvailabilityStatus = status;
    await user.save();

    return res.json({
      success: true,
      status: user.volunteerAvailabilityStatus
    });
  } catch (error) {
    console.error('updateVolunteerStatus error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update volunteer status'
    });
  }
};

// PUT /api/volunteer/location — persist volunteer GPS for nearby SOS matching
const updateVolunteerLocation = async (req, res) => {
  try {
    const userId = req?.user?._id;
    const role = (req?.user?.role || '').toUpperCase();
    const { latitude, longitude } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    if (role !== 'VOLUNTEER' && role !== 'BOTH') {
      return res.status(403).json({
        success: false,
        message: 'Only volunteers can update location'
      });
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude are required numbers'
      });
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude must be finite'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.set({
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      }
    });
    await user.save();

    return res.json({
      success: true,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      }
    });
  } catch (error) {
    console.error('updateVolunteerLocation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update volunteer location'
    });
  }
};

module.exports = {
  updateVolunteerStatus,
  updateVolunteerLocation
};

