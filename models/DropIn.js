const mongoose = require('mongoose');
const crypto = require('crypto');

const dropInSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  sport: { type: String, required: true },
  courtNumber: { type: Number, required: true },

  title: { type: String, default: '' },
  description: { type: String, default: '' },
  skillLevel: { type: String, default: '' },

  // Date/time stored as UTC strings matching Booking conventions
  date: { type: String, required: true },      // YYYY-MM-DD
  startTime: { type: String, required: true }, // HH:MM
  endTime: { type: String, required: true },   // HH:MM

  // Recurrence – all instances in a series share the same seriesId
  seriesId: { type: String, default: null },
  // Human-readable recurrence label stored for display (e.g. "weekly")
  recurrenceType: {
    type: String,
    enum: ['none', 'daily', 'weekly'],
    default: 'none'
  },
  // For weekly recurrence: 0=Sun,1=Mon,...,6=Sat
  recurrenceDays: { type: [Number], default: [] },
  // Last date to generate instances up to (inclusive)
  recurrenceUntil: { type: String, default: null }, // YYYY-MM-DD

  // Participation
  maxParticipants: { type: Number, required: true },
  pricePerParticipant: { type: Number, default: 0 },
  joinedParticipants: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  pendingRequests: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },

  // Public share
  shareCode: { type: String, unique: true, sparse: true },

  status: { type: String, enum: ['Active', 'Cancelled'], default: 'Active' },
}, { timestamps: true });

dropInSchema.index({ academyId: 1, date: 1, status: 1 });
dropInSchema.index({ seriesId: 1, date: 1 });

module.exports = mongoose.model('DropIn', dropInSchema);
