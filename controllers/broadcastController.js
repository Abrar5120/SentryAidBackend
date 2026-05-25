const Broadcast = require('../models/Broadcast');
const { sendBroadcastNotifications } = require('../services/fcmBroadcastService');

const MS_24H = 24 * 60 * 60 * 1000;

/** Non-expired broadcasts (TTL may delete slightly later; hide in API as soon as expired). */
function activeBroadcastFilter() {
  const now = new Date();
  return {
    $or: [
      { expiresAt: { $gt: now } },
      {
        expiresAt: { $exists: false },
        createdAt: { $gt: new Date(now.getTime() - MS_24H) }
      }
    ]
  };
}

const getBroadcastCount = async (req, res) => {
  try {
    const count = await Broadcast.countDocuments(activeBroadcastFilter());
    console.log('BROADCAST_COUNT_DEBUG total =', count);
    return res.status(200).json({
      success: true,
      count
    });
  } catch (err) {
    console.error('getBroadcastCount', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load broadcast count'
    });
  }
};

const listBroadcasts = async (req, res) => {
  try {
    const rows = await Broadcast.find(activeBroadcastFilter())
      .populate({ path: 'createdBy', select: 'name email' })
      .sort({ createdAt: -1 })
      .lean();

    const broadcasts = rows.map((row) => ({
      _id: row._id,
      title: row.title,
      message: row.message,
      createdAt: row.createdAt,
      createdBy: row.createdBy
        ? {
            _id: row.createdBy._id,
            name: row.createdBy.name,
            email: row.createdBy.email || ''
          }
        : null
    }));

    return res.status(200).json({
      success: true,
      broadcasts
    });
  } catch (err) {
    console.error('listBroadcasts', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load broadcasts'
    });
  }
};

const createBroadcast = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    const { title, message } = req.body || {};

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'title is required'
      });
    }
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'message is required'
      });
    }

    const doc = await Broadcast.create({
      title: title.trim(),
      message: message.trim(),
      createdBy: userId,
      expiresAt: new Date(Date.now() + MS_24H)
    });

    setImmediate(() => {
      sendBroadcastNotifications({
        broadcastId: doc._id.toString(),
        title: title.trim()
      }).catch((e) =>
        console.error('sendBroadcastNotifications', e.message)
      );
    });

    return res.status(201).json({
      success: true,
      message: 'Broadcast sent'
    });
  } catch (err) {
    console.error('createBroadcast', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to create broadcast'
    });
  }
};

module.exports = {
  getBroadcastCount,
  listBroadcasts,
  createBroadcast
};
