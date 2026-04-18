const express = require('express');
const router = express.Router();

const Activity = require('../models/Activity');
const Academy = require('../models/Academy');
const User = require('../models/User');
const Booking = require('../models/Booking');
const DropIn = require('../models/DropIn');
const Coaching = require('../models/Coaching');
const { encrypt, decrypt } = require('../utils/helperFunctions');
const { createEmptyFeedbackProfile, SKILL_LEVEL_TO_SCORE, scoreToSkillLevel } = require('../services/playerFeedback');

const toIdString = (value) => value?.toString?.() || String(value);
const normalizeSportName = (value) => String(value || '').trim().toLowerCase();
const roundToTwo = (value) => Math.round(value * 100) / 100;
const toDateKey = (date = new Date()) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getUniqueSports = async () => {
  const uniqueSports = await Academy.aggregate([
    { $unwind: '$sports' },
    { $group: { _id: '$sports.sportName' } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, sportName: '$_id' } }
  ]);

  return uniqueSports
    .map((item) => String(item.sportName || '').trim())
    .filter(Boolean);
};

const buildSportPerformanceMap = async (userId) => {
  const activities = await Activity.find({
    status: 'Completed',
    'playerFeedback.recipientUserId': userId
  })
    .select('_id sport completedAt toTime playerFeedback')
    .lean();

  const sportMap = new Map();

  for (const activity of activities) {
    const sportName = String(activity.sport || '').trim();
    const normalizedSport = normalizeSportName(sportName);

    if (!normalizedSport) {
      continue;
    }

    const matchedEntries = (activity.playerFeedback || []).filter(
      (entry) => entry.recipientUserId?.toString() === userId.toString()
        && !entry.noShow
        && entry.skillLevel
        && SKILL_LEVEL_TO_SCORE[entry.skillLevel]
    );

    if (!matchedEntries.length) {
      continue;
    }

    const activityScore = roundToTwo(
      matchedEntries.reduce((sum, entry) => sum + SKILL_LEVEL_TO_SCORE[entry.skillLevel], 0) / matchedEntries.length
    );

    if (!sportMap.has(normalizedSport)) {
      sportMap.set(normalizedSport, {
        sportName,
        allScores: [],
        activities: []
      });
    }

    const bucket = sportMap.get(normalizedSport);
    bucket.sportName = bucket.sportName || sportName;
    bucket.allScores.push(...matchedEntries.map((entry) => SKILL_LEVEL_TO_SCORE[entry.skillLevel]));
    bucket.activities.push({
      activityId: encrypt(activity._id.toString()),
      playedAt: activity.completedAt || activity.toTime || null,
      ratingScore: activityScore,
      ratingLabel: scoreToSkillLevel(activityScore)
    });
  }

  for (const value of sportMap.values()) {
    value.activities.sort(
      (a, b) => new Date(b.playedAt || 0).getTime() - new Date(a.playedAt || 0).getTime()
    );
  }

  return sportMap;
};

const buildUserSportRatings = (userGames, sportPerformanceMap) => {
  const gameMap = new Map();

  for (const game of userGames || []) {
    const gameName = String(game.gameName || '').trim();
    const normalizedGame = normalizeSportName(gameName);

    if (!normalizedGame) {
      continue;
    }

    gameMap.set(normalizedGame, {
      gameName,
      selfRatingScore: game.selfRating || 0,
      selfRatingLabel: game.selfRating ? scoreToSkillLevel(game.selfRating) : 'Unrated'
    });
  }

  for (const [sportKey, performance] of sportPerformanceMap.entries()) {
    if (!gameMap.has(sportKey)) {
      gameMap.set(sportKey, {
        gameName: performance.sportName,
        selfRatingScore: 0,
        selfRatingLabel: 'Unrated'
      });
    }
  }

  const response = [];
  for (const [sportKey, game] of gameMap.entries()) {
    const performance = sportPerformanceMap.get(sportKey);
    const allScores = performance?.allScores || [];
    const last5Activities = (performance?.activities || []).slice(0, 5);

    const averageReceivedScore = allScores.length
      ? roundToTwo(allScores.reduce((sum, value) => sum + value, 0) / allScores.length)
      : 0;

    const last5AverageScore = last5Activities.length
      ? roundToTwo(last5Activities.reduce((sum, item) => sum + item.ratingScore, 0) / last5Activities.length)
      : 0;

    response.push({
      sportName: game.gameName,
      selfRating: {
        score: game.selfRatingScore,
        label: game.selfRatingLabel
      },
      receivedRatingComparison: {
        averageScore: averageReceivedScore,
        averageLabel: averageReceivedScore ? scoreToSkillLevel(averageReceivedScore) : 'Unrated',
        basedOnRatings: allScores.length,
        last5ActivitiesAverageScore: last5AverageScore,
        last5ActivitiesAverageLabel: last5AverageScore ? scoreToSkillLevel(last5AverageScore) : 'Unrated'
      },
      recentActivityRatings: last5Activities
    });
  }

  return response.sort((a, b) => a.sportName.localeCompare(b.sportName));
};

