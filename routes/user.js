const express = require('express');
const router = express.Router();
const Academy = require('../models/Academy');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Booking = require('../models/Booking');
const DropIn = require('../models/DropIn');
const Coaching = require('../models/Coaching');

const { encrypt, decrypt } = require('../utils/helperFunctions');
const { createEmptyFeedbackProfile, SKILL_LEVEL_TO_SCORE, scoreToSkillLevel } = require('../services/playerFeedback');

const SELF_RATING_LEVELS = ['Beginner', 'Amateur', 'Intermediate', 'Advanced', 'Professional'];
const FEEDBACK_SKILL_TO_RATING = {
  Beginner: 1,
  Amateur: 2,
  Intermediate: 3,
  Advanced: 4,
  Professional: 5
};

const normalizeSportName = (value) => String(value || '').trim().toLowerCase();
const roundToTwo = (value) => Math.round(value * 100) / 100;

const toDateKey = (date = new Date()) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const buildVenueDetailsForUser = async (academy, viewerUserId) => {
  const academyId = academy._id;
  const todayKey = toDateKey();

  const [completedBookings, completedDropIns, completedCoaching, completedActivities, upcomingBookings, upcomingDropIns, upcomingCoaching, upcomingActivities, completedActivitiesForFeedback, ratingAggregate, viewer] = await Promise.all([
    Booking.countDocuments({ academyId, status: 'Confirmed', date: { $lt: todayKey } }),
    DropIn.countDocuments({ academyId, status: 'Active', date: { $lt: todayKey } }),
    Coaching.countDocuments({ academyId, status: 'Active', date: { $lt: todayKey } }),
    Activity.countDocuments({ academyId, status: 'Completed' }),
    Booking.countDocuments({ academyId, status: 'Confirmed', date: { $gte: todayKey } }),
    DropIn.countDocuments({ academyId, status: 'Active', date: { $gte: todayKey } }),
    Coaching.countDocuments({ academyId, status: 'Active', date: { $gte: todayKey } }),
    Activity.countDocuments({ academyId, status: 'Active' }),
    Activity.find({ academyId, status: 'Completed' }).select('playerFeedback').lean(),
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
    ]),
    User.findById(viewerUserId).select('favoriteAcademies venueRatings').lean()
  ]);

  const totalGamesPlayed = completedBookings + completedDropIns + completedCoaching + completedActivities;
  const upcomingGames = upcomingBookings + upcomingDropIns + upcomingCoaching + upcomingActivities;

  let feedbackRatingSum = 0;
  let feedbackRatingCount = 0;
  completedActivitiesForFeedback.forEach((activity) => {
    (activity.playerFeedback || []).forEach((feedback) => {
      if (feedback?.noShow || !feedback?.skillLevel) return;
      const rating = FEEDBACK_SKILL_TO_RATING[feedback.skillLevel];
      if (!rating) return;
      feedbackRatingSum += rating;
      feedbackRatingCount += 1;
    });
  });

  const feedbackAverage = feedbackRatingCount ? (feedbackRatingSum / feedbackRatingCount) : 0;
  const userAverage = ratingAggregate[0]?.average || 0;
  const userCount = ratingAggregate[0]?.count || 0;
  const combinedAverage = (feedbackRatingCount + userCount)
    ? ((feedbackAverage * feedbackRatingCount) + (userAverage * userCount)) / (feedbackRatingCount + userCount)
    : 0;

  const myRating = (viewer?.venueRatings || []).find((entry) => String(entry.academyId) === String(academyId))?.rating || 0;
  const isFavorite = (viewer?.favoriteAcademies || []).some((favId) => String(favId) === String(academyId));

  return {
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
    totalGamesPlayed,
    upcomingGames,
    averageRating: roundToTwo(combinedAverage),
    totalRatings: feedbackRatingCount + userCount,
    shareCode: academy.shareCode,
    viewer: {
      isFavorite,
      myRating
    }
  };
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
    .populate({ path: 'playPals', select: 'name email' })
    .lean();

  return (userWithPals?.playPals || []).map((pal) => ({
    id: encrypt(pal._id.toString()),
    name: pal.name,
    email: pal.email
  }));
};

const buildProfileSummary = async (userId) => {
  const user = await User.findById(userId)
    .select('name email phone createdAt feedbackProfile karmaPoints role games')
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
    email: user.email,
    phone: user.phone,
    role: user.role,
    joinedOn: user.createdAt,
    karmaPoints: user.karmaPoints,
    feedbackProfile: user.feedbackProfile || createEmptyFeedbackProfile(),
    playPals,
    sportRatings,
    availableSports
  };
};

const decryptUserIdForLookup = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value.iv && value.content && value.tag) {
    return decrypt(value);
  }

  return null;
};

