const Message = require('../models/Message');

const ALLOWED_SENDER_ROLES = ['USER', 'VOLUNTEER'];

/**
 * POST body: { sosId, message }
 * senderId from req.user._id, senderRole from req.user.role (must be USER or VOLUNTEER for Message schema).
 */
const sendMessage = async (req, res) => {
  try {
    const { sosId, message: text } = req.body;
    const senderId = req.user?._id;
    const senderRole = req.user?.role;

    if (!sosId || text === undefined || text === null || String(text).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'sosId and message are required'
      });
    }

    if (!senderId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const roleUpper = senderRole != null ? String(senderRole).toUpperCase() : '';
    if (!ALLOWED_SENDER_ROLES.includes(roleUpper)) {
      return res.status(400).json({
        success: false,
        message: 'Only USER or VOLUNTEER roles can send messages for this SOS chat'
      });
    }

    const doc = await Message.create({
      sosId,
      senderId,
      senderRole: roleUpper,
      message: String(text).trim()
    });

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: doc
    });
  } catch (error) {
    console.error('sendMessage error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
};

/**
 * GET params: sosId — list messages for that SOS, oldest first.
 */
const getMessages = async (req, res) => {
  try {
    const { sosId } = req.params;

    if (!sosId) {
      return res.status(400).json({
        success: false,
        messages: [],
        message: 'sosId is required'
      });
    }

    const messages = await Message.find({ sosId })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('getMessages error:', error);
    return res.status(500).json({
      success: false,
      messages: [],
      message: 'Failed to fetch messages'
    });
  }
};

module.exports = {
  sendMessage,
  getMessages
};
