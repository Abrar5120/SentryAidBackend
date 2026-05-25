const express = require('express');
const protect = require('../middleware/authMiddleware');
const {
  addEmergencyContact,
  getMyEmergencyContacts,
  deleteEmergencyContact
} = require('../controllers/emergencyContactController');

const router = express.Router();

router.post('/add', protect, addEmergencyContact);
router.get('/my', protect, getMyEmergencyContacts);
router.delete('/:id', protect, deleteEmergencyContact);

module.exports = router;
