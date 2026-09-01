const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Complaint = require('../models/Complaint');
const { protectAdmin, JWT_SECRET } = require('../middleware/auth');

/**
 * @route   POST /api/admin/login
 * @desc    Municipal / Panchayat staff login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please verify your staff email.',
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.',
      });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email, isAdmin: true, department: admin.department },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Admin authentication successful',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        department: admin.department,
        area: admin.area,
      },
    });
  } catch (err) {
    console.error('[Admin Login Error]', err);
    return res.status(500).json({ success: false, message: 'Server error during admin login.' });
  }
});

/**
 * @route   GET /api/admin/stats
 * @desc    Get aggregated stats for dashboard counters
 */
router.get('/stats', protectAdmin, async (req, res) => {
  try {
    const total = await Complaint.countDocuments();
    const pending = await Complaint.countDocuments({ status: 'pending' });
    const inProgress = await Complaint.countDocuments({ status: 'in_progress' });
    const resolved = await Complaint.countDocuments({ status: 'resolved' });

    // Category breakdown
    const categoryCounts = await Complaint.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    const categories = {
      road: 0,
      water: 0,
      garbage: 0,
      streetlight: 0,
      other: 0,
    };
    categoryCounts.forEach((c) => {
      if (categories[c._id] !== undefined) categories[c._id] = c.count;
    });

    return res.status(200).json({
      success: true,
      stats: {
        total,
        pending,
        inProgress,
        resolved,
        resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
        categories,
      },
    });
  } catch (err) {
    console.error('[Admin Stats Error]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching statistics.' });
  }
});

/**
 * @route   GET /api/admin/me
 * @desc    Get admin session profile
 */
router.get('/me', protectAdmin, async (req, res) => {
  return res.status(200).json({
    success: true,
    admin: {
      id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email,
      department: req.admin.department,
      area: req.admin.area,
    },
  });
});

module.exports = router;
