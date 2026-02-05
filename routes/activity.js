const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');

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

// ------------------------ Existing Routes ------------------------ //
// Host an activity (optional, could keep for backward compatibility)
router.post('/host', async (req, res) => {
  const { hostEmail, city, fromTime, toTime, date, maxPlayers } = req.body;
  const newActivity = await Activity.create({
    hostEmail, city, fromTime, toTime, date, maxPlayers,
    joinedPlayers: [hostEmail],
    pendingRequests: []
  });
  res.json(newActivity);
});

// Get all activities (exclude past and full)
router.get('/all', async (req, res) => {
  try {
    const { email } = req.query;
    const today = new Date().toISOString().split('T')[0];

    const allActivities = await Activity.find({
      date: { $gte: today }
    });

    const filtered = allActivities.filter(act =>
      act.hostEmail !== email &&
      !act.joinedPlayers.includes(email) &&
      !act.pendingRequests.includes(email) &&
      act.joinedPlayers.length < act.maxPlayers
    );

    res.json(filtered);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Request to join activity
router.post('/request', async (req, res) => {
  const { activityId, userEmail } = req.body;
  const activity = await Activity.findById(activityId);
  if (!activity.pendingRequests.includes(userEmail) &&
    !activity.joinedPlayers.includes(userEmail)) {
    activity.pendingRequests.push(userEmail);
    await activity.save();
  }
  res.json({ message: 'Request sent' });
});

// Get host’s hosted activities
router.get('/hosted/:email', async (req, res) => {
  const activities = await Activity.find({ hostEmail: req.params.email });
  res.json(activities);
});

// Approve or reject request
router.post('/respond', async (req, res) => {
  const { activityId, userEmail, action } = req.body;
  const activity = await Activity.findById(activityId);

  if (action === 'approve') {
    if (!activity.joinedPlayers.includes(userEmail) &&
      activity.joinedPlayers.length < activity.maxPlayers) {
      activity.joinedPlayers.push(userEmail);
    }
  }
  activity.pendingRequests = activity.pendingRequests.filter(e => e !== userEmail);
  await activity.save();

  res.json({ message: `User ${action}ed` });
});

// Retire a player
router.post('/retire-player', async (req, res) => {
  const { activityId, userEmail } = req.body;
  const activity = await Activity.findById(activityId);
  activity.joinedPlayers = activity.joinedPlayers.filter(p => p !== userEmail);
  activity.pendingRequests = activity.pendingRequests.filter(p => p !== userEmail);
  await activity.save();

  res.json({ message: 'Player retired from activity' });
});

// Cancel activity
router.delete('/cancel/:id', async (req, res) => {
  await Activity.findByIdAndDelete(req.params.id);
  res.json({ message: 'Activity cancelled' });
});

// Get my pending requests
router.get('/my-requests/:email', async (req, res) => {
  const activities = await Activity.find({ pendingRequests: req.params.email });
  res.json(activities);
});

// Cancel request
router.post('/cancel-request', async (req, res) => {
  const { activityId, userEmail } = req.body;
  const activity = await Activity.findById(activityId);
  if (!activity) return res.status(404).json({ message: 'Activity not found' });

  activity.pendingRequests = activity.pendingRequests.filter(p => p !== userEmail);
  await activity.save();

  res.json({ message: 'Request cancelled' });
});

// Get my activities
router.get('/my-activities/:email', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const activities = await Activity.find({
    joinedPlayers: req.params.email,
    date: { $gte: today }
  });
  res.json(activities);
});

// Retire self from activity
router.post('/retire-self', async (req, res) => {
  const { activityId, userEmail } = req.body;
  const activity = await Activity.findById(activityId);
  if (!activity) return res.status(404).json({ message: 'Activity not found' });

  const activityStart = new Date(`${activity.date}T${activity.fromTime}`);
  const now = new Date();

  if (now >= activityStart) {
    return res.status(400).json({ message: 'Cannot retire after activity start time' });
  }

  activity.joinedPlayers = activity.joinedPlayers.filter(p => p !== userEmail);
  await activity.save();

  res.json({ message: 'You have been retired from this activity' });
});

module.exports = router;
