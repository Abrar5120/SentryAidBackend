const Review = require('../models/Review');
const {
  logApprovedVolunteerIncluded,
  logPendingApplicantExcluded
} = require('../utils/volunteerApprovalFilters');

/**
 * Builds volunteer leaderboard from current Review documents (recomputed on every request).
 * @param {{ includeContact?: boolean }} options - when true, includes phone on volunteer (admin only).
 */
async function buildVolunteerRankings(options = {}) {
  const includeContact = options.includeContact === true;
  const rows = await Review.aggregate([
    {
      $group: {
        _id: '$volunteerId',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    },
    {
      $sort: {
        averageRating: -1,
        totalReviews: -1
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'volunteerDoc'
      }
    },
    {
      $unwind: {
        path: '$volunteerDoc',
        preserveNullAndEmptyArrays: true
      }
    }
  ]);

  const approvedRows = rows.filter((row) => {
    const vol = row.volunteerDoc;
    const isApproved = vol && vol.volunteerApprovalStatus === 'approved';
    if (!isApproved && vol) {
      logPendingApplicantExcluded('volunteer rankings', String(vol._id));
    }
    return isApproved;
  });

  logApprovedVolunteerIncluded('volunteer rankings', `count=${approvedRows.length}`);

  return approvedRows.map((row, index) => {
    const vol = row.volunteerDoc;
    const avgRaw = row.averageRating != null ? row.averageRating : 0;
    const averageRating = Math.round(avgRaw * 10) / 10;

    return {
      rank: index + 1,
      volunteer: {
        _id: vol._id,
        name: vol.name,
        email: vol.email || '',
        ...(includeContact ? { phone: vol.phone || '' } : {}),
        profileImage: vol.profileImage || ''
      },
      averageRating,
      totalReviews: row.totalReviews
    };
  });
}

module.exports = {
  buildVolunteerRankings
};
