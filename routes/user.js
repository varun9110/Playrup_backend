const express = require('express');
const router = express.Router();
const Academy = require('../models/Academy'); 
const User = require('../models/User');


const { encrypt, decrypt } = require('../utils/helperFunctions');
const { createEmptyFeedbackProfile } = require('../services/playerFeedback');

router.get('/profile-summary', async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('name email phone createdAt feedbackProfile karmaPoints role')
            .lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json({
            user: {
                id: encrypt(user._id.toString()),
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                joinedOn: user.createdAt,
                karmaPoints: user.karmaPoints,
                feedbackProfile: user.feedbackProfile || createEmptyFeedbackProfile()
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/sports/unique
router.post('/all-sports', async (req, res) => {
    try {

        const { userEmail, userId } = req.body;

        if (!userId || !userEmail) {
            return res.status(400).json({
                message: 'userId and userEmail are required'
            });
        }

        const userEmailDecrypted = decrypt(userEmail);
        const userIdDecrypted = decrypt(userId);



        const uniqueSports = await Academy.aggregate([
            { $unwind: "$sports" },                  // Flatten the sports array
            { $group: { _id: "$sports.sportName" } }, // Group by sportName
            { $sort: { _id: 1 } },                   // Optional: sort alphabetically
            { $project: { _id: 0, sportName: "$_id" } } // Return clean object
        ]);

        res.json({ sports: uniqueSports.map(s => s.sportName) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;