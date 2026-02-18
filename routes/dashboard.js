const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Academy = require('../models/Academy');

const { encrypt, decrypt } = require('../utils/helperFunctions');
const e = require('express');

router.post('/dashboard-data', async (req, res) => {
  try {
    const { userEmail, userId } = req.body;

    if (!userId || !userEmail) {
      return res.status(400).json({
        message: 'userId and userEmail are required'
      });
    }

    const userEmailDecrypted = decrypt(userEmail);
    const userIdDecrypted = decrypt(userId);

    const now = new Date();

    // Get only confirmed bookings
    const bookings = await Booking.find({
      userEmail: userEmailDecrypted,
      userId: userIdDecrypted,
      status: 'Confirmed'
    }).populate('academyId', 'name address city');

    const upcomingBookings = bookings.filter((booking) => {
      // Combine date + startTime properly
      const bookingDateTime = new Date(
        `${booking.date}T${booking.startTime}:00`
      );

      return bookingDateTime > now;
    });

    // Optional: Sort by nearest booking first
    upcomingBookings.sort((a, b) => {
      const aDate = new Date(`${a.date}T${a.startTime}:00`);
      const bDate = new Date(`${b.date}T${b.startTime}:00`);
      return aDate - bDate;
    });

    return res.status(200).json({
      count: upcomingBookings.length,
      bookings: upcomingBookings
    });

  } catch (error) {
    console.error('Error fetching upcoming bookings:', error);
    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});


module.exports = router;
