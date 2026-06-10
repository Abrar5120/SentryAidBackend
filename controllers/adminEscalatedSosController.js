const SOS = require('../models/SOS');
const User = require('../models/User');
const EmergencyContact = require('../models/EmergencyContact');
const { saveSosWithLocationRepair } = require('../utils/sosLocationRepair');

const SOS_ESCALATION_DEBUG = 'SOS_ESCALATION_DEBUG';
const ADMIN_ESCALATION_DEBUG = 'ADMIN_ESCALATION_DEBUG';

function formatDurationMs(ms) {
  if (!ms || ms < 0) {
    return '0m';
  }
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Loads emergency contacts for a SOS requester; phone resolved from linked SentryAid user when registered.
 */
async function loadEmergencyContactsForUser(userId) {
  const ownerId = userId != null ? String(userId) : '';
  console.log(ADMIN_ESCALATION_DEBUG, 'loading contacts', ownerId || '(none)');

  if (!ownerId) {
    console.log(ADMIN_ESCALATION_DEBUG, 'no contacts available', '(no userId)');
    return [];
  }

  const contacts = await EmergencyContact.find({ userId: ownerId })
    .sort({ createdAt: 1 })
    .lean();

  if (!contacts.length) {
    console.log(ADMIN_ESCALATION_DEBUG, 'no contacts available', ownerId);
    return [];
  }

  const linkedIds = contacts
    .map((c) => c.linkedUserId)
    .filter((id) => id != null);

  const linkedUsers = linkedIds.length
    ? await User.find({ _id: { $in: linkedIds } }).select('phone').lean()
    : [];

  const phoneByUserId = new Map(
    linkedUsers.map((u) => [String(u._id), u.phone && String(u.phone).trim() ? u.phone : null])
  );

  const mapped = contacts.map((c) => {
    const linkedKey = c.linkedUserId != null ? String(c.linkedUserId) : null;
    const phone = linkedKey ? phoneByUserId.get(linkedKey) || null : null;
    return {
      name: c.name && String(c.name).trim() ? c.name : '—',
      relationship: c.relationship && String(c.relationship).trim()
        ? c.relationship
        : 'Emergency Contact',
      phone,
      email: c.email && String(c.email).trim() ? c.email : null
    };
  });

  console.log(ADMIN_ESCALATION_DEBUG, 'contacts found', mapped.length, ownerId);
  return mapped;
}

async function mapEscalatedRow(sos) {
  const user = sos.userId && typeof sos.userId === 'object' ? sos.userId : null;
  const escalatedAt = sos.escalatedAt || sos.createdAt;
  const escalatedMs = escalatedAt ? Date.now() - new Date(escalatedAt).getTime() : 0;
  const mapLink = `https://maps.google.com/?q=${sos.latitude},${sos.longitude}`;
  const ownerId = user ? user._id : sos.userId;
  const emergencyContacts = await loadEmergencyContactsForUser(ownerId);

  return {
    id: String(sos._id),
    userId: user ? String(user._id) : String(sos.userId),
    userName: user?.name || 'Unknown',
    userPhone: user?.phone || null,
    userNid: user?.nid || null,
    message: sos.message || 'Emergency',
    status: sos.status,
    latitude: sos.latitude,
    longitude: sos.longitude,
    mapLink,
    createdAt: sos.createdAt,
    escalatedAt,
    escalatedDuration: formatDurationMs(escalatedMs),
    areaName: sos.areaName || null,
    emergencyContacts
  };
}

/**
 * GET /api/admin/escalated-sos — list SOS awaiting admin resolution.
 */
const getEscalatedSosList = async (req, res) => {
  try {
    const rows = await SOS.find({ status: 'escalated' })
      .sort({ escalatedAt: -1, createdAt: -1 })
      .populate('userId', 'name phone nid');

    const escalatedSos = await Promise.all(rows.map((row) => mapEscalatedRow(row)));

    return res.json({
      success: true,
      escalatedSos
    });
  } catch (err) {
    console.error(SOS_ESCALATION_DEBUG, 'list failed', err.message || err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load escalated SOS list'
    });
  }
};

/**
 * POST /api/admin/escalated-sos/:id/resolve
 */
const resolveEscalatedSos = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'SOS id is required'
      });
    }

    const sos = await SOS.findOne({ _id: id, status: 'escalated' });
    if (!sos) {
      return res.status(404).json({
        success: false,
        message: 'Escalated SOS not found or already resolved'
      });
    }

    sos.status = 'resolved_by_admin';
    sos.resolvedAt = new Date();
    await saveSosWithLocationRepair(sos);

    console.log(SOS_ESCALATION_DEBUG, 'admin resolved SOS', String(id));

    return res.json({
      success: true,
      message: 'SOS resolved by administrator',
      sos: {
        id: String(sos._id),
        status: sos.status,
        resolvedAt: sos.resolvedAt
      }
    });
  } catch (err) {
    console.error(SOS_ESCALATION_DEBUG, 'resolve failed', err.message || err);
    return res.status(500).json({
      success: false,
      message: 'Failed to resolve escalated SOS'
    });
  }
};

module.exports = {
  getEscalatedSosList,
  resolveEscalatedSos
};
