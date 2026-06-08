const SOS = require('../models/SOS');
const User = require('../models/User');
const EmergencyContact = require('../models/EmergencyContact');
const { sendSosEmergencyEmail } = require('../utils/sendSosEmergencyEmail');
const { sendSosEscalatedUserNotification } = require('./fcmSosService');
const {
  hasValidSosLocation,
  repairSosLocationOnDocument,
  saveSosWithLocationRepair,
  repairInvalidSosLocationsInDb
} = require('../utils/sosLocationRepair');

const SOS_ESCALATION_DEBUG = 'SOS_ESCALATION_DEBUG';
const SOS_ESCALATION_DELAY_MS =
  Number(process.env.SOS_ESCALATION_DELAY_MS) > 0
    ? Number(process.env.SOS_ESCALATION_DELAY_MS)
    : 5 * 60 * 1000;

/** @type {Map<string, NodeJS.Timeout>} */
const escalationTimers = new Map();

function isValidContactEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function formatSosCreatedAt(date) {
  if (!date) {
    return 'Unknown';
  }
  try {
    return new Date(date).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC'
    }) + ' UTC';
  } catch {
    return String(date);
  }
}

function buildEscalationEmailHtml(user, sos) {
  const userName = user?.name || 'SentryAid user';
  const userPhone = user?.phone || 'Not provided';
  const message = (sos.message || 'Emergency').replace(/</g, '&lt;');
  const createdAt = formatSosCreatedAt(sos.createdAt);
  const mapLink = `https://maps.google.com/?q=${sos.latitude},${sos.longitude}`;
  const area = sos.areaName ? ` (${sos.areaName})` : '';

  return `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 560px;">
  <h2 style="color:#d32f2f; margin-top:0;">SOS Escalation — No Volunteer Response</h2>
  <p>This SOS alert has been active for <strong>5 minutes</strong> without a volunteer accepting it.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
  <p><strong>User name:</strong> ${userName}</p>
  <p><strong>User phone:</strong> ${userPhone}</p>
  <p><strong>SOS created:</strong> ${createdAt}</p>
  <p><strong>Message:</strong> ${message}</p>
  <p><strong>Last known location:</strong> ${sos.latitude}, ${sos.longitude}${area}</p>
  <p style="margin:20px 0;">
    <a href="${mapLink}" style="background:#d32f2f;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">
      Open location on Google Maps
    </a>
  </p>
  <p style="font-size:13px;color:#666;">Please check on this person immediately.</p>
  <p>— SentryAid</p>
</div>`;
}

function ensureSosLocationOrSkip(sos) {
  if (hasValidSosLocation(sos)) {
    return true;
  }

  const repair = repairSosLocationOnDocument(sos);
  if (repair.ok) {
    console.log(SOS_ESCALATION_DEBUG, 'repaired invalid location', String(sos._id));
    return true;
  }

  console.warn(SOS_ESCALATION_DEBUG, 'skipped invalid SOS', String(sos._id));
  return false;
}

async function sendEscalationEmails(sos, user) {
  const contacts = await EmergencyContact.find({ userId: sos.userId });
  const validContacts = contacts.filter((c) => isValidContactEmail(c.email));

  if (!validContacts.length) {
    console.log(SOS_ESCALATION_DEBUG, 'no emergency contacts to email', String(sos._id));
    return false;
  }

  const subject = `URGENT: SOS escalation — no volunteer response for ${user?.name || 'SentryAid user'}`;
  const html = buildEscalationEmailHtml(user, sos);

  console.log(SOS_ESCALATION_DEBUG, 'sending emails', 'count=', validContacts.length, 'sosId=', String(sos._id));

  let sentAny = false;
  for (const c of validContacts) {
    const email = c.email.trim().toLowerCase();
    try {
      await sendSosEmergencyEmail(email, subject, html);
      sentAny = true;
    } catch (err) {
      console.error(SOS_ESCALATION_DEBUG, 'email failed for', email, err.message || err);
    }
  }
  return sentAny;
}

