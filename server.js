const fs = require('fs');
const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '.env')
});

const { RESEND_DEBUG, resolveFromAddress } = require('./utils/resendEmailService');
const resolvedSender = resolveFromAddress();
console.log(
  RESEND_DEBUG,
  'email transport: Resend API only',
  process.env.RESEND_API_KEY ? '(RESEND_API_KEY set)' : '(RESEND_API_KEY missing)'
);
console.log(RESEND_DEBUG, 'resolved sender email:', resolvedSender);

const { initFirebaseAdminIfPossible } = require('./config/firebaseAdmin');
initFirebaseAdminIfPossible();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const sosRoutes = require('./routes/sosRoutes');
const messageRoutes = require('./routes/messageRoutes');
const volunteerRoutes = require('./routes/volunteerRoutes');
const emergencyContactRoutes = require('./routes/emergencyContactRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const abuseReportRoutes = require('./routes/abuseReportRoutes');
const broadcastRoutes = require('./routes/broadcastRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();

const { ensureUploadDirectories, PROFILE_DIR } = require('./config/uploadDirs');
ensureUploadDirectories();

// Middleware
app.use(express.json());
app.use(cors());

// Profile images only — NID images are admin-protected via /api/admin/users/:id/nid/:side
app.use('/uploads/profile', express.static(PROFILE_DIR));

// Test route
app.get('/', (req, res) => {
  res.json({
    message: 'SentryAid Backend Running'
  });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// SOS routes
app.use('/api/sos', sosRoutes);

app.use('/api/messages', messageRoutes);

// Volunteer routes
app.use('/api/volunteer', volunteerRoutes);

// Emergency contacts
app.use('/api/emergency-contact', emergencyContactRoutes);

// Reviews (post-SOS feedback)
app.use('/api/reviews', reviewRoutes);

// Abuse / incident reports
app.use('/api/abuse-reports', abuseReportRoutes);

// Emergency broadcasts (admin sends; all authenticated users can list)
app.use('/api/broadcasts', broadcastRoutes);

// FCM token registration for push notifications
app.use('/api/notifications', notificationRoutes);

// User account actions (deactivate, etc.)
app.use('/api/users', userRoutes);

// Server configuration
const PORT = process.env.PORT || 5000;

// Connect to MongoDB before starting server
connectDB();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
