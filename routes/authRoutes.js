const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const User = require('../models/User');
const protect = require('../middleware/authMiddleware');
const sendOTPEmail = require('../utils/sendOTPEmail');
const { RESEND_DEBUG } = require('../utils/resendEmailService');
const { forgotPassword, resetPassword } = require('../controllers/authController');

const router = express.Router();

const OTP_EXPIRY_MINUTES = 5;
const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

// Ensure upload directory exists before configuring multer
const uploadDir = path.join(__dirname, "../uploads/profile");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

// Configure multer with file size limit and file type restriction
const upload = multer({
  storage: storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/pjpeg",
      "image/heic",
      "image/heif"
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.log("Rejected file type:", file.mimetype);
      cb(new Error("Only image files are allowed"), false);
    }
  }
});

// POST /api/auth/register
router.post('/register', upload.single('profileImage'), async (req, res) => {
  try {
    console.log("REGISTER REQUEST RECEIVED");
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const { name, email, phone, nid, password, role } = req.body;

    // Validate all fields are provided
    if (!name || !email || !phone || !nid || !password) {
      return res.status(400).json({
        message: 'All fields are required'
      });
    }

    // Check if email already exists
    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      return res.status(400).json({
        message: 'Email already registered'
      });
    }

    // Check if NID already exists
    const existingUserByNID = await User.findOne({ nid });
    if (existingUserByNID) {
      return res.status(400).json({
        message: 'NID already registered'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Validate and set role
    // Valid roles: USER, VOLUNTEER, BOTH
    const validRoles = ['USER', 'VOLUNTEER', 'BOTH'];
    let userRole = 'USER'; // Default to USER
    
    if (role && validRoles.includes(role.toUpperCase())) {
      userRole = role.toUpperCase();
    }

    const emailOTP = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store web-relative path for profile images (served from /uploads)
    const profileImage = req.file ? `/uploads/profile/${req.file.filename}` : "";

    // Create new user
    const user = new User({
      name,
      email,
      phone,
      nid,
      password: hashedPassword,
      role: userRole,
      isEmailVerified: false,
      userApprovalStatus: "pending",
      volunteerApprovalStatus: "pending",
      status: "pending",
      volunteerStatus: "pending",
      emailOTP,
      otpExpiry,
      profileImage: profileImage
    });

    // Save user to database
    await user.save();

    try {
      console.log(RESEND_DEBUG, 'registration route invoking sendOTPEmail (Resend) for', user.email);
      await sendOTPEmail(user.email, emailOTP);
      console.log(RESEND_DEBUG, 'registration OTP email success', user.email);
    } catch (mailErr) {
      console.error(RESEND_DEBUG, 'registration OTP email failed', user.email, mailErr?.message || mailErr);
      if (mailErr?.stack) {
        console.error(RESEND_DEBUG, 'registration OTP email stack', mailErr.stack);
      }
    }

    res.status(201).json({
      message: 'Registration successful. Please verify OTP sent to your email.',
      requiresOTP: true,
      email: user.email,
      role: user.role,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    console.error("Error Stack:", error.stack);
    
    // Handle multer errors (file size, file type)
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: 'File size too large. Maximum size is 3MB',
          error: error.message
        });
      }
      return res.status(400).json({
        message: 'File upload error',
        error: error.message
      });
    }
    
    // Handle file filter errors
    if (error.message === "Only JPG and PNG images are allowed" || 
        error.message === "Only image files are allowed") {
      return res.status(400).json({
        message: error.message,
        error: error.message
      });
    }
    
    res.status(500).json({
      message: "Registration failed",
      error: error.message
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Debug logging: login attempt
    console.log("LOGIN ATTEMPT - Email:", email);

    // If either field is missing → return 400
    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required'
      });
    }

    // --- Hardcoded admin bypass (no MongoDB, no OTP, no approval checks) ---
    const ADMIN_EMAIL = 'admin@sentryaid.com';
    const adminPasswordPlain = process.env.ADMIN_PASSWORD || '123456';
    const emailNorm = String(email).trim().toLowerCase();
    if (emailNorm === ADMIN_EMAIL) {
      console.log('ADMIN_LOGIN_DEBUG', 'Admin login attempted');
      if (password !== adminPasswordPlain) {
        console.log('ADMIN_LOGIN_DEBUG', 'Admin login failed');
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      console.log('ADMIN_LOGIN_DEBUG', 'Admin login success');
      const adminJwtId =
        process.env.ADMIN_JWT_SUBJECT ||
        '000000000000000000000001';
      const token = jwt.sign(
        { id: adminJwtId, role: 'ADMIN', adminBypass: true },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: adminJwtId,
          name: 'Admin',
          email: ADMIN_EMAIL,
          role: 'ADMIN',
          status: 'approved',
          isEmailVerified: true,
          userApprovalStatus: 'approved',
          volunteerApprovalStatus: 'approved',
          profileImage: ''
        }
      });
    }

    // Find user by email
    const user = await User.findOne({ email });

    // If not found → return 400
    if (!user) {
      console.log("LOGIN FAILED - User not found for email:", email);
      return res.status(400).json({
        message: 'User not found'
      });
    }

    const requestedLoginType = (req.body?.loginType || "USER").toUpperCase();
    // Normalize role and status for comparison (convert to lowercase)
    const normalizedRole = (user.role || "").toLowerCase();
    const isEmailVerified = user.isEmailVerified === true;
    const userApprovalStatus = (user.userApprovalStatus || "pending").toLowerCase();
    const volunteerApprovalStatus = (user.volunteerApprovalStatus || "pending").toLowerCase();

    // Debug logging: user found
    console.log("LOGIN EMAIL:", email);
    console.log("LOGIN ROLE:", user.role, "(normalized:", normalizedRole + ")");
    console.log("LOGIN EMAIL VERIFIED:", isEmailVerified);
    console.log("LOGIN USER APPROVAL:", userApprovalStatus);
    console.log("LOGIN VOLUNTEER APPROVAL:", volunteerApprovalStatus);

    // Compare password using bcrypt.compare()
    const isPasswordValid = await bcrypt.compare(password, user.password);

    // If password does not match → return 401
    if (!isPasswordValid) {
      console.log("LOGIN DECISION: BLOCKED - Invalid password");
      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    if (!isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email OTP before login."
      });
    }

    if (userApprovalStatus === "deactivated") {
      return res.status(403).json({
        success: false,
        message:
          "Your account has been deactivated. Please contact support or an administrator."
      });
    }

    const isVolunteerRole = normalizedRole === "volunteer";
    const isBothRole = normalizedRole === "both";
    const isUserRole = normalizedRole === "user";
    const isAdminRole = normalizedRole === "admin";

    if (isUserRole && userApprovalStatus !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Your user account is not approved."
      });
    }

    if (isVolunteerRole && volunteerApprovalStatus !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Your volunteer account is awaiting admin approval."
      });
    }

    if (isBothRole) {
      if (userApprovalStatus !== "approved") {
        return res.status(403).json({
          success: false,
          message: "Your user account is not approved."
        });
      }
      if (requestedLoginType === "VOLUNTEER" && volunteerApprovalStatus !== "approved") {
        return res.status(403).json({
          success: false,
          message: "Your volunteer account is awaiting admin approval."
        });
      }
    }

    const canLogin = isAdminRole || isUserRole || isVolunteerRole || isBothRole;

    if (!canLogin) {
      console.log("LOGIN DECISION: BLOCKED - Invalid role/status combination");
      console.log("LOGIN BLOCKED - Role:", user.role, "Status:", user.status);
      return res.status(403).json({
        success: false,
        message: "Your account is not approved for login."
      });
    }

    // THEN create JWT (only if login is allowed)
    // Generate JWT token after password is successfully validated and approval check passes
    console.log("LOGIN DECISION: ALLOWED - Generating JWT token");
    console.log("LOGIN SUCCESS - Email:", email, "Role:", user.role, "Status:", user.status);
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // If successful → return 200
    res.status(200).json({
      message: 'Login successful',
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status || "pending",
        isEmailVerified: user.isEmailVerified === true,
        userApprovalStatus: user.userApprovalStatus || "pending",
        volunteerApprovalStatus: user.volunteerApprovalStatus || "pending",
        profileImage: user.profileImage || ""
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Server error during login'
    });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', resetPassword);

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'email and otp are required'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.emailOTP || !user.otpExpiry) {
      return res.status(400).json({
        success: false,
        message: 'OTP not generated. Please register again.'
      });
    }

    if (String(user.emailOTP) !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    if (new Date() > new Date(user.otpExpiry)) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired'
      });
    }

    user.isEmailVerified = true;
    if (user.role === "USER") {
      user.userApprovalStatus = "approved";
      user.volunteerApprovalStatus = "pending";
      user.status = "approved";
      user.volunteerStatus = "none";
    } else if (user.role === "VOLUNTEER") {
      user.userApprovalStatus = "pending";
      user.volunteerApprovalStatus = "pending";
      user.status = "pending";
      user.volunteerStatus = "pending";
    } else if (user.role === "BOTH") {
      user.userApprovalStatus = "approved";
      user.volunteerApprovalStatus = "pending";
      user.status = "pending";
      user.volunteerStatus = "pending";
    } else if (user.role === "ADMIN") {
      user.userApprovalStatus = "approved";
      user.volunteerApprovalStatus = "approved";
      user.status = "approved";
      user.volunteerStatus = "none";
    }

    user.emailOTP = null;
    user.otpExpiry = null;
    await user.save();

    return res.json({
      success: true,
      message: 'OTP verified successfully',
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      userApprovalStatus: user.userApprovalStatus,
      volunteerApprovalStatus: user.volunteerApprovalStatus
    });
  } catch (error) {
    console.error('verify-otp error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
});

// GET /api/auth/profile
router.get('/profile', protect, (req, res) => {
  res.status(200).json({
    message: 'Protected route accessed',
    user: req.user
  });
});

module.exports = router;
