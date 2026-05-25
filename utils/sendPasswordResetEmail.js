/**
 * Password reset emails — Resend API only (no Nodemailer/SMTP).
 */
const { sendResendEmail, RESEND_DEBUG } = require('./resendEmailService');

async function sendPasswordResetEmail(email, token) {
  console.log(RESEND_DEBUG, 'sending password reset email to', email);

  const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
    <h2 style="color:#1A3A5F;">SentryAid Password Reset</h2>

    <p>Hello,</p>

    <p>You requested a password reset for your SentryAid account. Your reset code is:</p>

    <div style="
        font-size: 32px;
        font-weight: bold;
        letter-spacing: 6px;
        margin: 20px 0;
        color: #0A2540;
    ">
        ${token}
    </div>

    <p>This code expires in 15 minutes.</p>

    <p>If you did not request a password reset, please ignore this email.</p>

    <br>

    <p>Thank you,</p>
    <p><strong>SentryAid Team</strong></p>
</div>
`;

  return sendResendEmail({
    to: email,
    subject: 'SentryAid Password Reset Code',
    html,
    context: 'password reset'
  });
}

module.exports = sendPasswordResetEmail;
