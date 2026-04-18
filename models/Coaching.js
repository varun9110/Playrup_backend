const mongoose = require('mongoose');

const coachingSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  sport: { type: String, required: true },
  courtNumber: { type: Number, required: true },

  title: { type: String, default: '' },
  description: { type: String, default: '' },
  skillLevel: { type: String, default: '' },

  // Space for coach details and future coach assignment.
  coachName: { type: String, default: '' },
  coachBio: { type: String, default: '' },
  coachContact: { type: String, default: '' },

  date: { type: String, required: true },      // YYYY-MM-DD
  startTime: { type: String, required: true }, // HH:MM
  endTime: { type: String, required: true },   // HH:MM

  seriesId: { type: String, default: null },
  recurrenceType: {
    type: String,
    enum: ['none', 'daily', 'weekly'],
    default: 'none'
  },
  recurrenceDays: { type: [Number], default: [] },
  recurrenceUntil: { type: String, default: null },

  // No max participant restriction for coaching plans.
  pricePerParticipant: { type: Number, default: 0 },
  joinedParticipants: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  pendingRequests: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },

  shareCode: { type: String, unique: true, sparse: true },
  status: { type: String, enum: ['Active', 'Cancelled'], default: 'Active' },
  reminder15Sent: { type: Boolean, default: false },
}, { timestamps: true });

coachingSchema.index({ academyId: 1, date: 1, status: 1 });
coachingSchema.index({ seriesId: 1, date: 1 });

module.exports = mongoose.model('Coaching', coachingSchema);
