const express = require('express');
const {
  createSOS,
  getAvailableSOS,
  getUserSOS,
  getMyActiveSOS,
  getMySOS,
  acceptSOS,
  completeSOS,
  cancelSOS,
  rejectSOS,
  updateSosLocation,
  getSosVolunteerLocation
} = require('../controllers/sosController');
const { getSosHeatmap, getSosCountByArea } = require('../controllers/sosAnalyticsController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/create', protect, createSOS);
router.get('/heatmap', protect, getSosHeatmap);
router.get('/count-by-area', protect, getSosCountByArea);
router.get('/available', protect, getAvailableSOS);
router.get('/my', protect, getUserSOS);
router.get('/my-active', protect, getMyActiveSOS);
router.get('/my-sos', protect, getMySOS);
router.get('/location/:sosId', protect, getSosVolunteerLocation);
router.post('/accept', protect, acceptSOS);
router.post('/complete', protect, completeSOS);
router.post('/cancel', protect, cancelSOS);
router.post('/reject', protect, rejectSOS);
router.post('/update-location', protect, updateSosLocation);

module.exports = router;