const getPlayPals = async (userId) => {
  const userWithPals = await User.findById(userId)
    .select('playPals')
    .populate({ path: 'playPals', select: 'name' })
    .lean();

  return (userWithPals?.playPals || []).map((pal) => ({
    id: encrypt(pal._id.toString()),
    name: pal.name
  }));
};

const buildPublicProfileSummary = async (userId) => {
  const user = await User.findById(userId)
    .select('name createdAt feedbackProfile karmaPoints role games')
    .lean();

  if (!user) {
    return null;
  }

  const [availableSports, playPals, sportPerformanceMap] = await Promise.all([
    getUniqueSports(),
    getPlayPals(user._id),
    buildSportPerformanceMap(user._id)
  ]);

  const sportRatings = buildUserSportRatings(user.games || [], sportPerformanceMap);

  return {
    id: encrypt(user._id.toString()),
    name: user.name,
    avatarUrl: null,
    role: user.role,
    joinedOn: user.createdAt,
    karmaPoints: user.karmaPoints,
    feedbackProfile: user.feedbackProfile || createEmptyFeedbackProfile(),
    playPals,
    sportRatings,
    availableSports
  };
};

const parseEncryptedUserId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed?.iv && parsed?.content && parsed?.tag) {
        return decrypt(parsed);
      }
    } catch (_error) {
      return value;
    }
    return value;
  }

  if (typeof value === 'object' && value.iv && value.content && value.tag) {
    return decrypt(value);
  }

  return null;
};

