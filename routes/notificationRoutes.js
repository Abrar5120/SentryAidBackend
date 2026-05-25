const express = require('express');
const protect = require('../middleware/authMiddleware');
const { registerFcmToken } = require('../controllers/notificationsController');

const router = express.Router();

router.post('/register-token', protect, registerFcmToken);

module.exports = router;
