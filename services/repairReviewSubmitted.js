const SOS = require('../models/SOS');
const Review = require('../models/Review');

const REVIEW_BACKEND_DEBUG = 'REVIEW_BACKEND_DEBUG';

/**
 * One-time / startup repair: any SOS that already has a Review must have reviewSubmitted=true.
 * Also normalizes missing reviewSubmitted fields to explicit false.
 */
async function repairReviewSubmittedFlags() {
  const reviews = await Review.find({}).select('sosId').lean();
  let flagsSetTrue = 0;

  for (const review of reviews) {
    if (!review.sosId) {
      continue;
    }
    const result = await SOS.updateOne(
      { _id: review.sosId },
      { $set: { reviewSubmitted: true } }
    );
    if (result.modifiedCount > 0 || result.matchedCount > 0) {
      flagsSetTrue += 1;
    }
    console.log(
      REVIEW_BACKEND_DEBUG,
      'repair sosId=',
      String(review.sosId),
      'matched=',
      result.matchedCount,
      'modified=',
      result.modifiedCount
    );
  }

  const normalized = await SOS.updateMany(
    { reviewSubmitted: { $exists: false } },
    { $set: { reviewSubmitted: false } }
  );

  console.log(
    REVIEW_BACKEND_DEBUG,
    'repair complete reviews=',
    reviews.length,
    'sosWithReviewFlagged=',
    flagsSetTrue,
    'normalizedMissingField=',
    normalized.modifiedCount
  );

  return { reviewsProcessed: reviews.length, flagsSetTrue, normalized: normalized.modifiedCount };
}

module.exports = { repairReviewSubmittedFlags };
