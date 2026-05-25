const mongoose = require('mongoose');
const SOS = require('../models/SOS');
const Review = require('../models/Review');
const { buildVolunteerRankings } = require('../services/volunteerRankingService');

const REVIEW_DEBUG = 'REVIEW_DEBUG';
const REVIEW_TRIGGER_DEBUG = 'REVIEW_TRIGGER_DEBUG';
const REVIEW_BACKEND_DEBUG = 'REVIEW_BACKEND_DEBUG';

/** Pending review filter — only explicit false matches (after repair, missing fields are false). */
function buildPendingReviewFilter(userId) {
  const uid = userId && mongoose.Types.ObjectId.isValid(String(userId))
    ? new mongoose.Types.ObjectId(String(userId))
    : userId;
  return {
    userId: uid,
    status: 'completed',
    acceptedBy: { $exists: true, $ne: null },
    reviewSubmitted: false
  };
}

function sendPendingReviewResponse(res, hasPendingReview, sos) {
  const responseObject = {
    success: true,
    hasPendingReview: !!hasPendingReview,
    sos: hasPendingReview && sos ? sos : null
  };
  console.log(REVIEW_BACKEND_DEBUG, 'response=', JSON.stringify(responseObject, null, 2));
  return res.status(200).json(responseObject);
}

async function markSosReviewSubmitted(sosId, label) {
  const updated = await SOS.findByIdAndUpdate(
    sosId,
    { $set: { reviewSubmitted: true } },
    { new: true }
  );
  console.log(REVIEW_BACKEND_DEBUG, label, 'sosId=', String(sosId), 'reviewSubmitted=', updated?.reviewSubmitted);
  return updated;
}

const createReview = async (req, res) => {
  try {
    const requesterId = req.user?._id ?? req.user?.id;
    const { sosId, rating, incidentDescription } = req.body;

    if (!sosId || typeof incidentDescription !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'sosId and incidentDescription are required'
      });
    }

    const desc = incidentDescription.trim();
    if (desc.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'incidentDescription cannot be empty'
      });
    }

    const rawRating = Number(rating);
    const rNum = Math.round(rawRating);
    if (!Number.isFinite(rawRating) || rNum < 1 || rNum > 10 || Math.abs(rawRating - rNum) > 1e-6) {
      return res.status(400).json({
        success: false,
        message: 'rating must be an integer from 1 to 10'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(sosId)) {
      return res.status(400).json({ success: false, message: 'Invalid sosId' });
    }

    const sos = await SOS.findById(sosId);
    if (!sos) {
      return res.status(404).json({ success: false, message: 'SOS not found' });
    }

    if (String(sos.userId) !== String(requesterId)) {
      return res.status(403).json({
        success: false,
        message: 'Only the SOS requester can submit a review'
      });
    }

    if (sos.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'SOS must be completed before submitting a review'
      });
    }

    if (!sos.acceptedBy) {
      return res.status(400).json({
        success: false,
        message: 'No volunteer assigned to this SOS'
      });
    }

    console.log(REVIEW_BACKEND_DEBUG, 'before update:');
    console.log(REVIEW_BACKEND_DEBUG, '  sosId=', String(sos._id));
    console.log(REVIEW_BACKEND_DEBUG, '  reviewSubmitted=', sos.reviewSubmitted);

    const existing = await Review.findOne({ sosId: sos._id });

    if (sos.reviewSubmitted === true) {
      return res.status(200).json({
        success: true,
        message: existing ? 'Review already submitted.' : 'Review already marked as submitted.'
      });
    }

    if (existing) {
      sos.reviewSubmitted = true;
      await sos.save();
      console.log(REVIEW_BACKEND_DEBUG, 'after update:');
      console.log(REVIEW_BACKEND_DEBUG, '  sosId=', String(sos._id));
      console.log(REVIEW_BACKEND_DEBUG, '  reviewSubmitted=', sos.reviewSubmitted);
      return res.status(200).json({
        success: true,
        message: 'Review already exists.',
        review: existing
      });
    }

    const review = await Review.create({
      sosId: sos._id,
      userId: sos.userId,
      volunteerId: sos.acceptedBy,
      rating: rNum,
      incidentDescription: desc
    });

    sos.reviewSubmitted = true;
    await sos.save();

    console.log(REVIEW_BACKEND_DEBUG, 'after update:');
    console.log(REVIEW_BACKEND_DEBUG, '  sosId=', String(sos._id));
    console.log(REVIEW_BACKEND_DEBUG, '  reviewSubmitted=', sos.reviewSubmitted);
    console.log(REVIEW_DEBUG, 'Review created id=', String(review._id), 'sosId=', String(sos._id));

    return res.status(201).json({
      success: true,
      message: 'Review submitted',
      review
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const dupSosId = req.body?.sosId;
      if (dupSosId && mongoose.Types.ObjectId.isValid(dupSosId)) {
        await markSosReviewSubmitted(dupSosId, 'after update (duplicate index)');
      }
      console.log(REVIEW_DEBUG, 'Duplicate prevented (index) sosId=', String(dupSosId));
      return res.status(200).json({
        success: true,
        message: 'Review already exists.'
      });
    }
    console.error(REVIEW_DEBUG, 'createReview error', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to create review'
    });
  }
};

