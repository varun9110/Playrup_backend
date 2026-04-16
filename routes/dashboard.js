const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Academy = require('../models/Academy');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { completeOverdueActivities } = require('../services/activityAutoCompletion');
const { parseActivityDateTime } = require('../utils/activityTime');

const { encrypt, decrypt } = require('../utils/helperFunctions');
const e = require('express');

router.post('/dashboard-data', async (req, res) => {
    try {
        await completeOverdueActivities();

        const { userEmail, userId } = req.body;

        if (!userId || !userEmail) {
            return res.status(400).json({
                message: 'userId and userEmail are required'
            });
        }

        const userEmailDecrypted = decrypt(userEmail);
        const userIdDecrypted = decrypt(userId);

        const now = new Date();
        const userRecord = await User.findById(userIdDecrypted).select('karmaPoints');

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
            const activityEndDateTime = parseActivityDateTime(activity.date, activity.toTime || activity.fromTime);
            return activityEndDateTime ? activityEndDateTime < now : false;
        });

        // Sort past activities by most recent first
        pastActivitiesFiltered.sort((a, b) => {
            const aDate = parseActivityDateTime(a.date, a.toTime || a.fromTime);
            const bDate = parseActivityDateTime(b.date, b.toTime || b.fromTime);

            const aTime = aDate ? aDate.getTime() : 0;
            const bTime = bDate ? bDate.getTime() : 0;

            return bTime - aTime; // descending
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
            pastHostedActivitiesCount,
            totalKarmaPoints: userRecord?.karmaPoints || 0
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return res.status(500).json({
            message: 'Internal server error'
        });
    }
});


module.exports = router;
