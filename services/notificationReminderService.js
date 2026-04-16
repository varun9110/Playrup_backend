const Booking = require('../models/Booking');
const Activity = require('../models/Activity');
const Academy = require('../models/Academy');
const { parseActivityDateTime } = require('../utils/activityTime');
const { createNotification } = require('./notificationService');

const REMINDER_INTERVAL_MS = 60 * 1000;

let initialized = false;
let isRunning = false;

const isWithinReminderWindow = (startDateTime, now) => {
  if (!startDateTime) return false;
  const diffMs = startDateTime.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 15 * 60 * 1000;
};

const runBookingReminderTick = async (now) => {
  const bookings = await Booking.find({
    status: 'Confirmed',
    reminder15Sent: false
  }).select('_id userId academyId sport courtNumber date startTime');

  for (const booking of bookings) {
    const bookingStart = parseActivityDateTime(booking.date, booking.startTime);
    if (!isWithinReminderWindow(bookingStart, now)) {
      continue;
    }

    const academy = booking.academyId
      ? await Academy.findById(booking.academyId).select('name')
      : null;

    await createNotification({
      recipientUserId: booking.userId,
      templateKey: 'booking.reminder.15min.forUser',
      variables: {
        sport: booking.sport,
        academyName: academy?.name || 'academy',
        startTime: booking.startTime
      },
      metadata: {
        bookingId: booking._id,
        academyId: booking.academyId
      }
    });

    booking.reminder15Sent = true;
    await booking.save();
  }
};

const runActivityReminderTick = async (now) => {
  const activities = await Activity.find({
    status: 'Active',
    reminder15Sent: false
  }).select('_id sport location date fromTime joinedPlayers hostId');

  for (const activity of activities) {
    const activityStart = parseActivityDateTime(activity.fromTime) || parseActivityDateTime(activity.date, activity.fromTime);
    if (!isWithinReminderWindow(activityStart, now)) {
      continue;
    }

    const participantIds = Array.from(
      new Set((activity.joinedPlayers || []).map((id) => id.toString()))
    );

    for (const participantId of participantIds) {
      await createNotification({
        recipientUserId: participantId,
        templateKey: 'activity.reminder.15min.forUser',
        variables: {
          sport: activity.sport,
          location: activity.location || 'activity venue',
          fromTime: activity.fromTime
        },
        metadata: {
          activityId: activity._id
        }
      });
    }

    activity.reminder15Sent = true;
    await activity.save();
  }
};

const runReminderTick = async () => {
  const now = new Date();
  await runBookingReminderTick(now);
  await runActivityReminderTick(now);
};

const initNotificationReminderService = () => {
  if (initialized) return;
  initialized = true;

  const tick = async () => {
    if (isRunning) return;

    isRunning = true;
    try {
      await runReminderTick();
    } catch (error) {
      console.error('Failed to run notification reminder tick:', error);
    } finally {
      isRunning = false;
    }
  };

  tick();
  const timer = setInterval(tick, REMINDER_INTERVAL_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
};

module.exports = {
  initNotificationReminderService,
  runReminderTick
};
