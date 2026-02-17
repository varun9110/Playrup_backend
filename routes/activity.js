const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const Request = require('../models/Request');
const { encrypt, decrypt } = require('../utils/helperFunctions');


// Create Activity with extended fields
router.post('/createActivity', async (req, res) => {
  try {
    const {
      hostEmail,
      hostId,
      city,
      location,
      sport,
      academyId,
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

    const userEmailDecrypted = decrypt(hostEmail);
    const userIdDecrypted = decrypt(hostId);

    if (!hostEmail || !hostId || !sport || !date || !fromTime || !toTime || !maxPlayers) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newActivity = await Activity.create({
      hostEmail: userEmailDecrypted,
      hostId: userIdDecrypted,
      city,
      location,
      sport,
      academyId,
      academy,
      address,
      date,
      fromTime,
      toTime,
      courtNumber,
      skillLevel,
      maxPlayers,
      pricePerParticipant: pricePerParticipant || 0,
      joinedPlayers: [userIdDecrypted],
      pendingRequests: []
    });

    res.json({ success: true, message: 'Activity created successfully', activity: newActivity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to create activity' });
  }
});

// Get all future Active activities
router.get('/allActivities', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const activities = await Activity.find({
      date: { $gte: today },
      status: 'Active'
    })
      .populate({
        path: 'hostId',
        select: 'email name phone role isVerified createdAt' // only send what you need
      })
      .sort({ date: 1, fromTime: 1 });

    const activitiesWithEncryptedData = activities.map(activity => {
      const activityObj = activity.toObject();
      const { hostEmail, hostId, ...rest } = activityObj;

      return {
        ...rest,
        // Encrypt activity-level sensitive fields
        joinedPlayers: activityObj.joinedPlayers.map(id =>
          encrypt(id.toString())
        ),
        pendingRequests: activityObj.pendingRequests.map(id =>
          encrypt(id.toString())
        ),

        // 🔥 Send Host Details
        host: {
          id: encrypt(activityObj.hostId._id.toString()),
          email: encrypt(activityObj.hostId.email),
          phone: encrypt(activityObj.hostId.phone),
          role: activityObj.hostId.role,
          isVerified: activityObj.hostId.isVerified,
          joinedOn: activityObj.hostId.createdAt,
          name: activityObj.hostId.name
        }
      };
    });

    res.json(activitiesWithEncryptedData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});




// Soft delete / cancel user's activity
router.post('/cancelActivity', async (req, res) => {
  try {
    const { activityId, hostEmail, hostId } = req.body;

    const userEmailDecrypted = decrypt(hostEmail);
    const userIdDecrypted = decrypt(hostId);

    // Find the activity by ID and host email
    const activity = await Activity.findOne({ _id: activityId, hostEmail: userEmailDecrypted, hostId: userIdDecrypted }).populate({
      path: 'hostId',
      select: 'email name phone role isVerified createdAt' // only send what you need
    });

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found or you are not the host' });
    }

    if (activity.status === 'Cancelled') {
      return res.status(400).json({ message: 'Activity is already cancelled' });
    }

    // Soft delete
    activity.status = 'Cancelled';
    await activity.save();

    const activityObj = activity.toObject();
    const { hostEmail: _, hostId: __, ...cleanedActivity } = activityObj;

    const cleanedActivityWithEncryptedFields = {
      ...cleanedActivity,
      // Encrypt activity-level sensitive fields
      joinedPlayers: activityObj.joinedPlayers.map(id =>
        encrypt(id.toString())
      ),
      pendingRequests: activityObj.pendingRequests.map(id =>
        encrypt(id.toString())
      ),

      // 🔥 Send Host Details
      host: {
        id: encrypt(activityObj.hostId._id.toString()),
        email: encrypt(activityObj.hostId.email),
        phone: encrypt(activityObj.hostId.phone),
        role: activityObj.hostId.role,
        isVerified: activityObj.hostId.isVerified,
        joinedOn: activityObj.hostId.createdAt,
        name: activityObj.hostId.name
      }
    };



    res.json({ message: 'Activity cancelled successfully', activity: cleanedActivityWithEncryptedFields });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Request to join an activity
router.post('/requestJoin', async (req, res) => {
  try {
    const { activityId, userEmail, userId } = req.body;

    const userEmailDecrypted = decrypt(userEmail);
    const userIdDecrypted = decrypt(userId);

    if (!activityId || !userEmailDecrypted || !userIdDecrypted) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const activity = await Activity.findById(activityId);
    if (!activity || activity.status !== 'Active') {
      return res.status(404).json({ message: 'Activity not found or not active' });
    }


    if (activity.joinedPlayers.includes(userIdDecrypted)) {
      return res.status(400).json({ message: 'You are already part of this activity' });
    }

    if (activity.pendingRequests.includes(userIdDecrypted)) {
      return res.status(400).json({ message: 'You have already requested to join' });
    }

    // Add user to pending requests in Activity
    activity.pendingRequests.push(userIdDecrypted);
    await activity.save();

    // Create a new request in Request for history
    const newRequest = await Request.create({
      activityId,
      userEmail: userEmailDecrypted,
      userId: userIdDecrypted,
      status: 'Pending'
    });

    const newRequestPayload = {
      ...newRequest._doc,
      userEmail: encrypt(newRequest.userEmail.toString()),
      userId: encrypt(newRequest.userId.toString())
    };

    res.json({ message: 'Join request sent successfully', request: newRequestPayload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


// POST endpoint to get user activities
router.post('/userActivities', async (req, res) => {
  try {
    const { userEmail, userId } = req.body;

    const userEmailDecrypted = decrypt(userEmail);
    const userIdDecrypted = decrypt(userId);

    if (!userEmailDecrypted || !userIdDecrypted) {
      return res.status(400).json({ message: 'User email and userId are required in the body' });
    }

    // Fetch all activities where the user is in joinedPlayers
    const activities = await Activity.find({ joinedPlayers: userIdDecrypted })
    .populate({
      path: 'hostId',
      select: 'email name phone role isVerified createdAt' // only send what you need
    })
    .sort({ date: 1, fromTime: 1 });

    const activitiesWithEncryptedData = activities.map(activity => {
      const activityObj = activity.toObject();
      const { hostEmail, hostId, ...rest } = activityObj;

      return {
        ...rest,
        // Encrypt activity-level sensitive fields
        joinedPlayers: activityObj.joinedPlayers.map(id =>
          encrypt(id.toString())
        ),
        pendingRequests: activityObj.pendingRequests.map(id =>
          encrypt(id.toString())
        ),

        // 🔥 Send Host Details
        host: {
          id: encrypt(activityObj.hostId._id.toString()),
          email: encrypt(activityObj.hostId.email),
          phone: encrypt(activityObj.hostId.phone),
          role: activityObj.hostId.role,
          isVerified: activityObj.hostId.isVerified,
          joinedOn: activityObj.hostId.createdAt,
          name: activityObj.hostId.name
        }
      };
    });

    res.status(200).json({ activitiesWithEncryptedData });
  } catch (error) {
    console.error('Error fetching user activities:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Fetch activity by ID
// router.get('/:activityId', async (req, res) => {
//   try {
//     const { activityId } = req.params;

//     const activity = await Activity.findById(activityId);

//     if (!activity) {
//       return res.status(404).json({
//         message: 'Activity not found'
//       });
//     }

//     res.status(200).json({ activity });
//   } catch (error) {
//     console.error('Error fetching activity:', error);

//     res.status(500).json({
//       message: 'Failed to fetch activity',
//       error: error.message
//     });
//   }
// });

// // Update Activity
// router.put('/updateActivity/:activityId', async (req, res) => {
//   try {
//     const { activityId } = req.params;
//     const updateData = {};

//     // List of allowed fields to update
//     const allowedFields = [
//       'city',
//       'location',
//       'sport',
//       'academy',
//       'address',
//       'date',
//       'fromTime',
//       'toTime',
//       'courtNumber',
//       'skillLevel',
//       'maxPlayers',
//       'pricePerParticipant'
//     ];

//     // Only include fields that are present in req.body
//     allowedFields.forEach(field => {
//       if (req.body[field] !== undefined) {
//         updateData[field] = req.body[field];
//       }
//     });

//     const activity = await Activity.findById(activityId);
//     if (!activity) {
//       return res.status(404).json({ success: false, message: 'Activity not found' });
//     }

//     // Update fields
//     Object.assign(activity, updateData);
//     await activity.save();

//     res.json({ success: true, message: 'Activity updated successfully', activity });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ success: false, message: 'Failed to update activity' });
//   }
// });


module.exports = router;
