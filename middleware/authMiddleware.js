const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    // Check if request has Authorization header
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      // Extract token from "Bearer <token>"
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token → return 401
    if (!token) {
      return res.status(401).json({
        message: 'Not authorized, no token'
      });
    }

    // Verify token using jwt.verify()
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.adminBypass === true && decoded.role === 'ADMIN') {
      req.user = {
        _id: decoded.id,
        id: decoded.id,
        role: 'ADMIN',
        name: 'Admin',
        email: process.env.ADMIN_EMAIL || 'admin@sentryaid.com'
      };
      return next();
    }

    // Find user by decoded.id
    const user = await User.findById(decoded.id);

    // If user not found
    if (!user) {
      return res.status(401).json({
        message: 'Token failed'
      });
    }

    // Attach user to request
    req.user = user;

    // Call next()
    next();
  } catch (error) {
    // If verification fails → return 401
    return res.status(401).json({
      message: 'Token failed'
    });
  }
};

module.exports = protect;
