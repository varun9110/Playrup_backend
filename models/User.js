const mongoose = require('mongoose');

const gameStatSchema = new mongoose.Schema({
  gameName: { type: String, required: true },
  selfRating: { type: Number, default: 0 },        // user's rating for this game
  otherPlayerRating: { type: Number, default: 0 }, // rating received from other players
  last5Ratings: [{ type: Number }],               // last 5 game ratings
  totalGamesPlayed: { type: Number, default: 0 }, // total games played
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
  games: [gameStatSchema], // Array of games with stats
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);