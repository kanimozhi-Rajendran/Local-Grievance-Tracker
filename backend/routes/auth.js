const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protectCitizen, JWT_SECRET } = require('../middleware/auth');
const { sendSMS } = require('../services/sms');

// In-memory OTP storage: phone -> { otp, expiresAt }
const otpStore = new Map();

/**
 * @route   POST /api/auth/send-otp
 * @desc    Generate and send 6-digit OTP to mobile number
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || String(phone).trim().length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid phone number (minimum 8-10 digits).',
      });
    }

    const cleanPhone = String(phone).replace(/\s+/g, '');
    // Generate a 6-digit OTP with 5-minute expiry
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    otpStore.set(cleanPhone, { otp, expiresAt });

    const smsText = `Your Local Grievance Tracker verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;
    const smsResult = await sendSMS(cleanPhone, smsText);

    return res.status(200).json({
      success: true,
      message: smsResult.isRealSMS
        ? `Verification code sent via SMS to ${cleanPhone}`
        : `OTP generated for ${cleanPhone} (Development mock mode)`,
      otp, // Provided for easy development / automated test verification
      expiresIn: 300,
      isRealSMS: smsResult.isRealSMS,
    });
  } catch (err) {
    console.error('[Send OTP Error]', err);
    return res.status(500).json({ success: false, message: 'Server error sending OTP.' });
  }
});

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP and log in / sign up citizen
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp, name, area } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Both phone number and OTP are required.',
      });
    }

    const cleanPhone = String(phone).replace(/\s+/g, '');
    const cleanOtp = String(otp).trim();

    const storedData = otpStore.get(cleanPhone);
    const isMasterOtp = cleanOtp === '123456'; // Fallback demo passcode
    const isValidStoredOtp = storedData && storedData.otp === cleanOtp && Date.now() < storedData.expiresAt;

    if (!isMasterOtp && !isValidStoredOtp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP. Please request a new one.',
      });
    }

    // Clean up used OTP
    otpStore.delete(cleanPhone);

    // Find or create citizen user
    let user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      user = await User.create({
        phone: cleanPhone,
        name: name && name.trim() ? name.trim() : `Citizen (${cleanPhone.slice(-4)})`,
        area: area && area.trim() ? area.trim() : 'Ward 14 (Central)',
      });
      console.log(`[User] Created new citizen account: ${user.name} (${user.phone})`);
    } else {
      let updated = false;
      if (name && name.trim() && user.name.startsWith('Citizen (')) {
        user.name = name.trim();
        updated = true;
      }
      if (area && area.trim() && user.area === 'General Ward') {
        user.area = area.trim();
        updated = true;
      }
      if (updated) await user.save();
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id, phone: user.phone }, JWT_SECRET, {
      expiresIn: '30d',
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        area: user.area,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('[Verify OTP Error]', err);
    return res.status(500).json({ success: false, message: 'Server error during OTP verification.' });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get currently logged in citizen profile
 */
router.get('/me', protectCitizen, async (req, res) => {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      phone: req.user.phone,
      area: req.user.area,
      createdAt: req.user.createdAt,
    },
  });
});

/**
 * @route   PUT /api/auth/profile
 * @desc    Update citizen profile (name, area)
 */
router.put('/profile', protectCitizen, async (req, res) => {
  try {
    const { name, area } = req.body;
    if (name) req.user.name = name.trim();
    if (area) req.user.area = area.trim();
    await req.user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: req.user,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error updating profile.' });
  }
});

/**
 * @route   PUT /api/auth/push-token
 * @desc    Save/update device Expo push token for logged-in citizen
 */
router.put('/push-token', protectCitizen, async (req, res) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken) {
      return res.status(400).json({ success: false, message: 'pushToken is required' });
    }

    req.user.pushToken = String(pushToken).trim();
    await req.user.save();

    console.log(`[Push Notification] Registered push token for ${req.user.name}: ${req.user.pushToken}`);

    return res.status(200).json({
      success: true,
      message: 'Push token registered successfully',
      pushToken: req.user.pushToken,
    });
  } catch (err) {
    console.error('[Push Token Error]', err);
    return res.status(500).json({ success: false, message: 'Error saving push token.' });
  }
});

module.exports = router;
