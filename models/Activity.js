const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  hostEmail: { type: String, required: true },
  city: { type: String },
  location: { type: String },       
  sport: { type: String, required: true },
  academy: { type: String },        
  address: { type: String },        
  date: { type: String, required: true }, // YYYY-MM-DD
  fromTime: { type: String, required: true }, // HH:mm
  toTime: { type: String, required: true },   // HH:mm
  courtNumber: { type: Number },    
  skillLevel: { type: String },     
  maxPlayers: { type: Number, required: true },
  pricePerParticipant: { type: Number, default: 0 }, 
  joinedPlayers: { type: [String], default: [] },
  pendingRequests: { type: [String], default: [] },
  status: { type: String, default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('Activity', activitySchema);
