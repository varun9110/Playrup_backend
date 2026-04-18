const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Academy = require('../models/Academy');
const Activity = require('../models/Activity');
const DropIn = require('../models/DropIn');
const Coaching = require('../models/Coaching');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { completeOverdueActivities } = require('../services/activityAutoCompletion');
const { parseActivityDateTime } = require('../utils/activityTime');

const { encrypt, decrypt } = require('../utils/helperFunctions');

const toDateKey = (date = new Date()) => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

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

router.get('/admin-overview', async (req, res) => {
    try {
        if (req.user?.role !== 'superadmin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const todayKey = toDateKey();
        const sevenDaysLaterKey = toDateKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalAcademies,
            totalPlayers,
            totalAcademyManagers,
            totalSportsRaw,
            totalCitiesRaw,
            confirmedBookingsToday,
            confirmedBookingsNext7Days,
            activeDropInsNext7Days,
            activeCoachingNext7Days,
            totalNotifications,
            unreadNotifications,
            academiesCreatedLast30Days,
            recentAcademiesRaw,
            topCitiesRaw,
            busiestSportsRaw
        ] = await Promise.all([
            Academy.countDocuments(),
            User.countDocuments({ role: 'user' }),
            User.countDocuments({ role: 'academy' }),
            Academy.distinct('sports.sportName'),
            Academy.distinct('city'),
            Booking.countDocuments({
                status: 'Confirmed',
                date: todayKey
            }),
            Booking.countDocuments({
                status: 'Confirmed',
                date: { $gte: todayKey, $lte: sevenDaysLaterKey }
            }),
            DropIn.countDocuments({
                status: 'Active',
                date: { $gte: todayKey, $lte: sevenDaysLaterKey }
            }),
            Coaching.countDocuments({
                status: 'Active',
                date: { $gte: todayKey, $lte: sevenDaysLaterKey }
            }),
            Notification.countDocuments(),
            Notification.countDocuments({ readAt: null }),
            Academy.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
            Academy.find({})
                .sort({ createdAt: -1 })
                .limit(8)
                .select('name city sports createdAt updatedAt')
                .lean(),
            Academy.aggregate([
                {
                    $group: {
                        _id: '$city',
                        academyCount: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        city: { $ifNull: ['$_id', 'Unknown'] },
                        academyCount: 1
                    }
                },
                { $sort: { academyCount: -1 } },
                { $limit: 5 }
            ]),
            Academy.aggregate([
                { $unwind: '$sports' },
                {
                    $group: {
                        _id: '$sports.sportName',
                        academyCount: { $sum: 1 },
                        courtCount: { $sum: { $ifNull: ['$sports.numberOfCourts', 0] } }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        sportName: '$_id',
                        academyCount: 1,
                        courtCount: 1
                    }
                },
                { $sort: { academyCount: -1, courtCount: -1 } },
                { $limit: 6 }
            ])
        ]);

        const totalSports = Array.isArray(totalSportsRaw)
            ? totalSportsRaw.filter((sport) => String(sport || '').trim()).length
            : 0;
        const totalCities = Array.isArray(totalCitiesRaw)
            ? totalCitiesRaw.filter((city) => String(city || '').trim()).length
            : 0;

        const recentAcademies = (recentAcademiesRaw || []).map((academy) => ({
            _id: academy._id,
            name: academy.name,
            city: academy.city || '',
            sportsCount: Array.isArray(academy.sports) ? academy.sports.length : 0,
            createdAt: academy.createdAt,
            updatedAt: academy.updatedAt
        }));

        return res.status(200).json({
            metrics: {
                totalAcademies,
                totalPlayers,
                totalAcademyManagers,
                totalSports,
                totalCities,
                confirmedBookingsToday,
                confirmedBookingsNext7Days,
                activeDropInsNext7Days,
                activeCoachingNext7Days,
                totalNotifications,
                unreadNotifications,
                academiesCreatedLast30Days
            },
            recentAcademies,
            topCities: topCitiesRaw || [],
            busiestSports: busiestSportsRaw || []
        });
    } catch (error) {
        console.error('Error fetching superadmin overview:', error);
        return res.status(500).json({
            message: 'Internal server error'
        });
    }
});


module.exports = router;
