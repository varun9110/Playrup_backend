const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateOTP, sendOTP } = require('../utils/otpSender');
const { encrypt } = require('../utils/helperFunctions');
const bcrypt = require('bcryptjs');
const { issueToken, getTokenExpiryDate } = require('../middleware/authMiddleware');

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const normalizePhone = (value = '') => String(value || '').trim();

const buildBaseName = ({ name, email, phone }) => {
  const trimmedName = String(name || '').trim();
  if (trimmedName) {
    return trimmedName.toLowerCase();
  }

  const emailPrefix = String(email || '').split('@')[0]?.trim();
  if (emailPrefix) {
    return emailPrefix.toLowerCase();
  }

  const phoneDigits = String(phone || '').replace(/\D/g, '');
  const suffix = phoneDigits.slice(-6) || Date.now().toString().slice(-6);
  return `player_${suffix}`;
};

const resolveUniqueName = async ({ name, email, phone }) => {
  const baseName = buildBaseName({ name, email, phone });
  let candidate = baseName;
  let index = 1;

  while (await User.exists({ name: candidate })) {
    index += 1;
    candidate = `${baseName}_${index}`;
  }

  return candidate;
};

router.post('/register', async (req, res) => {
  try {
    const { email, password, phone, name } = req.body;
    if (!email || !password || !phone) {
      return res.status(400).json({ message: 'All fields are required', error: 'All fields required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    let user = await User.findOne({ $or: [{ email: normalizedEmail }, { phone: normalizedPhone }] });
    if (user) return res.status(400).json({ message: 'User with given email or phone already exists', error: 'User exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    const uniqueName = await resolveUniqueName({ name, email: normalizedEmail, phone: normalizedPhone });

    user = new User({
      name: uniqueName,
      email: normalizedEmail,
      password: hashedPassword,
      phone: normalizedPhone,
      otp,
      otpExpiry
    });
    await user.save();
    await sendOTP(normalizedPhone, otp);

    res.json({ message: 'OTP sent to phone number', success: 'otp created' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required', error: 'Email and OTP required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found', error: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'User already verified', error: 'User already verified' });
    if (user.otp !== otp || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP', error: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    res.json({ message: 'User verified successfully', success: 'User verified successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: 'Server error' });
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required', error: 'Email required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: 'User not found', error: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'User already verified', error: 'User already verified' });

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();
    await sendOTP(user.phone, otp);

    res.json({ message: 'OTP resent to phone number', success: 'otp resent' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, phone, password } = req.body;
  let user;

  if (email) {
    user = await User.findOne({ email });
  } else if (phone) {
    user = await User.findOne({ phone });
  }

  if (!user || !user.isVerified) {
    return res.status(400).json({ message: 'Invalid credentials or not verified' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

  const token = issueToken(user);
  user.token = token;
  user.tokenExpiry = getTokenExpiryDate();
  await user.save();

  const userObject = user.toObject();
  const { password: _password, otp: _otp, otpExpiry: _otpExpiry, token: _token, tokenExpiry: _tokenExpiry, _id: _idValue, ...userWithoutSensitiveInfo } = userObject;

  res.json({
    ...userWithoutSensitiveInfo,
    token,
    userId: encrypt(userObject._id.toString()),
    email: encrypt(userObject.email.toString()),
    phone: encrypt(userObject.phone.toString()),
  });
});

module.exports = router;
