const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const User = require('../models/User');

const BROADCAST_FCM_TAG = 'BROADCAST_FCM';

function loadServiceAccountJson() {
  const keyPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    'firebase-service-account.json';
  if (!keyPath) {
    return null;
  }
  const resolved = path.isAbsolute(keyPath) ? keyPath : path.join(__dirname, '..', keyPath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

function initFirebaseAdminIfPossible() {
  if (admin.apps.length > 0) {
    return true;
  }
  try {
    const svc = loadServiceAccountJson();
    if (!svc) {
      console.warn(
        BROADCAST_FCM_TAG,
        'Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS to enable push notifications'
      );
      return false;
    }
    admin.initializeApp({
      credential: admin.credential.cert(svc)
    });
    console.log(BROADCAST_FCM_TAG, 'Firebase Admin initialised');
    return true;
  } catch (e) {
    console.error(BROADCAST_FCM_TAG, 'init failed:', e.message);
    return false;
  }
}

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
  sendBroadcastNotifications,
  initFirebaseAdminIfPossible,
  loadServiceAccountJson
};
