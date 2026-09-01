const express = require('express');
const router = express.Router();
const multer = require('multer');
const Complaint = require('../models/Complaint');
const { protectCitizen, optionalCitizenAuth, protectAdmin } = require('../middleware/auth');
const { uploadImage } = require('../config/cloudinary');

// Setup multer with memory storage (max 10MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

/**
 * @route   POST /api/complaints
 * @desc    Create a new grievance complaint (with photo upload)
 */
router.post('/', protectCitizen, upload.single('photo'), async (req, res) => {
  try {
    const { category, description, lat, lng, address, photoUrl: bodyPhotoUrl } = req.body;

    if (!category || !description) {
      return res.status(400).json({
        success: false,
        message: 'Category and description are required.',
      });
    }

    const validCategories = ['road', 'water', 'garbage', 'streetlight', 'other'];
    if (!validCategories.includes(String(category).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Category must be one of: ${validCategories.join(', ')}`,
      });
    }

    // Determine host for relative uploads
    const reqHost = `${req.protocol}://${req.get('host')}`;

    // Handle image upload from file or direct URL
    let finalPhotoUrl = bodyPhotoUrl || '';
    if (req.file) {
      const uploaded = await uploadImage(req.file, reqHost);
      if (uploaded) finalPhotoUrl = uploaded;
    }

    // Default sample image if none provided
    if (!finalPhotoUrl) {
      const fallbackImages = {
        road: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop&q=80',
        water: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=800&auto=format&fit=crop&q=80',
        garbage: 'https://images.unsplash.com/photo-1605600659873-d808a13e4d2a?w=800&auto=format&fit=crop&q=80',
        streetlight: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=800&auto=format&fit=crop&q=80',
        other: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&auto=format&fit=crop&q=80',
      };
      finalPhotoUrl = fallbackImages[String(category).toLowerCase()] || fallbackImages.other;
    }

    const complaint = await Complaint.create({
      userId: req.user._id,
      category: String(category).toLowerCase(),
      description: description.trim(),
      photoUrl: finalPhotoUrl,
      location: {
        lat: lat ? parseFloat(lat) : 13.0827, // Default to metropolitan demo coords if not provided
        lng: lng ? parseFloat(lng) : 80.2707,
        address: address && address.trim() ? address.trim() : req.user.area || 'Municipal Ward',
      },
      status: 'pending',
      upvotes: [req.user._id], // Author automatically upvotes their own complaint
      upvoteCount: 1,
    });

    const populated = await Complaint.findById(complaint._id).populate('userId', 'name phone area');

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      complaint: populated,
    });
  } catch (err) {
    console.error('[Create Complaint Error]', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Server error while creating complaint.',
    });
  }
});

/**
 * @route   GET /api/complaints/my
 * @desc    Get all complaints created by the logged-in citizen
 */
router.get('/my', protectCitizen, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { userId: req.user._id };

    if (status && status !== 'all') {
      filter.status = status.toLowerCase();
    }

    const complaints = await Complaint.find(filter)
      .sort({ createdAt: -1 })
      .populate('userId', 'name phone area');

    return res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (err) {
    console.error('[Get My Complaints Error]', err);
    return res.status(500).json({ success: false, message: 'Server error loading your complaints.' });
  }
});

/**
 * @route   GET /api/complaints
 * @desc    List all complaints with search, category, status, and area filters
 *          Sorted by upvoteCount DESC (highest priority first) or date
 */
router.get('/', optionalCitizenAuth, async (req, res) => {
  try {
    const { category, status, area, search, sortBy = 'priority' } = req.query;
    const filter = {};

    if (category && category !== 'all') {
      filter.category = category.toLowerCase();
    }

    if (status && status !== 'all') {
      filter.status = status.toLowerCase();
    }

    if (area && area !== 'all') {
      filter['location.address'] = { $regex: area, $options: 'i' };
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { description: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
        { 'location.address': { $regex: q, $options: 'i' } },
      ];
    }

    let sortOption = { upvoteCount: -1, createdAt: -1 };
    if (sortBy === 'recent') {
      sortOption = { createdAt: -1 };
    } else if (sortBy === 'oldest') {
      sortOption = { createdAt: 1 };
    }

    const complaints = await Complaint.find(filter)
      .sort(sortOption)
      .populate('userId', 'name phone area')
      .lean();

    // Attach hasUpvoted flag if user is logged in
    const currentUserId = req.user ? req.user._id.toString() : null;
    const formatted = complaints.map((item) => ({
      ...item,
      hasUpvoted: currentUserId ? (item.upvotes || []).some((uid) => uid.toString() === currentUserId) : false,
    }));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      complaints: formatted,
    });
  } catch (err) {
    console.error('[List Complaints Error]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching complaints.' });
  }
});

