const Activity = require('../models/Activity');
const User = require('../models/User');
const { subscribe } = require('./eventBus');
const { ACTIVITY_COMPLETED_TOPIC } = require('./topics');
const { createNotification } = require('../services/notificationService');

const HOST_KARMA_POINTS = 5;
const PARTICIPANT_KARMA_POINTS = 3;

let initialized = false;

const distributeKarmaOnActivityCompletion = async (_topic, payload) => {
  try {
    const activityId = payload?.activityId;
    if (!activityId) return;

    const activity = await Activity.findById(activityId).select(
      '_id hostId joinedPlayers status karmaDistributed sport'
    );

    if (!activity || activity.status !== 'Completed' || activity.karmaDistributed) {
      return;
    }

    const hostId = activity.hostId?.toString();
    const joinedPlayerIds = Array.from(
      new Set((activity.joinedPlayers || []).map((playerId) => playerId.toString()))
    );

    const nonHostParticipantIds = joinedPlayerIds.filter((playerId) => playerId !== hostId);

    // No karma distribution for solo-host activities.
    if (!nonHostParticipantIds.length) {
      activity.karmaDistributed = true;
      activity.karmaDistributedAt = new Date();
      await activity.save();
      return;
    }

    if (hostId && !joinedPlayerIds.includes(hostId)) {
      joinedPlayerIds.push(hostId);
    }

    if (joinedPlayerIds.length) {
      const karmaUpdates = joinedPlayerIds.map((playerId) => ({
        updateOne: {
          filter: { _id: playerId },
          update: {
            $inc: {
              karmaPoints: playerId === hostId ? HOST_KARMA_POINTS : PARTICIPANT_KARMA_POINTS
            }
          }
        }
      }));

      await User.bulkWrite(karmaUpdates);

      // Add all newly-played users as play pals for each participant.
      const playPalsUpdates = joinedPlayerIds
        .map((playerId) => {
          const otherParticipants = joinedPlayerIds.filter((id) => id !== playerId);
          if (!otherParticipants.length) {
            return null;
          }

          return {
            updateOne: {
              filter: { _id: playerId },
              update: {
                $addToSet: {
                  playPals: { $each: otherParticipants }
                }
              }
            }
          };
        })
        .filter(Boolean);

      if (playPalsUpdates.length) {
        await User.bulkWrite(playPalsUpdates);
      }

      for (const participantId of joinedPlayerIds) {
        await createNotification({
          recipientUserId: participantId,
          templateKey: 'activity.completed.rateGame.forParticipants',
          variables: {
            sport: activity.sport || 'activity'
          },
          metadata: {
            activityId: activity._id
          }
        });
      }
    }

    activity.karmaDistributed = true;
    activity.karmaDistributedAt = new Date();
    await activity.save();
  } catch (error) {
    console.error('Failed to distribute activity completion karma:', error);
  }
};

const initActivityCompletionSubscriber = () => {
  if (initialized) {
    return;
  }

  subscribe(ACTIVITY_COMPLETED_TOPIC, distributeKarmaOnActivityCompletion);
  initialized = true;
};

module.exports = {
  initActivityCompletionSubscriber
};
