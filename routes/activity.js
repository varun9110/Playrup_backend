const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Activity = require('../models/Activity');
const Request = require('../models/Request');
const User = require('../models/User');
const ActivityChatMessage = require('../models/ActivityChatMessage');
const { encrypt, decrypt } = require('../utils/helperFunctions');
const { publishSync } = require('../events/eventBus');
const { ACTIVITY_COMPLETED_TOPIC } = require('../events/topics');
const { parseActivityDateTime, buildActivityDateTimes } = require('../utils/activityTime');
const { completeOverdueActivities } = require('../services/activityAutoCompletion');
const { createNotification } = require('../services/notificationService');
const {
  FEEDBACK_SCORE_VALUES,
  FEEDBACK_SKILL_LEVELS,
  recalculateUserFeedbackProfile
} = require('../services/playerFeedback');

const MAX_CHAT_MESSAGE_LENGTH = 1000;
const CHAT_TYPING_TTL_MS = 5000;

const chatImageUploadDir = path.join(__dirname, '..', 'uploads', 'chat-images');
if (!fs.existsSync(chatImageUploadDir)) {
  fs.mkdirSync(chatImageUploadDir, { recursive: true });
}

const chatImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatImageUploadDir),
  filename: (_req, file, cb) => {
    const safeBaseName = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${safeBaseName}${path.extname(file.originalname)}`);
  }
});

const chatImageUpload = multer({
  storage: chatImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image files are allowed'));
  }
});

const typingByActivity = new Map();

const toIdString = (value) => value?.toString?.() || String(value);
const extractIdString = (value) => {
  if (value && typeof value === 'object' && value._id) {
    return toIdString(value._id);
  }
  return toIdString(value);
};

const decryptEncryptedId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.iv && value.content && value.tag) {
    return decrypt(value);
  }
  return null;
};

const getUniqueParticipantIds = (activity) => Array.from(
  new Set([extractIdString(activity.hostId), ...(activity.joinedPlayers || []).map((playerId) => extractIdString(playerId))])
);

const isActivityParticipant = (activity, userId) => {
  const normalizedUserId = toIdString(userId);
  const isHost = extractIdString(activity.hostId) === normalizedUserId;
  const hasJoined = (activity.joinedPlayers || []).some(
    (playerId) => extractIdString(playerId) === normalizedUserId
  );
  return isHost || hasJoined;
};

const buildFeedbackStatusForUser = (activity, currentUserId) => {
  const participantIds = getUniqueParticipantIds(activity).filter(
    (participantId) => participantId !== toIdString(currentUserId)
  );
  const submittedRecipientIds = new Set(
    (activity.playerFeedback || [])
      .filter((entry) => toIdString(entry.raterUserId) === toIdString(currentUserId))
      .map((entry) => toIdString(entry.recipientUserId))
  );

  return {
    canSubmit: activity.status === 'Completed' && participantIds.length > 0,
    totalRecipients: participantIds.length,
    submittedCount: participantIds.filter((participantId) => submittedRecipientIds.has(participantId)).length,
    isComplete: participantIds.length > 0 && participantIds.every((participantId) => submittedRecipientIds.has(participantId))
  };
};

const sanitizeFeedbackEntryForResponse = (entry) => ({
  noShow: Boolean(entry.noShow),
  punctualStatus: entry.noShow ? null : entry.punctualStatus || null,
  teamPlayerScore: entry.noShow ? null : entry.teamPlayerScore ?? null,
  paymentScore: entry.noShow ? null : entry.paymentScore ?? null,
  skillLevel: entry.noShow ? null : entry.skillLevel || null,
  updatedAt: entry.updatedAt || entry.createdAt || null
});

const validateFeedbackPayload = (feedbackItem) => {
  const noShow = Boolean(feedbackItem.noShow);
  const punctualStatus = feedbackItem.punctualStatus || null;
  const teamPlayerScore = feedbackItem.teamPlayerScore ?? null;
  const paymentScore = feedbackItem.paymentScore ?? null;
  const skillLevel = feedbackItem.skillLevel || null;

  if (noShow) {
    if (punctualStatus || teamPlayerScore !== null || paymentScore !== null || skillLevel) {
      return 'No-show feedback cannot include punctuality, team player, payment, or skill level ratings';
    }

    return null;
  }

  if (!['Punctual', 'Late'].includes(punctualStatus)) {
    return 'Punctual status must be either Punctual or Late';
  }

  if (!FEEDBACK_SCORE_VALUES.includes(teamPlayerScore)) {
    return 'Team player rating must be one of -2, -1, 1, or 2';
  }

  if (!FEEDBACK_SCORE_VALUES.includes(paymentScore)) {
    return 'Payment rating must be one of -2, -1, 1, or 2';
  }

  if (!FEEDBACK_SKILL_LEVELS.includes(skillLevel)) {
    return 'Skill level must be Beginner, Amateur, Intermediate, Advanced, or Professional';
  }

  return null;
};

const serializeChatMessage = (chatMessage, currentUserId) => {
  const sender = chatMessage.senderId;
  const senderId = sender && sender._id ? sender._id : sender;

  return {
    _id: chatMessage._id,
    activityId: chatMessage.activityId,
    message: chatMessage.message,
    attachment: chatMessage.attachment || null,
    sender: {
      id: encrypt(toIdString(senderId)),
      name: sender?.name || 'Unknown User'
    },
    createdAt: chatMessage.createdAt,
    updatedAt: chatMessage.updatedAt,
    isOwnMessage: toIdString(senderId) === toIdString(currentUserId),
    isReadByCurrentUser: (chatMessage.readBy || []).some(
      (readerId) => toIdString(readerId) === toIdString(currentUserId)
    )
  };
};

const cleanupTypingState = (activityId) => {
  const now = Date.now();
  const activityTyping = typingByActivity.get(activityId);
  if (!activityTyping) return;

  for (const [key, value] of activityTyping.entries()) {
    if (now - value.updatedAt > CHAT_TYPING_TTL_MS) {
      activityTyping.delete(key);
    }
  }

  if (activityTyping.size === 0) {
    typingByActivity.delete(activityId);
  }
};

const setTypingState = (activityId, userId, userName, isTyping) => {
  const normalizedActivityId = toIdString(activityId);
  const normalizedUserId = toIdString(userId);

  if (!typingByActivity.has(normalizedActivityId)) {
    typingByActivity.set(normalizedActivityId, new Map());
  }

  const activityTyping = typingByActivity.get(normalizedActivityId);
  if (!isTyping) {
    activityTyping.delete(normalizedUserId);
    if (activityTyping.size === 0) {
      typingByActivity.delete(normalizedActivityId);
    }
    return;
  }

  activityTyping.set(normalizedUserId, {
    userId: normalizedUserId,
    userName,
    updatedAt: Date.now()
  });
};

const getTypingParticipants = (activityId, currentUserId) => {
  const normalizedActivityId = toIdString(activityId);
  cleanupTypingState(normalizedActivityId);

  const activityTyping = typingByActivity.get(normalizedActivityId);
  if (!activityTyping) return [];

  return Array.from(activityTyping.values()).filter(
    (typingUser) => typingUser.userId !== toIdString(currentUserId)
  );
};

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

    const { startDateTime, endDateTime } = buildActivityDateTimes(date, fromTime, toTime);
    if (!startDateTime || !endDateTime) {
      return res.status(400).json({ message: 'Invalid activity date/time values' });
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
      date: startDateTime.toISOString().slice(0, 10),
      fromTime: startDateTime.toISOString(),
      toTime: endDateTime.toISOString(),
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
    await completeOverdueActivities();
    const currentUserId = req.user?._id;

    const now = new Date();

    const activeActivities = await Activity.find({
      status: 'Active'
    })
      .populate({
        path: 'hostId',
        select: 'email name phone role isVerified createdAt' // only send what you need
      });

    const activities = activeActivities
      .filter((activity) => {
        const endDateTime = parseActivityDateTime(activity.toTime) || parseActivityDateTime(activity.date, activity.toTime);
        return endDateTime ? endDateTime >= now : false;
      })
      .sort((a, b) => {
        const aStartDateTime = parseActivityDateTime(a.fromTime) || parseActivityDateTime(a.date, a.fromTime);
        const bStartDateTime = parseActivityDateTime(b.fromTime) || parseActivityDateTime(b.date, b.fromTime);

        const aTime = aStartDateTime ? aStartDateTime.getTime() : 0;
        const bTime = bStartDateTime ? bStartDateTime.getTime() : 0;
        return aTime - bTime;
      });

    const activitiesWithEncryptedData = activities.map(activity => {
      const activityObj = activity.toObject();
      const { hostEmail, hostId, ...rest } = activityObj;

      return {
        ...rest,
        feedbackStatus: currentUserId
          ? buildFeedbackStatusForUser(activityObj, currentUserId)
          : {
            canSubmit: false,
            totalRecipients: 0,
            submittedCount: 0,
            isComplete: false
          },
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

    const participantIds = Array.from(new Set((activity.joinedPlayers || []).map((id) => id.toString())));
    const hostIdStr = extractIdString(activity.hostId);
    for (const participantId of participantIds) {
      if (participantId === hostIdStr) continue;
      await createNotification({
        recipientUserId: participantId,
        templateKey: 'activity.cancelled.byHost.forParticipants',
        variables: {
          hostName: req.user?.name || 'Host',
          sport: activity.sport,
          date: activity.date,
          fromTime: activity.fromTime
        },
        metadata: {
          activityId: activity._id
        }
      });
    }

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

// Mark activity as completed and trigger karma distribution via pub/sub
router.post('/completeActivity', async (req, res) => {
  try {
    const { activityId, hostEmail, hostId } = req.body;

    if (!activityId || !hostEmail || !hostId) {
      return res.status(400).json({ message: 'activityId, hostEmail and hostId are required' });
    }

    const userEmailDecrypted = decrypt(hostEmail);
    const userIdDecrypted = decrypt(hostId);

    const activity = await Activity.findOne({
      _id: activityId,
      hostEmail: userEmailDecrypted,
      hostId: userIdDecrypted
    });

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found or you are not the host' });
    }

    if (activity.status === 'Cancelled') {
      return res.status(400).json({ message: 'Cancelled activity cannot be completed' });
    }

    if (activity.status === 'Completed') {
      return res.status(200).json({
        message: 'Activity is already completed',
        activityId: activity._id,
        status: activity.status,
        karmaDistributed: activity.karmaDistributed
      });
    }

    const activityEndDateTime = parseActivityDateTime(activity.toTime) || parseActivityDateTime(activity.date, activity.toTime);
    if (activityEndDateTime && activityEndDateTime > new Date()) {
      return res.status(400).json({ message: 'Activity can only be completed after end time' });
    }

    activity.status = 'Completed';
    activity.completedAt = new Date();
    await activity.save();

    publishSync(ACTIVITY_COMPLETED_TOPIC, {
      activityId: activity._id.toString()
    });

    return res.status(200).json({
      message: 'Activity completed successfully and karma distribution triggered',
      activityId: activity._id,
      status: activity.status
    });
  } catch (error) {
    console.error('Error completing activity:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});


// Request to join an activity
router.post('/requestJoin', async (req, res) => {
  try {
    await completeOverdueActivities();

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

    const requester = await User.findById(userIdDecrypted).select('name');
    await createNotification({
      recipientUserId: activity.hostId,
      templateKey: 'activity.joinRequest.sent.forHost',
      variables: {
        userName: requester?.name || 'A player',
        sport: activity.sport,
        date: activity.date,
        fromTime: activity.fromTime
      },
      metadata: {
        activityId: activity._id,
        requestId: newRequest._id
      }
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
    await completeOverdueActivities();

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
    });

    activities.sort((a, b) => {
      const aStartDateTime = parseActivityDateTime(a.fromTime) || parseActivityDateTime(a.date, a.fromTime);
      const bStartDateTime = parseActivityDateTime(b.fromTime) || parseActivityDateTime(b.date, b.fromTime);

      const aTime = aStartDateTime ? aStartDateTime.getTime() : 0;
      const bTime = bStartDateTime ? bStartDateTime.getTime() : 0;

      return bTime - aTime;
    });

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

router.get('/:activityId/feedback-form', async (req, res) => {
  try {
    const { activityId } = req.params;
    const currentUserId = req.user._id;

    const activity = await Activity.findById(activityId)
      .select('_id sport date fromTime toTime status hostId joinedPlayers playerFeedback');

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, currentUserId)) {
      return res.status(403).json({ message: 'Only activity participants can submit feedback' });
    }

    if (activity.status !== 'Completed') {
      return res.status(400).json({ message: 'Feedback can only be submitted for completed activities' });
    }

    const participantIds = getUniqueParticipantIds(activity);
    const users = await User.find({ _id: { $in: participantIds } })
      .select('name')
      .lean();

    const usersById = new Map(users.map((user) => [toIdString(user._id), user]));
    const existingFeedbackByRecipientId = new Map(
      (activity.playerFeedback || [])
        .filter((entry) => toIdString(entry.raterUserId) === toIdString(currentUserId))
        .map((entry) => [toIdString(entry.recipientUserId), sanitizeFeedbackEntryForResponse(entry)])
    );

    const participants = participantIds
      .filter((participantId) => participantId !== toIdString(currentUserId))
      .map((participantId) => ({
        id: encrypt(participantId),
        name: usersById.get(participantId)?.name || 'Unknown User',
        isHost: participantId === toIdString(activity.hostId),
        existingFeedback: existingFeedbackByRecipientId.get(participantId) || null
      }));

    return res.status(200).json({
      activity: {
        _id: activity._id,
        sport: activity.sport,
        date: activity.date,
        fromTime: activity.fromTime,
        toTime: activity.toTime,
        feedbackStatus: buildFeedbackStatusForUser(activity, currentUserId)
      },
      participants
    });
  } catch (error) {
    console.error('Error fetching feedback form:', error);
    return res.status(500).json({ message: 'Failed to fetch feedback form data' });
  }
});

router.post('/:activityId/feedback', async (req, res) => {
  try {
    const { activityId } = req.params;
    const currentUserId = req.user._id;
    const feedbackItems = Array.isArray(req.body?.feedback) ? req.body.feedback : [];

    if (!feedbackItems.length) {
      return res.status(400).json({ message: 'At least one feedback entry is required' });
    }

    const activity = await Activity.findById(activityId)
      .select('_id status hostId joinedPlayers playerFeedback');

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, currentUserId)) {
      return res.status(403).json({ message: 'Only activity participants can submit feedback' });
    }

    if (activity.status !== 'Completed') {
      return res.status(400).json({ message: 'Feedback can only be submitted for completed activities' });
    }

    const participantIds = new Set(getUniqueParticipantIds(activity));
    const seenRecipientIds = new Set();
    const touchedRecipientIds = new Set();

    for (const feedbackItem of feedbackItems) {
      const recipientUserId = decryptEncryptedId(feedbackItem.recipientId);
      if (!recipientUserId) {
        return res.status(400).json({ message: 'Each feedback entry must include a valid recipientId' });
      }

      if (recipientUserId === toIdString(currentUserId)) {
        return res.status(400).json({ message: 'You cannot submit feedback for yourself' });
      }

      if (!participantIds.has(recipientUserId)) {
        return res.status(400).json({ message: 'Feedback can only be submitted for activity participants' });
      }

      if (seenRecipientIds.has(recipientUserId)) {
        return res.status(400).json({ message: 'Duplicate feedback entries for the same participant are not allowed' });
      }
      seenRecipientIds.add(recipientUserId);

      const validationError = validateFeedbackPayload(feedbackItem);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const normalizedFeedback = {
        recipientUserId,
        raterUserId: currentUserId,
        noShow: Boolean(feedbackItem.noShow),
        punctualStatus: feedbackItem.noShow ? null : feedbackItem.punctualStatus,
        teamPlayerScore: feedbackItem.noShow ? null : feedbackItem.teamPlayerScore,
        paymentScore: feedbackItem.noShow ? null : feedbackItem.paymentScore,
        skillLevel: feedbackItem.noShow ? null : feedbackItem.skillLevel,
        updatedAt: new Date()
      };

      const existingIndex = activity.playerFeedback.findIndex(
        (entry) => toIdString(entry.raterUserId) === toIdString(currentUserId)
          && toIdString(entry.recipientUserId) === recipientUserId
      );

      if (existingIndex >= 0) {
        activity.playerFeedback[existingIndex].noShow = normalizedFeedback.noShow;
        activity.playerFeedback[existingIndex].punctualStatus = normalizedFeedback.punctualStatus;
        activity.playerFeedback[existingIndex].teamPlayerScore = normalizedFeedback.teamPlayerScore;
        activity.playerFeedback[existingIndex].paymentScore = normalizedFeedback.paymentScore;
        activity.playerFeedback[existingIndex].skillLevel = normalizedFeedback.skillLevel;
        activity.playerFeedback[existingIndex].updatedAt = normalizedFeedback.updatedAt;
      } else {
        activity.playerFeedback.push({
          ...normalizedFeedback,
          createdAt: new Date()
        });
      }

      touchedRecipientIds.add(recipientUserId);
    }

    await activity.save();
    await Promise.all(Array.from(touchedRecipientIds).map((recipientId) => recalculateUserFeedbackProfile(recipientId)));

    return res.status(200).json({
      message: 'Feedback submitted successfully',
      feedbackStatus: buildFeedbackStatusForUser(activity, currentUserId)
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return res.status(500).json({ message: 'Failed to submit feedback' });
  }
});

// Get chat participants for an activity
router.get('/chat/:activityId/participants', async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user._id;

    const activity = await Activity.findById(activityId).select('_id hostId joinedPlayers sport date fromTime toTime');
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, userId)) {
      return res.status(403).json({ message: 'Only activity participants can access chat' });
    }

    const uniqueParticipantIds = Array.from(
      new Set([toIdString(activity.hostId), ...(activity.joinedPlayers || []).map((id) => toIdString(id))])
    );

    const participants = await User.find({ _id: { $in: uniqueParticipantIds } })
      .select('name email')
      .lean();

    const participantById = new Map(participants.map((participant) => [toIdString(participant._id), participant]));

    const orderedParticipants = uniqueParticipantIds
      .map((participantId) => {
        const participant = participantById.get(participantId);
        if (!participant) return null;

        return {
          id: encrypt(participantId),
          name: participant.name,
          email: participant.email,
            isHost: participantId === extractIdString(activity.hostId)
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      activity: {
        _id: activity._id,
        sport: activity.sport,
        date: activity.date,
        fromTime: activity.fromTime,
        toTime: activity.toTime
      },
      participants: orderedParticipants
    });
  } catch (error) {
    console.error('Error fetching chat participants:', error);
    return res.status(500).json({ message: 'Failed to fetch chat participants' });
  }
});

// Fetch chat messages for an activity
router.get('/chat/:activityId/messages', async (req, res) => {
  try {
    const { activityId } = req.params;
    const { before, limit = 30 } = req.query;
    const userId = req.user._id;

    const activity = await Activity.findById(activityId).select('_id hostId joinedPlayers');
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, userId)) {
      return res.status(403).json({ message: 'Only activity participants can access chat' });
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    const filter = { activityId };

    if (before) {
      const beforeDate = new Date(before);
      if (Number.isNaN(beforeDate.getTime())) {
        return res.status(400).json({ message: 'Invalid before query param. Expected ISO date string.' });
      }
      filter.createdAt = { $lt: beforeDate };
    }

    const messages = await ActivityChatMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .populate({
        path: 'senderId',
        select: 'name'
      });

    const orderedMessages = messages.reverse();
    const nextCursor = messages.length === parsedLimit ? messages[messages.length - 1].createdAt : null;

    return res.status(200).json({
      messages: orderedMessages.map((message) => serializeChatMessage(message, userId)),
      pagination: {
        limit: parsedLimit,
        nextCursor
      }
    });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return res.status(500).json({ message: 'Failed to fetch chat messages' });
  }
});

// Send a chat message to activity participants
router.post('/chat/:activityId/messages', async (req, res) => {
  try {
    const { activityId } = req.params;
    const { message, attachment } = req.body;
    const userId = req.user._id;

    const activity = await Activity.findById(activityId).select('_id hostId joinedPlayers');
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, userId)) {
      return res.status(403).json({ message: 'Only activity participants can send chat messages' });
    }

    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    const normalizedAttachment = attachment && typeof attachment === 'object' ? {
      url: attachment.url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size
    } : null;

    if (!normalizedMessage && !normalizedAttachment?.url) {
      return res.status(400).json({ message: 'Message or attachment is required' });
    }

    if (normalizedMessage.length > MAX_CHAT_MESSAGE_LENGTH) {
      return res.status(400).json({ message: `Message cannot exceed ${MAX_CHAT_MESSAGE_LENGTH} characters` });
    }

    const newMessage = await ActivityChatMessage.create({
      activityId,
      senderId: userId,
      message: normalizedMessage,
      attachment: normalizedAttachment,
      readBy: [userId]
    });

    const populatedMessage = await ActivityChatMessage.findById(newMessage._id).populate({
      path: 'senderId',
      select: 'name'
    });

    return res.status(201).json({
      message: 'Chat message sent',
      chatMessage: serializeChatMessage(populatedMessage, userId)
    });
  } catch (error) {
    console.error('Error sending chat message:', error);
    return res.status(500).json({ message: 'Failed to send chat message' });
  }
});

// Upload chat image for an activity
router.post('/chat/:activityId/upload-photo', chatImageUpload.single('image'), async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user._id;

    const activity = await Activity.findById(activityId).select('_id hostId joinedPlayers');
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, userId)) {
      return res.status(403).json({ message: 'Only activity participants can upload chat images' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Image file is required' });
    }

    const imagePath = `/uploads/chat-images/${req.file.filename}`;
    return res.status(201).json({
      message: 'Image uploaded successfully',
      attachment: {
        url: imagePath,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error('Error uploading chat image:', error);
    return res.status(500).json({ message: 'Failed to upload image' });
  }
});

// Set typing status for current user in an activity chat
router.post('/chat/:activityId/typing', async (req, res) => {
  try {
    const { activityId } = req.params;
    const { isTyping } = req.body;
    const userId = req.user._id;

    const activity = await Activity.findById(activityId).select('_id hostId joinedPlayers');
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, userId)) {
      return res.status(403).json({ message: 'Only activity participants can update typing status' });
    }

    const typingFlag = Boolean(isTyping);
    setTypingState(activityId, userId, req.user.name, typingFlag);

    return res.status(200).json({
      message: 'Typing status updated',
      isTyping: typingFlag
    });
  } catch (error) {
    console.error('Error updating typing status:', error);
    return res.status(500).json({ message: 'Failed to update typing status' });
  }
});

// Get currently typing participants in an activity chat
router.get('/chat/:activityId/typing', async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user._id;

    const activity = await Activity.findById(activityId).select('_id hostId joinedPlayers');
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, userId)) {
      return res.status(403).json({ message: 'Only activity participants can access typing status' });
    }

    const typingUsers = getTypingParticipants(activityId, userId).map((typingUser) => ({
      id: encrypt(typingUser.userId),
      name: typingUser.userName
    }));

    return res.status(200).json({ typingUsers });
  } catch (error) {
    console.error('Error fetching typing participants:', error);
    return res.status(500).json({ message: 'Failed to fetch typing participants' });
  }
});

// Mark chat messages as read by current user
router.post('/chat/:activityId/read', async (req, res) => {
  try {
    const { activityId } = req.params;
    const { messageIds } = req.body || {};
    const userId = req.user._id;

    const activity = await Activity.findById(activityId).select('_id hostId joinedPlayers');
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, userId)) {
      return res.status(403).json({ message: 'Only activity participants can update read status' });
    }

    const updateFilter = {
      activityId,
      senderId: { $ne: userId },
      readBy: { $ne: userId }
    };

    if (Array.isArray(messageIds) && messageIds.length) {
      updateFilter._id = { $in: messageIds };
    }

    const result = await ActivityChatMessage.updateMany(updateFilter, {
      $addToSet: { readBy: userId }
    });

    return res.status(200).json({
      message: 'Read status updated',
      updatedCount: result.modifiedCount || 0
    });
  } catch (error) {
    console.error('Error updating read status:', error);
    return res.status(500).json({ message: 'Failed to update read status' });
  }
});

// Get unread message count for an activity for current user
router.get('/chat/:activityId/unread-count', async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user._id;

    const activity = await Activity.findById(activityId).select('_id hostId joinedPlayers');
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!isActivityParticipant(activity, userId)) {
      return res.status(403).json({ message: 'Only activity participants can access unread count' });
    }

    const unreadCount = await ActivityChatMessage.countDocuments({
      activityId,
      senderId: { $ne: userId },
      readBy: { $ne: userId }
    });

    return res.status(200).json({ unreadCount });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return res.status(500).json({ message: 'Failed to fetch unread count' });
  }
});

module.exports = router;
