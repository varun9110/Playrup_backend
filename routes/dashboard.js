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

        const encryptedUpcomingBookings = upcomingBookings.map((booking) => {
            const bookingObj = booking.toObject(); // convert mongoose doc → plain object

            return {
                ...bookingObj,
                userEmail: encrypt(bookingObj.userEmail.toString()),
                userId: encrypt(bookingObj.userId.toString())
            };
        });

        // -----------------------------
        // 2️⃣ Past activities user joined
        // -----------------------------
        const pastActivities = await Activity.find({
            joinedPlayers: userIdDecrypted
        });

        const pastActivitiesFiltered = pastActivities.filter((activity) => {
            const baseDate = new Date(activity.date);

            // Convert "6:00 AM" → 24-hour format
            let [time, modifier] = activity.fromTime.split(' ');
            let [hours, minutes] = time.split(':').map(Number);

            if (modifier === 'PM' && hours !== 12) {
                hours += 12;
            }
            if (modifier === 'AM' && hours === 12) {
                hours = 0;
            }

            // Set correct hours & minutes on base date
            baseDate.setUTCHours(hours);
            baseDate.setUTCMinutes(minutes);
            baseDate.setUTCSeconds(0);

            return baseDate < now;
        });

        // Sort past activities by most recent first
        pastActivitiesFiltered.sort((a, b) => {
            const aDate = new Date(`${a.date}T${a.fromTime}:00`);
            const bDate = new Date(`${b.date}T${b.fromTime}:00`);
            return bDate - aDate; // descending
        });

        const recent5Activities = pastActivitiesFiltered.slice(0, 5);

        const encryptedRecentPastActivities = recent5Activities.map(activity => {
            const obj = activity.toObject(); // convert mongoose doc → plain object

            // Encrypt scalar fields
            obj.hostEmail = encrypt(obj.hostEmail.toString());
            obj.hostId = encrypt(obj.hostId.toString());

            // Encrypt joinedPlayers array
            obj.joinedPlayers = obj.joinedPlayers.map(playerId =>
                encrypt(playerId.toString())
            );

            return obj;
        });

        // -----------------------------
        // 3️⃣ Past activities where user was the host
        // -----------------------------
        const pastHostedActivitiesCount = pastActivitiesFiltered.filter(activity => {
            return activity.hostId.toString() === userIdDecrypted;
        }).length;

        // -----------------------------
        // 4️⃣ Return the response
        // -----------------------------
        return res.status(200).json({
            upcomingBookingsCount: encryptedUpcomingBookings.length,
            upcomingBookings: encryptedUpcomingBookings,
            pastActivitiesCount: pastActivitiesFiltered.length,
            recentPastActivities: encryptedRecentPastActivities,
            pastHostedActivitiesCount
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return res.status(500).json({
            message: 'Internal server error'
        });
    }
});


module.exports = router;
