const { admin, initFirebaseAdminIfPossible } = require('../config/firebaseAdmin');
const User = require('../models/User');

const BROADCAST_FCM_TAG = 'BROADCAST_FCM';

async function sendBroadcastNotifications(opts) {
  const { broadcastId, title } = opts || {};
  if (!broadcastId || !title) {
    console.warn(BROADCAST_FCM_TAG, 'missing broadcastId or title');
    return;
  }

  if (!initFirebaseAdminIfPossible()) {
    console.warn(BROADCAST_FCM_TAG, 'skip send — Firebase not configured');
    return;
  }

  const users = await User.find({
    role: { $in: ['USER', 'VOLUNTEER', 'BOTH'] },
    'fcmTokens.0': { $exists: true }
  })
    .select('fcmTokens')
    .lean();

  const tokenSet = new Set();
  for (const u of users) {
    for (const t of u.fcmTokens || []) {
      if (t && typeof t === 'string') {
        tokenSet.add(t.trim());
      }
    }
  }

  const tokens = Array.from(tokenSet);
  if (!tokens.length) {
    console.log('FCM_BROADCAST_DEBUG tokens =', 0);
    console.log(BROADCAST_FCM_TAG, 'no device tokens registered');
    return;
  }

  console.log('FCM_BROADCAST_DEBUG tokens =', tokens.length);

  const messaging = admin.messaging();
  const BATCH = 500;
  let totalSuccess = 0;
  let totalFailure = 0;

  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: {
        title: 'Emergency Broadcast',
        body: title
      },
      data: {
        broadcastId: String(broadcastId),
        type: 'broadcast'
      }
    });
    totalSuccess += res.successCount;
    totalFailure += res.failureCount;
    console.log(
      BROADCAST_FCM_TAG,
      `batch ${Math.floor(i / BATCH) + 1}: sent=${res.successCount} failed=${res.failureCount}`
    );
  }

  console.log('FCM_BROADCAST_DEBUG success =', totalSuccess);
  console.log('FCM_BROADCAST_DEBUG failure =', totalFailure);
}

module.exports = {
  sendBroadcastNotifications
};
