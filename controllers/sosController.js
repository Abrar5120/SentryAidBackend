const SOS = require('../models/SOS');
const Message = require('../models/Message');
const User = require('../models/User');
const EmergencyContact = require('../models/EmergencyContact');
const { sendSosEmergencyEmail, SOS_TARGET_DEBUG } = require('../utils/sendSosEmergencyEmail');
const sendVolunteerAcceptedEmail = require('../utils/sendVolunteerAcceptedEmail');
const { sendNearbyVolunteerSosNotifications } = require('../services/fcmSosService');
const { reverseGeocodeArea, GEOCODE_TIMEOUT_MS } = require('../utils/reverseGeocodeArea');

const VALID_SOS_TARGETS = ['volunteers', 'contacts', 'both'];
const RELATIONSHIP_SOS_DEBUG = 'RELATIONSHIP_SOS_DEBUG';
const SOS_RADIUS_DEBUG = 'SOS_RADIUS_DEBUG';
const SOS_NEARBY_RADIUS_METERS = 3000;
const SOS_REJECT_DEBUG = 'SOS_REJECT_DEBUG';
const SOS_ACTIVE_DEBUG = 'SOS_ACTIVE_DEBUG';
const RELATIONSHIP_IMAGE_DEBUG = 'RELATIONSHIP_IMAGE_DEBUG';
const VOLUNTEER_ACCEPTED_EMAIL_DEBUG = 'VOLUNTEER_ACCEPTED_EMAIL_DEBUG';

function isValidContactEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

async function notifyEmergencyContactsOnVolunteerAccept(sos, volunteerId) {
  try {
    const contacts = await EmergencyContact.find({ userId: sos.userId });
    const validContacts = contacts.filter((c) => isValidContactEmail(c.email));

    console.log(
      VOLUNTEER_ACCEPTED_EMAIL_DEBUG,
      'emergency contacts found',
      contacts.length
    );
    console.log(
      VOLUNTEER_ACCEPTED_EMAIL_DEBUG,
      'contacts with valid email',
      validContacts.length
    );
    console.log(
      VOLUNTEER_ACCEPTED_EMAIL_DEBUG,
      'recipient emails',
      validContacts.map((c) => c.email.trim().toLowerCase())
    );

    if (!validContacts.length) {
      return;
    }

    const emergencyUser = await User.findById(sos.userId).select('name phone');
    console.log(VOLUNTEER_ACCEPTED_EMAIL_DEBUG, 'SOS user details for email', {
      found: !!emergencyUser,
      name: emergencyUser?.name ?? null,
      phone: emergencyUser?.phone ?? null
    });

    const volunteer = await User.findById(volunteerId).select('name email phone bloodGroup');
    if (!volunteer) {
      console.error(VOLUNTEER_ACCEPTED_EMAIL_DEBUG, 'volunteer not found', volunteerId);
      return;
    }

    const emergencyUserDetails = {
      name: emergencyUser?.name ?? 'Unknown',
      phone: emergencyUser?.phone ?? 'N/A'
    };

    const acceptedAt = new Date();

    for (const c of validContacts) {
      const email = c.email.trim().toLowerCase();
      try {
        await sendVolunteerAcceptedEmail(email, volunteer, emergencyUserDetails, acceptedAt);
        console.log(VOLUNTEER_ACCEPTED_EMAIL_DEBUG, 'email sent successfully to', email);
      } catch (mailErr) {
        console.error(
          VOLUNTEER_ACCEPTED_EMAIL_DEBUG,
          'email failed for',
          email,
          mailErr.message || mailErr
        );
      }
    }
  } catch (err) {
    console.error(VOLUNTEER_ACCEPTED_EMAIL_DEBUG, 'notification flow error', err);
  }
}

function normalizeSosTarget(raw) {
  const t = (raw == null ? '' : String(raw)).trim().toLowerCase();
  if (VALID_SOS_TARGETS.includes(t)) {
    return t;
  }
  return 'both';
}

