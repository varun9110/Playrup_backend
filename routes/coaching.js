const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const Coaching = require('../models/Coaching');
const Academy = require('../models/Academy');
const DropIn = require('../models/DropIn');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { isTimeOverlap, timeToMinutes } = require('../utils/helperFunctions');
const { createNotification } = require('../services/notificationService');

const generateShareCode = () => crypto.randomBytes(8).toString('hex');

const ensureShareCode = async (coaching) => {
  if (coaching.shareCode) return coaching.shareCode;

  for (let i = 0; i < 3; i += 1) {
    coaching.shareCode = generateShareCode();
    try {
      await coaching.save();
      return coaching.shareCode;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new Error('Unable to generate unique share code');
};

const expandDates = (startDate, recurrenceType, recurrenceDays, recurrenceUntil) => {
  const start = new Date(`${startDate}T12:00:00Z`);
  const startDay = start.getUTCDay();

  const dates = [];
  if (recurrenceType === 'none') {
    return [startDate];
  }

  if (recurrenceType === 'daily') {
    dates.push(startDate);
  } else if (recurrenceType === 'weekly') {
    if (recurrenceDays.includes(startDay)) {
      dates.push(startDate);
    }
  }

  if (!recurrenceUntil) return dates;

  const until = new Date(`${recurrenceUntil}T12:00:00Z`);
  let cursor = new Date(`${startDate}T12:00:00Z`);

  while (true) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor > until) break;

    const dayOfWeek = cursor.getUTCDay();
    const yyyy = cursor.getUTCFullYear();
    const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (recurrenceType === 'daily') {
      dates.push(dateStr);
    } else if (recurrenceType === 'weekly' && recurrenceDays.includes(dayOfWeek)) {
      dates.push(dateStr);
    }
  }

  return dates;
};

const hasCourtSlotConflict = async ({ academyId, sport, courtNumber, date, startMinutes, endMinutes, excludeCoachingIds = [] }) => {
  const bookings = await Booking.find({
    academyId,
    sport,
    courtNumber,
    date,
    status: 'Confirmed',
  });

  const bookingConflict = bookings.some((b) =>
    isTimeOverlap(startMinutes, endMinutes, timeToMinutes(b.startTime), timeToMinutes(b.endTime))
  );
  if (bookingConflict) return { conflict: true, source: 'booking' };

  const dropIns = await DropIn.find({
    academyId,
    sport,
    courtNumber,
    date,
    status: 'Active',
  });

  const dropInConflict = dropIns.some((item) =>
    isTimeOverlap(startMinutes, endMinutes, timeToMinutes(item.startTime), timeToMinutes(item.endTime))
  );
  if (dropInConflict) return { conflict: true, source: 'dropin' };

  const coachingSessions = await Coaching.find({
    academyId,
    sport,
    courtNumber,
    date,
    status: 'Active',
    ...(excludeCoachingIds.length > 0 ? { _id: { $nin: excludeCoachingIds } } : {}),
  });

  const coachingConflict = coachingSessions.some((item) =>
    isTimeOverlap(startMinutes, endMinutes, timeToMinutes(item.startTime), timeToMinutes(item.endTime))
  );

  return coachingConflict ? { conflict: true, source: 'coaching' } : { conflict: false };
};

