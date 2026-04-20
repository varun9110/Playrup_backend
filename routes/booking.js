const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Booking = require('../models/Booking');
const DropIn = require('../models/DropIn');
const Coaching = require('../models/Coaching');
const Academy = require('../models/Academy');
const User = require('../models/User');
const { createNotification } = require('../services/notificationService');
const {
  isTimeOverlap,
  timeToMinutes,
  calculatePrice,
  minutesToTime,
  decrypt,
  encrypt
} = require('../utils/helperFunctions');
const {
  getResolvedRatesForSport,
  hasCompleteRatePlan
} = require('../utils/courtRatePlan');

const isRequestedRangeUnavailable = (slotPrices = [], startMinutes, endMinutes) => {
  for (const slot of slotPrices) {
    if (!slot?.unavailable) continue;
    const slotStart = timeToMinutes(slot.time);
    const slotEnd = slotStart + 60;
    if (isTimeOverlap(startMinutes, endMinutes, slotStart, slotEnd)) {
      return true;
    }
  }
  return false;
};

// CREATE BOOKING
router.post('/create', async (req, res) => {
  const { userEmail, userId, academyId, sport, courtNumber, date, startTime, duration } = req.body;

  try {
    const academy = await Academy.findById(academyId);
    if (!academy) return res.status(404).json({ message: 'Academy not found' });

    const sportData = academy.sports.find(s => s.sportName === sport);
    if (!sportData) return res.status(404).json({ message: 'Sport not offered' });

    const requestedStartUtc = timeToMinutes(startTime);
    const requestedEndUtc = requestedStartUtc + duration;
    const academyStart = timeToMinutes(sportData.startTime);
    const academyEnd = timeToMinutes(sportData.endTime);

    if (!hasCompleteRatePlan(sportData)) {
      return res.status(400).json({ message: 'Academy must configure weekday and holiday rates before booking' });
    }

    const resolvedRates = getResolvedRatesForSport({
      sportData,
      date,
      startTime,
      academyTimezone: academy.timezone
    });

    if (resolvedRates.error) {
      return res.status(400).json({ message: resolvedRates.error });
    }

    const requestedLocalStart = timeToMinutes(resolvedRates.localStartTime);
    const requestedLocalEnd = requestedLocalStart + duration;

    if (requestedLocalStart < academyStart || requestedLocalEnd > academyEnd) {
      return res.status(400).json({ message: 'Requested time outside academy hours' });
    }

    // Only consider ACTIVE bookings (ignore Cancelled)
    const bookings = await Booking.find({
      academyId,
      sport,
      courtNumber,
      date,
      status: 'Confirmed'
    });

    for (let b of bookings) {
      const bookingStart = timeToMinutes(b.startTime);
      const bookingEnd = timeToMinutes(b.endTime);
      if (isTimeOverlap(requestedStartUtc, requestedEndUtc, bookingStart, bookingEnd)) {
        return res.status(400).json({ message: 'Slot already booked' });
      }
    }

    // Check for active drop-in sessions blocking this slot
    const dropIns = await DropIn.find({ academyId, sport, courtNumber, date, status: 'Active' });
    for (let di of dropIns) {
      const diStart = timeToMinutes(di.startTime);
      const diEnd = timeToMinutes(di.endTime);
      if (isTimeOverlap(requestedStartUtc, requestedEndUtc, diStart, diEnd)) {
        return res.status(400).json({ message: 'Slot is reserved for a Drop-In session' });
      }
    }

    // Check for active coaching classes blocking this slot
    const coachingSessions = await Coaching.find({ academyId, sport, courtNumber, date, status: 'Active' });
    for (let session of coachingSessions) {
      const coachingStart = timeToMinutes(session.startTime);
      const coachingEnd = timeToMinutes(session.endTime);
      if (isTimeOverlap(requestedStartUtc, requestedEndUtc, coachingStart, coachingEnd)) {
        return res.status(400).json({ message: 'Slot is reserved for a Coaching class' });
      }
    }

    const courtPricing = resolvedRates.activeCourts.find((p) => Number(p.courtNumber) === Number(courtNumber));
    if (!courtPricing) {
      return res.status(404).json({ message: 'Court pricing not found' });
    }

    if (isRequestedRangeUnavailable(courtPricing.rates, requestedLocalStart, requestedLocalEnd)) {
      return res.status(400).json({ message: 'Selected slot is marked unavailable by academy' });
    }

    const price = calculatePrice(courtPricing.rates, resolvedRates.localStartTime, duration);

    const userEmailDecrypted = decrypt(userEmail);
    const userIdDecrypted = decrypt(userId);

    const newBooking = new Booking({
      userEmail: userEmailDecrypted,
      userId: userIdDecrypted,
      academyId,
      sport,
      courtNumber,
      date,
      startTime,
      endTime: minutesToTime(requestedEndUtc),
      price,
      status: 'Confirmed'
    });

    await newBooking.save();

    const [academyUser, bookingUser] = await Promise.all([
      Academy.findById(academyId).select('name userId'),
      User.findById(userIdDecrypted).select('name')
    ]);

    if (academyUser?.userId) {
      await createNotification({
        recipientUserId: academyUser.userId,
        templateKey: 'booking.created.forAcademy',
        variables: {
          userName: bookingUser?.name || 'A player',
          sport,
          courtNumber,
          date,
          startTime
        },
        metadata: {
          bookingId: newBooking._id,
          academyId
        }
      });
    }

    res.json({
      message: 'Booking successful',
      booking: newBooking
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Booking failed' });
  }
});

// SEARCH ACADEMIES (ignore cancelled bookings indirectly)
router.post('/search', async (req, res) => {
  const { city, sport, date } = req.body;

  if (!city || !sport || !date) {
    return res.status(400).json({ message: "City and sport are required" });
  }

  try {
    const academies = await Academy.find({
      city: city.toLowerCase(),
      "sports.sportName": sport
    });

    const configuredAcademies = academies.filter((academy) => {
      const sportData = academy.sports.find((s) => s.sportName === sport);
      return hasCompleteRatePlan(sportData);
    });

    // Optional: You could filter out academies that have no available courts
    // but that's usually done in check-availability endpoint
    res.status(200).json({ academies: configuredAcademies });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Search failed' });
  }
});

// CHECK AVAILABILITY
router.post('/check-availability', async (req, res) => {
  try {
    const { academyId, sport, date, startTime, duration } = req.body;

    const academy = await Academy.findById(academyId);
    if (!academy) return res.status(404).json({ message: 'Academy not found' });

    const sportData = academy.sports.find(s => s.sportName === sport);
    if (!sportData) return res.status(404).json({ message: 'Sport not found in this academy' });

    const courts = [];
    const requestedStartUtc = timeToMinutes(startTime);
    const requestedEndUtc = requestedStartUtc + duration;
    const academyStart = timeToMinutes(sportData.startTime);
    const academyEnd = timeToMinutes(sportData.endTime);

    if (!hasCompleteRatePlan(sportData)) {
      return res.status(400).json({ message: 'Academy must configure weekday and holiday rates before booking' });
    }

    const resolvedRates = getResolvedRatesForSport({
      sportData,
      date,
      startTime,
      academyTimezone: academy.timezone
    });

    if (resolvedRates.error) {
      return res.status(400).json({ message: resolvedRates.error });
    }

    const requestedLocalStart = timeToMinutes(resolvedRates.localStartTime);
    const requestedLocalEnd = requestedLocalStart + duration;

    for (let i = 1; i <= sportData.numberOfCourts; i++) {
      // Ignore times outside academy hours
      if (requestedLocalStart < academyStart || requestedLocalEnd > academyEnd) {
        courts.push({ courtNumber: i, available: false, price: 0 });
        continue;
      }

      // Only consider ACTIVE bookings (ignore Cancelled)
      const bookings = await Booking.find({
        academyId,
        sport,
        courtNumber: i,
        date,
        status: 'Confirmed'
      });

      let available = true;
      for (let b of bookings) {
        const bookingStart = timeToMinutes(b.startTime);
        const bookingEnd = timeToMinutes(b.endTime);
        if (isTimeOverlap(requestedStartUtc, requestedEndUtc, bookingStart, bookingEnd)) {
          available = false;
          break;
        }
      }

      // Check for active drop-in sessions blocking this slot
      if (available) {
        const dropIns = await DropIn.find({
          academyId,
          sport,
          courtNumber: i,
          date,
          status: 'Active',
        });
        if (dropIns.some(di => isTimeOverlap(requestedStartUtc, requestedEndUtc, timeToMinutes(di.startTime), timeToMinutes(di.endTime)))) {
          available = false;
        }
      }

      if (available) {
        const coachingSessions = await Coaching.find({
          academyId,
          sport,
          courtNumber: i,
          date,
          status: 'Active',
        });
        if (coachingSessions.some(session => isTimeOverlap(requestedStartUtc, requestedEndUtc, timeToMinutes(session.startTime), timeToMinutes(session.endTime)))) {
          available = false;
        }
      }

      let price = 0;
      if (available) {
        const courtPricing = resolvedRates.activeCourts.find((p) => Number(p.courtNumber) === i);
        if (courtPricing) {
          if (isRequestedRangeUnavailable(courtPricing.rates, requestedLocalStart, requestedLocalEnd)) {
            available = false;
          } else {
            price = calculatePrice(courtPricing.rates, resolvedRates.localStartTime, duration);
          }
        } else {
          available = false;
        }
      }

      courts.push({ courtNumber: i, available, price });
    }

    res.json({
      courts,
      rateContext: {
        rateType: resolvedRates.rateType,
        weekday: resolvedRates.weekday,
        localDate: resolvedRates.localDateKey,
        timezone: resolvedRates.timezone
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// MY BOOKINGS
router.post('/my-bookings', async (req, res) => {
  try {
    const { userEmail, userId } = req.body;

    const userEmailDecrypted = decrypt(userEmail);
    const userIdDecrypted = decrypt(userId);

    // Only fetch bookings that are still active (Confirmed)
    const bookings = await Booking.find({ userEmail: userEmailDecrypted, userId: userIdDecrypted, status: 'Confirmed' })
      .populate('academyId', 'name address city');

    let response = bookings.map(b => ({
      ...b._doc,
      userEmail: encrypt(b.userEmail.toString()),  // Encrypt email before sending back
      userId: encrypt(b.userId.toString())  // Encrypt userId before sending back
    }));


    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to retrieve bookings' });
  }
});

// Soft cancel booking by updating status
router.post('/cancel-booking', async (req, res) => {
  try {
    const { bookingId, userEmail, userId } = req.body;

    const userEmailDecrypted = decrypt(userEmail);
    const userIdDecrypted = decrypt(userId);

    const booking = await Booking.findOne({ _id: bookingId, userEmail: userEmailDecrypted, userId: userIdDecrypted, status: 'Confirmed' });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or already cancelled' });
    }

    booking.status = 'Cancelled';
    await booking.save();

    const bookingResponse = {
      ...booking._doc,
      userEmail: encrypt(booking.userEmail.toString()),
      userId: encrypt(booking.userId.toString())
    };

    res.json({ message: 'Booking cancelled successfully', booking: bookingResponse });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to cancel booking' });
  }
});

// Academy cancels booking and user gets a notification
router.post('/academy-cancel-booking', async (req, res) => {
  try {
    const { bookingId, academyId } = req.body;

    if (!bookingId || !academyId) {
      return res.status(400).json({ message: 'bookingId and academyId are required' });
    }

    const academy = await Academy.findById(academyId).select('name userId');
    if (!academy) {
      return res.status(404).json({ message: 'Academy not found' });
    }

    if (req.user.role !== 'academy' || academy.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the academy owner can cancel this booking' });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      academyId,
      status: 'Confirmed'
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or already cancelled' });
    }

    booking.status = 'Cancelled';
    await booking.save();

    await createNotification({
      recipientUserId: booking.userId,
      templateKey: 'booking.cancelled.byAcademy.forUser',
      variables: {
        academyName: academy.name || 'Academy',
        sport: booking.sport,
        date: booking.date,
        startTime: booking.startTime
      },
      metadata: {
        bookingId: booking._id,
        academyId
      }
    });

    return res.status(200).json({ message: 'Booking cancelled by academy successfully', booking });
  } catch (error) {
    console.error('Error cancelling booking by academy:', error);
    return res.status(500).json({ message: 'Failed to cancel booking' });
  }
});

// MODIFY / RESCHEDULE BOOKING
router.patch('/modify-booking', async (req, res) => {
  try {
    const { bookingId, userEmail, userId, academyId, sport, courtNumber, date, startTime, duration } = req.body;

    // Find the booking to modify
    const userEmailDecrypted = decrypt(userEmail);
    const userIdDecrypted = decrypt(userId);

    const booking = await Booking.findOne({ _id: bookingId, userEmail: userEmailDecrypted, userId: userIdDecrypted, status: 'Confirmed' });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or already cancelled' });
    }

    // Validate academy and sport
    const academy = await Academy.findById(academyId);
    if (!academy) return res.status(404).json({ message: 'Academy not found' });

    const sportData = academy.sports.find(s => s.sportName === sport);
    if (!sportData) return res.status(404).json({ message: 'Sport not offered' });

    // Keep overlap checks in UTC, matching stored booking/drop-in/coaching timestamps.
    const requestedStartUtc = timeToMinutes(startTime);
    const requestedEndUtc = requestedStartUtc + duration;
    const academyStart = timeToMinutes(sportData.startTime);
    const academyEnd = timeToMinutes(sportData.endTime);

    // Check for overlapping bookings on the same court
    const overlappingBookings = await Booking.find({
      _id: { $ne: bookingId },  // exclude the booking being modified
      academyId,
      sport,
      courtNumber,
      date,
      status: 'Confirmed'
    });

    for (let b of overlappingBookings) {
      const bookingStart = timeToMinutes(b.startTime);
      const bookingEnd = timeToMinutes(b.endTime);
      if (isTimeOverlap(requestedStartUtc, requestedEndUtc, bookingStart, bookingEnd)) {
        return res.status(400).json({ message: 'Requested slot is already booked' });
      }
    }

    const overlappingDropIns = await DropIn.find({
      academyId,
      sport,
      courtNumber,
      date,
      status: 'Active'
    });

    for (let session of overlappingDropIns) {
      const dropInStart = timeToMinutes(session.startTime);
      const dropInEnd = timeToMinutes(session.endTime);
      if (isTimeOverlap(requestedStartUtc, requestedEndUtc, dropInStart, dropInEnd)) {
        return res.status(400).json({ message: 'Requested slot is reserved for a Drop-In session' });
      }
    }

    const overlappingCoachingSessions = await Coaching.find({
      academyId,
      sport,
      courtNumber,
      date,
      status: 'Active'
    });

    for (let session of overlappingCoachingSessions) {
      const coachingStart = timeToMinutes(session.startTime);
      const coachingEnd = timeToMinutes(session.endTime);
      if (isTimeOverlap(requestedStartUtc, requestedEndUtc, coachingStart, coachingEnd)) {
        return res.status(400).json({ message: 'Requested slot is reserved for a Coaching class' });
      }
    }

    if (!hasCompleteRatePlan(sportData)) {
      return res.status(400).json({ message: 'Academy must configure weekday and holiday rates before booking' });
    }

    const resolvedRates = getResolvedRatesForSport({
      sportData,
      date,
      startTime,
      academyTimezone: academy.timezone
    });

    if (resolvedRates.error) {
      return res.status(400).json({ message: resolvedRates.error });
    }

    const requestedLocalStart = timeToMinutes(resolvedRates.localStartTime);
    const requestedLocalEnd = requestedLocalStart + duration;

    // Check academy hours in academy-local time.
    if (requestedLocalStart < academyStart || requestedLocalEnd > academyEnd) {
      return res.status(400).json({ message: 'Requested time outside academy hours' });
    }

    // Calculate new price
    const courtPricing = resolvedRates.activeCourts.find((p) => Number(p.courtNumber) === Number(courtNumber));
    if (!courtPricing) return res.status(404).json({ message: 'Court pricing not found' });

    if (isRequestedRangeUnavailable(courtPricing.rates, requestedLocalStart, requestedLocalEnd)) {
      return res.status(400).json({ message: 'Selected slot is marked unavailable by academy' });
    }

    const price = calculatePrice(courtPricing.rates, resolvedRates.localStartTime, duration);

    // Update booking
    booking.date = date;
    booking.startTime = startTime;
    booking.endTime = minutesToTime(requestedEndUtc);
    booking.courtNumber = courtNumber;
    booking.price = price;

    await booking.save();

    const bookingResponse = {
      ...booking._doc,
      userEmail: encrypt(booking.userEmail.toString()),
      userId: encrypt(booking.userId.toString())
    };

    res.json({ message: 'Booking modified successfully', booking: bookingResponse });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to modify booking' });
  }
});

// POST /api/bookings/academy
router.post('/academy-bookings', async (req, res) => {
  try {
    const { academyId, startDate, endDate, sport } = req.body;

    if (!academyId || !startDate) {
      return res.status(400).json({ message: 'academyId and startDate are required' });
    }

    // Build the date filter
    let dateFilter = {};
    if (endDate) {
      // If endDate is provided, filter bookings between startDate and endDate
      dateFilter = {
        date: {
          $gte: startDate,
          $lte: endDate
        }
      };
    } else {
      // If only startDate is provided, filter bookings for that specific date
      dateFilter = {
        date: startDate
      };
    }

    const bookings = await Booking.find({
      academyId,
      sport,
      status: 'Confirmed',
      ...dateFilter
    }).populate('userId', 'name email phone') // optional: populate user info
      .sort({ startTime: 1 }); // sort by start time

    res.status(200).json({ success: true, bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

/** TO_DO TO DO
 * create an endpoint to charge or refund the money for the booking modification and cancellation
 */



module.exports = router;
