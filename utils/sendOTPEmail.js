/**
 * Registration OTP emails — Resend API only (no Nodemailer/SMTP).
 */
const { sendResendEmail, RESEND_DEBUG } = require('./resendEmailService');

async function sendOTPEmail(email, otp) {
  console.log(RESEND_DEBUG, 'sending OTP to', email);

  const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
    <h2 style="color:#d32f2f;">SentryAid Registration Verification</h2>

    <p>Hello,</p>

    <p>Your SentryAid registration OTP is:</p>

    <div style="
        font-size: 32px;
        font-weight: bold;
        letter-spacing: 6px;
        margin: 20px 0;
        color: #000;
    ">
        ${otp}
    </div>

    <p>This OTP will expire in 5 minutes.</p>

    <p>If you did not request this registration, please ignore this email.</p>

    <br>

    <p>Thank you,</p>
    <p><strong>SentryAid Team</strong></p>
</div>
`;

  return sendResendEmail({
    to: email,
    subject: 'Your SentryAid Registration OTP',
    html,
    context: 'OTP'
  });
}

module.exports = sendOTPEmail;
