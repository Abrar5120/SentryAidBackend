const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  isRegistered: {
    type: Boolean,
    default: false
  },
  linkedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  relationship: {
    type: String,
    trim: true,
    default: 'Emergency Contact'
  },
  /** Stored as string to preserve leading zeros (e.g. 017XXXXXXXX). Required for new contacts via API. */
  phoneNumber: {
    type: String,
    trim: true,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);
