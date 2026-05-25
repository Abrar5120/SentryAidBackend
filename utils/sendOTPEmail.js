const nodemailer = require('nodemailer');

async function sendOTPEmail(email, otp) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  transporter.verify(function(error, success) {
    if (error) {
      console.log("EMAIL_OTP_DEBUG transporter failed");
      console.log(error);
    } else {
      console.log("EMAIL_OTP_DEBUG transporter ready");
    }
  });

  console.log("EMAIL_OTP_DEBUG sending to:", email);
  console.log("EMAIL_OTP_DEBUG otp:", otp);
  console.log("EMAIL_OTP_DEBUG EMAIL_USER:", process.env.EMAIL_USER);

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your SentryAid Registration OTP",
    html: `
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
`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("EMAIL_OTP_DEBUG success");
    console.log(info);
    return info;
  } catch (error) {
    console.log("EMAIL_OTP_DEBUG failed");
    console.log(error);
    throw error;
  }
}

module.exports = sendOTPEmail;