router.get('/activity/:shareCode', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const viewerUserId = parseEncryptedUserId(req.query?.userId);

    if (!shareCode) {
      return res.status(400).json({ message: 'shareCode is required' });
    }

    const activity = await Activity.findOne({ shareCode })
      .populate({ path: 'hostId', select: 'name' })
      .populate({ path: 'joinedPlayers', select: 'name' })
      .lean();

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    const uniqueParticipants = new Map();
    if (activity.hostId?._id) {
      uniqueParticipants.set(toIdString(activity.hostId._id), {
        id: encrypt(toIdString(activity.hostId._id)),
        name: activity.hostId.name || 'Host',
        avatarUrl: null,
        isHost: true
      });
    }

    (activity.joinedPlayers || []).forEach((player) => {
      if (!player?._id) return;
      const playerId = toIdString(player._id);
      if (!uniqueParticipants.has(playerId)) {
        uniqueParticipants.set(playerId, {
          id: encrypt(playerId),
          name: player.name || 'Player',
          avatarUrl: null,
          isHost: false
        });
      }
    });

    const participants = Array.from(uniqueParticipants.values());
    const slotsRemaining = Math.max((activity.maxPlayers || 0) - participants.length, 0);
    const hasJoined = Boolean(
      viewerUserId && (activity.joinedPlayers || []).some((player) => toIdString(player?._id || player) === viewerUserId)
    );
    const hasRequested = Boolean(
      viewerUserId && (activity.pendingRequests || []).some((pendingId) => toIdString(pendingId) === viewerUserId)
    );

    return res.status(200).json({
      activity: {
        id: activity._id,
        shareCode: activity.shareCode,
        name: activity.sport,
        description: activity.address || '',
        sport: activity.sport,
        city: activity.city,
        location: activity.location,
        address: activity.address,
        date: activity.date,
        fromTime: activity.fromTime,
        toTime: activity.toTime,
        status: activity.status,
        maxPlayers: activity.maxPlayers,
        slotsRemaining,
        participants,
        hasJoined,
        hasRequested,
        host: {
          id: activity.hostId?._id ? encrypt(toIdString(activity.hostId._id)) : null,
          name: activity.hostId?.name || 'Host'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching public activity:', error);
    return res.status(500).json({ message: 'Failed to fetch activity details' });
  }
});

router.post('/user/profile-summary', async (req, res) => {
  try {
    const targetUserId = parseEncryptedUserId(req.body?.userId);

    if (!targetUserId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const userSummary = await buildPublicProfileSummary(targetUserId);

    if (!userSummary) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      user: userSummary
    });
  } catch (error) {
    console.error('Error fetching public profile summary:', error);
    return res.status(500).json({ message: 'Failed to fetch profile details' });
  }
});

router.get('/venue/:shareCode', async (req, res) => {
  try {
    const { shareCode } = req.params;

    if (!shareCode) {
      return res.status(400).json({ message: 'shareCode is required' });
    }

    const academy = await Academy.findOne({ shareCode })
      .select('name address city mapLink photos openTime closeTime amenities sports shareCode')
      .lean();

    if (!academy) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    const academyId = academy._id;
    const todayKey = toDateKey();

    const [completedBookings, completedDropIns, completedCoaching, completedActivities, upcomingBookings, upcomingDropIns, upcomingCoaching, upcomingActivities, ratingAggregate] = await Promise.all([
      Booking.countDocuments({ academyId, status: 'Confirmed', date: { $lt: todayKey } }),
      DropIn.countDocuments({ academyId, status: 'Active', date: { $lt: todayKey } }),
      Coaching.countDocuments({ academyId, status: 'Active', date: { $lt: todayKey } }),
      Activity.countDocuments({ academyId, status: 'Completed' }),
      Booking.countDocuments({ academyId, status: 'Confirmed', date: { $gte: todayKey } }),
      DropIn.countDocuments({ academyId, status: 'Active', date: { $gte: todayKey } }),
      Coaching.countDocuments({ academyId, status: 'Active', date: { $gte: todayKey } }),
      Activity.countDocuments({ academyId, status: 'Active' }),
      User.aggregate([
        { $unwind: '$venueRatings' },
        { $match: { 'venueRatings.academyId': academyId } },
        {
          $group: {
            _id: '$venueRatings.academyId',
            average: { $avg: '$venueRatings.rating' },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const averageRating = ratingAggregate[0]?.average ? Math.round(ratingAggregate[0].average * 100) / 100 : 0;
    const ratingCount = ratingAggregate[0]?.count || 0;

    return res.status(200).json({
      venue: {
        id: academy._id,
        name: academy.name,
        address: academy.address,
        city: academy.city,
        mapLink: academy.mapLink || '',
        photos: academy.photos || [],
        openTime: academy.openTime || '',
        closeTime: academy.closeTime || '',
        amenities: academy.amenities || {},
        sports: (academy.sports || []).map((sport) => ({
          sportName: sport.sportName,
          numberOfCourts: sport.numberOfCourts,
          startTime: sport.startTime,
          endTime: sport.endTime
        })),
        totalGamesPlayed: completedBookings + completedDropIns + completedCoaching + completedActivities,
        upcomingGames: upcomingBookings + upcomingDropIns + upcomingCoaching + upcomingActivities,
        averageRating,
        totalRatings: ratingCount,
        shareCode: academy.shareCode
      }
    });
  } catch (error) {
    console.error('Error fetching public venue:', error);
    return res.status(500).json({ message: 'Failed to fetch venue details' });
  }
});

module.exports = router;
