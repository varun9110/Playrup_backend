const Notification = require('../models/Notification');
const NotificationTemplate = require('../models/NotificationTemplate');

const DEFAULT_TEMPLATES = [
  {
    key: 'booking.created.forAcademy',
    title: 'New booking received',
    body: '{{userName}} booked {{sport}} court {{courtNumber}} on {{date}} at {{startTime}}.',
    channels: { push: true, email: true, sms: false }
  },
  {
    key: 'booking.cancelled.byAcademy.forUser',
    title: 'Booking cancelled by academy',
    body: '{{academyName}} cancelled your {{sport}} booking on {{date}} at {{startTime}}.',
    channels: { push: true, email: true, sms: true }
  },
  {
    key: 'booking.reminder.15min.forUser',
    title: 'Booking starts in 15 minutes',
    body: 'Your {{sport}} booking at {{academyName}} starts at {{startTime}}. Please be ready.',
    channels: { push: true, email: false, sms: false }
  },
  {
    key: 'activity.joinRequest.sent.forHost',
    title: 'New activity join request',
    body: '{{userName}} requested to join your {{sport}} activity on {{date}} at {{fromTime}}.',
    channels: { push: true, email: true, sms: false }
  },
  {
    key: 'dropin.joinRequest.sent.forAcademy',
    title: 'New drop-in join request',
    body: '{{userName}} requested to join your {{sport}} drop-in on {{date}} at {{startTime}}.',
    channels: { push: true, email: true, sms: false }
  },
  {
    key: 'dropin.request.accepted.forParticipant',
    title: 'Drop-in request accepted',
    body: '{{academyName}} accepted your request for the {{sport}} drop-in on {{date}} at {{startTime}}.',
    channels: { push: true, email: true, sms: false }
  },
  {
    key: 'dropin.request.rejected.forParticipant',
    title: 'Drop-in request rejected',
    body: 'Your request for the {{sport}} drop-in on {{date}} at {{startTime}} was rejected by {{academyName}}.',
    channels: { push: true, email: false, sms: false }
  },
  {
    key: 'dropin.participant.removed.forParticipant',
    title: 'Removed from drop-in',
    body: '{{academyName}} removed you from the {{sport}} drop-in on {{date}} at {{startTime}}.',
    channels: { push: true, email: false, sms: false }
  },
  {
    key: 'coaching.joinRequest.sent.forAcademy',
    title: 'New coaching join request',
    body: '{{userName}} requested to join your {{sport}} coaching class on {{date}} at {{startTime}}.',
    channels: { push: true, email: true, sms: false }
  },
  {
    key: 'coaching.request.accepted.forParticipant',
    title: 'Coaching request accepted',
    body: '{{academyName}} accepted your request for the {{sport}} coaching class on {{date}} at {{startTime}}.',
    channels: { push: true, email: true, sms: false }
  },
  {
    key: 'coaching.request.rejected.forParticipant',
    title: 'Coaching request rejected',
    body: 'Your request for the {{sport}} coaching class on {{date}} at {{startTime}} was rejected by {{academyName}}.',
    channels: { push: true, email: false, sms: false }
  },
  {
    key: 'coaching.participant.removed.forParticipant',
    title: 'Removed from coaching class',
    body: '{{academyName}} removed you from the {{sport}} coaching class on {{date}} at {{startTime}}.',
    channels: { push: true, email: false, sms: false }
  },
  {
    key: 'coaching.class.cancelled.forParticipant',
    title: 'Coaching class cancelled',
    body: '{{academyName}} cancelled the {{sport}} coaching class on {{date}} at {{startTime}}.',
    channels: { push: true, email: true, sms: false }
  },
  {
    key: 'coaching.series.cancelled.forParticipant',
    title: 'Coaching series updated',
    body: 'A future {{sport}} coaching class on {{date}} at {{startTime}} was cancelled.',
    channels: { push: true, email: false, sms: false }
  },
  {
    key: 'coaching.reminder.15min.forParticipant',
    title: 'Coaching class starts in 15 minutes',
    body: 'Your {{sport}} coaching class at {{academyName}} starts at {{startTime}}.',
    channels: { push: true, email: false, sms: false }
  },
  {
    key: 'activity.cancelled.byHost.forParticipants',
    title: 'Activity cancelled by host',
    body: '{{hostName}} cancelled the {{sport}} activity scheduled for {{date}} at {{fromTime}}.',
    channels: { push: true, email: true, sms: true }
  },
  {
    key: 'activity.withdrawn.byUser.forHost',
    title: 'Participant withdrew from activity',
    body: '{{userName}} withdrew from your {{sport}} activity on {{date}} at {{fromTime}}.',
    channels: { push: true, email: false, sms: false }
  },
  {
    key: 'activity.request.rejected.forParticipant',
    title: 'Activity request rejected',
    body: 'Your request to join the {{sport}} activity on {{date}} at {{fromTime}} was rejected by {{hostName}}.',
    channels: { push: true, email: false, sms: false }
  },
  {
    key: 'activity.request.accepted.forParticipant',
    title: 'Activity request accepted',
    body: '{{hostName}} accepted your request for the {{sport}} activity on {{date}} at {{fromTime}}.',
    channels: { push: true, email: true, sms: false }
  },
  {
    key: 'activity.completed.rateGame.forParticipants',
    title: 'Rate your completed game',
    body: 'Your {{sport}} activity has completed. Please rate the game and participants.',
    channels: { push: true, email: true, sms: false }
  },
  {
    key: 'activity.reminder.15min.forUser',
    title: 'Activity starts in 15 minutes',
    body: 'Your {{sport}} activity at {{location}} starts at {{fromTime}}. Join on time.',
    channels: { push: true, email: false, sms: false }
  }
];

const DEFAULT_TEMPLATE_MAP = new Map(DEFAULT_TEMPLATES.map((template) => [template.key, template]));

const renderTemplate = (content, variables = {}) => {
  if (!content || typeof content !== 'string') return '';

  return content.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, variableName) => {
    const value = variables[variableName];
    if (value === null || value === undefined) return '';
    return String(value);
  });
};

const ensureDefaultTemplates = async () => {
  const upserts = DEFAULT_TEMPLATES.map((template) => ({
    updateOne: {
      filter: { key: template.key },
      update: {
        $setOnInsert: template
      },
      upsert: true
    }
  }));

  if (!upserts.length) return;
  await NotificationTemplate.bulkWrite(upserts);
};

const getTemplateByKey = async (key) => {
  let template = await NotificationTemplate.findOne({ key });
  if (template) return template;

  const defaults = DEFAULT_TEMPLATE_MAP.get(key);
  if (!defaults) {
    return null;
  }

  template = await NotificationTemplate.create(defaults);
  return template;
};

const createNotification = async ({ recipientUserId, templateKey, variables = {}, metadata = {} }) => {
  const template = await getTemplateByKey(templateKey);
  if (!template) return null;

  const title = renderTemplate(template.title, variables).trim();
  const body = renderTemplate(template.body, variables).trim();

  if (!title || !body) return null;

  const notification = await Notification.create({
    recipientUserId,
    templateKey,
    title,
    body,
    metadata,
    channelSnapshot: {
      push: Boolean(template.channels?.push),
      email: Boolean(template.channels?.email),
      sms: Boolean(template.channels?.sms)
    }
  });

  return notification;
};

module.exports = {
  DEFAULT_TEMPLATES,
  ensureDefaultTemplates,
  createNotification
};
