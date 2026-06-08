const { sendResendEmail } = require('./resendEmailService');

const VOLUNTEER_TERMINATION_EMAIL_DEBUG = 'VOLUNTEER_TERMINATION_EMAIL_DEBUG';
const EMAIL_SUBJECT = 'SentryAid Volunteer Account Termination Notice';

function esc(value) {
  return String(value ?? '').replace(/</g, '&lt;');
}

function formatTerminationDate(date) {
  if (!date) {
    return new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }
  try {
    return new Date(date).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return String(date);
  }
}

function buildVolunteerTerminationHtml(volunteerName, terminatedAt, reason) {
  const name = volunteerName && String(volunteerName).trim()
    ? esc(volunteerName.trim())
    : 'Volunteer';
  const dateStr = esc(formatTerminationDate(terminatedAt));
  const reasonStr = esc(reason || 'Not specified');

  return `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
  <h2 style="color:#d32f2f; margin-top:0;">Volunteer Account Termination Notice</h2>

  <p>Hello ${name},</p>

  <p>This message is to inform you that your <strong>SentryAid volunteer account</strong> has been terminated by an administrator.</p>

  <p><strong>Termination date:</strong> ${dateStr}</p>
  <p><strong>Termination reason:</strong> ${reasonStr}</p>

  <p>You will no longer be able to access volunteer features or receive SOS alerts through the platform.</p>

  <p>If you believe this action was made in error, please contact SentryAid support.</p>

  <br>
  <p>Thank you,</p>
  <p><strong>SentryAid Team</strong></p>
</div>
`;
}

/**
 * Sends volunteer termination notice email.
 * @param {string} email
 * @param {string} [volunteerName]
 * @param {Date|string} terminatedAt
 * @param {string} reason
 */
async function sendVolunteerTerminationEmail(email, volunteerName, terminatedAt, reason) {
  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient) {
    throw new Error('Volunteer email is required');
  }

  console.log(VOLUNTEER_TERMINATION_EMAIL_DEBUG, 'sending', recipient);

  await sendResendEmail({
    to: recipient,
    subject: EMAIL_SUBJECT,
    html: buildVolunteerTerminationHtml(volunteerName, terminatedAt, reason),
    context: 'volunteer termination notice'
  });
}

module.exports = sendVolunteerTerminationEmail;
