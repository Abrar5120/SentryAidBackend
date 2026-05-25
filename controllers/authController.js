const bcrypt = require('bcrypt');
const User = require('../models/User');
const sendPasswordResetEmail = require('../utils/sendPasswordResetEmail');
const { RESEND_DEBUG } = require('../utils/resendEmailService');

const GENERIC_FORGOT_SUCCESS_MESSAGE =
  'If an account exists with this email, a reset code has been sent.';

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: 'User not found'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({
        message: 'Invalid credentials'
      });
    }

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Server error during login'
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: emailNorm });

    if (!user) {
      console.log('PASSWORD_RESET_DEBUG forgot-password: no user for email');
      return res.status(200).json({
        success: true,
        message: GENERIC_FORGOT_SUCCESS_MESSAGE
      });
    }

    const token = String(Math.floor(100000 + Math.random() * 900000));
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    console.log('PASSWORD_RESET_DEBUG token generated for', emailNorm);

    try {
      console.log(RESEND_DEBUG, 'forgot-password route invoking sendPasswordResetEmail (Resend) for', emailNorm);
      await sendPasswordResetEmail(user.email, token);
      console.log(RESEND_DEBUG, 'password reset email success', emailNorm);
    } catch (mailErr) {
      console.error(RESEND_DEBUG, 'password reset email failed', emailNorm, mailErr?.message || mailErr);
      if (mailErr?.stack) {
        console.error(RESEND_DEBUG, 'password reset email stack', mailErr.stack);
      }
      return res.status(500).json({
        success: false,
        message: 'Unable to send reset email. Please try again later.'
      });
    }

    return res.status(200).json({
      success: true,
      message: GENERIC_FORGOT_SUCCESS_MESSAGE
    });
  } catch (error) {
    console.error('forgot-password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during password reset request'
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body || {};

    if (!email || !token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, token, and new password are required'
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: emailNorm });

    if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset code'
      });
    }

    if (String(user.resetPasswordToken) !== String(token).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset code'
      });
    }

    if (new Date() > new Date(user.resetPasswordExpires)) {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();
      return res.status(400).json({
        success: false,
        message: 'Reset code has expired. Please request a new one.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    console.log('PASSWORD_RESET_DEBUG password updated for', emailNorm);

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('reset-password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during password reset'
    });
  }
};

module.exports = {
  loginUser,
  forgotPassword,
  resetPassword
};
