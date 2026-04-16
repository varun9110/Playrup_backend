const mongoose = require('mongoose');

const channelSettingsSchema = new mongoose.Schema({
  push: { type: Boolean, default: true },
  email: { type: Boolean, default: false },
  sms: { type: Boolean, default: false }
}, { _id: false });

const notificationTemplateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  channels: { type: channelSettingsSchema, default: () => ({}) },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
