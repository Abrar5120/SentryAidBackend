const User = require('../models/User');

const registerFcmToken = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    const { fcmToken } = req.body || {};

    if (typeof fcmToken !== 'string' || !fcmToken.trim()) {
      return res.status(400).json({
        success: false,
        message: 'fcmToken is required'
      });
    }

    const t = fcmToken.trim();
    await User.findByIdAndUpdate(userId, { $addToSet: { fcmTokens: t } });

    console.log('FCM_REGISTER_DEBUG register-token ok userId=', String(userId));

    return res.status(200).json({
      success: true
    });
  } catch (err) {
    console.error('registerFcmToken', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to save token'
    });
  }
};

module.exports = {
  registerFcmToken
};
