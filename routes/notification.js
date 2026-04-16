const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const NotificationTemplate = require('../models/NotificationTemplate');
const { ensureDefaultTemplates } = require('../services/notificationService');

const toNotificationResponse = (notification) => ({
  _id: notification._id,
  templateKey: notification.templateKey,
  title: notification.title,
  body: notification.body,
  metadata: notification.metadata || {},
  channelSnapshot: notification.channelSnapshot || {},
  readAt: notification.readAt,
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt
});

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ message: 'Only super admins can perform this action' });
  }

  next();
};

router.get('/my', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const [items, unreadCount, totalCount] = await Promise.all([
      Notification.find({ recipientUserId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit),
      Notification.countDocuments({ recipientUserId: req.user._id, readAt: null }),
      Notification.countDocuments({ recipientUserId: req.user._id })
    ]);

    return res.status(200).json({
      unreadCount,
      totalCount,
      items: items.map(toNotificationResponse)
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      recipientUserId: req.user._id,
      readAt: null
    });

    return res.status(200).json({ unreadCount });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return res.status(500).json({ message: 'Failed to fetch unread count' });
  }
});

router.patch('/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipientUserId: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.status(200).json({
      message: 'Notification marked as read',
      notification: toNotificationResponse(notification)
    });
  } catch (error) {
    console.error('Error marking notification read:', error);
    return res.status(500).json({ message: 'Failed to update notification' });
  }
});

router.patch('/read-all', async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipientUserId: req.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    );

    return res.status(200).json({
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount || 0
    });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    return res.status(500).json({ message: 'Failed to update notifications' });
  }
});

router.get('/admin/templates', requireSuperAdmin, async (_req, res) => {
  try {
    await ensureDefaultTemplates();
    const templates = await NotificationTemplate.find({}).sort({ key: 1 });
    return res.status(200).json({ templates });
  } catch (error) {
    console.error('Error fetching notification templates:', error);
    return res.status(500).json({ message: 'Failed to fetch notification templates' });
  }
});

router.put('/admin/templates/:templateKey', requireSuperAdmin, async (req, res) => {
  try {
    const { templateKey } = req.params;
    const { title, body, channels } = req.body;

    if (!title || !body) {
      return res.status(400).json({ message: 'title and body are required' });
    }

    const nextChannels = {
      push: Boolean(channels?.push),
      email: Boolean(channels?.email),
      sms: Boolean(channels?.sms)
    };

    const template = await NotificationTemplate.findOneAndUpdate(
      { key: templateKey },
      {
        $set: {
          title,
          body,
          channels: nextChannels,
          updatedBy: req.user._id
        }
      },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ message: 'Notification template not found' });
    }

    return res.status(200).json({
      message: 'Notification template updated',
      template
    });
  } catch (error) {
    console.error('Error updating notification template:', error);
    return res.status(500).json({ message: 'Failed to update template' });
  }
});

router.get('/admin/all', requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const [items, totalCount] = await Promise.all([
      Notification.find({})
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('recipientUserId', 'name email role'),
      Notification.countDocuments({})
    ]);

    return res.status(200).json({
      totalCount,
      items: items.map((notification) => ({
        ...toNotificationResponse(notification),
        recipientUser: notification.recipientUserId
          ? {
              _id: notification.recipientUserId._id,
              name: notification.recipientUserId.name,
              email: notification.recipientUserId.email,
              role: notification.recipientUserId.role
            }
          : null
      }))
    });
  } catch (error) {
    console.error('Error fetching all notifications for admin:', error);
    return res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

module.exports = router;
