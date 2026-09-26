const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Complaint = require('../models/Complaint');
const { protectAdmin, JWT_SECRET } = require('../middleware/auth');
const { checkAndAutoEscalateComplaints } = require('../services/escalationService');

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
      { id: admin._id, email: admin.email, isAdmin: true, department: admin.department, name: admin.name },
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
 * @desc    Get aggregated stats for dashboard counters & SLA health
 */
router.get('/stats', protectAdmin, async (req, res) => {
  try {
    await checkAndAutoEscalateComplaints();

    const total = await Complaint.countDocuments();
    const pending = await Complaint.countDocuments({ status: { $in: ['submitted', 'pending'] } });
    const acknowledged = await Complaint.countDocuments({ status: 'acknowledged' });
    const inProgress = await Complaint.countDocuments({ status: 'in_progress' });
    const resolved = await Complaint.countDocuments({ status: 'resolved' });
    const rejected = await Complaint.countDocuments({ status: 'rejected' });
    const escalated = await Complaint.countDocuments({ isEscalated: true, status: { $ne: 'resolved' } });

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

    // Calculate Average Resolution Time
    const resolvedComplaints = await Complaint.find({ status: 'resolved', resolvedAt: { $ne: null } })
      .select('createdAt resolvedAt')
      .lean();

    let avgResolutionHours = 0;
    if (resolvedComplaints.length > 0) {
      const totalHours = resolvedComplaints.reduce((acc, c) => {
        const diff = (new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
        return acc + Math.max(1, diff);
      }, 0);
      avgResolutionHours = Math.round(totalHours / resolvedComplaints.length);
    }

    const avgResolutionDays = (avgResolutionHours / 24).toFixed(1);

    return res.status(200).json({
      success: true,
      stats: {
        total,
        pending,
        acknowledged,
        inProgress,
        resolved,
        rejected,
        escalated,
        resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
        avgResolutionHours,
        avgResolutionDays: `${avgResolutionDays} days`,
        categories,
      },
    });
  } catch (err) {
    console.error('[Admin Stats Error]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching statistics.' });
  }
});

/**
 * @route   GET /api/admin/analytics
 * @desc    Get comprehensive analytics data for admin charts
 */
router.get('/analytics', protectAdmin, async (req, res) => {
  try {
    const total = await Complaint.countDocuments();
    const pending = await Complaint.countDocuments({ status: { $in: ['submitted', 'pending'] } });
    const acknowledged = await Complaint.countDocuments({ status: 'acknowledged' });
    const inProgress = await Complaint.countDocuments({ status: 'in_progress' });
    const resolved = await Complaint.countDocuments({ status: 'resolved' });
    const rejected = await Complaint.countDocuments({ status: 'rejected' });
    const escalated = await Complaint.countDocuments({ isEscalated: true, status: { $ne: 'resolved' } });

    // 1. Category Breakdown
    const categoryGroup = await Complaint.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    const categories = {
      road: 0,
      water: 0,
      garbage: 0,
      streetlight: 0,
      other: 0,
    };
    categoryGroup.forEach((item) => {
      if (categories[item._id] !== undefined) {
        categories[item._id] = item.count;
      } else {
        categories.other += item.count;
      }
    });

    // 2. 30-Day Timeline (Daily complaints)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const timelineData = await Complaint.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyTimeline = [];
    const timelineMap = new Map();
    timelineData.forEach((d) => timelineMap.set(d._id, d.count));

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyTimeline.push({
        date: dateStr,
        displayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: timelineMap.get(dateStr) || 0,
      });
    }

    // 3. Status Breakdown & Percentages
    const pendingPct = total > 0 ? Math.round(((pending + acknowledged) / total) * 100) : 0;
    const inProgressPct = total > 0 ? Math.round((inProgress / total) * 100) : 0;
    const resolvedPct = total > 0 ? Math.round((resolved / total) * 100) : 0;
    const rejectedPct = total > 0 ? Math.round((rejected / total) * 100) : 0;

    return res.status(200).json({
      success: true,
      analytics: {
        total,
        escalated,
        categories: {
          labels: ['Road Damage', 'Water Leak', 'Garbage', 'Streetlight', 'Other'],
          keys: ['road', 'water', 'garbage', 'streetlight', 'other'],
          data: [
            categories.road,
            categories.water,
            categories.garbage,
            categories.streetlight,
            categories.other,
          ],
        },
        timeline: dailyTimeline,
        statusBreakdown: {
          labels: ['Submitted & Pending', 'In Progress / Dispatched', 'Resolved & Verified', 'Rejected'],
          data: [pending + acknowledged, inProgress, resolved, rejected],
          percentages: [pendingPct, inProgressPct, resolvedPct, rejectedPct],
        },
      },
    });
  } catch (err) {
    console.error('[Admin Analytics Error]', err);
    return res.status(500).json({ success: false, message: 'Server error loading analytics.' });
  }
});

module.exports = router;
