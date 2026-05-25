const nodemailer = require('nodemailer');

const SOS_TARGET_DEBUG = 'SOS_TARGET_DEBUG';

/**
 * Sends a single SOS alert email to an emergency contact.
 * Does not throw on missing env (logs and returns).
 */
async function sendSosEmergencyEmail(toEmail, subject, html) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(SOS_TARGET_DEBUG, 'Emergency email skipped (EMAIL_USER / EMAIL_PASS not set)', toEmail);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject,
    html
  });
}

module.exports = { sendSosEmergencyEmail, SOS_TARGET_DEBUG };
