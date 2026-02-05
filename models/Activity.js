const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  hostEmail: { type: String, required: true },
  city: { type: String },
  location: { type: String },       // New
  sport: { type: String, required: true },
  academy: { type: String },        // New
  address: { type: String },        // New
  date: { type: String, required: true }, // YYYY-MM-DD
  fromTime: { type: String, required: true }, // HH:mm
  toTime: { type: String, required: true },   // HH:mm
  courtNumber: { type: Number },    // New
  skillLevel: { type: String },     // New: Beginner/Intermediate/Advanced
  maxPlayers: { type: Number, required: true },
  pricePerParticipant: { type: Number, default: 0 }, // Optional
  joinedPlayers: { type: [String], default: [] },
  pendingRequests: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Activity', activitySchema);
