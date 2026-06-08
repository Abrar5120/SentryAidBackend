const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  nid: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['USER', 'VOLUNTEER', 'ADMIN', 'BOTH'],
    default: 'USER'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  userApprovalStatus: {
    type: String,
    enum: ["pending", "approved", "deactivated"],
    default: "pending"
  },
  volunteerApprovalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected", "terminated"],
    default: "pending"
  },
  /** Reason recorded when an administrator terminates volunteer access */
  terminationReason: {
    type: String,
    default: null
  },
  terminatedAt: {
    type: Date,
    default: null
  },
  terminatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  emailOTP: {
    type: String,
    default: null
  },
  otpExpiry: {
    type: Date,
    default: null
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ["approved", "pending"],
    default: "approved"
  },
  volunteerStatus: {
    type: String,
    enum: ["none", "pending", "approved", "rejected"],
    default: "none"
  },
  volunteerAvailabilityStatus: {
    type: String,
    enum: ["active", "inactive"],
    default: "active"
  },
  profileImage: {
    type: String,
    default: ''
  },
  /** Relative paths e.g. /uploads/nid/filename.jpg — admin-only access */
  nidFrontImage: {
    type: String,
    default: ''
  },
  nidBackImage: {
    type: String,
    default: ''
  },
  /** FCM registration tokens from mobile clients (Firebase Cloud Messaging). */
  fcmTokens: {
    type: [String],
    default: []
  },
  /** GeoJSON Point for volunteer matching; [longitude, latitude]. Updated by volunteer clients. */
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('User', userSchema);
