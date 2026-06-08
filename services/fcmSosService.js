const { admin, initFirebaseAdminIfPossible } = require('../config/firebaseAdmin');
const User = require('../models/User');

const SOS_FCM_DEBUG = 'SOS_FCM_DEBUG';
const SOS_NEARBY_RADIUS_METERS = 3000;

function volunteerLocationIsUsable(coords) {
  return (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1]) &&
    !(coords[0] === 0 && coords[1] === 0)
  );
}

/**
 * Active volunteers within 3 km of the SOS point who have FCM tokens and valid coordinates.
 */
async function findNearbyVolunteerTokens(sos) {
  const latitude = sos?.latitude;
  const longitude = sos?.longitude;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { nearbyCount: 0, tokens: [] };
  }

  let rows = [];
  try {
    rows = await User.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [longitude, latitude] },
          key: 'location',
          distanceField: 'distanceMeters',
          maxDistance: SOS_NEARBY_RADIUS_METERS,
          spherical: true,
          query: {
            role: { $in: ['VOLUNTEER', 'BOTH'] },
            volunteerAvailabilityStatus: 'active',
            'fcmTokens.0': { $exists: true },
            location: { $exists: true, $ne: null }
          }
        }
      }
    ]);
  } catch (err) {
    console.error(SOS_FCM_DEBUG, 'geoNear volunteer query failed', err.message || err);
    return { nearbyCount: 0, tokens: [] };
  }

  const nearbyVolunteers = rows.filter((u) =>
    volunteerLocationIsUsable(u.location?.coordinates)
  );

  const tokenSet = new Set();
  for (const u of nearbyVolunteers) {
    for (const t of u.fcmTokens || []) {
      if (t && typeof t === 'string' && t.trim()) {
        tokenSet.add(t.trim());
      }
    }
  }

  return {
    nearbyCount: nearbyVolunteers.length,
    tokens: Array.from(tokenSet)
  };
}

/**
 * Push FCM to nearby active volunteers (3 km) when an SOS is created for volunteers/both targets.
 */
async function sendNearbyVolunteerSosNotifications(sos) {
  if (!sos || !sos._id) {
    console.warn(SOS_FCM_DEBUG, 'skip — missing sos document');
    return;
  }

  const target = sos.target;
  if (target === 'contacts') {
    return;
  }

  const { nearbyCount, tokens } = await findNearbyVolunteerTokens(sos);

  console.log(SOS_FCM_DEBUG, 'nearby volunteers found', nearbyCount);
  console.log(SOS_FCM_DEBUG, 'tokens count', tokens.length);

  if (!tokens.length) {
    return;
  }

  if (!initFirebaseAdminIfPossible()) {
    console.warn(SOS_FCM_DEBUG, 'skip send — Firebase not configured');
    return;
  }

  const messaging = admin.messaging();
  const sosId = String(sos._id);
  const BATCH = 500;
  let totalSuccess = 0;
  let totalFailure = 0;

  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    // Data-only message so Android onMessageReceived runs in background/killed state
    // and can play the 10-second emergency alarm (notification payload is built on-device).
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      data: {
        type: 'SOS_ALERT',
        sosId,
        targetScreen: 'volunteer_dashboard',
        title: '🚨 EMERGENCY SOS ALERT',
        body: 'Someone nearby needs emergency assistance.'
      },
      android: {
        priority: 'high'
      }
    });
    totalSuccess += res.successCount;
    totalFailure += res.failureCount;
  }

  console.log(SOS_FCM_DEBUG, 'success count', totalSuccess);
  console.log(SOS_FCM_DEBUG, 'failure count', totalFailure);
}

/**
 * Notify the SOS requester that their volunteer marked assistance as provided.
 */
async function sendAssistanceProvidedNotification(sos) {
  if (!sos || !sos._id || !sos.userId) {
    console.warn(SOS_FCM_DEBUG, 'assistance-provided skip — missing sos or userId');
    return;
  }

  const user = await User.findById(sos.userId).select('fcmTokens');
  if (!user || !Array.isArray(user.fcmTokens) || !user.fcmTokens.length) {
    console.log(SOS_FCM_DEBUG, 'assistance-provided skip — no user tokens');
    return;
  }

  const tokenSet = new Set();
  for (const t of user.fcmTokens) {
    if (t && typeof t === 'string' && t.trim()) {
      tokenSet.add(t.trim());
    }
  }
  const tokens = Array.from(tokenSet);
  if (!tokens.length) {
    return;
  }

  if (!initFirebaseAdminIfPossible()) {
    console.warn(SOS_FCM_DEBUG, 'assistance-provided skip — Firebase not configured');
    return;
  }

  const messaging = admin.messaging();
  const sosId = String(sos._id);
  const title = 'Assistance provided';
  const body =
    'Your volunteer has marked assistance as provided. Please confirm completion if your issue has been resolved.';

  const BATCH = 500;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    await messaging.sendEachForMulticast({
      tokens: batch,
      data: {
        type: 'SOS_ASSISTANCE_PROVIDED',
        sosId,
        targetScreen: 'user_dashboard',
        title,
        body
      },
      android: {
        priority: 'high'
      }
    });
  }

  console.log(SOS_FCM_DEBUG, 'assistance-provided sent to', tokens.length, 'token(s) sosId=', sosId);
}

/**
 * Notify the SOS requester that their SOS was escalated after 5 minutes.
 */
async function sendSosEscalatedUserNotification(sos) {
  if (!sos || !sos._id || !sos.userId) {
    console.warn(SOS_FCM_DEBUG, 'escalated-user skip — missing sos or userId');
    return;
  }

  const user = await User.findById(sos.userId).select('fcmTokens');
  if (!user || !Array.isArray(user.fcmTokens) || !user.fcmTokens.length) {
    console.log(SOS_FCM_DEBUG, 'escalated-user skip — no user tokens');
    return;
  }

  const tokenSet = new Set();
  for (const t of user.fcmTokens) {
    if (t && typeof t === 'string' && t.trim()) {
      tokenSet.add(t.trim());
    }
  }
  const tokens = Array.from(tokenSet);
  if (!tokens.length) {
    return;
  }

  if (!initFirebaseAdminIfPossible()) {
    console.warn(SOS_FCM_DEBUG, 'escalated-user skip — Firebase not configured');
    return;
  }

  const messaging = admin.messaging();
  const sosId = String(sos._id);
  const title = 'SOS Escalated';
  const body =
    'No volunteer accepted your SOS within 5 minutes. Your emergency contacts and SentryAid administrators have been notified.';

  const BATCH = 500;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    await messaging.sendEachForMulticast({
      tokens: batch,
      data: {
        type: 'SOS_ESCALATED',
        sosId,
        targetScreen: 'user_dashboard',
        title,
        body
      },
      android: {
        priority: 'high'
      }
    });
  }

  console.log(SOS_FCM_DEBUG, 'escalated-user sent to', tokens.length, 'token(s) sosId=', sosId);
}

module.exports = {
  sendNearbyVolunteerSosNotifications,
  sendAssistanceProvidedNotification,
  sendSosEscalatedUserNotification,
  SOS_NEARBY_RADIUS_METERS
};