async function finalizeSosEscalation(sos) {
  sos.status = 'escalated';
  sos.escalationEmailSent = true;
  sos.escalatedAt = new Date();
  await saveSosWithLocationRepair(sos);

  console.log(SOS_ESCALATION_DEBUG, 'escalated SOS', String(sos._id));

  try {
    await sendSosEscalatedUserNotification(sos);
    console.log(SOS_ESCALATION_DEBUG, 'user notified', String(sos._id));
  } catch (err) {
    console.error(SOS_ESCALATION_DEBUG, 'user notify failed', String(sos._id), err.message || err);
  }

  console.log(SOS_ESCALATION_DEBUG, 'added to admin queue', String(sos._id));
}

/**
 * Escalate a still-pending SOS after 5 minutes: emails, status change, user FCM.
 */
async function runSosEscalationCheck(sosId) {
  try {
    console.log(SOS_ESCALATION_DEBUG, 'checking SOS', String(sosId));

    const sos = await SOS.findById(sosId);
    if (!sos) {
      return;
    }

    if (sos.status === 'escalated' || sos.status === 'resolved_by_admin') {
      return;
    }

    if (sos.status !== 'pending') {
      console.log(SOS_ESCALATION_DEBUG, 'skipped accepted SOS', String(sosId), 'status=', sos.status);
      return;
    }

    if (sos.escalationEmailSent) {
      console.log(SOS_ESCALATION_DEBUG, 'skipped duplicate escalation', String(sosId));
      return;
    }

    if (!ensureSosLocationOrSkip(sos)) {
      return;
    }

    console.log(SOS_ESCALATION_DEBUG, 'still pending', String(sosId));

    const user = await User.findById(sos.userId).select('name phone');
    await sendEscalationEmails(sos, user);
    await finalizeSosEscalation(sos);

    console.log(SOS_ESCALATION_DEBUG, 'success', String(sosId));
  } catch (err) {
    console.error(SOS_ESCALATION_DEBUG, 'escalation check failed', String(sosId), err.message || err);
  }
}

function scheduleSosEscalation(sosId) {
  const key = String(sosId);
  console.log(SOS_ESCALATION_DEBUG, 'scheduled', key);

  const existing = escalationTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    escalationTimers.delete(key);
    void runSosEscalationCheck(sosId);
  }, SOS_ESCALATION_DELAY_MS);

  escalationTimers.set(key, timer);
}

function cancelSosEscalation(sosId) {
  const key = String(sosId);
  const timer = escalationTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    escalationTimers.delete(key);
  }
}

async function recoverPendingEscalations() {
  try {
    await repairInvalidSosLocationsInDb(SOS);

    const cutoff = new Date(Date.now() - SOS_ESCALATION_DELAY_MS);
    const rows = await SOS.find({
      status: 'pending',
      escalationEmailSent: { $ne: true },
      createdAt: { $lte: cutoff }
    }).select('_id');

    if (rows.length) {
      console.log(SOS_ESCALATION_DEBUG, 'recovering', rows.length, 'pending escalation(s)');
    }

    for (const row of rows) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await runSosEscalationCheck(row._id);
      } catch (err) {
        console.error(
          SOS_ESCALATION_DEBUG,
          'recovery item failed',
          String(row._id),
          err.message || err
        );
      }
    }

    const legacyRows = await SOS.find({
      status: 'pending',
      escalationEmailSent: true
    }).select('_id escalatedAt updatedAt createdAt');

    for (const row of legacyRows) {
      try {
        const doc = await SOS.findById(row._id);
        if (!doc || doc.status !== 'pending') {
          continue;
        }
        doc.status = 'escalated';
        if (!doc.escalatedAt) {
          doc.escalatedAt = doc.updatedAt || doc.createdAt || new Date();
        }
        // eslint-disable-next-line no-await-in-loop
        await saveSosWithLocationRepair(doc);
        console.log(SOS_ESCALATION_DEBUG, 'legacy pending→escalated', String(row._id));
      } catch (err) {
        console.error(
          SOS_ESCALATION_DEBUG,
          'legacy fix failed',
          String(row._id),
          err.message || err
        );
      }
    }

    console.log(SOS_ESCALATION_DEBUG, 'recovery completed');
  } catch (err) {
    console.error(SOS_ESCALATION_DEBUG, 'recovery failed', err.message || err);
  }
}

module.exports = {
  SOS_ESCALATION_DEBUG,
  SOS_ESCALATION_DELAY_MS,
  scheduleSosEscalation,
  cancelSosEscalation,
  runSosEscalationCheck,
  recoverPendingEscalations,
  buildEscalationEmailHtml
};
