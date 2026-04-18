const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const Academy = require('../models/Academy');
const Activity = require('../models/Activity');
const Booking = require('../models/Booking');
const DropIn = require('../models/DropIn');
const Coaching = require('../models/Coaching');
const User = require('../models/User');
const { capitalizeWords, decrypt, encrypt } = require('../utils/helperFunctions');

const academyPhotoUploadDir = path.join(__dirname, '..', 'uploads', 'academy-photos');
if (!fs.existsSync(academyPhotoUploadDir)) {
  fs.mkdirSync(academyPhotoUploadDir, { recursive: true });
}

const academyPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, academyPhotoUploadDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});

const academyPhotoUpload = multer({
  storage: academyPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (!file?.mimetype?.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  }
});

const toDateKey = (date = new Date()) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toSafeLower = (value) => String(value || '').trim().toLowerCase();

const isAcademyActive = (academy) => !academy?.status || academy.status === 'active';

const findAcademyForOwner = async ({ academyId, email, userId }) => {
  if (academyId) {
    const academy = await Academy.findById(academyId);
    if (!academy) {
      return null;
    }
    if (userId && String(academy.userId) !== String(userId)) {
      return null;
    }
    return academy;
  }

  if (!email) {
    return null;
  }

  const query = {
    email: String(email).toLowerCase().trim()
  };

  if (userId) {
    query.userId = userId;
  }

  return Academy.findOne(query).sort({ createdAt: 1 });
};

const getFrontendBaseUrl = () => {
  return process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
};

const getAcademyOnboardingLink = (token) => {
  return `${getFrontendBaseUrl().replace(/\/$/, '')}/academy/onboarding/verify?token=${encodeURIComponent(token)}`;
};

const createMailTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
};

let academyEmailIndexChecked = false;
const ensureAcademyEmailIsNonUnique = async () => {
  if (academyEmailIndexChecked) {
    return;
  }

  try {
    const indexes = await Academy.collection.indexes();
    const emailIndex = indexes.find((index) => index.key?.email === 1 && index.unique);
    if (emailIndex?.name) {
      await Academy.collection.dropIndex(emailIndex.name);
      console.log(`Dropped legacy unique index on academy email: ${emailIndex.name}`);
    }
  } catch (error) {
    console.warn('Unable to validate academy email index:', error?.message || error);
  } finally {
    academyEmailIndexChecked = true;
  }
};

const ensureAcademyShareCode = async (academy) => {
  if (academy.shareCode) {
    return academy.shareCode;
  }

  let code;
  let exists;
  do {
    code = crypto.randomBytes(5).toString('hex');
    exists = await Academy.exists({ shareCode: code });
  } while (exists);

  academy.shareCode = code;
  await academy.save();
  return code;
};

