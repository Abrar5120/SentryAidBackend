const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const { repairReviewSubmittedFlags } = require('../services/repairReviewSubmitted');
const { recoverPendingEscalations } = require('../services/sosEscalationService');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    await repairReviewSubmittedFlags();

    try {
      await recoverPendingEscalations();
    } catch (escalationErr) {
      console.error('SOS_ESCALATION_DEBUG', 'startup recovery error (non-fatal)', escalationErr.message || escalationErr);
    }

    // Create default admin account if it doesn't exist
    await createDefaultAdmin();
  } catch (error) {
    console.error('MongoDB Connection Failed', error);
    process.exit(1);
  }
};

/**
 * Create default admin account if it doesn't exist
 */
async function createDefaultAdmin() {
  try {
    const adminEmail = "admin@sentryaid.com";
    
    const existingAdmin = await User.findOne({ email: adminEmail });
    
    if (!existingAdmin) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("123456", salt);
      
      const adminUser = new User({
        name: "Admin",
        email: adminEmail,
        phone: "0000000000", // Default phone for admin
        nid: "ADMIN000000", // Default NID for admin
        password: hashedPassword,
        role: "ADMIN",
        status: "approved"
      });
      
      await adminUser.save();
      
      console.log("Default admin created: admin@sentryaid.com / 123456");
    } else {
      console.log("Admin account already exists");
    }
  } catch (error) {
    console.error("Error creating admin:", error);
  }
}

module.exports = connectDB;
