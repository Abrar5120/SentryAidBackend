const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  sosId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SOS',
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  volunteerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  incidentDescription: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

ReviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Review', ReviewSchema);
