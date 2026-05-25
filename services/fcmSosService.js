const admin = require('firebase-admin');
const User = require('../models/User');
const { initFirebaseAdminIfPossible } = require('./fcmBroadcastService');

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
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: {
        title: '🚨 Emergency SOS Nearby',
        body: 'A user near your location needs immediate assistance.'
      },
      data: {
        type: 'sos_alert',
        sosId,
        targetScreen: 'volunteer_dashboard',
        title: '🚨 Emergency SOS Nearby',
        body: 'A user near your location needs immediate assistance.'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'sos_alerts',
          sound: 'default',
          priority: 'max',
          defaultSound: true,
          defaultVibrateTimings: true,
          visibility: 'public'
        }
      }
    });
    totalSuccess += res.successCount;
    totalFailure += res.failureCount;
  }

  console.log(SOS_FCM_DEBUG, 'success count', totalSuccess);
  console.log(SOS_FCM_DEBUG, 'failure count', totalFailure);
}

module.exports = {
  sendNearbyVolunteerSosNotifications,
  SOS_NEARBY_RADIUS_METERS
};
