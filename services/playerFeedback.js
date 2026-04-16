const User = require('../models/User');
const Activity = require('../models/Activity');

const FEEDBACK_SCORE_VALUES = [-2, -1, 1, 2];
const FEEDBACK_SKILL_LEVELS = ['Beginner', 'Amateur', 'Intermediate', 'Advanced', 'Professional'];
const SKILL_LEVEL_TO_SCORE = {
  Beginner: 1,
  Amateur: 2,
  Intermediate: 3,
  Advanced: 4,
  Professional: 5
};

const roundToTwo = (value) => Math.round(value * 100) / 100;

const createEmptyFeedbackProfile = () => ({
  noShowCount: 0,
  totalFeedbackReceived: 0,
  punctual: {
    punctualCount: 0,
    lateCount: 0,
    ratedCount: 0,
    punctualityPercentage: 0
  },
  teamPlayer: {
    totalScore: 0,
    ratingCount: 0,
    averageScore: 0
  },
  paymentReliability: {
    totalScore: 0,
    ratingCount: 0,
    averageScore: 0
  },
  skillLevel: {
    ratingCount: 0,
    averageScore: 0,
    averageLabel: 'Unrated',
    counts: {
      beginner: 0,
      amateur: 0,
      intermediate: 0,
      advanced: 0,
      professional: 0
    }
  },
  lastFeedbackAt: null
});

const scoreToSkillLevel = (score) => {
  const rounded = Math.min(5, Math.max(1, Math.round(score || 0)));
  return FEEDBACK_SKILL_LEVELS[rounded - 1] || 'Unrated';
};

const buildFeedbackProfileSummary = (feedbackEntries) => {
  const profile = createEmptyFeedbackProfile();

  for (const entry of feedbackEntries) {
    profile.totalFeedbackReceived += 1;

    if (entry.updatedAt && (!profile.lastFeedbackAt || entry.updatedAt > profile.lastFeedbackAt)) {
      profile.lastFeedbackAt = entry.updatedAt;
    }

    if (entry.noShow) {
      profile.noShowCount += 1;
      continue;
    }

    if (entry.punctualStatus === 'Punctual') {
      profile.punctual.punctualCount += 1;
      profile.punctual.ratedCount += 1;
    } else if (entry.punctualStatus === 'Late') {
      profile.punctual.lateCount += 1;
      profile.punctual.ratedCount += 1;
    }

    if (typeof entry.teamPlayerScore === 'number') {
      profile.teamPlayer.totalScore += entry.teamPlayerScore;
      profile.teamPlayer.ratingCount += 1;
    }

    if (typeof entry.paymentScore === 'number') {
      profile.paymentReliability.totalScore += entry.paymentScore;
      profile.paymentReliability.ratingCount += 1;
    }

    if (entry.skillLevel && SKILL_LEVEL_TO_SCORE[entry.skillLevel]) {
      const skillKey = entry.skillLevel.toLowerCase();
      profile.skillLevel.ratingCount += 1;
      profile.skillLevel.averageScore += SKILL_LEVEL_TO_SCORE[entry.skillLevel];
      profile.skillLevel.counts[skillKey] += 1;
    }
  }

  if (profile.punctual.ratedCount > 0) {
    profile.punctual.punctualityPercentage = roundToTwo(
      (profile.punctual.punctualCount / profile.punctual.ratedCount) * 100
    );
  }

  if (profile.teamPlayer.ratingCount > 0) {
    profile.teamPlayer.averageScore = roundToTwo(
      profile.teamPlayer.totalScore / profile.teamPlayer.ratingCount
    );
  }

  if (profile.paymentReliability.ratingCount > 0) {
    profile.paymentReliability.averageScore = roundToTwo(
      profile.paymentReliability.totalScore / profile.paymentReliability.ratingCount
    );
  }

  if (profile.skillLevel.ratingCount > 0) {
    profile.skillLevel.averageScore = roundToTwo(
      profile.skillLevel.averageScore / profile.skillLevel.ratingCount
    );
    profile.skillLevel.averageLabel = scoreToSkillLevel(profile.skillLevel.averageScore);
  } else {
    profile.skillLevel.averageScore = 0;
  }

  return profile;
};

const recalculateUserFeedbackProfile = async (userId) => {
  const activities = await Activity.find({ 'playerFeedback.recipientUserId': userId })
    .select('playerFeedback')
    .lean();

  const feedbackEntries = [];
  for (const activity of activities) {
    for (const entry of activity.playerFeedback || []) {
      if (entry.recipientUserId?.toString() === userId.toString()) {
        feedbackEntries.push(entry);
      }
    }
  }

  const feedbackProfile = buildFeedbackProfileSummary(feedbackEntries);

  await User.findByIdAndUpdate(userId, { feedbackProfile });
  return feedbackProfile;
};

module.exports = {
  FEEDBACK_SCORE_VALUES,
  FEEDBACK_SKILL_LEVELS,
  SKILL_LEVEL_TO_SCORE,
  createEmptyFeedbackProfile,
  buildFeedbackProfileSummary,
  recalculateUserFeedbackProfile,
  scoreToSkillLevel
};