const getReviewExists = async (req, res) => {
  try {
    const requesterId = req.user?._id ?? req.user?.id;
    const { sosId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sosId)) {
      return res.status(400).json({ success: false, exists: false, message: 'Invalid sosId' });
    }

    const sos = await SOS.findById(sosId);
    if (!sos) {
      return res.status(404).json({ success: false, exists: false, message: 'SOS not found' });
    }

    if (String(sos.userId) !== String(requesterId)) {
      return res.status(403).json({
        success: false,
        exists: false,
        message: 'Forbidden'
      });
    }

    const existing = await Review.findOne({ sosId: sos._id }).select('_id').lean();
    const exists = !!existing || sos.reviewSubmitted === true;

    return res.status(200).json({
      success: true,
      exists
    });
  } catch (err) {
    console.error(REVIEW_DEBUG, 'getReviewExists error', err);
    return res.status(500).json({ success: false, exists: false });
  }
};

const getAdminReviews = async (req, res) => {
  try {
    const rows = await Review.find({})
      .populate({ path: 'volunteerId', select: 'name email profileImage role' })
      .populate({ path: 'userId', select: 'name email profileImage role' })
      .populate({ path: 'sosId', select: 'status message latitude longitude createdAt' })
      .sort({ createdAt: -1 })
      .lean();

    console.log(REVIEW_DEBUG, 'Admin reviews count=', rows.length);

    const reviews = rows.map((row) => ({
      _id: row._id,
      rating: row.rating,
      incidentDescription: row.incidentDescription,
      createdAt: row.createdAt,
      volunteer: row.volunteerId
        ? {
            _id: row.volunteerId._id,
            name: row.volunteerId.name,
            email: row.volunteerId.email,
            profileImage: row.volunteerId.profileImage || '',
            role: row.volunteerId.role || ''
          }
        : null,
      user: row.userId
        ? {
            _id: row.userId._id,
            name: row.userId.name,
            email: row.userId.email,
            profileImage: row.userId.profileImage || '',
            role: row.userId.role || ''
          }
        : null,
      sos: row.sosId || null
    }));

    return res.status(200).json({
      success: true,
      reviews
    });
  } catch (err) {
    console.error(REVIEW_DEBUG, 'getAdminReviews error', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load reviews'
    });
  }
};

/**
 * GET /api/reviews/pending — single completed SOS for this user awaiting review.
 */
