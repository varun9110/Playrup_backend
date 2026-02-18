const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const ActivityRequest = require('../models/Request');
const User = require('../models/User');

const { encrypt, decrypt } = require('../utils/helperFunctions');
const e = require('express');

/**
 * 1️⃣ Get activities I HOST that have PENDING join requests
 * Email comes from request body
 */
router.post('/hosted/pending-requests', async (req, res) => {
  try {
    const { userEmail, userId } = req.body;

    if (!userEmail || !userId) {
      return res.status(400).json({ message: 'Email and userId are required' });
    }

    const userEmailDecrypted = decrypt(userEmail);
    const userIdDecrypted = decrypt(userId);

    // Get hosted activities
    const hostedActivities = await Activity.find({
      hostEmail: userEmailDecrypted,
      hostId: userIdDecrypted
    }).select('_id');

    const activityIds = hostedActivities.map(a => a._id);

    // Get pending requests for these activities
    const pendingRequests = await ActivityRequest.find({
      activityId: { $in: activityIds },
      status: 'Pending'
    })
      .populate('activityId')
      .populate({
        path: 'userId',
        select: 'email name phone role isVerified createdAt'
      })
      .sort({ createdAt: -1 });

    // Map and encrypt sensitive fields
    const encryptedRequests = pendingRequests.map(request => {
      const activity = request.activityId.toObject();
      const user = request.userId.toObject();

      return {
        ...request.toObject(), // include all root fields (status, timestamps, etc.)
        activityId: {
          ...activity,
          hostEmail: encrypt(activity.hostEmail),
          hostId: encrypt(activity.hostId.toString()),
          joinedPlayers: activity.joinedPlayers.map(id => encrypt(id.toString())),
          pendingRequests: activity.pendingRequests.map(id => encrypt(id.toString())),
        },
        userId: {
          ...user,
          _id: encrypt(user._id.toString()),
          email: encrypt(user.email),
          phone: encrypt(user.phone),
        },
        userEmail: undefined, // drop userEmail from root
      };
    });

    res.status(200).json({
      count: encryptedRequests.length,
      requests: encryptedRequests
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
    const { userEmail, userId } = req.body;

    const userEmailDecrypted = decrypt(userEmail);
    const userIdDecrypted = decrypt(userId);

    if (!userEmailDecrypted || !userIdDecrypted) {
      return res.status(400).json({ message: 'Email and userId are required' });
    }

    // Fetch requests made by this user
    const myRequests = await ActivityRequest.find({
      userId: userIdDecrypted
    })
      .populate('activityId')
      .populate({
        path: 'userId',
        select: 'email name phone role isVerified createdAt'
      })
      .sort({ createdAt: -1 });

    // Map and encrypt sensitive fields
    const encryptedRequests = await Promise.all(
      myRequests.map(async request => {
        const activity = request.activityId.toObject();
        const user = request.userId.toObject();

        // Fetch host details from User model
        const host = await User.findById(activity.hostId).select('email name phone role isVerified createdAt');

        return {
          ...request.toObject(),
          activityId: {
            ...activity,
            hostEmail: encrypt(activity.hostEmail),
            hostId: encrypt(activity.hostId.toString()),
            joinedPlayers: activity.joinedPlayers.map(id => encrypt(id.toString())),
            pendingRequests: activity.pendingRequests.map(id => encrypt(id.toString())),
          },
          userId: {
            ...user,
            _id: encrypt(user._id.toString()),
            email: encrypt(user.email),
            phone: encrypt(user.phone),
          },
          hostDetails: host
            ? {
              _id: encrypt(host._id.toString()),
              email: encrypt(host.email),
              name: host.name,
              phone: encrypt(host.phone),
              role: host.role,
              isVerified: host.isVerified,
              createdAt: host.createdAt,
            }
            : null,
          userEmail: undefined, // drop root userEmail
        };
      })
    );

    res.status(200).json({
      count: encryptedRequests.length,
      requests: encryptedRequests
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
    const { requestId, activityId, userId } = req.body;

    if (!requestId || !activityId || !userId) {
      return res.status(400).json({
        message: 'requestId, activityId and userId are required'
      });
    }

    const userIdDecrypted = decrypt(userId);

    // Find activity
    const activity = await Activity.findById(activityId);

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    // Check if already joined
    if (activity.joinedPlayers.includes(userIdDecrypted)) {
      return res.status(400).json({
        message: 'User already joined this activity'
      });
    }

    // Check if activity is full
    if (activity.joinedPlayers.length >= activity.maxPlayers) {
      return res.status(400).json({
        message: 'Activity is already full'
      });
    }

    // Find the request
    const request = await ActivityRequest.findOne({
      _id: requestId,
      status: 'Pending'
    }).populate('userId', 'email name phone role isVerified');

    if (!request) {
      return res.status(404).json({
        message: 'Pending request not found'
      });
    }

    // Update activity document
    activity.joinedPlayers.push(userIdDecrypted);
    activity.pendingRequests = activity.pendingRequests.filter(
      id => id.toString() !== userIdDecrypted.toString()
    );
    await activity.save();

    // Update request status
    request.status = 'Accepted';
    request.respondedAt = new Date();
    await request.save();

    // Encrypt sensitive fields in response
    const encryptedActivity = {
      ...activity.toObject(),
      hostEmail: encrypt(activity.hostEmail),
      hostId: encrypt(activity.hostId.toString()),
      joinedPlayers: activity.joinedPlayers.map(id => encrypt(id.toString())),
      pendingRequests: activity.pendingRequests.map(id => encrypt(id.toString())),
    };

    const encryptedRequest = {
      ...request.toObject(),
      userEmail: encrypt(request.userEmail),
      userId: {
        ...request.userId.toObject(),
        _id: encrypt(request.userId._id.toString()),
        email: encrypt(request.userId.email),
        phone: encrypt(request.userId.phone),
      }
    };

    res.status(200).json({
      message: 'Request approved successfully',
      activity: encryptedActivity,
      request: encryptedRequest
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
    const { requestId, activityId, userId } = req.body;

    if (!requestId || !activityId || !userId) {
      return res.status(400).json({
        message: 'requestId, activityId and userId are required'
      });
    }

    const userIdDecrypted = decrypt(userId);

    // Find activity
    const activity = await Activity.findById(activityId);

    if (!activity) {
      return res.status(404).json({
        message: 'Activity not found'
      });
    }

    // Find the pending request
    const request = await ActivityRequest.findOne({
      _id: requestId,
      status: 'Pending'
    }).populate('userId', 'email name phone role isVerified');

    if (!request) {
      return res.status(404).json({
        message: 'Pending request not found'
      });
    }

    // Remove user from pendingRequests array (if using it)
    activity.pendingRequests = activity.pendingRequests.filter(
      id => id.toString() !== userIdDecrypted.toString()
    );

    await activity.save();

    //Update request document
    request.status = 'Rejected';
    request.respondedAt = new Date();
    await request.save();

    // Encrypt sensitive fields in response
    const encryptedActivity = {
      ...activity.toObject(),
      hostEmail: encrypt(activity.hostEmail),
      hostId: encrypt(activity.hostId.toString()),
      joinedPlayers: activity.joinedPlayers.map(id => encrypt(id.toString())),
      pendingRequests: activity.pendingRequests.map(id => encrypt(id.toString())),
    };

    const encryptedRequest = {
      ...request.toObject(),
      userEmail: encrypt(request.userEmail),
      userId: {
        ...request.userId.toObject(),
        _id: encrypt(request.userId._id.toString()),
        email: encrypt(request.userId.email),
        phone: encrypt(request.userId.phone),
      }
    };

    res.status(200).json({
      message: 'Request rejected successfully',
      activity: encryptedActivity,
      request: encryptedRequest
    });

  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


/**
 * 5️⃣ Withdraw a join request
 * Removes user from pendingRequests OR joinedPlayers
 * Updates Request status to "Withdrawn"
 */
router.post('/withdraw-request', async (req, res) => {
  try {
    const { requestId, activityId, userId } = req.body;

    if (!requestId || !activityId || !userId) {
      return res.status(400).json({
        message: 'requestId, activityId and userId are required'
      });
    }

    const userIdDecrypted = decrypt(userId);

    // Find the request document
    const request = await ActivityRequest.findOne({
      _id: requestId,
      status: { $in: ['Pending', 'Approved'] }
    }).populate('userId', 'email name phone role isVerified');


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
        id => id.toString() !== userIdDecrypted.toString()
      );
    }

    // If request was Approved → remove from joinedPlayers
    if (request.status === 'Approved') {
      activity.joinedPlayers = activity.joinedPlayers.filter(
        id => id.toString() !== userIdDecrypted.toString()
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
