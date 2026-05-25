/**
 * SOS emergency contact emails — Resend API only (no Nodemailer/SMTP).
 */
const { sendResendEmail, RESEND_DEBUG } = require('./resendEmailService');

const SOS_TARGET_DEBUG = 'SOS_TARGET_DEBUG';

/**
 * Sends a single SOS alert email to an emergency contact.
 */
async function sendSosEmergencyEmail(toEmail, subject, html) {
  console.log(SOS_TARGET_DEBUG, RESEND_DEBUG, 'sending SOS emergency email to', toEmail);

  return sendResendEmail({
    to: toEmail,
    subject,
    html,
    context: 'SOS emergency alert'
  });
}

module.exports = { sendSosEmergencyEmail, SOS_TARGET_DEBUG };
