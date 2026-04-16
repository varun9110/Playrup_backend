const Activity = require('../models/Activity');
const { publishSync } = require('../events/eventBus');
const { ACTIVITY_COMPLETED_TOPIC } = require('../events/topics');
const { parseActivityDateTime } = require('../utils/activityTime');

const AUTO_COMPLETION_INTERVAL_MS = 30 * 1000;

let initialized = false;
let isRunning = false;

const completeOverdueActivities = async () => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const activeActivities = await Activity.find({
    status: 'Active',
    date: { $lte: today }
  }).select('_id date toTime');

  for (const activity of activeActivities) {
    const activityEndDateTime = parseActivityDateTime(activity.date, activity.toTime);
    if (!activityEndDateTime || activityEndDateTime > now) {
      continue;
    }

    const completedActivity = await Activity.findOneAndUpdate(
      { _id: activity._id, status: 'Active' },
      {
        $set: {
          status: 'Completed',
          completedAt: new Date()
        }
      },
      { new: true }
    ).select('_id status');

    if (completedActivity) {
      publishSync(ACTIVITY_COMPLETED_TOPIC, {
        activityId: completedActivity._id.toString()
      });
    }
  }
};

const initActivityAutoCompletion = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  const tick = async () => {
    if (isRunning) return;

    isRunning = true;
    try {
      await completeOverdueActivities();
    } catch (error) {
      console.error('Failed to auto-complete overdue activities:', error);
    } finally {
      isRunning = false;
    }
  };

  tick();
  const timer = setInterval(tick, AUTO_COMPLETION_INTERVAL_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
};

module.exports = {
  completeOverdueActivities,
  initActivityAutoCompletion
};
