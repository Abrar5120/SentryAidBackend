const express = require('express');
const protect = require('../middleware/authMiddleware');
const adminOnly = require('../middleware/adminMiddleware');
const {
  createAbuseReport,
  getAdminAbuseReports,
  resolveAbuseReport
} = require('../controllers/abuseReportController');

const router = express.Router();

router.post('/create', protect, createAbuseReport);
router.get('/admin', protect, adminOnly, getAdminAbuseReports);
router.put('/:id/resolve', protect, adminOnly, resolveAbuseReport);

module.exports = router;
