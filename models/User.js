const mongoose = require('mongoose');

const FEEDBACK_SKILL_LEVELS = ['Beginner', 'Amateur', 'Intermediate', 'Advanced', 'Professional'];

const feedbackProfileSchema = new mongoose.Schema({
  noShowCount: { type: Number, default: 0 },
  totalFeedbackReceived: { type: Number, default: 0 },
  punctual: {
    punctualCount: { type: Number, default: 0 },
    lateCount: { type: Number, default: 0 },
    ratedCount: { type: Number, default: 0 },
    punctualityPercentage: { type: Number, default: 0 }
  },
  teamPlayer: {
    totalScore: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 }
  },
  paymentReliability: {
    totalScore: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 }
  },
  skillLevel: {
    ratingCount: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    averageLabel: { type: String, enum: [...FEEDBACK_SKILL_LEVELS, 'Unrated'], default: 'Unrated' },
    counts: {
      beginner: { type: Number, default: 0 },
      amateur: { type: Number, default: 0 },
      intermediate: { type: Number, default: 0 },
      advanced: { type: Number, default: 0 },
      professional: { type: Number, default: 0 }
    }
  },
  lastFeedbackAt: { type: Date, default: null }
}, { _id: false });

const gameStatSchema = new mongoose.Schema({
  gameName: { type: String, required: true },
  selfRating: { type: Number, default: 0 },
  otherPlayerRating: { type: Number, default: 0 },
  last5Ratings: [{ type: Number }],
  totalGamesPlayed: { type: Number, default: 0 }
}, { _id: false });

const venueRatingSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  name: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phone: { type: String, unique: true, required: true },
  isVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'superadmin', 'academy'], default: 'user' },
  otp: String,
  otpExpiry: Date,
  token: String,
  tokenExpiry: Date,
  karmaPoints: { type: Number, default: 0 },
  playPals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  favoriteAcademies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Academy' }],
  venueRatings: { type: [venueRatingSchema], default: [] },
  games: [gameStatSchema],
  feedbackProfile: { type: feedbackProfileSchema, default: () => ({}) }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);