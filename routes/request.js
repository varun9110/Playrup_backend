const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const ActivityRequest = require('../models/Request');

/**
 * 1️⃣ Get activities I HOST that have PENDING join requests
 * Email comes from request body
 */
router.post('/hosted/pending-requests', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find activities hosted by this user
    const hostedActivities = await Activity.find({ hostEmail: email }).select('_id');

    const activityIds = hostedActivities.map(a => a._id);

    // Find pending requests for those activities
    const pendingRequests = await ActivityRequest.find({
      activityId: { $in: activityIds },
      status: 'Pending'
    })
      .populate('activityId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: pendingRequests.length,
      requests: pendingRequests
    });
  } catch (error) {
    console.error('Error fetching hosted pending requests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * 2️⃣ Get activities where I HAVE SENT join requests
 * Email comes from request body
 */
router.post('/my-requests', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const myRequests = await ActivityRequest.find({
      userEmail: email
    })
      .populate('activityId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: myRequests.length,
      requests: myRequests
    });
  } catch (error) {
    console.error('Error fetching my activity requests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
