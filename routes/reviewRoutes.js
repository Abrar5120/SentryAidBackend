const express = require('express');
const protect = require('../middleware/authMiddleware');
const adminOnly = require('../middleware/adminMiddleware');
const {
  createReview,
  getReviewExists,
  getPendingReview,
  getAdminReviews,
  getMyReviews,
  getVolunteerRankings
} = require('../controllers/reviewController');

const router = express.Router();

router.post('/create', protect, createReview);
router.get('/volunteer-rankings', protect, getVolunteerRankings);
router.get('/my-reviews', protect, getMyReviews);
router.get('/pending', protect, getPendingReview);
router.get('/exists/:sosId', protect, getReviewExists);
router.get('/admin', protect, adminOnly, getAdminReviews);

module.exports = router;