async function runSosTargetSideEffects(sos, target, requester) {
  const requesterName = requester?.name || 'A SentryAid user';
  const mapLink = `https://maps.google.com/?q=${sos.latitude},${sos.longitude}`;

  if (target === 'volunteers' || target === 'both') {
    console.log(SOS_TARGET_DEBUG, 'Volunteer notification triggered', String(sos._id));
    try {
      await sendNearbyVolunteerSosNotifications(sos);
    } catch (fcmErr) {
      console.error(SOS_TARGET_DEBUG, 'SOS FCM send failed', fcmErr.message || fcmErr);
    }
  }

  if (target === 'contacts' || target === 'both') {
    try {
      const contacts = await EmergencyContact.find({ userId: sos.userId });
      const subject = `SentryAid SOS alert from ${requesterName}`;
      const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
  <h2 style="color:#d32f2f;">Emergency SOS</h2>
  <p><strong>${requesterName}</strong> has triggered an SOS in SentryAid.</p>
  <p><strong>Message:</strong> ${(sos.message || 'Emergency').replace(/</g, '&lt;')}</p>
  <p><a href="${mapLink}">Open location on Google Maps</a></p>
  <p>Coordinates: ${sos.latitude}, ${sos.longitude}</p>
  <p>— SentryAid</p>
</div>`;
      for (const c of contacts) {
        if (!c.email) {
          continue;
        }
        try {
          await sendSosEmergencyEmail(c.email, subject, html);
          console.log(SOS_TARGET_DEBUG, 'Emergency contact notification triggered', c.email);
        } catch (mailErr) {
          console.error(SOS_TARGET_DEBUG, 'Emergency contact email failed for', c.email, mailErr.message || mailErr);
        }
      }
      if (!contacts.length) {
        console.log(SOS_TARGET_DEBUG, 'Emergency contact notification triggered (no contacts saved for user)');
      }
    } catch (err) {
      console.error(SOS_TARGET_DEBUG, 'Emergency contact flow error', err);
    }
  }
}

// 1. CREATE SOS FUNCTION
const createSOS = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const { latitude, longitude, message } = req.body;
    const target = normalizeSosTarget(req.body.target);

    console.log(SOS_TARGET_DEBUG, 'Selected target', target);

    if (!userId || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'userId, latitude and longitude are required'
      });
    }

    const activeSos = await SOS.findOne({
      userId,
      status: { $in: ['pending', 'accepted'] }
    });

    if (activeSos) {
      console.log(SOS_ACTIVE_DEBUG, 'create blocked — existing active SOS', String(activeSos._id));
      return res.status(400).json({
        success: false,
        message: 'You already have an active SOS request.',
        sos: activeSos
      });
    }

    let relationshipPayload = {
      isEmergencyRelationshipSOS: false,
      relationship: null,
      senderUserId: null,
      senderName: null,
      senderEmail: null,
      senderPhoto: null
    };

    if (target === 'contacts' || target === 'both') {
      const registeredContacts = await EmergencyContact.find({
        userId,
        isRegistered: true
      }).sort({ createdAt: -1 });

      if (registeredContacts.length > 0) {
        console.log(
          RELATIONSHIP_SOS_DEBUG,
          'registered emergency contact found',
          registeredContacts.length
        );
        const sender = await User.findById(userId).select('name email profileImage');
        const primary = registeredContacts[0];
        const relLabel = primary.relationship || 'Emergency Contact';
        const rawPhoto = sender?.profileImage;
        console.log(RELATIONSHIP_IMAGE_DEBUG, 'sender.profileImage:', rawPhoto);
        const senderPhotoStored =
          rawPhoto != null && String(rawPhoto).trim() !== '' ? String(rawPhoto).trim() : '';
        console.log(RELATIONSHIP_IMAGE_DEBUG, 'senderPhoto value before saving:', senderPhotoStored);
        relationshipPayload = {
          isEmergencyRelationshipSOS: true,
          relationship: relLabel,
          senderUserId: userId,
          senderName: sender?.name || 'Unknown',
          senderEmail: sender?.email || null,
          senderPhoto: senderPhotoStored
        };
        console.log(RELATIONSHIP_SOS_DEBUG, 'relationship saved', relLabel);
        console.log(RELATIONSHIP_SOS_DEBUG, 'relationship SOS created');
      }
    }

    let areaName = 'Unknown';
    try {
      areaName = await Promise.race([
        reverseGeocodeArea(latitude, longitude),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('area geocode timeout')), GEOCODE_TIMEOUT_MS + 200)
        )
      ]);
    } catch (areaErr) {
      console.log('AREA_GEOCODE_DEBUG', 'using Unknown', areaErr.message || areaErr);
    }

    const sos = await SOS.create({
      userId,
      latitude,
      longitude,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      areaName,
      message,
      target,
      ...relationshipPayload
    });

    const requester = await User.findById(userId).select('name email');

    process.nextTick(() => {
      runSosTargetSideEffects(sos, target, requester).catch((err) => {
        console.error(SOS_TARGET_DEBUG, 'post-create side effects failed', err);
      });
    });

    return res.status(201).json({
      success: true,
      message: 'SOS created successfully',
      sos
    });
  } catch (error) {
    console.error('createSOS error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create SOS'
    });
  }
};

function volunteerLocationIsUsable(coords) {
  return (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1]) &&
    !(coords[0] === 0 && coords[1] === 0)
  );
}

// 2. GET AVAILABLE SOS (nearby pending SOS within radius; preserves target + emergency-contact rules)
const getAvailableSOS = async (req, res) => {
  try {
    const volunteerId = req?.user?._id;
    if (!volunteerId) {
      return res.status(401).json({
        success: false,
        sosList: []
      });
    }

    const volunteer = await User.findById(volunteerId).select(
      'role volunteerAvailabilityStatus location'
    );
    const role = (volunteer?.role || '').toUpperCase();
    const availability = (volunteer?.volunteerAvailabilityStatus || 'active').toLowerCase();

    if ((role === 'VOLUNTEER' || role === 'BOTH') && availability !== 'active') {
      return res.json({
        success: true,
        sosList: [],
        message: 'Volunteer is currently inactive'
      });
    }

    const volCoords = volunteer?.location?.coordinates;
    console.log(SOS_RADIUS_DEBUG, 'Volunteer coordinates', volCoords);
    if (!volunteerLocationIsUsable(volCoords)) {
      console.log(SOS_RADIUS_DEBUG, 'Missing or placeholder volunteer location — returning empty SOS list');
      return res.json({
        success: true,
        sosList: [],
        message: 'Volunteer location required to show nearby SOS. Open the dashboard with location enabled.'
      });
    }

    const [volLng, volLat] = volCoords;

    const ownerIdsWhereIAmRegisteredContact = await EmergencyContact.find({
      linkedUserId: volunteerId,
      isRegistered: true
    }).distinct('userId');

    const targetOr = [
      { target: { $in: ['volunteers', 'both'] } },
      { target: { $exists: false } },
      { target: null },
      {
        target: 'contacts',
        userId: { $in: ownerIdsWhereIAmRegisteredContact }
      }
    ];

    try {
      await SOS.updateMany(
        {
          status: 'pending',
          latitude: { $exists: true },
          longitude: { $exists: true },
          $or: [
            { location: { $exists: false } },
            { location: null },
            { 'location.coordinates': { $exists: false } },
            { 'location.coordinates.0': { $exists: false } }
          ]
        },
        [
          {
            $set: {
              location: {
                type: 'Point',
                coordinates: ['$longitude', '$latitude']
              }
            }
          }
        ]
      );
    } catch (bfErr) {
      console.error(SOS_RADIUS_DEBUG, 'backfill SOS location failed', bfErr.message || bfErr);
    }

    const geoQuery = {
      status: 'pending',
      location: { $exists: true, $ne: null },
      rejectedBy: { $nin: [volunteerId] },
      $or: targetOr
    };

    console.log(SOS_REJECT_DEBUG, 'getAvailableSOS excludes rejectedBy for volunteer', String(volunteerId));

    let sosListRaw;
    try {
      sosListRaw = await SOS.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [volLng, volLat] },
            key: 'location',
            distanceField: 'distanceFromVolunteerMeters',
            maxDistance: SOS_NEARBY_RADIUS_METERS,
            spherical: true,
            query: geoQuery
          }
        },
        { $sort: { createdAt: -1 } }
      ]);
    } catch (geoErr) {
      console.error(SOS_RADIUS_DEBUG, '$geoNear failed', geoErr.message || geoErr);
      return res.status(500).json({
        success: false,
        sosList: [],
        message: 'Nearby SOS query failed'
      });
    }

    console.log(
      SOS_RADIUS_DEBUG,
      'Nearby SOS count',
      sosListRaw.length,
      'radius used (meters)',
      SOS_NEARBY_RADIUS_METERS
    );
    console.log(
      SOS_REJECT_DEBUG,
      'getAvailableSOS rows (rejectedBy $nin applied in geo query)',
      sosListRaw.length
    );
    if (sosListRaw.length > 0 && sosListRaw[0].distanceFromVolunteerMeters != null) {
      console.log(
        SOS_RADIUS_DEBUG,
        'Distance calculated (first item, m)',
        sosListRaw[0].distanceFromVolunteerMeters
      );
    }

    const sosList = await Promise.all(
      sosListRaw.map(async (sosDoc) => {
        const { distanceFromVolunteerMeters, ...rest } = sosDoc;
        const meters = distanceFromVolunteerMeters;
        const km = meters != null ? (meters / 1000).toFixed(1) : '0.0';
        const distanceFromVolunteer = `${km} km away`;

        const ecRow = await EmergencyContact.findOne({
          userId: sosDoc.userId,
          linkedUserId: volunteerId,
          isRegistered: true
        })
          .select('relationship')
          .lean();

        const viewerEmergencySosCard = !!(
          sosDoc.isEmergencyRelationshipSOS &&
          ecRow
        );
        const viewerRelationshipLabel = ecRow
          ? ecRow.relationship || 'Emergency Contact'
          : null;

        return {
          ...rest,
          viewerEmergencySosCard,
          viewerRelationshipLabel,
          distanceFromVolunteer
        };
      })
    );

    return res.json({
      success: true,
      sosList
    });
  } catch (error) {
    console.error('getAvailableSOS error:', error);
    return res.status(500).json({
      success: false,
      sosList: []
    });
  }
};

// GET SOS ACCEPTED BY CURRENT VOLUNTEER (only active accepted — not completed / pending / cancelled)
const getMySOS = async (req, res) => {
  try {
    const volunteerId = req?.user?.id;

    const sosList = await SOS.find({
      acceptedBy: volunteerId,
      status: 'accepted'
    }).sort({ createdAt: -1 });

    console.log('[getMySOS] returned SOS count:', sosList.length);

    return res.json({
      success: true,
      sosList
    });
  } catch (error) {
    console.error('getMySOS error:', error);
    return res.status(500).json({
      success: false,
      sosList: []
    });
  }
};

// GET SOS FOR CURRENT USER (exclude cancelled)
const getUserSOS = async (req, res) => {
  try {
    const userId = req?.user?._id || req?.user?.id;

    const sosList = await SOS.find({
      userId,
      status: { $ne: 'cancelled' }
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      sosList
    });
  } catch (error) {
    console.error('getUserSOS error:', error);
    return res.status(500).json({
      success: false,
      sosList: []
    });
  }
};

/**
 * GET /api/sos/my-active — single active SOS for the requester (pending or accepted).
 */
const getMyActiveSOS = async (req, res) => {
  try {
    const userId = req?.user?._id || req?.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const activeSos = await SOS.findOne({
      userId,
      status: { $in: ['pending', 'accepted'] }
    })
      .sort({ createdAt: -1 })
      .populate('acceptedBy', 'name email');

    console.log(
      SOS_ACTIVE_DEBUG,
      'userId=',
      String(userId),
      'active=',
      activeSos ? String(activeSos._id) : 'none',
      'status=',
      activeSos?.status ?? 'n/a'
    );

    if (!activeSos) {
      return res.json({
        success: true,
        activeSos: null,
        volunteer: null
      });
    }

    let volunteer = null;
    if (activeSos.acceptedBy && typeof activeSos.acceptedBy === 'object') {
      volunteer = {
        id: String(activeSos.acceptedBy._id),
        name: activeSos.acceptedBy.name || 'Volunteer',
        email: activeSos.acceptedBy.email || null
      };
    }

    const payload = activeSos.toObject();
    if (payload.acceptedBy && typeof payload.acceptedBy === 'object') {
      payload.acceptedBy = String(payload.acceptedBy._id);
    }

    return res.json({
      success: true,
      activeSos: payload,
      volunteer
    });
  } catch (error) {
    console.error(SOS_ACTIVE_DEBUG, 'getMyActiveSOS error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load active SOS'
    });
  }
};

// 3. ACCEPT SOS (RACE CONDITION SAFE)
const acceptSOS = async (req, res) => {
  try {
    const { sosId, latitude, longitude } = req.body;
    const volunteerId = req?.user?.id;
    const volunteerDbId = req?.user?._id;

    if (!sosId || !volunteerId) {
      return res.status(400).json({
        success: false,
        message: 'sosId and volunteerId are required'
      });
    }

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude are required'
      });
    }

    const volunteer = await User.findById(volunteerDbId != null ? volunteerDbId : volunteerId)
      .select('volunteerAvailabilityStatus');
    if (!volunteer || volunteer.volunteerAvailabilityStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Volunteer is inactive'
      });
    }

    console.log('ACCEPT_SOS_GPS_DEBUG', 'req.body.latitude', req.body.latitude);
    console.log('ACCEPT_SOS_GPS_DEBUG', 'req.body.longitude', req.body.longitude);

    const existingSos = await SOS.findById(sosId).select('status target userId');
    if (!existingSos) {
      return res.status(404).json({
        success: false,
        message: 'SOS not found'
      });
    }
    if (existingSos.status !== 'pending') {
      return res.json({
        success: false,
        message: 'SOS already accepted by another volunteer'
      });
    }
    const sosTarget = existingSos.target || 'both';
    if (sosTarget === 'contacts') {
      const ec = await EmergencyContact.findOne({
        userId: existingSos.userId,
        linkedUserId: volunteerDbId != null ? volunteerDbId : volunteerId,
        isRegistered: true
      }).select('_id');
      if (!ec) {
        return res.status(403).json({
          success: false,
          message:
            'This SOS was sent to emergency contacts only. Only registered emergency contacts can accept it.'
        });
      }
    }

    // Atomic conditional update to avoid race condition
    const updated = await SOS.findOneAndUpdate(
      { _id: sosId, status: 'pending' },
      {
        $set: {
          status: 'accepted',
          acceptedBy: volunteerId,
          volunteerLatitude: latitude,
          volunteerLongitude: longitude
        }
      },
      { new: true }
    );

    if (!updated) {
      return res.json({
        success: false,
        message: 'SOS already accepted by another volunteer'
      });
    }

    try {
      const locationLink = `https://maps.google.com/?q=${updated.volunteerLatitude},${updated.volunteerLongitude}`;
      const chatMessage = 'Volunteer accepted SOS.\nLocation: ' + locationLink;

      const message = new Message({
        sosId: updated._id,
        senderId: volunteerDbId != null ? volunteerDbId : volunteerId,
        senderRole: 'VOLUNTEER',
        message: chatMessage
      });
      await message.save();
    } catch (msgErr) {
      console.error('acceptSOS: failed to create chat message', msgErr);
    }

    const volunteerIdForNotify = volunteerDbId != null ? volunteerDbId : volunteerId;
    void notifyEmergencyContactsOnVolunteerAccept(updated, volunteerIdForNotify);

    return res.json({
      success: true,
      message: 'SOS accepted',
      sos: updated
    });
  } catch (error) {
    console.error('acceptSOS error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept SOS'
    });
  }
};

