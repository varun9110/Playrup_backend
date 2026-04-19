const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const CONFIG_WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateKey = (value) => {
  const dateKey = String(value || '').trim();
  if (!DATE_KEY_REGEX.test(dateKey)) {
    return '';
  }
  return dateKey;
};

const parseUtcDateTime = (dateKey, startTime) => {
  const normalizedDate = normalizeDateKey(dateKey);
  const [hours, minutes] = String(startTime || '00:00').split(':').map(Number);
  if (!normalizedDate || !Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  const [year, month, day] = normalizedDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes));
};

const getAcademyLocalDateMeta = ({ date, startTime, timezone }) => {
  const parsedDate = parseUtcDateTime(date, startTime);
  if (!parsedDate) {
    return null;
  }

  const safeTimezone = String(timezone || 'UTC').trim() || 'UTC';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(parsedDate);
  const partMap = parts.reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const localDateKey = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const weekday = String(partMap.weekday || '').toLowerCase();
  // Normalize hour — Intl may return '24' for midnight
  const rawHour = Number(partMap.hour);
  const localHour = String(rawHour === 24 ? 0 : rawHour).padStart(2, '0');
  const localMinute = String(partMap.minute || '00').padStart(2, '0');
  const localStartTime = `${localHour}:${localMinute}`;

  return {
    localDateKey,
    weekday,
    localStartTime,
    timezone: safeTimezone
  };
};

const getWeekdayCourts = (weeklyRates = [], weekday) => {
  return weeklyRates.find((entry) => String(entry?.weekday || '').toLowerCase() === weekday)?.courts || [];
};

const getResolvedRatesForSport = ({ sportData, date, startTime, academyTimezone }) => {
  if (!sportData?.ratePlan) {
    return { error: 'Rate plan is not configured for this sport' };
  }

  const localMeta = getAcademyLocalDateMeta({ date, startTime, timezone: academyTimezone });
  if (!localMeta) {
    return { error: 'Invalid booking date or time' };
  }

  const holidaySet = new Set((sportData.ratePlan.publicHolidayDates || []).map(normalizeDateKey).filter(Boolean));
  const isHoliday = holidaySet.has(localMeta.localDateKey);

  const activeCourts = isHoliday
    ? (sportData.ratePlan.holidayRates || [])
    : getWeekdayCourts(sportData.ratePlan.weeklyRates, localMeta.weekday);

  return {
    localDateKey: localMeta.localDateKey,
    weekday: localMeta.weekday,
    localStartTime: localMeta.localStartTime,
    rateType: isHoliday ? 'holiday' : 'weekday',
    activeCourts,
    timezone: localMeta.timezone
  };
};

const hasCompleteRatePlan = (sportData) => {
  const plan = sportData?.ratePlan;
  if (!plan) {
    return false;
  }

  const weekly = Array.isArray(plan.weeklyRates) ? plan.weeklyRates : [];
  const seen = new Set(weekly.map((entry) => String(entry?.weekday || '').toLowerCase()));
  return CONFIG_WEEKDAY_KEYS.every((day) => seen.has(day)) && Array.isArray(plan.holidayRates) && plan.holidayRates.length > 0;
};

module.exports = {
  WEEKDAY_KEYS,
  CONFIG_WEEKDAY_KEYS,
  normalizeDateKey,
  getAcademyLocalDateMeta,
  getResolvedRatesForSport,
  hasCompleteRatePlan
};
