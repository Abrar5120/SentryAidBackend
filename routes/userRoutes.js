const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { deactivateAccount } = require('../controllers/userController');

router.post('/deactivate-account', protect, deactivateAccount);

module.exports = router;