router.get('/profile-summary', async (req, res) => {
  try {
    const userSummary = await buildProfileSummary(req.user._id);

    if (!userSummary) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user: userSummary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/profile-summary/view', async (req, res) => {
  try {
    const targetUserId = decryptUserIdForLookup(req.body?.userId);

    if (!targetUserId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const userSummary = await buildProfileSummary(targetUserId);

    if (!userSummary) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user: userSummary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/playpals', async (req, res) => {
  try {
    const playPals = await getPlayPals(req.user._id);
    return res.json({ playPals });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/sports', async (_req, res) => {
  try {
    const sports = await getUniqueSports();
    return res.json({ sports });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/games', async (req, res) => {
  try {
    const gameNameRaw = String(req.body?.gameName || '').trim();
    if (!gameNameRaw) {
      return res.status(400).json({ message: 'gameName is required' });
    }

    const sports = await getUniqueSports();
    const matchedSport = sports.find(
      (sportName) => normalizeSportName(sportName) === normalizeSportName(gameNameRaw)
    );

    if (!matchedSport) {
      return res.status(400).json({ message: 'gameName must be selected from the available sports list' });
    }

    const user = await User.findById(req.user._id).select('games');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const alreadyAdded = (user.games || []).some(
      (game) => normalizeSportName(game.gameName) === normalizeSportName(matchedSport)
    );

    if (!alreadyAdded) {
      user.games.push({ gameName: matchedSport, selfRating: 0 });
      await user.save();
    }

    return res.status(200).json({
      message: alreadyAdded ? 'Sport already added to your list' : 'Sport added to your list',
      gameName: matchedSport
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/games/self-rating', async (req, res) => {
  try {
    const gameNameRaw = String(req.body?.gameName || '').trim();
    const selfRatingLabel = String(req.body?.selfRating || '').trim();

    if (!gameNameRaw || !selfRatingLabel) {
      return res.status(400).json({ message: 'gameName and selfRating are required' });
    }

    if (!SELF_RATING_LEVELS.includes(selfRatingLabel)) {
      return res.status(400).json({ message: 'selfRating must be Beginner, Amateur, Intermediate, Advanced, or Professional' });
    }

    const user = await User.findById(req.user._id).select('games');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let existingGame = (user.games || []).find(
      (game) => normalizeSportName(game.gameName) === normalizeSportName(gameNameRaw)
    );

    if (!existingGame) {
      // Sport not yet in the user's games list — auto-add it so the self rating can be saved.
      const sports = await getUniqueSports();
      const matchedSport = sports.find(
        (sportName) => normalizeSportName(sportName) === normalizeSportName(gameNameRaw)
      );

      if (!matchedSport) {
        return res.status(400).json({ message: 'Sport not recognised. Select from the available sports list.' });
      }

      user.games.push({ gameName: matchedSport, selfRating: 0 });
      existingGame = user.games[user.games.length - 1];
    }

    existingGame.selfRating = SKILL_LEVEL_TO_SCORE[selfRatingLabel];
    await user.save();

    return res.status(200).json({
      message: 'Self rating updated successfully',
      sportName: existingGame.gameName,
      selfRating: {
        score: existingGame.selfRating,
        label: selfRatingLabel
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/games', async (req, res) => {
  try {
    const gameNameRaw = String(req.body?.gameName || '').trim();
    if (!gameNameRaw) {
      return res.status(400).json({ message: 'gameName is required' });
    }

    const user = await User.findById(req.user._id).select('games');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const beforeCount = user.games.length;
    user.games = user.games.filter(
      (game) => normalizeSportName(game.gameName) !== normalizeSportName(gameNameRaw)
    );

    if (user.games.length === beforeCount) {
      return res.status(404).json({ message: 'Sport not found in your games list' });
    }

    await user.save();
    return res.status(200).json({ message: 'Sport removed from your games list' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
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

    const venue = await buildVenueDetailsForUser(academy, req.user._id);
    return res.status(200).json({ venue });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/venue/:academyId/favorite', async (req, res) => {
  try {
    const { academyId } = req.params;
    const { isFavorite } = req.body || {};

    const academy = await Academy.findById(academyId).select('_id');
    if (!academy) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    const user = await User.findById(req.user._id).select('favoriteAcademies');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const alreadyFavorite = (user.favoriteAcademies || []).some((favId) => String(favId) === String(academyId));
    const nextFavorite = typeof isFavorite === 'boolean' ? isFavorite : !alreadyFavorite;

    if (nextFavorite && !alreadyFavorite) {
      user.favoriteAcademies.push(academyId);
    }

    if (!nextFavorite && alreadyFavorite) {
      user.favoriteAcademies = user.favoriteAcademies.filter((favId) => String(favId) !== String(academyId));
    }

    await user.save();
    return res.status(200).json({ isFavorite: nextFavorite });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/venue/:academyId/rate', async (req, res) => {
  try {
    const { academyId } = req.params;
    const rating = Number(req.body?.rating);

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'rating must be a number between 1 and 5' });
    }

    const academy = await Academy.findById(academyId).select('_id shareCode');
    if (!academy) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    const user = await User.findById(req.user._id).select('venueRatings favoriteAcademies');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existingRating = (user.venueRatings || []).find((entry) => String(entry.academyId) === String(academyId));
    if (existingRating) {
      existingRating.rating = rating;
      existingRating.updatedAt = new Date();
    } else {
      user.venueRatings.push({ academyId, rating, updatedAt: new Date() });
    }

    await user.save();

    const ratingAggregate = await User.aggregate([
      { $unwind: '$venueRatings' },
      { $match: { 'venueRatings.academyId': academy._id } },
      {
        $group: {
          _id: '$venueRatings.academyId',
          average: { $avg: '$venueRatings.rating' },
          count: { $sum: 1 }
        }
      }
    ]);

    return res.status(200).json({
      myRating: rating,
      userRatingsAverage: roundToTwo(ratingAggregate[0]?.average || 0),
      userRatingsCount: ratingAggregate[0]?.count || 0
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/favorite-academies', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('favoriteAcademies').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      favoriteAcademyIds: (user.favoriteAcademies || []).map((id) => id.toString())
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Backward compatibility with existing clients that call this endpoint as POST with encrypted values.
router.post('/all-sports', async (req, res) => {
  try {
    const { userEmail, userId } = req.body;

    if (!userId || !userEmail) {
      return res.status(400).json({
        message: 'userId and userEmail are required'
      });
    }

    decrypt(userEmail);
    decrypt(userId);

    const sports = await getUniqueSports();
    return res.json({ sports });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;