// 4. COMPLETE SOS (volunteer must have accepted it; status must still be "accepted")
const completeSOS = async (req, res) => {
  try {
    const { sosId } = req.body;
    const volunteerId = req?.user?.id;

    console.log('[completeSOS] called, sosId:', sosId);

    if (!sosId || !volunteerId) {
      return res.status(400).json({
        success: false,
        message: 'sosId is required'
      });
    }

    const sos = await SOS.findOne({
      _id: sosId,
      acceptedBy: volunteerId,
      status: 'accepted'
    });

    if (!sos) {
      return res.status(403).json({
        success: false,
        message: 'You can only complete SOS requests you accepted that are still active.'
      });
    }

    sos.status = 'completed';
    await sos.save();

    console.log('[completeSOS] saved to MongoDB, sosId:', sosId, 'updated status:', sos.status);

    return res.json({
      success: true,
      message: 'SOS marked as completed',
      sos
    });
  } catch (error) {
    console.error('completeSOS error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete SOS'
    });
  }
};

// 5. CANCEL SOS (only owner user can cancel their SOS)
const cancelSOS = async (req, res) => {
  try {
    const { sosId } = req.body;
    const userId = req?.user?._id;

    if (!sosId) {
      return res.status(400).json({
        success: false,
        message: 'sosId is required'
      });
    }

    const sos = await SOS.findById(sosId);
    if (!sos) {
      return res.status(404).json({
        success: false,
        message: 'SOS not found'
      });
    }

    if (!userId || String(sos.userId) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own SOS request.'
      });
    }

    sos.status = 'cancelled';
    await sos.save();

    return res.json({
      success: true,
      message: 'SOS cancelled successfully',
      sos
    });
  } catch (error) {
    console.error('cancelSOS error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel SOS'
    });
  }
};

