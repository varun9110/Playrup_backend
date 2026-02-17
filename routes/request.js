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

/**
 * 3️⃣ Approve Join Request
 * Moves user from pendingRequests → joinedPlayers
 * Updates request status to Accepted
 */
router.post('/approve-request', async (req, res) => {
  try {
    const { requestId, activityId, userEmail } = req.body;

    if (!requestId || !activityId || !userEmail) {
      return res.status(400).json({
        message: 'requestId, activityId and userEmail are required'
      });
    }

    // 1️⃣ Find activity
    const activity = await Activity.findById(activityId);

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    // 2️⃣ Check if already joined
    if (activity.joinedPlayers.includes(userEmail)) {
      return res.status(400).json({
        message: 'User already joined this activity'
      });
    }

    // 3️⃣ Check if activity is full
    if (activity.joinedPlayers.length >= activity.maxPlayers) {
      return res.status(400).json({
        message: 'Activity is already full'
      });
    }

    // 4️⃣ Find the request
    const request = await ActivityRequest.findOne({
      _id: requestId,
      status: 'Pending'
    });

    if (!request) {
      return res.status(404).json({
        message: 'Pending request not found'
      });
    }

    // 5️⃣ Update activity document
    activity.joinedPlayers.push(userEmail);

    // Remove from pendingRequests array (if you are using it)
    activity.pendingRequests = activity.pendingRequests.filter(
      email => email !== userEmail
    );

    await activity.save();

    // 6️⃣ Update request status
    request.status = 'Accepted';
    request.respondedAt = new Date();
    await request.save();

    res.status(200).json({
      message: 'Request approved successfully',
      activity,
      request
    });

  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * 4️⃣ Reject Join Request
 * Removes user from pendingRequests
 * Updates request status to Rejected
 */
router.post('/reject-request', async (req, res) => {
  try {
    const { requestId, activityId, userEmail } = req.body;

    if (!requestId || !activityId || !userEmail) {
      return res.status(400).json({
        message: 'requestId, activityId and userEmail are required'
      });
    }

    // 1️⃣ Find activity
    const activity = await Activity.findById(activityId);

    if (!activity) {
      return res.status(404).json({
        message: 'Activity not found'
      });
    }

    // 2️⃣ Find the pending request
    const request = await ActivityRequest.findOne({
      _id: requestId,
      status: 'Pending'
    });

    if (!request) {
      return res.status(404).json({
        message: 'Pending request not found'
      });
    }

    // 3️⃣ Remove user from pendingRequests array (if using it)
    activity.pendingRequests = activity.pendingRequests.filter(
      email => email !== userEmail
    );

    await activity.save();

    // 4️⃣ Update request document
    request.status = 'Rejected';
    request.respondedAt = new Date();
    await request.save();

    res.status(200).json({
      message: 'Request rejected successfully',
      activity,
      request
    });

  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


/**
 * 4️⃣ Withdraw a join request
 * Removes user from pendingRequests OR joinedPlayers
 * Updates Request status to "Withdrawn"
 */
router.post('/withdraw-request', async (req, res) => {
  try {
    const { requestId, activityId, userEmail } = req.body;

    if (!requestId || !activityId || !userEmail) {
      return res.status(400).json({
        message: 'requestId, activityId and userEmail are required'
      });
    }

    // Find the request document
    const request = await ActivityRequest.findOne({
      _id: requestId,
      status: { $in: ['Pending', 'Approved'] }
    });


    if (!request) {
      return res.status(404).json({
        message: 'Request not found'
      });
    }

    // Find the activity
    const activity = await Activity.findById(activityId);

    if (!activity) {
      return res.status(404).json({
        message: 'Activity not found'
      });
    }

    // If request was Pending → remove from pendingRequests
    if (request.status === 'Pending') {
      activity.pendingRequests = activity.pendingRequests.filter(
        user => user !== userEmail
      );
    }

    // If request was Approved → remove from joinedPlayers
    if (request.status === 'Approved') {
      activity.joinedPlayers = activity.joinedPlayers.filter(
        user => user !== userEmail
      );
    }

    // Update request status
    request.status = 'Withdrawn';

    await activity.save();
    await request.save();

    res.status(200).json({
      message: 'Request withdrawn successfully'
    });

  } catch (error) {
    console.error('Error withdrawing request:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});



module.exports = router;
