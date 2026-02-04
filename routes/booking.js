const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Academy = require('../models/Academy');
const {
  isTimeOverlap,
  timeToMinutes,
  calculatePrice,
  minutesToTime
} = require('../utils/helperFunctions');

// CREATE BOOKING
router.post('/create', async (req, res) => {
  const { userEmail, academyId, sport, courtNumber, date, startTime, duration } = req.body;

  try {
    const academy = await Academy.findById(academyId);
    if (!academy) return res.status(404).json({ message: 'Academy not found' });

    const sportData = academy.sports.find(s => s.sportName === sport);
    if (!sportData) return res.status(404).json({ message: 'Sport not offered' });

    const requestedStart = timeToMinutes(startTime);
    const requestedEnd = requestedStart + duration;
    const academyStart = timeToMinutes(sportData.startTime);
    const academyEnd = timeToMinutes(sportData.endTime);

    if (requestedStart < academyStart || requestedEnd > academyEnd) {
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
      if (isTimeOverlap(requestedStart, requestedEnd, bookingStart, bookingEnd)) {
        return res.status(400).json({ message: 'Slot already booked' });
      }
    }

    const courtPricing = sportData.pricing.find(p => p.courtNumber === courtNumber);
    if (!courtPricing) return res.status(404).json({ message: 'Court pricing not found' });

    const price = calculatePrice(courtPricing.prices, startTime, duration);

    const newBooking = new Booking({
      userEmail,
      academyId,
      sport,
      courtNumber,
      date,
      startTime,
      endTime: minutesToTime(requestedEnd),
      price,
      status: 'Confirmed'
    });

    await newBooking.save();
    res.json({ message: 'Booking successful', booking: newBooking });
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

    // Optional: You could filter out academies that have no available courts
    // but that's usually done in check-availability endpoint
    res.status(200).json({ academies });
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
    const requestedStart = timeToMinutes(startTime);
    const requestedEnd = requestedStart + duration;
    const academyStart = timeToMinutes(sportData.startTime);
    const academyEnd = timeToMinutes(sportData.endTime);

    for (let i = 1; i <= sportData.numberOfCourts; i++) {
      // Ignore times outside academy hours
      if (requestedStart < academyStart || requestedEnd > academyEnd) {
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
        if (isTimeOverlap(requestedStart, requestedEnd, bookingStart, bookingEnd)) {
          available = false;
          break;
        }
      }

      let price = 0;
      if (available) {
        const courtPricing = sportData.pricing.find(p => p.courtNumber === i);
        if (courtPricing) {
          price = calculatePrice(courtPricing.prices, startTime, duration);
        }
      }

      courts.push({ courtNumber: i, available, price });
    }

    res.json({ courts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// MY BOOKINGS
router.post('/my-bookings', async (req, res) => {
  try {
    const { userEmail } = req.body;

    // Only fetch bookings that are still active (Confirmed)
    const bookings = await Booking.find({ userEmail, status: 'Confirmed' })
      .populate('academyId', 'name address city');

    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to retrieve bookings' });
  }
});

// Soft cancel booking by updating status
router.post('/cancel-booking', async (req, res) => {
  try {
    const { bookingId, userEmail } = req.body;

    const booking = await Booking.findOne({ _id: bookingId, userEmail, status: 'Confirmed' });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or already cancelled' });
    }

    booking.status = 'Cancelled';
    await booking.save();

    res.json({ message: 'Booking cancelled successfully', booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to cancel booking' });
  }
});

// MODIFY / RESCHEDULE BOOKING
router.patch('/modify-booking', async (req, res) => {
  try {
    const { bookingId, userEmail, academyId, sport, courtNumber, date, startTime, duration } = req.body;

    // Find the booking to modify
    const booking = await Booking.findOne({ _id: bookingId, userEmail, status: 'Confirmed' });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or already cancelled' });
    }

    // Validate academy and sport
    const academy = await Academy.findById(academyId);
    if (!academy) return res.status(404).json({ message: 'Academy not found' });

    const sportData = academy.sports.find(s => s.sportName === sport);
    if (!sportData) return res.status(404).json({ message: 'Sport not offered' });

    // Convert startTime and duration to minutes
    const requestedStart = timeToMinutes(startTime);
    const requestedEnd = requestedStart + duration;
    const academyStart = timeToMinutes(sportData.startTime);
    const academyEnd = timeToMinutes(sportData.endTime);

    // Check academy hours
    if (requestedStart < academyStart || requestedEnd > academyEnd) {
      return res.status(400).json({ message: 'Requested time outside academy hours' });
    }

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
      if (isTimeOverlap(requestedStart, requestedEnd, bookingStart, bookingEnd)) {
        return res.status(400).json({ message: 'Requested slot is already booked' });
      }
    }

    // Calculate new price
    const courtPricing = sportData.pricing.find(p => p.courtNumber === courtNumber);
    if (!courtPricing) return res.status(404).json({ message: 'Court pricing not found' });

    const price = calculatePrice(courtPricing.prices, startTime, duration);

    // Update booking
    booking.date = date;
    booking.startTime = startTime;
    booking.endTime = minutesToTime(requestedEnd);
    booking.courtNumber = courtNumber;
    booking.price = price;

    await booking.save();

    res.json({ message: 'Booking modified successfully', booking });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to modify booking' });
  }
});




/** TO_DO TO DO
 * create an endpoint to charge or refund the money for the booking modification and cancellation
 */



module.exports = router;
