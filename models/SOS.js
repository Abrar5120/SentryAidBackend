const mongoose = require('mongoose');

const SOSSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  /** GeoJSON Point for nearby volunteer queries; [longitude, latitude] */
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: undefined
    }
  },
  /** Reverse-geocoded label at SOS creation (e.g. suburb) for analytics */
  areaName: {
    type: String,
    default: null
  },
  message: {
    type: String,
    default: "Emergency"
  },
  target: {
    type: String,
    enum: ["volunteers", "contacts", "both"],
    default: "both"
  },
  isEmergencyRelationshipSOS: {
    type: Boolean,
    default: false
  },
  relationship: {
    type: String,
    default: null
  },
  senderUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  senderName: {
    type: String,
    default: null
  },
  senderEmail: {
    type: String,
    default: null
  },
  senderPhoto: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: [
      "pending",
      "accepted",
      "awaiting_user_confirmation",
      "completed",
      "cancelled",
      "escalated",
      "resolved_by_admin"
    ],
    default: "pending"
  },
  /** When SOS was escalated after 5 minutes with no volunteer accept */
  escalatedAt: {
    type: Date,
    default: null
  },
  /** When an administrator manually resolved an escalated SOS */
  resolvedAt: {
    type: Date,
    default: null
  },
  /** Set when the assigned volunteer marks assistance as provided (user must confirm completion). */
  completionRequestedAt: {
    type: Date,
    default: null
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  /** Volunteers who declined this SOS; excluded from their available queue */
  rejectedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  volunteerLatitude: {
    type: Number,
    default: null
  },
  volunteerLongitude: {
    type: Number,
    default: null
  },
  lastUpdatedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  /** True after the requester submits a post-completion review */
  reviewSubmitted: {
    type: Boolean,
    default: false
  },
  /** True after 5-minute no-accept escalation emails were sent to emergency contacts */
  escalationEmailSent: {
    type: Boolean,
    default: false
  }
});

SOSSchema.index({ location: '2dsphere' });

module.exports = mongoose.model("SOS", SOSSchema);
