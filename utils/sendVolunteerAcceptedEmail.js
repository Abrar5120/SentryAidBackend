const nodemailer = require('nodemailer');

const VOLUNTEER_ACCEPTED_EMAIL_DEBUG = 'VOLUNTEER_ACCEPTED_EMAIL_DEBUG';
const EMAIL_SUBJECT = 'SentryAid Alert: A Volunteer Has Accepted the Emergency Request';

function esc(value) {
  return String(value ?? 'N/A').replace(/</g, '&lt;');
}

function formatAcceptedAt(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildVolunteerAcceptedHtml(emergencyUser, volunteer, acceptedAt) {
  const bloodGroupLine =
    volunteer.bloodGroup && String(volunteer.bloodGroup).trim()
      ? `<p style="margin:4px 0;"><strong>Blood Group:</strong> ${esc(volunteer.bloodGroup)}</p>`
      : '';

  return `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.5;">
  <h2 style="color:#1A3A5F; margin-top:0;">SentryAid Emergency Alert</h2>

  <p>A verified SentryAid volunteer has accepted the emergency request and is on the way to assist the person listed below.</p>

  <div style="margin: 24px 0; padding: 16px; background: #fff3f3; border-left: 4px solid #d32f2f;">
    <h3 style="margin: 0 0 12px; color: #b71c1c; text-transform: uppercase; font-size: 14px;">Person in Emergency</h3>
    <p style="margin:4px 0;"><strong>Name:</strong> ${esc(emergencyUser?.name)}</p>
    <p style="margin:4px 0;"><strong>Phone:</strong> ${esc(emergencyUser?.phone)}</p>
  </div>

  <div style="margin: 24px 0; padding: 16px; background: #f3f7fb; border-left: 4px solid #1A3A5F;">
    <h3 style="margin: 0 0 12px; color: #1A3A5F; text-transform: uppercase; font-size: 14px;">Responding Volunteer</h3>
    <p style="margin:4px 0;"><strong>Name:</strong> ${esc(volunteer?.name)}</p>
    <p style="margin:4px 0;"><strong>Phone:</strong> ${esc(volunteer?.phone)}</p>
    <p style="margin:4px 0;"><strong>Email:</strong> ${esc(volunteer?.email)}</p>
    ${bloodGroupLine}
    <p style="margin:12px 0 4px;"><strong>Accepted At:</strong> ${formatAcceptedAt(acceptedAt)}</p>
  </div>

  <p style="margin-top: 24px;"><strong>Please remain calm. Help is on the way.</strong></p>

  <br>
  <p>Thank you,</p>
  <p><strong>SentryAid Team</strong></p>
</div>
`;
}

/**
 * Sends volunteer-accepted SOS notification to one emergency contact.
 * @param {string} recipientEmail
 * @param {{ name?: string, email?: string, phone?: string, bloodGroup?: string }} volunteer
 * @param {{ name?: string, phone?: string }} emergencyUser Person who triggered the SOS
 * @param {Date} acceptedAt
 */
async function sendVolunteerAcceptedEmail(recipientEmail, volunteer, emergencyUser, acceptedAt) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(
      VOLUNTEER_ACCEPTED_EMAIL_DEBUG,
      'email skipped (EMAIL_USER / EMAIL_PASS not set)',
      recipientEmail
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const acceptedDate = acceptedAt instanceof Date ? acceptedAt : new Date(acceptedAt);

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: recipientEmail,
    subject: EMAIL_SUBJECT,
    html: buildVolunteerAcceptedHtml(emergencyUser, volunteer, acceptedDate)
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(VOLUNTEER_ACCEPTED_EMAIL_DEBUG, 'transport success for', recipientEmail);
  return info;
}

module.exports = sendVolunteerAcceptedEmail;
