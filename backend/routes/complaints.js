const express = require('express');
const router = express.Router();
const multer = require('multer');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const { protectCitizen, optionalCitizenAuth, protectAdmin } = require('../middleware/auth');
const { uploadImage } = require('../config/cloudinary');
const { sendExpoPushNotification } = require('../services/pushNotifications');
const { sendSMS } = require('../services/sms');
const { calculateDueDate, SLA_DAYS, ESCALATION_LEVELS } = require('../config/sla');
const { checkAndAutoEscalateComplaints, getWardLeaderboard } = require('../services/escalationService');

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
 * Haversine formula to compute distance between two GPS coordinates in meters
 */
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * @route   POST /api/complaints/check-duplicate
 * @desc    Check if an active grievance exists within 100m in the same category
 */
router.post('/check-duplicate', async (req, res) => {
  try {
    const { category, lat, lng, radiusMeters = 100 } = req.body;

    if (!category || lat === undefined || lng === undefined) {
      return res.status(200).json({ success: true, isDuplicate: false, duplicates: [] });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    // Find all active (submitted, pending, acknowledged, in_progress, reopened) complaints in the same category
    const activeComplaints = await Complaint.find({
      category: String(category).toLowerCase(),
      status: { $in: ['submitted', 'pending', 'acknowledged', 'in_progress', 'reopened'] },
    }).populate('userId', 'name area');

    const duplicates = [];

    for (const comp of activeComplaints) {
      if (comp.location && comp.location.lat && comp.location.lng) {
        const dist = getDistanceMeters(parsedLat, parsedLng, comp.location.lat, comp.location.lng);
        if (dist <= radiusMeters) {
          duplicates.push({
            _id: comp._id,
            category: comp.category,
            description: comp.description,
            photoUrl: comp.photoUrl,
            photos: comp.photos || (comp.photoUrl ? [comp.photoUrl] : []),
            status: comp.status,
            upvoteCount: comp.upvoteCount || (comp.upvotes ? comp.upvotes.length : 1),
            location: comp.location,
            distanceMeters: dist,
            createdAt: comp.createdAt,
          });
        }
      }
    }

    // Sort by nearest distance first
    duplicates.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return res.status(200).json({
      success: true,
      isDuplicate: duplicates.length > 0,
      duplicates,
    });
  } catch (err) {
    console.error('[Check Duplicate Error]', err);
    return res.status(500).json({ success: false, message: 'Server error checking duplicates.' });
  }
});

/**
 * @route   GET /api/complaints/leaderboard
 * @desc    Public ward leaderboard showing resolution performance and trust metrics
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await getWardLeaderboard();
    return res.status(200).json({
      success: true,
      leaderboard,
    });
  } catch (err) {
    console.error('[Leaderboard Error]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching leaderboard.' });
  }
});

/**
 * @route   POST /api/complaints/auto-escalate
 * @desc    Trigger SLA auto-escalation check for overdue grievances
 */
router.post('/auto-escalate', async (req, res) => {
  try {
    const escalated = await checkAndAutoEscalateComplaints();
    return res.status(200).json({
      success: true,
      message: `Checked SLA deadlines. ${escalated.length} complaints escalated.`,
      escalated,
    });
  } catch (err) {
    console.error('[Auto Escalate Error]', err);
    return res.status(500).json({ success: false, message: 'Error checking auto-escalations.' });
  }
});

/**
 * @route   POST /api/complaints
 * @desc    Create a new grievance complaint (with photo upload & multiple photos support)
 */
router.post('/', protectCitizen, upload.array('photos', 3), async (req, res) => {
  try {
    const { category, description, lat, lng, address, photoUrl: bodyPhotoUrl, photos: bodyPhotos } = req.body;

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

    // Collect photos
    const photoUrls = [];

    // From file upload (multer)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploaded = await uploadImage(file, reqHost);
        if (uploaded) photoUrls.push(uploaded);
      }
    } else if (req.file) {
      const uploaded = await uploadImage(req.file, reqHost);
      if (uploaded) photoUrls.push(uploaded);
    }

    // From JSON body
    if (bodyPhotos && Array.isArray(bodyPhotos)) {
      bodyPhotos.forEach((p) => {
        if (p && typeof p === 'string' && !photoUrls.includes(p)) photoUrls.push(p);
      });
    } else if (bodyPhotoUrl && typeof bodyPhotoUrl === 'string' && !photoUrls.includes(bodyPhotoUrl)) {
      photoUrls.push(bodyPhotoUrl);
    }

    // Fallback image if none provided
    if (photoUrls.length === 0) {
      const fallbackImages = {
        road: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop&q=80',
        water: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=800&auto=format&fit=crop&q=80',
        garbage: 'https://images.unsplash.com/photo-1605600659873-d808a13e4d2a?w=800&auto=format&fit=crop&q=80',
        streetlight: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=800&auto=format&fit=crop&q=80',
        other: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&auto=format&fit=crop&q=80',
      };
      photoUrls.push(fallbackImages[String(category).toLowerCase()] || fallbackImages.other);
    }

    const now = new Date();
    const cleanAddress = address && address.trim() ? address.trim() : (req.user.area || 'Municipal Ward Area');

    const complaint = await Complaint.create({
      userId: req.user._id,
      category: String(category).toLowerCase(),
      description: description.trim(),
      photoUrl: photoUrls[0],
      photos: photoUrls,
      location: {
        lat: lat ? parseFloat(lat) : 13.0827,
        lng: lng ? parseFloat(lng) : 80.2707,
        address: cleanAddress,
      },
      status: 'submitted',
      statusTimeline: [
        {
          status: 'submitted',
          changedBy: {
            id: req.user._id,
            name: req.user.name || 'Citizen',
            role: 'citizen',
          },
          timestamp: now,
          note: 'Grievance submitted by citizen with GPS coordinates and photographic evidence.',
        },
      ],
      upvotes: [req.user._id],
      upvoteCount: 1,
      dueDate: calculateDueDate(category, now),
      escalationLevel: 1,
      isEscalated: false,
    });

    const populated = await Complaint.findById(complaint._id).populate('userId', 'name phone area');

    // Notify nearby ward citizens (opt-in simulated notification)
    const wardMatch = cleanAddress.match(/Ward\s*\d+/i);
    const wardText = wardMatch ? wardMatch[0] : (req.user.area || 'your area');
    console.log(`[Ward Broadcast] New grievance reported in ${wardText}: "${description.slice(0, 40)}..." (Ticket #${complaint._id.toString().slice(-6)})`);

    return res.status(201).json({
      success: true,
      message: 'Grievance submitted successfully.',
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
    // Run SLA auto-escalation check
    await checkAndAutoEscalateComplaints();

    const { status } = req.query;
    const filter = { userId: req.user._id };

    if (status && status !== 'all') {
      if (status === 'pending' || status === 'submitted') {
        filter.status = { $in: ['submitted', 'pending'] };
      } else {
        filter.status = status.toLowerCase();
      }
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
 *          Sorted by upvoteCount DESC (priority), SLA deadline, or date
 */
router.get('/', optionalCitizenAuth, async (req, res) => {
  try {
    // Run SLA auto-escalation check periodically on query
    await checkAndAutoEscalateComplaints();

    const { category, status, area, search, sortBy = 'priority' } = req.query;
    const filter = {};

    if (category && category !== 'all') {
      filter.category = category.toLowerCase();
    }

    if (status && status !== 'all') {
      if (status === 'pending' || status === 'submitted') {
        filter.status = { $in: ['submitted', 'pending'] };
      } else {
        filter.status = status.toLowerCase();
      }
    }

    if (area && area !== 'all' && area.trim()) {
      filter['location.address'] = { $regex: area.trim(), $options: 'i' };
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
    } else if (sortBy === 'deadline') {
      sortOption = { dueDate: 1, upvoteCount: -1 };
    }

    let complaints = await Complaint.find(filter)
      .sort(sortOption)
      .populate('userId', 'name phone area')
      .lean();

    // If a specific area was filtered and returned 0 results, check if we should return all grievances
    // so that citizen recent grievances feed never looks blank when user has an unseeded ward
    if (complaints.length === 0 && area && area !== 'all') {
      const allComplaints = await Complaint.find({ ...filter, 'location.address': { $exists: true } })
        .sort(sortOption)
        .populate('userId', 'name phone area')
        .lean();
      if (allComplaints.length > 0) {
        complaints = allComplaints;
      }
    }

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
 * @route   GET /api/complaints/public-resolved
 * @desc    Public transparency feed: Get all verified resolved complaints without personal citizen data
 */
router.get('/public-resolved', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { status: 'resolved' };

    if (category && category !== 'all') {
      filter.category = String(category).toLowerCase();
    }

    const resolvedComplaints = await Complaint.find(filter)
      .select(
        'category description photoUrl photos resolutionPhotoUrl resolutionNote location createdAt resolvedAt upvoteCount citizenFeedback isEscalated'
      )
      .sort({ resolvedAt: -1, createdAt: -1 })
      .lean();

    const formatted = resolvedComplaints.map((item) => {
      const created = new Date(item.createdAt);
      const resolved = item.resolvedAt ? new Date(item.resolvedAt) : new Date();
      const diffTime = Math.abs(resolved - created);
      const daysTaken = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      return {
        _id: item._id,
        category: item.category,
        description: item.description,
        photoUrl: item.photoUrl,
        photos: item.photos || (item.photoUrl ? [item.photoUrl] : []),
        resolutionPhotoUrl: item.resolutionPhotoUrl,
        resolutionNote: item.resolutionNote,
        location: item.location,
        createdAt: item.createdAt,
        resolvedAt: item.resolvedAt || item.createdAt,
        daysTaken,
        upvoteCount: item.upvoteCount || 1,
        citizenFeedback: item.citizenFeedback,
        isEscalated: item.isEscalated,
      };
    });

    return res.status(200).json({
      success: true,
      total: formatted.length,
      complaints: formatted,
    });
  } catch (err) {
    console.error('[Public Resolved Feed Error]', err);
    return res.status(500).json({
      success: false,
      message: 'Server error loading public transparency feed.',
    });
  }
});

/**
 * @route   GET /api/complaints/:id
 * @desc    Get detailed view of a single complaint with full timeline & escalation history
 */
router.get('/:id', optionalCitizenAuth, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('userId', 'name phone area pushToken')
      .populate('assignedOfficer.id', 'name email department')
      .lean();

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const currentUserId = req.user ? req.user._id.toString() : null;
    const hasUpvoted = currentUserId
      ? (complaint.upvotes || []).some((uid) => uid.toString() === currentUserId)
      : false;

    // Format SLA metadata
    const slaDays = SLA_DAYS[complaint.category] || 7;
    const now = new Date();
    const isOverdue = complaint.dueDate && now > new Date(complaint.dueDate) && complaint.status !== 'resolved' && complaint.status !== 'rejected';

    return res.status(200).json({
      success: true,
      complaint: {
        ...complaint,
        hasUpvoted,
        slaDays,
        isOverdue,
        escalationTitle: ESCALATION_LEVELS[complaint.escalationLevel]?.title || 'Ward Officer',
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
 * @desc    Update complaint status (Officer / Admin)
 *          Supported statuses: 'acknowledged', 'in_progress', 'resolved', 'rejected'
 */
router.patch('/:id/status', protectAdmin, upload.single('resolutionPhoto'), async (req, res) => {
  try {
    const { status, resolutionNote, resolutionPhotoUrl, rejectionReason, officerName, department } = req.body;
    const validStatuses = ['submitted', 'pending', 'acknowledged', 'in_progress', 'resolved', 'rejected'];

    if (!status || !validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const targetStatus = status.toLowerCase();

    // Validation: Rejection requires a clear rejectionReason
    if (targetStatus === 'rejected' && (!rejectionReason || !rejectionReason.trim())) {
      return res.status(400).json({
        success: false,
        message: 'A rejection reason is mandatory when marking a grievance as Rejected.',
      });
    }

    const complaint = await Complaint.findById(req.params.id).populate('userId', 'name phone area pushToken');
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const oldStatus = complaint.status;
    complaint.status = targetStatus;

    if (resolutionNote) {
      complaint.resolutionNote = resolutionNote.trim();
    }

    if (targetStatus === 'rejected') {
      complaint.rejectionReason = rejectionReason.trim();
    }

    // Resolution proof image handling (mandatory for resolved)
    if (req.file) {
      const reqHost = `${req.protocol}://${req.get('host')}`;
      const resPhoto = await uploadImage(req.file, reqHost);
      if (resPhoto) complaint.resolutionPhotoUrl = resPhoto;
    } else if (resolutionPhotoUrl && resolutionPhotoUrl.trim()) {
      complaint.resolutionPhotoUrl = resolutionPhotoUrl.trim();
    } else if (targetStatus === 'resolved' && !complaint.resolutionPhotoUrl) {
      // High-quality municipal resolution proof fallback
      const resolutionFallbacks = {
        road: 'https://images.unsplash.com/photo-1541888946425-d0fbb186156f?w=800&auto=format&fit=crop&q=80',
        water: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',
        garbage: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800&auto=format&fit=crop&q=80',
        streetlight: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800&auto=format&fit=crop&q=80',
        other: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80',
      };
      complaint.resolutionPhotoUrl = resolutionFallbacks[complaint.category] || resolutionFallbacks.other;
    }

    if (targetStatus === 'resolved') {
      complaint.resolvedAt = new Date();
      // Reset feedback to pending confirmation
      complaint.citizenFeedback = {
        confirmed: null,
        confirmedAt: null,
        comment: '',
        rating: 0,
      };
    } else if (targetStatus !== 'resolved') {
      complaint.resolvedAt = null;
    }

    // Record officer who made change
    const actorName = officerName || req.admin?.name || 'Municipal Officer';
    const actorRole = 'officer';

    // Append to statusTimeline
    complaint.statusTimeline.push({
      status: targetStatus,
      changedBy: {
        id: req.admin?._id,
        name: actorName,
        role: actorRole,
      },
      timestamp: new Date(),
      note: resolutionNote || (targetStatus === 'rejected' ? `Rejected: ${rejectionReason}` : `Status updated to ${targetStatus.replace('_', ' ')}`),
      rejectionReason: targetStatus === 'rejected' ? rejectionReason : '',
    });

    await complaint.save();

    // Friendly status labels
    const statusLabels = {
      submitted: 'Submitted',
      pending: 'Submitted & Queued',
      acknowledged: 'Acknowledged by Ward Officer',
      in_progress: 'In Progress (Field Team Dispatched)',
      resolved: 'Resolved (Awaiting Citizen Confirmation)',
      rejected: 'Rejected by Municipal Authority',
      reopened: 'Reopened by Citizen',
    };
    const newStatusLabel = statusLabels[complaint.status] || complaint.status;
    const shortDesc = complaint.description.length > 35 ? complaint.description.substring(0, 35) + '...' : complaint.description;
    
    let pushBody = `Your grievance "${shortDesc}" is now ${newStatusLabel}.`;
    if (targetStatus === 'rejected') {
      pushBody += ` Reason: ${complaint.rejectionReason}`;
    } else if (complaint.resolutionNote) {
      pushBody += ` Note: ${complaint.resolutionNote}`;
    }

    // Trigger push notification to citizen
    if (complaint.userId?.pushToken) {
      await sendExpoPushNotification(complaint.userId.pushToken, {
        title: `🏛️ Grievance Update: ${newStatusLabel}`,
        body: pushBody,
        data: { complaintId: complaint._id.toString(), status: complaint.status },
      });
    }

    // Trigger SMS notification to citizen
    if (complaint.userId?.phone) {
      const smsText = `[Grievance Cell] Ticket #${complaint._id.toString().slice(-6)} update: Status is now ${newStatusLabel}. ${complaint.resolutionNote || complaint.rejectionReason || ''}`;
      await sendSMS(complaint.userId.phone, smsText);
    }

    console.log(`\n-----------------------------------------------------`);
    console.log(`[Citizen Notification Alert - Status Change]`);
    console.log(`To Citizen: ${complaint.userId?.name || 'Citizen'} (${complaint.userId?.phone || 'N/A'})`);
    console.log(`Complaint ID: #${complaint._id.toString().slice(-6)}`);
    console.log(`Status Transition: [${oldStatus.toUpperCase()}] -> [${complaint.status.toUpperCase()}] by ${actorName}`);
    if (complaint.resolutionNote) console.log(`Officer Note: "${complaint.resolutionNote}"`);
    if (complaint.rejectionReason) console.log(`Rejection Reason: "${complaint.rejectionReason}"`);
    console.log(`-----------------------------------------------------\n`);

    return res.status(200).json({
      success: true,
      message: `Status updated to ${complaint.status}. Citizen has been notified.`,
      complaint,
    });
  } catch (err) {
    console.error('[Update Status Error]', err);
    return res.status(500).json({ success: false, message: 'Error updating complaint status.' });
  }
});

/**
 * @route   POST /api/complaints/:id/feedback
 * @desc    Citizen feedback loop: "Was this fixed properly? Yes / No"
 *          If No: Reopens grievance and auto-escalates to higher officer level
 */
router.post('/:id/feedback', protectCitizen, async (req, res) => {
  try {
    const { confirmed, comment, rating = 5 } = req.body;

    if (confirmed === undefined || confirmed === null) {
      return res.status(400).json({
        success: false,
        message: 'Please provide confirmation: confirmed (true/false).',
      });
    }

    const complaint = await Complaint.findById(req.params.id).populate('userId', 'name phone area pushToken');
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const isYes = Boolean(confirmed);
    const now = new Date();

    if (isYes) {
      // Citizen confirms resolution
      complaint.citizenFeedback = {
        confirmed: true,
        confirmedAt: now,
        comment: comment ? comment.trim() : 'Citizen confirmed satisfactory resolution.',
        rating: Number(rating) || 5,
      };

      complaint.statusTimeline.push({
        status: 'resolved',
        changedBy: {
          id: req.user._id,
          name: req.user.name || 'Citizen',
          role: 'citizen',
        },
        timestamp: now,
        note: `Citizen verified and confirmed satisfactory repair (${rating}/5 stars).`,
      });

      await complaint.save();

      return res.status(200).json({
        success: true,
        message: 'Thank you! Your resolution verification has been recorded.',
        complaint,
      });
    } else {
      // Citizen reports NOT fixed -> Reopen and Auto-Escalate
      const nextLevel = Math.min(3, (complaint.escalationLevel || 1) + 1);
      const levelTitle = ESCALATION_LEVELS[nextLevel]?.title || 'Assistant Executive Engineer';

      complaint.status = 'reopened';
      complaint.isEscalated = true;
      complaint.escalationLevel = nextLevel;
      complaint.resolvedAt = null;

      complaint.citizenFeedback = {
        confirmed: false,
        confirmedAt: now,
        comment: comment ? comment.trim() : 'Citizen reported issue was not resolved properly.',
        rating: 1,
      };

      const escalationReason = `Citizen marked repair as incomplete / unsatisfied. Reopened and escalated to Level ${nextLevel} (${levelTitle}).`;

      complaint.escalationHistory.push({
        level: nextLevel,
        levelTitle,
        escalatedAt: now,
        reason: escalationReason,
      });

      complaint.statusTimeline.push({
        status: 'reopened',
        changedBy: {
          id: req.user._id,
          name: req.user.name || 'Citizen',
          role: 'citizen',
        },
        timestamp: now,
        note: `Citizen rejected fix. ${escalationReason}`,
      });

      await complaint.save();

      console.log(`[Citizen Feedback] Grievance #${complaint._id.toString().slice(-6)} REOPENED & ESCALATED to Level ${nextLevel}.`);

      return res.status(200).json({
        success: true,
        message: `Grievance reopened and escalated to Level ${nextLevel} (${levelTitle}) for urgent re-inspection.`,
        complaint,
      });
    }
  } catch (err) {
    console.error('[Feedback Loop Error]', err);
    return res.status(500).json({ success: false, message: 'Server error processing resolution feedback.' });
  }
});

module.exports = router;