// 5b. REJECT SOS (volunteer declines pending SOS — hidden from their queue via rejectedBy)
const rejectSOS = async (req, res) => {
  try {
    const volunteerDbId = req?.user?._id;
    const { sosId } = req.body || {};

    if (!volunteerDbId || !sosId) {
      return res.status(400).json({
        success: false,
        message: 'sosId is required'
      });
    }

    const role = (req?.user?.role || '').toUpperCase();
    if (role !== 'VOLUNTEER' && role !== 'BOTH') {
      return res.status(403).json({
        success: false,
        message: 'Only volunteers can reject an SOS'
      });
    }

    const sos = await SOS.findById(sosId).select('status userId');
    if (!sos) {
      return res.status(404).json({
        success: false,
        message: 'SOS not found'
      });
    }
    if (sos.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending SOS can be rejected'
      });
    }
    if (String(sos.userId) === String(volunteerDbId)) {
      return res.status(403).json({
        success: false,
        message: 'You cannot reject your own SOS'
      });
    }

    console.log(SOS_REJECT_DEBUG, 'Volunteer rejected SOS', String(sosId), 'volunteer', String(volunteerDbId));

    const updated = await SOS.findByIdAndUpdate(
      sosId,
      { $addToSet: { rejectedBy: volunteerDbId } },
      { new: true }
    );

    console.log(
      SOS_REJECT_DEBUG,
      'RejectedBy updated length',
      updated?.rejectedBy != null ? updated.rejectedBy.length : 0
    );

    return res.json({
      success: true,
      message: 'SOS rejected',
      sos: updated
    });
  } catch (error) {
    console.error('rejectSOS error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject SOS'
    });
  }
};

