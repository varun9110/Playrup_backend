const mongoose = require('mongoose');

const FEEDBACK_SKILL_LEVELS = ['Beginner', 'Amateur', 'Intermediate', 'Advanced', 'Professional'];
const FEEDBACK_SCORE_VALUES = [-2, -1, 1, 2];

const playerFeedbackSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  raterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  noShow: { type: Boolean, default: false },
  punctualStatus: { type: String, enum: ['Punctual', 'Late', null], default: null },
  teamPlayerScore: { type: Number, enum: [...FEEDBACK_SCORE_VALUES, null], default: null },
  paymentScore: { type: Number, enum: [...FEEDBACK_SCORE_VALUES, null], default: null },
  skillLevel: { type: String, enum: [...FEEDBACK_SKILL_LEVELS, null], default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: true });

const activitySchema = new mongoose.Schema({
  hostEmail: { type: String, required: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  city: { type: String },
  location: { type: String },
  sport: { type: String, required: true },
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy' },
  academy: { type: String },
  address: { type: String },
  date: { type: String, required: true }, // YYYY-MM-DD
  fromTime: { type: String, required: true }, // HH:mm
  toTime: { type: String, required: true },   // HH:mm
  courtNumber: { type: Number },
  skillLevel: { type: String },
  maxPlayers: { type: Number, required: true },
  pricePerParticipant: { type: Number, default: 0 },
  joinedPlayers: {type: [mongoose.Schema.Types.ObjectId], ref: 'User', required: true, default: [] },
  pendingRequests: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', required: true, default: [] },
  status: { type: String, enum: ['Active', 'Cancelled', 'Completed'], default: 'Active' },
  reminder15Sent: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  karmaDistributed: { type: Boolean, default: false },
  karmaDistributedAt: { type: Date, default: null },
  playerFeedback: { type: [playerFeedbackSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Activity', activitySchema);