const getAcademyStats = async (academyId) => {
  const todayKey = toDateKey();

  const [completedBookings, completedDropIns, completedCoaching, completedActivities, upcomingBookings, upcomingDropIns, upcomingCoaching, upcomingActivities, ratingAggregate] = await Promise.all([
    Booking.countDocuments({ academyId, status: 'Confirmed', date: { $lt: todayKey } }),
    DropIn.countDocuments({ academyId, status: 'Active', date: { $lt: todayKey } }),
    Coaching.countDocuments({ academyId, status: 'Active', date: { $lt: todayKey } }),
    Activity.countDocuments({ academyId, status: 'Completed' }),
    Booking.countDocuments({ academyId, status: 'Confirmed', date: { $gte: todayKey } }),
    DropIn.countDocuments({ academyId, status: 'Active', date: { $gte: todayKey } }),
    Coaching.countDocuments({ academyId, status: 'Active', date: { $gte: todayKey } }),
    Activity.countDocuments({ academyId, status: 'Active' }),
    User.aggregate([
      { $unwind: '$venueRatings' },
      { $match: { 'venueRatings.academyId': academyId } },
      {
        $group: {
          _id: '$venueRatings.academyId',
          average: { $avg: '$venueRatings.rating' },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const totalGamesPlayed = completedBookings + completedDropIns + completedCoaching + completedActivities;
  const upcomingGames = upcomingBookings + upcomingDropIns + upcomingCoaching + upcomingActivities;

  const averageRating = ratingAggregate[0]?.average ? Math.round(ratingAggregate[0].average * 100) / 100 : 0;
  const ratingCount = ratingAggregate[0]?.count || 0;

  return {
    totalGamesPlayed,
    upcomingGames,
    averageRating,
    totalRatings: ratingCount
  };
};

// POST /academy/onboard-academy
/**
 * @swagger
 * /academy/onboard-academy:
 *   post:
 *     summary: Onboard a new academy
 *     tags: [Academy]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *                 format: phone
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *     responses:
 *       200:
 *         description: Academy onboarded successfully
 *       400:
 *         description: Bad request
 */
router.post('/onboard-academy', async (req, res) => {
  try {
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ message: 'Only superadmin can onboard academies' });
    }

    const {
      name, email, phone, address, city
    } = req.body;

    if (!name || !email || !phone || !address || !city) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.trim();
    const normalizedName = name.toLowerCase().trim();

    await ensureAcademyEmailIsNonUnique();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (!existingUser) {
      const existingPhone = await User.findOne({ phone: normalizedPhone });
      if (existingPhone) {
        return res.status(400).json({ message: 'Academy owner phone already exists for another user' });
      }
    }

    const duplicateAcademy = await Academy.findOne({
      userId: existingUser?._id,
      name: normalizedName,
      city: city.toLowerCase().trim(),
      address: address.toLowerCase().trim()
    });

    if (duplicateAcademy) {
      return res.status(400).json({ message: 'An academy with this name and location already exists for this owner' });
    }

    const passwordPlain = crypto.randomBytes(6).toString('hex'); // 12-char random password

    let academyUser;
    if (!existingUser) {
      // Create random password
      const hashedPassword = await bcrypt.hash(passwordPlain, 10);
      // Create Academy User account
      academyUser = new User({
        name: normalizedName,
        email: normalizedEmail,
        password: hashedPassword,
        phone: normalizedPhone,
        role: 'academy',
        isVerified: true
      });
      await academyUser.save();
    } else {
      academyUser = existingUser;
      if (academyUser.role !== 'academy' && academyUser.role !== 'superadmin') {
        return res.status(400).json({ message: 'This email belongs to a non-academy account' });
      }
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const verificationTokenExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const onboardingLink = getAcademyOnboardingLink(verificationToken);


    // Create Academy document
    const newAcademy = new Academy({
      name: normalizedName,
      userId: academyUser._id,
      email: normalizedEmail,
      phone: normalizedPhone,
      address: address.toLowerCase(),
      city: city.toLowerCase(),
      shareCode: crypto.randomBytes(5).toString('hex'),
      status: 'pending_verification',
      onboardingVerificationTokenHash: verificationTokenHash,
      onboardingVerificationTokenExpiry: verificationTokenExpiry,
      onboardingVerifiedAt: null
    });
    await newAcademy.save();

    let mailOptions;
    if (!existingUser) {
      // Send email to academy
      mailOptions = {
        from: 'varun.goel.vg@gmail.com',
        to: normalizedEmail,
        subject: 'Verify your new academy on PlayC',
        text: `Hello ${capitalizeWords(name)},

              A new academy has been created under your account.

              Please verify this academy by opening the secure link below:
              ${onboardingLink}

              You must be logged in with this email before verification.

              Login credentials:

              Email: ${normalizedEmail}
              Password: ${passwordPlain}

              Please change your password after logging in.

              Best regards,
              PlayC`
      };
    } else {
      mailOptions = {
        from: 'varun.goel.vg@gmail.com',
        to: normalizedEmail,
        subject: 'Verify your newly onboarded academy',
        text: `Hello ${capitalizeWords(name)},

              A new academy has been added under your owner account.

              Please verify this academy by opening the secure link below:
              ${onboardingLink}

              You must be logged in with your existing owner account to complete verification.

              Best regards,
              PlayC`
      };
    }

    const transporter = createMailTransporter();
    let emailDelivery = 'not-configured';
    if (transporter) {
      await transporter.sendMail(mailOptions);
      emailDelivery = 'sent';
    }

    res.json({
      message: 'Academy onboarded. Verification email prepared.',
      success: true,
      academyId: newAcademy._id,
      status: newAcademy.status,
      emailDelivery,
      onboardingLink
    });

  } catch (error) {
    console.error(error);
    if (error?.code === 11000) {
      return res.status(400).json({
        message: 'Duplicate value detected while onboarding academy',
        error: error.message
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/verify-onboarding', async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Verification token is required' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const academy = await Academy.findOne({ onboardingVerificationTokenHash: tokenHash });

    if (!academy) {
      return res.status(404).json({ success: false, message: 'Invalid or already used verification token' });
    }

    if (String(academy.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to verify this academy' });
    }

    if (!academy.onboardingVerificationTokenExpiry || academy.onboardingVerificationTokenExpiry < new Date()) {
      return res.status(400).json({ success: false, message: 'Verification token has expired' });
    }

    academy.status = 'active';
    academy.onboardingVerifiedAt = new Date();
    academy.onboardingVerificationTokenHash = null;
    academy.onboardingVerificationTokenExpiry = null;
    await academy.save();

    return res.status(200).json({
      success: true,
      message: 'Academy verified successfully',
      academyId: academy._id,
      status: academy.status
    });
  } catch (error) {
    console.error('Error verifying academy onboarding:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /academy/configure
/**
 * @swagger
 * /academy/configure:
 *   post:
 *     summary: Configure sports and courts for an academy
 *     tags: [Academy]
 *     description: Update the sports configuration of an academy by providing email and sports array.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - sports
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Academy's registered email
 *               sports:
 *                 type: array
 *                 description: List of sports with courts and pricing
 *                 items:
 *                   type: object
 *                   properties:
 *                     sportName:
 *                       type: string
 *                     numberOfCourts:
 *                       type: integer
 *                     startTime:
 *                       type: string
 *                       example: "06:00"
 *                     endTime:
 *                       type: string
 *                       example: "22:00"
 *                     pricing:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           courtNumber:
 *                             type: integer
 *                           prices:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 time:
 *                                   type: string
 *                                   example: "10:00"
 *                                 price:
 *                                   type: number
 *                                   example: 20
 *     responses:
 *       200:
 *         description: Academy updated successfully
 *       404:
 *         description: Academy not found
 *       500:
 *         description: Server error
 */
router.post('/configure', async (req, res) => {
  const { email, userId, sports, academyId } = req.body;

  try {
    let userEmail = null;
    let userIdDecrypted = null;
    if (email) userEmail = decrypt(email);
    if (userId) userIdDecrypted = decrypt(userId);

    const ownerId = req.user?._id || userIdDecrypted;
    const academy = await findAcademyForOwner({ academyId, email: userEmail, userId: ownerId });

    if (!academy) {
      return res.json({ message: 'Academy could not be found' });
    }

    if (!isAcademyActive(academy)) {
      return res.status(403).json({ message: 'Academy is pending verification' });
    }

    academy.sports = sports;
    await academy.save();

    res.json({ message: 'Academy updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /academy/getDetails
/**
 * @swagger
 * /academy/getDetails:
 *   get:
 *     summary: Get academy details
 *     tags: [Academy]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: Academy's email
 *     responses:
 *       200:
 *         description: Academy details retrieved successfully
 *       404:
 *         description: Academy not found
 *       500:
 *         description: Server error
 */
router.post("/getDetails", async (req, res) => {
  const {
    email, userId, academyId
  } = req.body;


  try {
    let userEmail = null;
    let userIdDecrypted = null;
    if (email) userEmail = decrypt(email);
    if (userId) userIdDecrypted = decrypt(userId);

    const ownerId = req.user?._id || userIdDecrypted;
    const academy = await findAcademyForOwner({ academyId, email: userEmail, userId: ownerId });

    if (!academy) {
      return res.status(404).json({ error: 'Academy not found', success: false });
    }

    if (!isAcademyActive(academy)) {
      return res.status(403).json({ error: 'Academy is pending verification', success: false });
    }

    res.status(200).json({ academy, success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

// GET /academy/locations
/**
 * @swagger
 * /academy/locations:
 *   get:
 *     summary: Get unique cities and addresses of academies
 *     tags: [Academy]
 *     responses:
 *       200:
 *         description: Successfully retrieved locations
 *       500:
 *         description: Server error
 */
router.get("/locations", async (req, res) => {
  try {
    const activeFilter = { $or: [{ status: 'active' }, { status: { $exists: false } }] };
    const cities = await Academy.distinct("city", activeFilter);
    const addresses = await Academy.aggregate([
      {
        $match: activeFilter
      },
      {
        $group: {
          _id: { city: "$city", address: "$address" }
        }
      },
      {
        $project: {
          _id: 0,
          city: "$_id.city",
          address: "$_id.address"
        }
      }
    ]);

    res.status(200).json({
      uniqueCities: cities,
      uniqueLocations: addresses,
    });
  } catch (err) {
    console.error("Error fetching locations:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /academy/sports/:city
/**
 * @swagger
 * /academy/sports/{city}:
 *   get:
 *     summary: Get unique sports available in a city
 *     tags: [Academy]
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City name
 *     responses:
 *       200:
 *         description: Successfully retrieved sports
 *       404:
 *         description: No sports found for this city
 *       500:
 *         description: Server error
 */
router.get("/sports/:city", async (req, res) => {
  try {
    const { city } = req.params;

    const academies = await Academy.find({ city: city.toLowerCase() }).select("sports.sportName");
    if (!academies.length) {
      return res.status(404).json({ message: "No sports found for this city" });
    }

    const sportsSet = new Set();
    academies.forEach((academy) => {
      academy.sports.forEach((sport) => {
        sportsSet.add(sport.sportName);
      });
    });

    res.json({ sports: [...sportsSet] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /academy/getAcademies
/**
 * @swagger
 * /academy/getAcademies:
 *   get:
 *     summary: Get academies by city and sport
 *     tags: [Academy]
 *     parameters:
 *       - in: query
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City name
 *       - in: query
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *         description: Sport name
 *     responses:
 *       200:
 *         description: List of academies offering the sport
 *       400:
 *         description: Missing parameters
 *       404:
 *         description: No academies found
 *       500:
 *         description: Server error
 */
router.get("/getAcademies", async (req, res) => {
  try {
    const { city, sport } = req.query;

    if (!city || !sport) {
      return res.status(400).json({
        message: "City and sport are required",
        success: false
      });
    }

    const academies = await Academy.find({
      city: city.toLowerCase(),
      "sports.sportName": sport,
      $or: [{ status: 'active' }, { status: { $exists: false } }]
    }).select("name email phone address city sports");

    if (!academies.length) {
      return res.status(404).json({
        message: "No academies found for this sport and city",
        success: false
      });
    }

    res.status(200).json({
      academies,
      success: true
    });
  } catch (err) {
    console.error("Error fetching academies:", err);
    res.status(500).json({
      message: "Server error",
      success: false
    });
  }
});

// GET /academy/getCourts
/**
 * @swagger
 * /academy/getCourts:
 *   get:
 *     summary: Get courts and pricing for a specific sport in an academy
 *     tags: [Academy]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: Academy's registered email
 *       - in: query
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *         description: Sport name
 *     responses:
 *       200:
 *         description: List of courts and pricing
 *       400:
 *         description: Missing parameters
 *       404:
 *         description: Academy or sport not found
 *       500:
 *         description: Server error
 */
router.get("/getCourts", async (req, res) => {
  try {
    const { email, sport, academyId } = req.query;

    if ((!email && !academyId) || !sport) {
      return res.status(400).json({
        message: "academyId or academy email and sport name are required",
        success: false
      });
    }

    const academyQuery = academyId
      ? { _id: academyId }
      : { email: String(email).toLowerCase().trim() };

    const academy = await Academy.findOne({
      ...academyQuery,
      $or: [{ status: 'active' }, { status: { $exists: false } }]
    });
    if (!academy) {
      return res.status(404).json({
        message: "Academy not found",
        success: false
      });
    }

    const sportData = academy.sports.find(s => s.sportName.toLowerCase() === sport.toLowerCase());
    if (!sportData) {
      return res.status(404).json({
        message: `Sport "${sport}" not found in this academy`,
        success: false
      });
    }

    res.status(200).json({
      academy: academy.name,
      sport: sportData.sportName,
      courts: sportData.pricing, // contains courtNumber and prices array
      success: true
    });
  } catch (err) {
    console.error("Error fetching courts:", err);
    res.status(500).json({
      message: "Server error",
      success: false
    });
  }
});

router.post('/user-academies', async (req, res) => {
  try {
    const { userId } = req.body;

    let ownerUserId = req.user?._id ? String(req.user._id) : null;

    if (userId) {
      if (typeof userId === 'object' && userId.iv && userId.content && userId.tag) {
        ownerUserId = decrypt(userId);
      } else if (typeof userId === 'string' && /^[0-9a-fA-F]{24}$/.test(userId)) {
        ownerUserId = userId;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid userId payload'
        });
      }
    }

    if (!ownerUserId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    const academies = await Academy.find({
      userId: ownerUserId,
      $or: [{ status: 'active' }, { status: { $exists: false } }]
    })
      .populate('userId', 'name email phone') // optional
      .sort({ name: -1 });

    return res.status(200).json({
      success: true,
      count: academies.length,
      data: academies
    });

  } catch (error) {
    console.error('Error fetching user academies:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.get('/profile/:academyId', async (req, res) => {
  try {
    const { academyId } = req.params;
    const academy = await Academy.findById(academyId);

    if (!academy) {
      return res.status(404).json({ success: false, message: 'Academy not found' });
    }

    if (!isAcademyActive(academy)) {
      return res.status(403).json({ success: false, message: 'Academy is pending verification' });
    }

    if (String(academy.userId) !== String(req.user?._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this academy profile' });
    }

    const shareCode = await ensureAcademyShareCode(academy);
    const stats = await getAcademyStats(academy._id);

    return res.status(200).json({
      success: true,
      academy,
      stats,
      shareLink: `/venue/${shareCode}`
    });
  } catch (error) {
    console.error('Error fetching academy profile:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/profile/:academyId', async (req, res) => {
  try {
    const { academyId } = req.params;
    const academy = await Academy.findById(academyId);

    if (!academy) {
      return res.status(404).json({ success: false, message: 'Academy not found' });
    }

    if (!isAcademyActive(academy)) {
      return res.status(403).json({ success: false, message: 'Academy is pending verification' });
    }

    if (String(academy.userId) !== String(req.user?._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this academy profile' });
    }

    const {
      name,
      phone,
      address,
      city,
      mapLink,
      openTime,
      closeTime,
      amenities
    } = req.body || {};

    if (typeof name === 'string') academy.name = toSafeLower(name);
    if (typeof phone === 'string') academy.phone = phone.trim();
    if (typeof address === 'string') academy.address = toSafeLower(address);
    if (typeof city === 'string') academy.city = toSafeLower(city);
    if (typeof mapLink === 'string') academy.mapLink = mapLink.trim();
    if (typeof openTime === 'string') academy.openTime = openTime;
    if (typeof closeTime === 'string') academy.closeTime = closeTime;
    if (amenities && typeof amenities === 'object') {
      academy.amenities = {
        ...academy.amenities,
        ...amenities
      };
    }

    await academy.save();
    const stats = await getAcademyStats(academy._id);
    const shareCode = await ensureAcademyShareCode(academy);

    return res.status(200).json({
      success: true,
      message: 'Academy profile updated',
      academy,
      stats,
      shareLink: `/venue/${shareCode}`
    });
  } catch (error) {
    console.error('Error updating academy profile:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/profile/:academyId/photos', academyPhotoUpload.array('photos', 8), async (req, res) => {
  try {
    const { academyId } = req.params;
    const academy = await Academy.findById(academyId);

    if (!academy) {
      return res.status(404).json({ success: false, message: 'Academy not found' });
    }

    if (!isAcademyActive(academy)) {
      return res.status(403).json({ success: false, message: 'Academy is pending verification' });
    }

    if (String(academy.userId) !== String(req.user?._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to update photos' });
    }

    const uploadedPaths = (req.files || []).map((file) => `/uploads/academy-photos/${file.filename}`);
    if (!uploadedPaths.length) {
      return res.status(400).json({ success: false, message: 'At least one photo is required' });
    }

    const mergedPhotos = Array.from(new Set([...(academy.photos || []), ...uploadedPaths]));
    academy.photos = mergedPhotos.slice(0, 12);
    await academy.save();

    return res.status(200).json({
      success: true,
      message: 'Photos uploaded successfully',
      photos: academy.photos
    });
  } catch (error) {
    console.error('Error uploading academy photos:', error);
    return res.status(500).json({ success: false, message: 'Failed to upload photos' });
  }
});

router.delete('/profile/:academyId/photos', async (req, res) => {
  try {
    const { academyId } = req.params;
    const { photoUrl } = req.body || {};

    const academy = await Academy.findById(academyId);
    if (!academy) {
      return res.status(404).json({ success: false, message: 'Academy not found' });
    }

    if (!isAcademyActive(academy)) {
      return res.status(403).json({ success: false, message: 'Academy is pending verification' });
    }

    if (String(academy.userId) !== String(req.user?._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to update photos' });
    }

    if (!photoUrl) {
      return res.status(400).json({ success: false, message: 'photoUrl is required' });
    }

    academy.photos = (academy.photos || []).filter((item) => item !== photoUrl);
    await academy.save();

    return res.status(200).json({
      success: true,
      message: 'Photo removed',
      photos: academy.photos
    });
  } catch (error) {
    console.error('Error deleting academy photo:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete photo' });
  }
});


module.exports = router;