// 6. UPDATE VOLUNTEER LOCATION FOR SOS
const updateSosLocation = async (req, res) => {
  try {
    const { sosId, latitude, longitude } = req.body;

    if (!sosId) {
      return res.status(400).json({
        success: false,
        message: 'sosId is required'
      });
    }

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude are required'
      });
    }

    const updated = await SOS.findByIdAndUpdate(
      sosId,
      {
        $set: {
          volunteerLatitude: latitude,
          volunteerLongitude: longitude,
          lastUpdatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'SOS not found'
      });
    }

    return res.json({
      success: true,
      message: 'SOS location updated successfully',
      sos: updated
    });
  } catch (error) {
    console.error('updateSosLocation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update SOS location'
    });
  }
};

// 7. GET VOLUNTEER LIVE LOCATION FOR A SOS (requesting user or accepting volunteer only)
const getSosVolunteerLocation = async (req, res) => {
  try {
    const { sosId } = req.params;
    const user = req?.user;

    if (!sosId) {
      return res.status(400).json({
        success: false,
        message: 'sosId is required'
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const sos = await SOS.findById(sosId).select(
      'userId acceptedBy volunteerLatitude volunteerLongitude lastUpdatedAt'
    );

    if (!sos) {
      return res.status(404).json({
        success: false,
        message: 'SOS not found'
      });
    }

    const uid = String(user._id);
    const isOwner = String(sos.userId) === uid;
    const isVolunteer = sos.acceptedBy != null && String(sos.acceptedBy) === uid;

    if (!isOwner && !isVolunteer) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to view this SOS location'
      });
    }

    return res.json({
      success: true,
      volunteerLatitude: sos.volunteerLatitude,
      volunteerLongitude: sos.volunteerLongitude,
      lastUpdatedAt: sos.lastUpdatedAt
    });
  } catch (error) {
    console.error('getSosVolunteerLocation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get SOS location'
    });
  }
};

module.exports = {
  createSOS,
  getAvailableSOS,
  getMySOS,
  getUserSOS,
  getMyActiveSOS,
  acceptSOS,
  completeSOS,
  cancelSOS,
  rejectSOS,
  updateSosLocation,
  getSosVolunteerLocation
};

