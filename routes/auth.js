const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateOTP, sendOTP } = require('../utils/otpSender');
const { encrypt } = require('../utils/helperFunctions');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: User authentication and authorization APIs
 *
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               phone:
 *                 type: string
 *                 format: phone
 *     responses:
 *       200:
 *         description: OTP sent to phone number
 *       400:
 *         description: User with given email or phone already exists
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, phone } = req.body;
    if (!email || !password || !phone) {
      return res.status(400).json({ message: 'All fields are required', error: "All fields required" });
    }

    // Check if user exists
    let user = await User.findOne({ $or: [{ email }, { phone }] });
    if (user) return res.status(400).json({ message: 'User with given email or phone already exists', error: "User exists" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP and expiry (5 minutes)
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    // Create user but not verified yet
    user = new User({ email, password: hashedPassword, phone, otp, otpExpiry });
    await user.save();

    // Send OTP (just log for now)
    await sendOTP(phone, otp);

    res.json({ message: 'OTP sent to phone number', success: "otp created" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify OTP and activate user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *                 format: otp
 *     responses:
 *       200:
 *         description: User verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required', error: "Email and OTP required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found', error: "User not found" });

    if (user.isVerified) return res.status(400).json({ message: 'User already verified', error: "User already verified" });

    if (user.otp !== otp || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP', error: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    res.json({ message: 'User verified successfully', success: "User verified successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: "Server error" });
  }
});

/**
 * @swagger
 * /login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user (only after verification)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: test@example.com
 *               phone:
 *                 type: string
 *                 format: phone
 *                 example: "1234567890"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: User logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT access token
 *                 email:
 *                   type: string
 *                 phone:
 *                   type: string
 *                 role:
 *                   type: string
 *       400:
 *         description: Invalid credentials or not verified
 */
router.post('/login', async (req, res) => {
  const { email, phone, password } = req.body;
  
  let user;
  if (email !== "") {
    user = await User.findOne({ email });
  } else if (phone !== "") {
    user = await User.findOne({ phone });
  }
  if (!user || !user.isVerified) {
    return res.status(400).json({ message: 'Invalid credentials or not verified' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

  const userId = encrypt(user._id.toString());
  const userEmail = encrypt(user.email.toString());
  const userPhone = encrypt(user.phone.toString());


  res.json({
    token,
    userId,
    userEmail,
    userPhone,
    role: user.role
  });
});


module.exports = router;
