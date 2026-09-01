const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');

const JWT_SECRET = process.env.JWT_SECRET || 'grievance_tracker_jwt_secret_key_2026';

// Middleware to authenticate citizen user
const protectCitizen = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please login with your phone number.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User account not found.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
};

// Optional citizen authentication (e.g. for listing to know if current user upvoted)
const optionalCitizenAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = await User.findById(decoded.id);
    } catch (err) {
      // Continue without user
    }
  }
  next();
};

// Middleware to authenticate municipal staff / admin
const protectAdmin = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden. Admin privileges required.' });
    }
    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Admin profile not found.' });
    }
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired admin session token.' });
  }
};

module.exports = {
  protectCitizen,
  optionalCitizenAuth,
  protectAdmin,
  JWT_SECRET,
};
