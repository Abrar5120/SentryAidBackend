const express = require('express');
const protect = require('../middleware/authMiddleware');
const adminOnly = require('../middleware/adminMiddleware');
const {
  getBroadcastCount,
  listBroadcasts,
  createBroadcast
} = require('../controllers/broadcastController');

const router = express.Router();

// IMPORTANT: literal paths like `/count` must be registered BEFORE any `/:id` style route,
// otherwise "count" would be captured as an id.
router.get('/count', protect, getBroadcastCount);
router.get('/', protect, listBroadcasts);
router.post('/create', protect, adminOnly, createBroadcast);

module.exports = router;
