const mongoose = require('mongoose');

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
  completedAt: { type: Date, default: null },
  karmaDistributed: { type: Boolean, default: false },
  karmaDistributedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Activity', activitySchema);
