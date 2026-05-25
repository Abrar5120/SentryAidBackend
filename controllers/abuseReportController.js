const mongoose = require('mongoose');
const AbuseReport = require('../models/AbuseReport');

function mapBrief(u) {
  if (!u) return null;
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    profileImage: u.profileImage || ''
  };
}

const createAbuseReport = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    const { volunteerId, title, description } = req.body || {};

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'title is required'
      });
    }

    if (typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: 'description is required'
      });
    }

    let volunteerObjectId = null;
    if (volunteerId != null && String(volunteerId).trim() !== '') {
      if (!mongoose.Types.ObjectId.isValid(volunteerId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid volunteerId'
        });
      }
      volunteerObjectId = volunteerId;
    }

    const doc = await AbuseReport.create({
      userId,
      volunteerId: volunteerObjectId,
      title: title.trim(),
      description: description.trim(),
      status: 'open'
    });

    return res.status(201).json({
      success: true,
      message: 'Incident report submitted.',
      reportId: doc._id
    });
  } catch (err) {
    console.error('createAbuseReport', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit report'
    });
  }
};

const getAdminAbuseReports = async (req, res) => {
  try {
    const rows = await AbuseReport.find({ status: 'open' })
      .populate({ path: 'userId', select: 'name email profileImage' })
      .populate({ path: 'volunteerId', select: 'name email profileImage' })
      .sort({ createdAt: -1 })
      .lean();

    const reports = rows.map((row) => ({
      _id: row._id,
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      user: mapBrief(row.userId),
      volunteer: mapBrief(row.volunteerId)
    }));

    return res.status(200).json({
      success: true,
      reports
    });
  } catch (err) {
    console.error('getAdminAbuseReports', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load abuse reports'
    });
  }
};

const resolveAbuseReport = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report id'
      });
    }

    const updated = await AbuseReport.findByIdAndUpdate(
      id,
      { status: 'resolved', resolvedAt: new Date() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Report marked as resolved.'
    });
  } catch (err) {
    console.error('resolveAbuseReport', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to resolve report'
    });
  }
};

module.exports = {
  createAbuseReport,
  getAdminAbuseReports,
  resolveAbuseReport
};
