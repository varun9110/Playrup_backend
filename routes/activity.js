const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const Request = require('../models/Request');


// Create Activity with extended fields
router.post('/createActivity', async (req, res) => {
  try {
    const {
      hostEmail,
      city,
      location,
      sport,
      academy,
      address,
      date,
      fromTime,
      toTime,
      courtNumber,
      skillLevel,
      maxPlayers,
      pricePerParticipant
    } = req.body;

    if (!hostEmail || !sport || !date || !fromTime || !toTime || !maxPlayers) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newActivity = await Activity.create({
      hostEmail,
      city,
      location,
      sport,
      academy,
      address,
      date,
      fromTime,
      toTime,
      courtNumber,
      skillLevel,
      maxPlayers,
      pricePerParticipant: pricePerParticipant || 0,
      joinedPlayers: [hostEmail],
      pendingRequests: []
    });

    res.json({ success: true, message: 'Activity created successfully', activity: newActivity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to create activity' });
  }
});


// Update Activity
router.put('/updateActivity/:activityId', async (req, res) => {
  try {
    const { activityId } = req.params;
    const updateData = {};

    // List of allowed fields to update
    const allowedFields = [
      'city',
      'location',
      'sport',
      'academy',
      'address',
      'date',
      'fromTime',
      'toTime',
      'courtNumber',
      'skillLevel',
      'maxPlayers',
      'pricePerParticipant'
    ];

    // Only include fields that are present in req.body
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }

    // Update fields
    Object.assign(activity, updateData);
    await activity.save();

    res.json({ success: true, message: 'Activity updated successfully', activity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to update activity' });
  }
});



// Get all future Active activities
router.get('/allActivities', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const activities = await Activity.find({
      date: { $gte: today },
      status: 'Active'
    }).sort({ date: 1, fromTime: 1 }); // optional but recommended

    res.json(activities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Soft delete / cancel user's activity
router.post('/cancelActivity', async (req, res) => {
  try {
    const { activityId, hostEmail } = req.body;

    // Find the activity by ID and host email
    const activity = await Activity.findOne({ _id: activityId, hostEmail });

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found or you are not the host' });
    }

    if (activity.status === 'Cancelled') {
      return res.status(400).json({ message: 'Activity is already cancelled' });
    }

    // Soft delete
    activity.status = 'Cancelled';
    await activity.save();

    res.json({ message: 'Activity cancelled successfully', activity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Request to join an activity
router.post('/requestJoin', async (req, res) => {
  try {
    const { activityId, userEmail } = req.body;

    if (!activityId || !userEmail) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const activity = await Activity.findById(activityId);
    if (!activity || activity.status !== 'Active') {
      return res.status(404).json({ message: 'Activity not found or not active' });
    }

    if (activity.joinedPlayers.includes(userEmail)) {
      return res.status(400).json({ message: 'You are already part of this activity' });
    }

    if (activity.pendingRequests.includes(userEmail)) {
      return res.status(400).json({ message: 'You have already requested to join' });
    }

    // Add user to pending requests in Activity
    activity.pendingRequests.push(userEmail);
    await activity.save();

    // Create a new request in Request for history
    const newRequest = await Request.create({
      activityId,
      userEmail,
      status: 'Pending'
    });

    res.json({ message: 'Join request sent successfully', request: newRequest });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
