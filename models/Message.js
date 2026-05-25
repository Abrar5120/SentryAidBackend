const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sosId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SOS",
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  senderRole: {
    type: String,
    enum: ["USER", "VOLUNTEER"],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Message", MessageSchema);
