const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Academy = require('../models/Academy');
const Activity = require('../models/Activity');

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

    // -----------------------------
    // 1️⃣ Upcoming bookings
    // -----------------------------
    const bookings = await Booking.find({
      userEmail: userEmailDecrypted,
      userId: userIdDecrypted,
      status: 'Confirmed'
    }).populate('academyId', 'name address city');

    const upcomingBookings = bookings.filter((booking) => {
      const bookingDateTime = new Date(`${booking.date}T${booking.startTime}:00`);
      return bookingDateTime > now;
    });

    upcomingBookings.sort((a, b) => {
      const aDate = new Date(`${a.date}T${a.startTime}:00`);
      const bDate = new Date(`${b.date}T${b.startTime}:00`);
      return aDate - bDate;
    });

    // -----------------------------
    // 2️⃣ Past activities user joined
    // -----------------------------
    const pastActivities = await Activity.find({
      joinedPlayers: userIdDecrypted
    });

    const pastActivitiesFiltered = pastActivities.filter((activity) => {
      const activityDateTime = new Date(`${activity.date}T${activity.fromTime}:00`);
      return activityDateTime < now;
    });

    // Sort past activities by most recent first
    pastActivitiesFiltered.sort((a, b) => {
      const aDate = new Date(`${a.date}T${a.fromTime}:00`);
      const bDate = new Date(`${b.date}T${b.fromTime}:00`);
      return bDate - aDate; // descending
    });

    // Take only the 5 most recent
    const recent5Activities = pastActivitiesFiltered.slice(0, 5);

    return res.status(200).json({
      upcomingBookingsCount: upcomingBookings.length,
      upcomingBookings,
      pastActivitiesCount: pastActivitiesFiltered.length,
      recentPastActivities: recent5Activities
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});




module.exports = router;