/**
 * @route   GET /api/complaints/:id
 * @desc    Get detailed view of a single complaint
 */
router.get('/:id', optionalCitizenAuth, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('userId', 'name phone area')
      .lean();

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const currentUserId = req.user ? req.user._id.toString() : null;
    const hasUpvoted = currentUserId
      ? (complaint.upvotes || []).some((uid) => uid.toString() === currentUserId)
      : false;

    return res.status(200).json({
      success: true,
      complaint: {
        ...complaint,
        hasUpvoted,
      },
    });
  } catch (err) {
    console.error('[Complaint Detail Error]', err);
    return res.status(500).json({ success: false, message: 'Invalid complaint ID or server error.' });
  }
});

/**
 * @route   PATCH /api/complaints/:id/upvote
 * @desc    Toggle upvote for a complaint by citizen
 */
router.patch('/:id/upvote', protectCitizen, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const userIdStr = req.user._id.toString();
    const existingIndex = complaint.upvotes.findIndex((uid) => uid.toString() === userIdStr);

    let hasUpvoted = false;
    if (existingIndex !== -1) {
      // Remove upvote
      complaint.upvotes.splice(existingIndex, 1);
      hasUpvoted = false;
    } else {
      // Add upvote
      complaint.upvotes.push(req.user._id);
      hasUpvoted = true;
    }

    complaint.upvoteCount = complaint.upvotes.length;
    await complaint.save();

    return res.status(200).json({
      success: true,
      message: hasUpvoted ? 'Upvoted complaint (+1 Priority)' : 'Removed upvote',
      hasUpvoted,
      upvoteCount: complaint.upvoteCount,
    });
  } catch (err) {
    console.error('[Upvote Error]', err);
    return res.status(500).json({ success: false, message: 'Error processing upvote.' });
  }
});

/**
 * @route   PATCH /api/complaints/:id/status
 * @desc    Update complaint status (Admin only)
 */
router.patch('/:id/status', protectAdmin, upload.single('resolutionPhoto'), async (req, res) => {
  try {
    const { status, resolutionNote } = req.body;
    const validStatuses = ['pending', 'in_progress', 'resolved'];

    if (!status || !validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const complaint = await Complaint.findById(req.params.id).populate('userId', 'name phone area');
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const oldStatus = complaint.status;
    complaint.status = status.toLowerCase();

    if (resolutionNote) {
      complaint.resolutionNote = resolutionNote.trim();
    }

    // Optional resolution proof image
    if (req.file) {
      const reqHost = `${req.protocol}://${req.get('host')}`;
      const resPhoto = await uploadImage(req.file, reqHost);
      if (resPhoto) complaint.resolutionPhotoUrl = resPhoto;
    }

    if (complaint.status === 'resolved' && !complaint.resolvedAt) {
      complaint.resolvedAt = new Date();
    } else if (complaint.status !== 'resolved') {
      complaint.resolvedAt = null;
    }

    await complaint.save();

    // Citizen notification simulation
    console.log(`\n-----------------------------------------------------`);
    console.log(`[Citizen Notification Alert]`);
    console.log(`To Citizen: ${complaint.userId?.name || 'Citizen'} (${complaint.userId?.phone || 'N/A'})`);
    console.log(`Complaint ID: #${complaint._id.toString().slice(-6)}`);
    console.log(`Status changed from [${oldStatus.toUpperCase()}] to [${complaint.status.toUpperCase()}]`);
    if (complaint.resolutionNote) console.log(`Note from Corporation/Panchayat: "${complaint.resolutionNote}"`);
    console.log(`-----------------------------------------------------\n`);

    return res.status(200).json({
      success: true,
      message: `Status updated to ${complaint.status}. Citizen has been notified.`,
      complaint,
      notificationSent: {
        to: complaint.userId?.phone,
        newStatus: complaint.status,
        note: complaint.resolutionNote,
      },
    });
  } catch (err) {
    console.error('[Update Status Error]', err);
    return res.status(500).json({ success: false, message: 'Error updating complaint status.' });
  }
});

module.exports = router;
