const express = require('express');
const protect = require('../middleware/authMiddleware');
const { updateVolunteerStatus, updateVolunteerLocation } = require('../controllers/volunteerController');

const router = express.Router();

router.put('/status', protect, updateVolunteerStatus);
router.put('/location', protect, updateVolunteerLocation);

module.exports = router;

