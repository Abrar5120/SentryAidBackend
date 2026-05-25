/**
 * Requires authenticated user with role ADMIN (after {@link protect}).
 */
function adminOnly(req, res, next) {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
}

module.exports = adminOnly;
