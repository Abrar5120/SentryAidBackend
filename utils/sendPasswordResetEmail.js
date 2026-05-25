const nodemailer = require('nodemailer');

async function sendPasswordResetEmail(email, token) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'SentryAid Password Reset Code',
    html: `
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
`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('PASSWORD_RESET_DEBUG email transport success');
    console.log(info);
    return info;
  } catch (error) {
    console.log('PASSWORD_RESET_DEBUG email transport failed');
    console.log(error);
    throw error;
  }
}

module.exports = sendPasswordResetEmail;
