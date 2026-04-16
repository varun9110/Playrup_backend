const mongoose = require('mongoose');

const activityChatMessageSchema = new mongoose.Schema({
  activityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Activity',
    required: true,
    index: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: false,
    trim: true,
    maxlength: 1000,
  },
  attachment: {
    url: { type: String },
    fileName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
  },
  readBy: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: [],
  },
}, { timestamps: true });

activityChatMessageSchema.index({ activityId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityChatMessage', activityChatMessageSchema);
