const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const DropIn = require('../models/DropIn');
const Academy = require('../models/Academy');
const User = require('../models/User');
const { isTimeOverlap, timeToMinutes } = require('../utils/helperFunctions');
const { createNotification } = require('../services/notificationService');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const generateShareCode = () => crypto.randomBytes(8).toString('hex');

const ensureShareCode = async (dropIn) => {
  if (dropIn.shareCode) return dropIn.shareCode;
  for (let i = 0; i < 3; i++) {
    dropIn.shareCode = generateShareCode();
    try {
      await dropIn.save();
      return dropIn.shareCode;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new Error('Unable to generate unique share code');
};

/**
 * Generate a list of YYYY-MM-DD date strings for a recurrence rule.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} recurrenceType - 'none'|'daily'|'weekly'
 * @param {number[]} recurrenceDays - days of week (0-6) for weekly
 * @param {string} recurrenceUntil - YYYY-MM-DD inclusive end
 * @returns {string[]}
 */
const expandDates = (startDate, recurrenceType, recurrenceDays, recurrenceUntil) => {
  const dates = [startDate];
  if (recurrenceType === 'none' || !recurrenceUntil) return dates;

  const until = new Date(recurrenceUntil + 'T12:00:00Z');
  let cursor = new Date(startDate + 'T12:00:00Z');

  while (true) {
    // Advance by one day
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor > until) break;

    const dayOfWeek = cursor.getUTCDay(); // 0-6
    const yyyy = cursor.getUTCFullYear();
    const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (recurrenceType === 'daily') {
      dates.push(dateStr);
    } else if (recurrenceType === 'weekly') {
      if (recurrenceDays.includes(dayOfWeek)) {
        dates.push(dateStr);
      }
    }
  }

  return dates;
};

// ──────────────────────────────────────────────
// POST /api/dropin/create
// Academy creates one or more drop-in sessions
// ──────────────────────────────────────────────
router.post('/create', async (req, res) => {
  try {
    const {
      academyId,
      sport,
      courtNumber,
      title,
      description,
      skillLevel,
      date,        // YYYY-MM-DD (first occurrence)
      startTime,   // HH:MM
      endTime,     // HH:MM
      maxParticipants,
      pricePerParticipant,
      recurrenceType,   // 'none'|'daily'|'weekly'
      recurrenceDays,   // array of 0-6 for weekly
      recurrenceUntil,  // YYYY-MM-DD
    } = req.body;

    if (!academyId || !sport || courtNumber == null || !date || !startTime || !endTime || !maxParticipants) {
      return res.status(400).json({ message: 'academyId, sport, courtNumber, date, startTime, endTime, maxParticipants are required' });
    }

    // Verify academy belongs to the authenticated user
    const academy = await Academy.findById(academyId);
    if (!academy) return res.status(404).json({ message: 'Academy not found' });
    if (academy.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised to manage this academy' });
    }

    const sportData = academy.sports.find(s => s.sportName === sport);
    if (!sportData) return res.status(404).json({ message: 'Sport not found in this academy' });
    if (courtNumber < 1 || courtNumber > sportData.numberOfCourts) {
      return res.status(400).json({ message: 'Invalid court number' });
    }

    const reqStart = timeToMinutes(startTime);
    const reqEnd = timeToMinutes(endTime);
    if (reqEnd <= reqStart) {
      return res.status(400).json({ message: 'endTime must be after startTime' });
    }
    const academyStart = timeToMinutes(sportData.startTime);
    const academyEnd = timeToMinutes(sportData.endTime);
    if (reqStart < academyStart || reqEnd > academyEnd) {
      return res.status(400).json({ message: 'Slot is outside academy operating hours' });
    }

    const Booking = require('../models/Booking');
    const type = recurrenceType || 'none';
    const days = Array.isArray(recurrenceDays) ? recurrenceDays : [];
    const until = recurrenceUntil || null;
    const allDates = expandDates(date, type, days, until);

    // Determine a seriesId only for recurring sessions
    const seriesId = allDates.length > 1 ? crypto.randomUUID() : null;

    const created = [];
    const conflicts = [];

    for (const d of allDates) {
      // Check for existing Booking conflicts
      const bookingsOnDay = await Booking.find({
        academyId,
        sport,
        courtNumber,
        date: d,
        status: 'Confirmed',
      });
      let hasConflict = bookingsOnDay.some(b =>
        isTimeOverlap(reqStart, reqEnd, timeToMinutes(b.startTime), timeToMinutes(b.endTime))
      );

      // Check for existing DropIn conflicts
      if (!hasConflict) {
        const existingDropIns = await DropIn.find({
          academyId,
          sport,
          courtNumber,
          date: d,
          status: 'Active',
        });
        hasConflict = existingDropIns.some(di =>
          isTimeOverlap(reqStart, reqEnd, timeToMinutes(di.startTime), timeToMinutes(di.endTime))
        );
      }

      if (hasConflict) {
        conflicts.push(d);
        continue;
      }

      const dropIn = new DropIn({
        academyId,
        createdBy: req.user._id,
        sport,
        courtNumber,
        title: title || '',
        description: description || '',
        skillLevel: skillLevel || '',
        date: d,
        startTime,
        endTime,
        seriesId,
        recurrenceType: type,
        recurrenceDays: days,
        recurrenceUntil: until,
        maxParticipants,
        pricePerParticipant: pricePerParticipant || 0,
      });

      // Generate a unique share code for each instance
      dropIn.shareCode = generateShareCode();
      try {
        await dropIn.save();
        created.push(dropIn);
      } catch (saveErr) {
        // Retry with a new share code on collision
        if (saveErr?.code === 11000) {
          dropIn.shareCode = generateShareCode();
          await dropIn.save();
          created.push(dropIn);
        } else {
          throw saveErr;
        }
      }
    }

    return res.status(201).json({
      message: `Created ${created.length} drop-in session(s). ${conflicts.length > 0 ? `Skipped ${conflicts.length} date(s) due to conflicts: ${conflicts.join(', ')}` : ''}`,
      created,
      skippedDates: conflicts,
    });
  } catch (err) {
    console.error('DropIn create error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// GET /api/dropin/academy/:academyId
// Fetch all drop-ins for an academy (for calendar view)
// Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&sport=...
// ──────────────────────────────────────────────
router.get('/academy/:academyId', async (req, res) => {
  try {
    const { academyId } = req.params;
    const { startDate, endDate, sport } = req.query;

    const academy = await Academy.findById(academyId).select('userId name');
    if (!academy) return res.status(404).json({ message: 'Academy not found' });
    if (academy.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const filter = { academyId, status: 'Active' };
    if (sport) filter.sport = sport;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const dropIns = await DropIn.find(filter)
      .populate('joinedParticipants', 'name email phone')
      .populate('pendingRequests', 'name email')
      .sort({ date: 1, startTime: 1 });

    return res.json({ dropIns });
  } catch (err) {
    console.error('DropIn fetch error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// GET /api/dropin/all
// List all active upcoming drop-in sessions for users
// ──────────────────────────────────────────────
router.get('/all', async (req, res) => {
  try {
    const { sport } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const viewerUserId = req.user?._id?.toString();

    const filter = {
      status: 'Active',
      date: { $gte: today },
    };

    if (sport) filter.sport = sport;

    const dropIns = await DropIn.find(filter)
      .populate('academyId', 'name city address')
      .populate('joinedParticipants', 'name')
      .sort({ date: 1, startTime: 1 });

    const payload = dropIns.map((dropIn) => ({
      ...dropIn.toObject(),
      hasRequested: viewerUserId
        ? dropIn.pendingRequests.some((id) => id.toString() === viewerUserId)
        : false,
      hasJoined: viewerUserId
        ? dropIn.joinedParticipants.some((p) => p._id.toString() === viewerUserId)
        : false,
    }));

    return res.json({ dropIns: payload });
  } catch (err) {
    console.error('DropIn all-list error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// GET /api/dropin/user-activities
// List drop-ins a user has joined
// ──────────────────────────────────────────────
router.get('/user-activities', async (req, res) => {
  try {
    const userId = req.user._id;

    const dropIns = await DropIn.find({
      joinedParticipants: userId,
    })
      .populate('academyId', 'name')
      .populate('joinedParticipants', 'name')
      .sort({ date: 1, startTime: 1 });

    return res.json({ dropIns });
  } catch (err) {
    console.error('DropIn user-activities error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// GET /api/dropin/:dropInId
// Get a single drop-in detail
// ──────────────────────────────────────────────
router.get('/:dropInId', async (req, res) => {
  try {
    const dropIn = await DropIn.findById(req.params.dropInId)
      .populate('joinedParticipants', 'name email phone')
      .populate('pendingRequests', 'name email')
      .populate('academyId', 'name address city');

    if (!dropIn) return res.status(404).json({ message: 'Drop-in not found' });
    return res.json({ dropIn });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// PUT /api/dropin/:dropInId
// Academy edits an existing drop-in occurrence
// ──────────────────────────────────────────────
router.put('/:dropInId', async (req, res) => {
  try {
    const { dropInId } = req.params;
    const {
      scope, // 'single' | 'future'
      sport,
      courtNumber,
      title,
      description,
      skillLevel,
      date,
      startTime,
      endTime,
      maxParticipants,
      pricePerParticipant,
      recurrenceType,
      recurrenceDays,
      recurrenceUntil,
    } = req.body;

    const dropIn = await DropIn.findById(dropInId).populate('academyId', 'userId sports');
    if (!dropIn) return res.status(404).json({ message: 'Drop-in not found' });
    if (dropIn.status !== 'Active') {
      return res.status(400).json({ message: 'Only active drop-ins can be edited' });
    }

    if (dropIn.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const editScope = scope === 'future' ? 'future' : 'single';
    const nextSport = sport || dropIn.sport;
    const nextCourtNumber = courtNumber != null ? Number(courtNumber) : dropIn.courtNumber;
    const nextDate = date || dropIn.date;
    const nextStartTime = startTime || dropIn.startTime;
    const nextEndTime = endTime || dropIn.endTime;
    const nextMaxParticipants = maxParticipants != null ? Number(maxParticipants) : dropIn.maxParticipants;
    const nextPrice = pricePerParticipant != null ? Number(pricePerParticipant) : dropIn.pricePerParticipant;

    const nextRecurrenceType = recurrenceType || dropIn.recurrenceType || 'none';
    const nextRecurrenceDays = Array.isArray(recurrenceDays)
      ? recurrenceDays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
      : (dropIn.recurrenceDays || []);
    const nextRecurrenceUntil = recurrenceUntil || dropIn.recurrenceUntil || null;

    if (!nextSport || !nextCourtNumber || !nextDate || !nextStartTime || !nextEndTime || !nextMaxParticipants) {
      return res.status(400).json({ message: 'sport, courtNumber, date, startTime, endTime, maxParticipants are required' });
    }

    if (editScope === 'future') {
      if (nextRecurrenceType === 'weekly' && nextRecurrenceDays.length === 0) {
        return res.status(400).json({ message: 'recurrenceDays are required for weekly recurrence' });
      }
      if (nextRecurrenceType !== 'none' && !nextRecurrenceUntil) {
        return res.status(400).json({ message: 'recurrenceUntil is required for recurring updates' });
      }
    }

    const academySport = (dropIn.academyId.sports || []).find(s => s.sportName === nextSport);
    if (!academySport) {
      return res.status(404).json({ message: 'Sport not found in this academy' });
    }

    if (nextCourtNumber < 1 || nextCourtNumber > academySport.numberOfCourts) {
      return res.status(400).json({ message: 'Invalid court number' });
    }

    const reqStart = timeToMinutes(nextStartTime);
    const reqEnd = timeToMinutes(nextEndTime);
    if (reqEnd <= reqStart) {
      return res.status(400).json({ message: 'endTime must be after startTime' });
    }

    const academyStart = timeToMinutes(academySport.startTime);
    const academyEnd = timeToMinutes(academySport.endTime);
    if (reqStart < academyStart || reqEnd > academyEnd) {
      return res.status(400).json({ message: 'Slot is outside academy operating hours' });
    }

    const Booking = require('../models/Booking');

    if (editScope === 'single') {
      if (nextMaxParticipants < (dropIn.joinedParticipants?.length || 0)) {
        return res.status(400).json({ message: 'maxParticipants cannot be less than current joined participants' });
      }

      const bookingConflicts = await Booking.find({
        academyId: dropIn.academyId._id,
        sport: nextSport,
        courtNumber: nextCourtNumber,
        date: nextDate,
        status: 'Confirmed',
      });
      const hasBookingConflict = bookingConflicts.some((b) =>
        isTimeOverlap(reqStart, reqEnd, timeToMinutes(b.startTime), timeToMinutes(b.endTime))
      );
      if (hasBookingConflict) {
        return res.status(400).json({ message: `Selected slot conflicts with a booking on ${nextDate}` });
      }

      const dropInConflicts = await DropIn.find({
        _id: { $ne: dropIn._id },
        academyId: dropIn.academyId._id,
        sport: nextSport,
        courtNumber: nextCourtNumber,
        date: nextDate,
        status: 'Active',
      });
      const hasDropInConflict = dropInConflicts.some((existing) =>
        isTimeOverlap(reqStart, reqEnd, timeToMinutes(existing.startTime), timeToMinutes(existing.endTime))
      );
      if (hasDropInConflict) {
        return res.status(400).json({ message: `Selected slot conflicts with another drop-in session on ${nextDate}` });
      }

      dropIn.sport = nextSport;
      dropIn.courtNumber = nextCourtNumber;
      dropIn.title = title != null ? title : dropIn.title;
      dropIn.description = description != null ? description : dropIn.description;
      dropIn.skillLevel = skillLevel != null ? skillLevel : dropIn.skillLevel;
      dropIn.date = nextDate;
      dropIn.startTime = nextStartTime;
      dropIn.endTime = nextEndTime;
      dropIn.maxParticipants = nextMaxParticipants;
      dropIn.pricePerParticipant = nextPrice;

      await dropIn.save();

      const updatedSingle = await DropIn.findById(dropIn._id)
        .populate('joinedParticipants', 'name email phone')
        .populate('pendingRequests', 'name email');

      return res.json({
        message: 'Drop-in occurrence updated successfully',
        dropIn: updatedSingle,
      });
    }

    let existingToReconcile = [dropIn];
    if (editScope === 'future' && dropIn.seriesId) {
      existingToReconcile = await DropIn.find({
        seriesId: dropIn.seriesId,
        date: { $gte: dropIn.date },
        status: 'Active',
      }).sort({ date: 1 });
    }

    const targetDates = editScope === 'future'
      ? (nextRecurrenceType === 'none'
        ? [nextDate]
        : expandDates(nextDate, nextRecurrenceType, nextRecurrenceDays, nextRecurrenceUntil))
      : [nextDate];

    const existingIds = existingToReconcile.map((item) => item._id);

    for (const targetDate of targetDates) {
      const bookingConflicts = await Booking.find({
        academyId: dropIn.academyId._id,
        sport: nextSport,
        courtNumber: nextCourtNumber,
        date: targetDate,
        status: 'Confirmed',
      });

      const hasBookingConflict = bookingConflicts.some((b) =>
        isTimeOverlap(reqStart, reqEnd, timeToMinutes(b.startTime), timeToMinutes(b.endTime))
      );
      if (hasBookingConflict) {
        return res.status(400).json({ message: `Selected slot conflicts with a booking on ${targetDate}` });
      }

      const dropInConflicts = await DropIn.find({
        _id: { $nin: existingIds },
        academyId: dropIn.academyId._id,
        sport: nextSport,
        courtNumber: nextCourtNumber,
        date: targetDate,
        status: 'Active',
      });

      const hasDropInConflict = dropInConflicts.some((existing) =>
        isTimeOverlap(reqStart, reqEnd, timeToMinutes(existing.startTime), timeToMinutes(existing.endTime))
      );
      if (hasDropInConflict) {
        return res.status(400).json({ message: `Selected slot conflicts with another drop-in session on ${targetDate}` });
      }
    }

    const existingByDate = new Map(existingToReconcile.map((item) => [item.date, item]));

    for (const targetDate of targetDates) {
      const existing = existingByDate.get(targetDate);
      const currentJoinedCount = existing?.joinedParticipants?.length || 0;
      if (nextMaxParticipants < currentJoinedCount) {
        return res.status(400).json({ message: `maxParticipants cannot be less than current joined participants for ${targetDate}` });
      }
    }

    const resolvedSeriesId = editScope === 'future'
      ? (targetDates.length > 1 ? (dropIn.seriesId || crypto.randomUUID()) : null)
      : dropIn.seriesId;

    const targetDateSet = new Set(targetDates);

    for (const targetDate of targetDates) {
      const existing = existingByDate.get(targetDate);
      if (existing) {
        existing.sport = nextSport;
        existing.courtNumber = nextCourtNumber;
        existing.title = title != null ? title : existing.title;
        existing.description = description != null ? description : existing.description;
        existing.skillLevel = skillLevel != null ? skillLevel : existing.skillLevel;
        existing.date = targetDate;
        existing.startTime = nextStartTime;
        existing.endTime = nextEndTime;
        existing.maxParticipants = nextMaxParticipants;
        existing.pricePerParticipant = nextPrice;
        if (editScope === 'future') {
          existing.seriesId = resolvedSeriesId;
          existing.recurrenceType = nextRecurrenceType;
          existing.recurrenceDays = nextRecurrenceDays;
          existing.recurrenceUntil = nextRecurrenceType === 'none' ? null : nextRecurrenceUntil;
        }
        await existing.save();
        continue;
      }

      const newDropIn = new DropIn({
        academyId: dropIn.academyId._id,
        createdBy: req.user._id,
        sport: nextSport,
        courtNumber: nextCourtNumber,
        title: title || '',
        description: description || '',
        skillLevel: skillLevel || '',
        date: targetDate,
        startTime: nextStartTime,
        endTime: nextEndTime,
        seriesId: resolvedSeriesId,
        recurrenceType: editScope === 'future' ? nextRecurrenceType : dropIn.recurrenceType,
        recurrenceDays: editScope === 'future' ? nextRecurrenceDays : (dropIn.recurrenceDays || []),
        recurrenceUntil: editScope === 'future'
          ? (nextRecurrenceType === 'none' ? null : nextRecurrenceUntil)
          : (dropIn.recurrenceUntil || null),
        maxParticipants: nextMaxParticipants,
        pricePerParticipant: nextPrice,
      });

      newDropIn.shareCode = generateShareCode();
      try {
        await newDropIn.save();
      } catch (saveErr) {
        if (saveErr?.code === 11000) {
          newDropIn.shareCode = generateShareCode();
          await newDropIn.save();
        } else {
          throw saveErr;
        }
      }
    }

    if (editScope === 'future') {
      const toCancel = existingToReconcile
        .filter((item) => !targetDateSet.has(item.date))
        .map((item) => item._id);
      if (toCancel.length > 0) {
        await DropIn.updateMany(
          { _id: { $in: toCancel } },
          { $set: { status: 'Cancelled' } }
        );
      }
    }

    const updated = await DropIn.findById(dropIn._id)
      .populate('joinedParticipants', 'name email phone')
      .populate('pendingRequests', 'name email');

    return res.json({
      message: editScope === 'future'
        ? 'Drop-in series updated successfully'
        : 'Drop-in occurrence updated successfully',
      dropIn: updated,
    });
  } catch (err) {
    console.error('DropIn update error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/dropin/:dropInId
// Academy deletes a single drop-in occurrence
// ──────────────────────────────────────────────
router.delete('/:dropInId', async (req, res) => {
  try {
    const dropIn = await DropIn.findById(req.params.dropInId).populate('academyId', 'userId');
    if (!dropIn) return res.status(404).json({ message: 'Drop-in not found' });

    if (dropIn.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    dropIn.status = 'Cancelled';
    await dropIn.save();

    return res.json({ message: 'Drop-in cancelled' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/dropin/series/:seriesId/from/:fromDate
// Academy cancels this and all future occurrences in a series
// ──────────────────────────────────────────────
router.delete('/series/:seriesId/from/:fromDate', async (req, res) => {
  try {
    const { seriesId, fromDate } = req.params;

    // Verify ownership by checking first instance in series
    const sample = await DropIn.findOne({ seriesId }).populate('academyId', 'userId');
    if (!sample) return res.status(404).json({ message: 'Series not found' });

    if (sample.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const result = await DropIn.updateMany(
      { seriesId, date: { $gte: fromDate }, status: 'Active' },
      { $set: { status: 'Cancelled' } }
    );

    return res.json({ message: `Cancelled ${result.modifiedCount} future occurrence(s) in the series` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// GET /api/dropin/share/:shareCode
// Public or authenticated user views a drop-in by share code
// ──────────────────────────────────────────────
router.get('/share/:shareCode', async (req, res) => {
  try {
    const dropIn = await DropIn.findOne({ shareCode: req.params.shareCode, status: 'Active' })
      .populate('academyId', 'name address city')
      .populate('joinedParticipants', 'name');

    if (!dropIn) return res.status(404).json({ message: 'Drop-in not found or no longer active' });

    const viewerUserId = req.user?._id?.toString();

    const publicData = {
      id: dropIn._id,
      shareCode: dropIn.shareCode,
      sport: dropIn.sport,
      title: dropIn.title,
      description: dropIn.description,
      skillLevel: dropIn.skillLevel,
      date: dropIn.date,
      startTime: dropIn.startTime,
      endTime: dropIn.endTime,
      courtNumber: dropIn.courtNumber,
      pricePerParticipant: dropIn.pricePerParticipant,
      maxParticipants: dropIn.maxParticipants,
      slotsRemaining: dropIn.maxParticipants - dropIn.joinedParticipants.length,
      academy: dropIn.academyId,
      participants: dropIn.joinedParticipants.map(p => ({ id: p._id, name: p.name })),
      hasRequested: viewerUserId
        ? dropIn.pendingRequests.some(id => id.toString() === viewerUserId)
        : false,
      hasJoined: viewerUserId
        ? dropIn.joinedParticipants.some(p => p._id.toString() === viewerUserId)
        : false,
      status: dropIn.status,
    };

    return res.json({ dropIn: publicData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/dropin/:dropInId/request-join
// Authenticated user requests to join a drop-in
// ──────────────────────────────────────────────
router.post('/:dropInId/request-join', async (req, res) => {
  try {
    const userId = req.user._id;
    const dropIn = await DropIn.findById(req.params.dropInId).populate('academyId', 'userId');
    if (!dropIn || dropIn.status !== 'Active') {
      return res.status(404).json({ message: 'Drop-in not found or not active' });
    }

    const alreadyJoined = dropIn.joinedParticipants.some(id => id.toString() === userId.toString());
    if (alreadyJoined) return res.status(400).json({ message: 'Already joined' });

    const alreadyRequested = dropIn.pendingRequests.some(id => id.toString() === userId.toString());
    if (alreadyRequested) return res.status(400).json({ message: 'Join request already sent' });

    if (dropIn.joinedParticipants.length >= dropIn.maxParticipants) {
      return res.status(400).json({ message: 'Drop-in is full' });
    }

    dropIn.pendingRequests.push(userId);
    await dropIn.save();

    const requester = await User.findById(userId).select('name');
    if (dropIn.academyId?.userId) {
      await createNotification({
        recipientUserId: dropIn.academyId.userId,
        templateKey: 'dropin.joinRequest.sent.forAcademy',
        variables: {
          userName: requester?.name || 'A player',
          sport: dropIn.sport,
          date: dropIn.date,
          startTime: dropIn.startTime,
        },
        metadata: {
          dropInId: dropIn._id,
          academyId: dropIn.academyId._id,
          requesterUserId: userId,
        }
      });
    }

    return res.json({ message: 'Join request sent. Waiting for academy approval.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/dropin/:dropInId/approve/:userId
// Academy approves a pending join request
// ──────────────────────────────────────────────
router.post('/:dropInId/approve/:userId', async (req, res) => {
  try {
    const { dropInId, userId } = req.params;

    const dropIn = await DropIn.findById(dropInId).populate('academyId', 'userId name');
    if (!dropIn) return res.status(404).json({ message: 'Drop-in not found' });

    if (dropIn.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const isPending = dropIn.pendingRequests.some(id => id.toString() === userId);
    if (!isPending) return res.status(400).json({ message: 'No pending request from this user' });

    if (dropIn.joinedParticipants.length >= dropIn.maxParticipants) {
      return res.status(400).json({ message: 'Drop-in is full' });
    }

    dropIn.pendingRequests = dropIn.pendingRequests.filter(id => id.toString() !== userId);
    dropIn.joinedParticipants.push(userId);
    await dropIn.save();

    await createNotification({
      recipientUserId: userId,
      templateKey: 'dropin.request.accepted.forParticipant',
      variables: {
        academyName: dropIn.academyId?.name || 'Academy',
        sport: dropIn.sport,
        date: dropIn.date,
        startTime: dropIn.startTime,
      },
      metadata: {
        dropInId: dropIn._id,
        academyId: dropIn.academyId?._id,
      }
    });

    return res.json({ message: 'User approved and added to drop-in' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/dropin/:dropInId/reject/:userId
// Academy rejects a pending request or removes an approved participant
// ──────────────────────────────────────────────
router.post('/:dropInId/reject/:userId', async (req, res) => {
  try {
    const { dropInId, userId } = req.params;

    const dropIn = await DropIn.findById(dropInId).populate('academyId', 'userId name');
    if (!dropIn) return res.status(404).json({ message: 'Drop-in not found' });

    if (dropIn.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const wasPending = dropIn.pendingRequests.some(id => id.toString() === userId);
    const wasJoined = dropIn.joinedParticipants.some(id => id.toString() === userId);

    if (!wasPending && !wasJoined) {
      return res.status(400).json({ message: 'User is not in pending or joined list' });
    }

    dropIn.pendingRequests = dropIn.pendingRequests.filter(id => id.toString() !== userId);
    dropIn.joinedParticipants = dropIn.joinedParticipants.filter(id => id.toString() !== userId);
    await dropIn.save();

    await createNotification({
      recipientUserId: userId,
      templateKey: wasJoined
        ? 'dropin.participant.removed.forParticipant'
        : 'dropin.request.rejected.forParticipant',
      variables: {
        academyName: dropIn.academyId?.name || 'Academy',
        sport: dropIn.sport,
        date: dropIn.date,
        startTime: dropIn.startTime,
      },
      metadata: {
        dropInId: dropIn._id,
        academyId: dropIn.academyId?._id,
      }
    });

    return res.json({ message: wasJoined ? 'Approved participant removed' : 'Request rejected' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// GET /api/dropin/:dropInId/share-link
// Academy fetches (or generates) the share link for a drop-in
// ──────────────────────────────────────────────
router.get('/:dropInId/share-link', async (req, res) => {
  try {
    const dropIn = await DropIn.findById(req.params.dropInId).populate('academyId', 'userId');
    if (!dropIn) return res.status(404).json({ message: 'Drop-in not found' });

    if (dropIn.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const code = await ensureShareCode(dropIn);
    return res.json({ shareCode: code });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
