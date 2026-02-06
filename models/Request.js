const mongoose = require('mongoose');

const activityRequestSchema = new mongoose.Schema({
  activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity', required: true },
  userEmail: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Accepted', 'Rejected'], default: 'Pending' },
  requestedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('ActivityRequest', activityRequestSchema);