router.post('/create', async (req, res) => {
  try {
    const {
      academyId,
      sport,
      courtNumber,
      title,
      description,
      skillLevel,
      coachName,
      coachBio,
      coachContact,
      date,
      startTime,
      endTime,
      pricePerParticipant,
      recurrenceType,
      recurrenceDays,
      recurrenceUntil,
    } = req.body;

    if (!academyId || !sport || courtNumber == null || !date || !startTime || !endTime) {
      return res.status(400).json({ message: 'academyId, sport, courtNumber, date, startTime and endTime are required' });
    }

    const academy = await Academy.findById(academyId);
    if (!academy) return res.status(404).json({ message: 'Academy not found' });
    if (academy.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised to manage this academy' });
    }

    const sportData = academy.sports.find((s) => s.sportName === sport);
    if (!sportData) return res.status(404).json({ message: 'Sport not found in this academy' });
    if (courtNumber < 1 || courtNumber > sportData.numberOfCourts) {
      return res.status(400).json({ message: 'Invalid court number' });
    }

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    if (endMinutes <= startMinutes) {
      return res.status(400).json({ message: 'endTime must be after startTime' });
    }

    const academyStart = timeToMinutes(sportData.startTime);
    const academyEnd = timeToMinutes(sportData.endTime);
    if (startMinutes < academyStart || endMinutes > academyEnd) {
      return res.status(400).json({ message: 'Slot is outside academy operating hours' });
    }

    const type = recurrenceType || 'none';
    const days = Array.isArray(recurrenceDays)
      ? recurrenceDays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
      : [];
    const until = recurrenceUntil || null;

    if (type === 'weekly' && days.length === 0) {
      return res.status(400).json({ message: 'recurrenceDays are required for weekly recurrence' });
    }

    if (type !== 'none' && !until) {
      return res.status(400).json({ message: 'recurrenceUntil is required for recurring coaching classes' });
    }

    const allDates = expandDates(date, type, days, until);
    if (allDates.length === 0) {
      return res.status(400).json({ message: 'No valid coaching dates generated for the selected recurrence settings' });
    }

    const seriesId = allDates.length > 1 ? crypto.randomUUID() : null;

    const created = [];
    const skippedDates = [];

    for (const d of allDates) {
      const conflictResult = await hasCourtSlotConflict({
        academyId,
        sport,
        courtNumber,
        date: d,
        startMinutes,
        endMinutes,
      });

      if (conflictResult.conflict) {
        skippedDates.push(d);
        continue;
      }

      const coaching = new Coaching({
        academyId,
        createdBy: req.user._id,
        sport,
        courtNumber,
        title: title || '',
        description: description || '',
        skillLevel: skillLevel || '',
        coachName: coachName || '',
        coachBio: coachBio || '',
        coachContact: coachContact || '',
        date: d,
        startTime,
        endTime,
        seriesId,
        recurrenceType: type,
        recurrenceDays: days,
        recurrenceUntil: until,
        pricePerParticipant: pricePerParticipant || 0,
      });

      coaching.shareCode = generateShareCode();
      try {
        await coaching.save();
        created.push(coaching);
      } catch (error) {
        if (error?.code === 11000) {
          coaching.shareCode = generateShareCode();
          await coaching.save();
          created.push(coaching);
        } else {
          throw error;
        }
      }
    }

    return res.status(201).json({
      message: `Created ${created.length} coaching class(es). ${skippedDates.length > 0 ? `Skipped ${skippedDates.length} date(s) due to conflicts: ${skippedDates.join(', ')}` : ''}`,
      created,
      skippedDates,
    });
  } catch (error) {
    console.error('Coaching create error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

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

    const coachingSessions = await Coaching.find(filter)
      .populate('joinedParticipants', 'name email phone')
      .populate('pendingRequests', 'name email')
      .sort({ date: 1, startTime: 1 });

    return res.json({ coachingSessions });
  } catch (error) {
    console.error('Coaching academy list error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

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

    const coachingSessions = await Coaching.find(filter)
      .populate('academyId', 'name city address')
      .populate('joinedParticipants', 'name')
      .sort({ date: 1, startTime: 1 });

    const payload = coachingSessions.map((session) => ({
      ...session.toObject(),
      hasRequested: viewerUserId
        ? session.pendingRequests.some((id) => id.toString() === viewerUserId)
        : false,
      hasJoined: viewerUserId
        ? session.joinedParticipants.some((p) => p._id.toString() === viewerUserId)
        : false,
    }));

    return res.json({ coachingSessions: payload });
  } catch (error) {
    console.error('Coaching all-list error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/user-activities', async (req, res) => {
  try {
    const userId = req.user._id;

    const coachingSessions = await Coaching.find({
      joinedParticipants: userId,
    })
      .populate('academyId', 'name')
      .populate('joinedParticipants', 'name')
      .sort({ date: 1, startTime: 1 });

    return res.json({ coachingSessions });
  } catch (error) {
    console.error('Coaching user-activities error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/share/:shareCode', async (req, res) => {
  try {
    const coaching = await Coaching.findOne({ shareCode: req.params.shareCode, status: 'Active' })
      .populate('academyId', 'name address city')
      .populate('joinedParticipants', 'name');

    if (!coaching) return res.status(404).json({ message: 'Coaching class not found or no longer active' });

    const viewerUserId = req.user?._id?.toString();

    const publicData = {
      id: coaching._id,
      shareCode: coaching.shareCode,
      sport: coaching.sport,
      title: coaching.title,
      description: coaching.description,
      skillLevel: coaching.skillLevel,
      coachName: coaching.coachName,
      coachBio: coaching.coachBio,
      coachContact: coaching.coachContact,
      date: coaching.date,
      startTime: coaching.startTime,
      endTime: coaching.endTime,
      courtNumber: coaching.courtNumber,
      pricePerParticipant: coaching.pricePerParticipant,
      academy: coaching.academyId,
      participants: coaching.joinedParticipants.map((p) => ({ id: p._id, name: p.name })),
      hasRequested: viewerUserId
        ? coaching.pendingRequests.some((id) => id.toString() === viewerUserId)
        : false,
      hasJoined: viewerUserId
        ? coaching.joinedParticipants.some((p) => p._id.toString() === viewerUserId)
        : false,
      status: coaching.status,
    };

    return res.json({ coaching: publicData });
  } catch (error) {
    console.error('Coaching public share error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:coachingId', async (req, res) => {
  try {
    const coaching = await Coaching.findById(req.params.coachingId)
      .populate('joinedParticipants', 'name email phone')
      .populate('pendingRequests', 'name email')
      .populate('academyId', 'name address city');

    if (!coaching) return res.status(404).json({ message: 'Coaching class not found' });
    return res.json({ coaching });
  } catch (error) {
    console.error('Coaching detail error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:coachingId', async (req, res) => {
  try {
    const { coachingId } = req.params;
    const {
      scope,
      sport,
      courtNumber,
      title,
      description,
      skillLevel,
      coachName,
      coachBio,
      coachContact,
      date,
      startTime,
      endTime,
      pricePerParticipant,
      recurrenceType,
      recurrenceDays,
      recurrenceUntil,
    } = req.body;

    const coaching = await Coaching.findById(coachingId).populate('academyId', 'userId sports name');
    if (!coaching) return res.status(404).json({ message: 'Coaching class not found' });
    if (coaching.status !== 'Active') {
      return res.status(400).json({ message: 'Only active coaching classes can be edited' });
    }

    if (coaching.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const editScope = scope === 'future' ? 'future' : 'single';
    const nextSport = sport || coaching.sport;
    const nextCourtNumber = courtNumber != null ? Number(courtNumber) : coaching.courtNumber;
    const nextDate = date || coaching.date;
    const nextStartTime = startTime || coaching.startTime;
    const nextEndTime = endTime || coaching.endTime;
    const nextPrice = pricePerParticipant != null ? Number(pricePerParticipant) : coaching.pricePerParticipant;

    const nextRecurrenceType = recurrenceType || coaching.recurrenceType || 'none';
    const nextRecurrenceDays = Array.isArray(recurrenceDays)
      ? recurrenceDays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
      : (coaching.recurrenceDays || []);
    const nextRecurrenceUntil = recurrenceUntil || coaching.recurrenceUntil || null;

    if (!nextSport || !nextCourtNumber || !nextDate || !nextStartTime || !nextEndTime) {
      return res.status(400).json({ message: 'sport, courtNumber, date, startTime and endTime are required' });
    }

    if (editScope === 'future') {
      if (nextRecurrenceType === 'weekly' && nextRecurrenceDays.length === 0) {
        return res.status(400).json({ message: 'recurrenceDays are required for weekly recurrence' });
      }
      if (nextRecurrenceType !== 'none' && !nextRecurrenceUntil) {
        return res.status(400).json({ message: 'recurrenceUntil is required for recurring updates' });
      }
    }

    const academySport = (coaching.academyId.sports || []).find((s) => s.sportName === nextSport);
    if (!academySport) {
      return res.status(404).json({ message: 'Sport not found in this academy' });
    }

    if (nextCourtNumber < 1 || nextCourtNumber > academySport.numberOfCourts) {
      return res.status(400).json({ message: 'Invalid court number' });
    }

    const startMinutes = timeToMinutes(nextStartTime);
    const endMinutes = timeToMinutes(nextEndTime);
    if (endMinutes <= startMinutes) {
      return res.status(400).json({ message: 'endTime must be after startTime' });
    }

    const academyStart = timeToMinutes(academySport.startTime);
    const academyEnd = timeToMinutes(academySport.endTime);
    if (startMinutes < academyStart || endMinutes > academyEnd) {
      return res.status(400).json({ message: 'Slot is outside academy operating hours' });
    }

    let existingToReconcile = [coaching];
    if (editScope === 'future' && coaching.seriesId) {
      existingToReconcile = await Coaching.find({
        seriesId: coaching.seriesId,
        date: { $gte: coaching.date },
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
      const conflictResult = await hasCourtSlotConflict({
        academyId: coaching.academyId._id,
        sport: nextSport,
        courtNumber: nextCourtNumber,
        date: targetDate,
        startMinutes,
        endMinutes,
        excludeCoachingIds: existingIds,
      });

      if (conflictResult.conflict) {
        return res.status(400).json({ message: `Selected slot conflicts with an existing ${conflictResult.source} on ${targetDate}` });
      }
    }

    const existingByDate = new Map(existingToReconcile.map((item) => [item.date, item]));

    const resolvedSeriesId = editScope === 'future'
      ? (targetDates.length > 1 ? (coaching.seriesId || crypto.randomUUID()) : null)
      : coaching.seriesId;

    const targetDateSet = new Set(targetDates);

    for (const targetDate of targetDates) {
      const existing = existingByDate.get(targetDate);
      if (existing) {
        existing.sport = nextSport;
        existing.courtNumber = nextCourtNumber;
        existing.title = title != null ? title : existing.title;
        existing.description = description != null ? description : existing.description;
        existing.skillLevel = skillLevel != null ? skillLevel : existing.skillLevel;
        existing.coachName = coachName != null ? coachName : existing.coachName;
        existing.coachBio = coachBio != null ? coachBio : existing.coachBio;
        existing.coachContact = coachContact != null ? coachContact : existing.coachContact;
        existing.date = targetDate;
        existing.startTime = nextStartTime;
        existing.endTime = nextEndTime;
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

      const newCoaching = new Coaching({
        academyId: coaching.academyId._id,
        createdBy: req.user._id,
        sport: nextSport,
        courtNumber: nextCourtNumber,
        title: title || '',
        description: description || '',
        skillLevel: skillLevel || '',
        coachName: coachName || '',
        coachBio: coachBio || '',
        coachContact: coachContact || '',
        date: targetDate,
        startTime: nextStartTime,
        endTime: nextEndTime,
        seriesId: resolvedSeriesId,
        recurrenceType: editScope === 'future' ? nextRecurrenceType : coaching.recurrenceType,
        recurrenceDays: editScope === 'future' ? nextRecurrenceDays : (coaching.recurrenceDays || []),
        recurrenceUntil: editScope === 'future'
          ? (nextRecurrenceType === 'none' ? null : nextRecurrenceUntil)
          : (coaching.recurrenceUntil || null),
        pricePerParticipant: nextPrice,
      });

      newCoaching.shareCode = generateShareCode();
      try {
        await newCoaching.save();
      } catch (error) {
        if (error?.code === 11000) {
          newCoaching.shareCode = generateShareCode();
          await newCoaching.save();
        } else {
          throw error;
        }
      }
    }

    if (editScope === 'future') {
      const toCancel = existingToReconcile
        .filter((item) => !targetDateSet.has(item.date))
        .map((item) => item._id);

      if (toCancel.length > 0) {
        await Coaching.updateMany(
          { _id: { $in: toCancel } },
          { $set: { status: 'Cancelled' } }
        );
      }
    }

    const updated = await Coaching.findById(coaching._id)
      .populate('joinedParticipants', 'name email phone')
      .populate('pendingRequests', 'name email');

    return res.json({
      message: editScope === 'future'
        ? 'Coaching series updated successfully'
        : 'Coaching class updated successfully',
      coaching: updated,
    });
  } catch (error) {
    console.error('Coaching update error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:coachingId', async (req, res) => {
  try {
    const coaching = await Coaching.findById(req.params.coachingId).populate('academyId', 'userId name');
    if (!coaching) return res.status(404).json({ message: 'Coaching class not found' });

    if (coaching.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    coaching.status = 'Cancelled';
    await coaching.save();

    const participantIds = (coaching.joinedParticipants || []).map((id) => id.toString());
    for (const participantId of participantIds) {
      await createNotification({
        recipientUserId: participantId,
        templateKey: 'coaching.class.cancelled.forParticipant',
        variables: {
          academyName: coaching.academyId?.name || 'Academy',
          sport: coaching.sport,
          date: coaching.date,
          startTime: coaching.startTime,
        },
        metadata: {
          coachingId: coaching._id,
          academyId: coaching.academyId?._id,
        }
      });
    }

    return res.json({ message: 'Coaching class cancelled' });
  } catch (error) {
    console.error('Coaching delete error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/series/:seriesId/from/:fromDate', async (req, res) => {
  try {
    const { seriesId, fromDate } = req.params;

    const sample = await Coaching.findOne({ seriesId }).populate('academyId', 'userId');
    if (!sample) return res.status(404).json({ message: 'Series not found' });

    if (sample.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const affectedSessions = await Coaching.find({
      seriesId,
      date: { $gte: fromDate },
      status: 'Active',
    }).select('_id joinedParticipants sport date startTime academyId');

    const result = await Coaching.updateMany(
      { seriesId, date: { $gte: fromDate }, status: 'Active' },
      { $set: { status: 'Cancelled' } }
    );

    for (const session of affectedSessions) {
      for (const participantId of session.joinedParticipants || []) {
        await createNotification({
          recipientUserId: participantId,
          templateKey: 'coaching.series.cancelled.forParticipant',
          variables: {
            sport: session.sport,
            date: session.date,
            startTime: session.startTime,
          },
          metadata: {
            coachingId: session._id,
            academyId: session.academyId,
            seriesId,
          }
        });
      }
    }

    return res.json({ message: `Cancelled ${result.modifiedCount} future coaching class(es) in the series` });
  } catch (error) {
    console.error('Coaching series delete error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:coachingId/share-link', async (req, res) => {
  try {
    const coaching = await Coaching.findById(req.params.coachingId).populate('academyId', 'userId');
    if (!coaching) return res.status(404).json({ message: 'Coaching class not found' });

    if (coaching.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const code = await ensureShareCode(coaching);
    return res.json({ shareCode: code });
  } catch (error) {
    console.error('Coaching share-link error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:coachingId/request-join', async (req, res) => {
  try {
    const userId = req.user._id;
    const coaching = await Coaching.findById(req.params.coachingId).populate('academyId', 'userId');
    if (!coaching || coaching.status !== 'Active') {
      return res.status(404).json({ message: 'Coaching class not found or not active' });
    }

    const alreadyJoined = coaching.joinedParticipants.some((id) => id.toString() === userId.toString());
    if (alreadyJoined) return res.status(400).json({ message: 'Already joined' });

    const alreadyRequested = coaching.pendingRequests.some((id) => id.toString() === userId.toString());
    if (alreadyRequested) return res.status(400).json({ message: 'Join request already sent' });

    coaching.pendingRequests.push(userId);
    await coaching.save();

    const requester = await User.findById(userId).select('name');
    if (coaching.academyId?.userId) {
      await createNotification({
        recipientUserId: coaching.academyId.userId,
        templateKey: 'coaching.joinRequest.sent.forAcademy',
        variables: {
          userName: requester?.name || 'A player',
          sport: coaching.sport,
          date: coaching.date,
          startTime: coaching.startTime,
        },
        metadata: {
          coachingId: coaching._id,
          academyId: coaching.academyId._id,
          requesterUserId: userId,
        }
      });
    }

    return res.json({ message: 'Join request sent. Waiting for academy approval.' });
  } catch (error) {
    console.error('Coaching request-join error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:coachingId/approve/:userId', async (req, res) => {
  try {
    const { coachingId, userId } = req.params;

    const coaching = await Coaching.findById(coachingId).populate('academyId', 'userId name');
    if (!coaching) return res.status(404).json({ message: 'Coaching class not found' });

    if (coaching.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const isPending = coaching.pendingRequests.some((id) => id.toString() === userId);
    if (!isPending) return res.status(400).json({ message: 'No pending request from this user' });

    coaching.pendingRequests = coaching.pendingRequests.filter((id) => id.toString() !== userId);
    coaching.joinedParticipants.push(userId);
    await coaching.save();

    await createNotification({
      recipientUserId: userId,
      templateKey: 'coaching.request.accepted.forParticipant',
      variables: {
        academyName: coaching.academyId?.name || 'Academy',
        sport: coaching.sport,
        date: coaching.date,
        startTime: coaching.startTime,
      },
      metadata: {
        coachingId: coaching._id,
        academyId: coaching.academyId?._id,
      }
    });

    return res.json({ message: 'User approved and added to coaching class' });
  } catch (error) {
    console.error('Coaching approve error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:coachingId/reject/:userId', async (req, res) => {
  try {
    const { coachingId, userId } = req.params;

    const coaching = await Coaching.findById(coachingId).populate('academyId', 'userId name');
    if (!coaching) return res.status(404).json({ message: 'Coaching class not found' });

    if (coaching.academyId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const wasPending = coaching.pendingRequests.some((id) => id.toString() === userId);
    const wasJoined = coaching.joinedParticipants.some((id) => id.toString() === userId);

    if (!wasPending && !wasJoined) {
      return res.status(400).json({ message: 'User is not in pending or joined list' });
    }

    coaching.pendingRequests = coaching.pendingRequests.filter((id) => id.toString() !== userId);
    coaching.joinedParticipants = coaching.joinedParticipants.filter((id) => id.toString() !== userId);
    await coaching.save();

    await createNotification({
      recipientUserId: userId,
      templateKey: wasJoined
        ? 'coaching.participant.removed.forParticipant'
        : 'coaching.request.rejected.forParticipant',
      variables: {
        academyName: coaching.academyId?.name || 'Academy',
        sport: coaching.sport,
        date: coaching.date,
        startTime: coaching.startTime,
      },
      metadata: {
        coachingId: coaching._id,
        academyId: coaching.academyId?._id,
      }
    });

    return res.json({ message: wasJoined ? 'Approved participant removed' : 'Request rejected' });
  } catch (error) {
    console.error('Coaching reject error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