const getPendingReview = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    console.log(REVIEW_BACKEND_DEBUG, 'endpoint hit by userId=', String(userId));

    const filter = buildPendingReviewFilter(userId);

    console.log(REVIEW_BACKEND_DEBUG, 'pending review query userId=', String(userId));
    console.log(REVIEW_BACKEND_DEBUG, 'pending review filter=', JSON.stringify(filter));

    const matchCount = await SOS.countDocuments(filter);
    console.log(REVIEW_BACKEND_DEBUG, 'matching SOS count=', matchCount);

    const matchingSos = await SOS.findOne(filter).sort({ createdAt: -1 }).lean();

    if (!matchingSos) {
      console.log(REVIEW_BACKEND_DEBUG, 'no pending review found');
      return sendPendingReviewResponse(res, false, null);
    }

    console.log(REVIEW_BACKEND_DEBUG, 'pending query result:');
    console.log(REVIEW_BACKEND_DEBUG, '  sosId=', String(matchingSos._id));
    console.log(REVIEW_BACKEND_DEBUG, '  status=', matchingSos.status);
    console.log(REVIEW_BACKEND_DEBUG, '  acceptedBy=', matchingSos.acceptedBy);
    console.log(REVIEW_BACKEND_DEBUG, '  reviewSubmitted=', matchingSos.reviewSubmitted);

    const existingReview = await Review.findOne({ sosId: matchingSos._id });
    if (existingReview) {
      const sosDoc = await SOS.findById(matchingSos._id);
      if (sosDoc) {
        sosDoc.reviewSubmitted = true;
        await sosDoc.save();
        console.log(REVIEW_BACKEND_DEBUG, 'self-heal: review exists, saved reviewSubmitted=true');
      }
      console.log(REVIEW_BACKEND_DEBUG, 'no pending review found (repaired stale flag)');
      return sendPendingReviewResponse(res, false, null);
    }

    console.log(REVIEW_TRIGGER_DEBUG, 'hasPendingReview=true sosId=', String(matchingSos._id));

    return sendPendingReviewResponse(res, true, matchingSos);
  } catch (err) {
    console.error(REVIEW_TRIGGER_DEBUG, 'getPendingReview error', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load pending review'
    });
  }
};

const getMyReviews = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    const role = (req.user?.role || '').toUpperCase();

    if (role !== 'VOLUNTEER' && role !== 'BOTH') {
      return res.status(403).json({
        success: false,
        message: 'Only volunteers can view their reviews'
      });
    }

    const rows = await Review.find({ volunteerId: userId })
      .populate({ path: 'userId', select: 'name email profileImage role' })
      .sort({ createdAt: -1 })
      .lean();

    const reviews = rows.map((row) => ({
      _id: row._id,
      rating: row.rating,
      incidentDescription: row.incidentDescription,
      createdAt: row.createdAt,
      user: row.userId
        ? {
            _id: row.userId._id,
            name: row.userId.name,
            email: row.userId.email,
            profileImage: row.userId.profileImage || '',
            role: row.userId.role || ''
          }
        : null
    }));

    console.log(REVIEW_DEBUG, 'My reviews count=', reviews.length, 'volunteerId=', String(userId));

    return res.status(200).json({
      success: true,
      reviews
    });
  } catch (err) {
    console.error(REVIEW_DEBUG, 'getMyReviews error', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load your reviews'
    });
  }
};

const getVolunteerRankings = async (req, res) => {
  try {
    const rankings = await buildVolunteerRankings({ includeContact: false });
    return res.status(200).json({
      success: true,
      rankings
    });
  } catch (err) {
    console.error(REVIEW_DEBUG, 'getVolunteerRankings error', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load volunteer rankings'
    });
  }
};

const getAdminVolunteerRankings = async (req, res) => {
  try {
    const rankings = await buildVolunteerRankings({ includeContact: true });
    return res.status(200).json({
      success: true,
      rankings
    });
  } catch (err) {
    console.error(REVIEW_DEBUG, 'getAdminVolunteerRankings error', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load volunteer rankings'
    });
  }
};

const deleteAdminReview = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid review id'
      });
    }

    const deleted = await Review.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Keep SOS.reviewSubmitted=true permanently — user must not be prompted again
    // even if an admin removes the review record.

    console.log(REVIEW_DEBUG, 'Admin deleted review id=', String(id));

    return res.status(200).json({
      success: true,
      message: 'Review deleted'
    });
  } catch (err) {
    console.error(REVIEW_DEBUG, 'deleteAdminReview error', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete review'
    });
  }
};

module.exports = {
  createReview,
  getReviewExists,
  getPendingReview,
  getAdminReviews,
  getMyReviews,
  getVolunteerRankings,
  getAdminVolunteerRankings,
  deleteAdminReview,
  REVIEW_DEBUG,
  REVIEW_TRIGGER_DEBUG
};
