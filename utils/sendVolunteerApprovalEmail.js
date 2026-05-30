/**
 * Volunteer application approval emails — Resend API only (no Nodemailer/SMTP).
 */
const { sendResendEmail } = require('./resendEmailService');

const VOLUNTEER_APPROVAL_EMAIL_DEBUG = 'VOLUNTEER_APPROVAL_EMAIL_DEBUG';
const EMAIL_SUBJECT = 'Your SentryAid Volunteer Application Has Been Approved';

function esc(value) {
  return String(value ?? '').replace(/</g, '&lt;');
}

function buildVolunteerApprovalHtml(volunteerName) {
  const name = volunteerName && String(volunteerName).trim()
    ? esc(volunteerName.trim())
    : 'Volunteer';

  return `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
  <h2 style="color:#1A3A5F; margin-top:0;">Welcome to the SentryAid Volunteer Community</h2>

  <p>Hello ${name},</p>

  <p>We are pleased to inform you that your <strong>SentryAid volunteer application has been approved</strong>.</p>

  <p>Your <strong>Volunteer Dashboard</strong> access is now unlocked. You may sign in with your volunteer account and begin using volunteer features immediately.</p>

  <ul style="padding-left: 20px;">
    <li>Receive nearby emergency SOS alerts</li>
    <li>Accept and respond to users who need assistance</li>
    <li>Help your community during critical situations</li>
  </ul>

  <p>Please ensure location services and notification permissions are enabled so you do not miss urgent SOS requests.</p>

  <p>Thank you for volunteering to help others. Your commitment makes SentryAid stronger.</p>

  <br>
  <p>Thank you,</p>
  <p><strong>SentryAid Team</strong></p>
</div>
`;
}

/**
 * Sends volunteer application approval notification.
 * @param {string} email Volunteer email address
 * @param {string} [volunteerName] Volunteer display name
 */
async function sendVolunteerApprovalEmail(email, volunteerName) {
  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient) {
    throw new Error('Volunteer email is required');
  }

  console.log(VOLUNTEER_APPROVAL_EMAIL_DEBUG, 'sending to', recipient);

  await sendResendEmail({
    to: recipient,
    subject: EMAIL_SUBJECT,
    html: buildVolunteerApprovalHtml(volunteerName),
    context: 'volunteer application approved'
  });
}

module.exports = sendVolunteerApprovalEmail;
