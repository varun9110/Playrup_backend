const parseActivityDateTime = (dateStr, timeStr) => {
  if (dateStr && !timeStr) {
    const standalone = new Date(dateStr);
    return Number.isNaN(standalone.getTime()) ? null : standalone;
  }

  if (!dateStr || !timeStr) return null;

  const normalizedTimeInput = String(timeStr).trim();

  // When time already contains full datetime, trust it directly.
  if (normalizedTimeInput.includes('T')) {
    const fullDate = new Date(normalizedTimeInput);
    if (!Number.isNaN(fullDate.getTime())) {
      return fullDate;
    }
  }

  const normalizedDate = String(dateStr).split('T')[0].trim();
  const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const amPmMatch = normalizedTimeInput.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);

  let hours;
  let minutes;

  if (amPmMatch) {
    hours = Number(amPmMatch[1]);
    minutes = Number(amPmMatch[2]);
    const meridiem = amPmMatch[3].toUpperCase();

    if (meridiem === 'PM' && hours !== 12) {
      hours += 12;
    }
    if (meridiem === 'AM' && hours === 12) {
      hours = 0;
    }
  } else {
    const twentyFourHourMatch = normalizedTimeInput.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!twentyFourHourMatch) return null;

    hours = Number(twentyFourHourMatch[1]);
    minutes = Number(twentyFourHourMatch[2]);
  }

  if (
    Number.isNaN(hours) || Number.isNaN(minutes) ||
    hours < 0 || hours > 23 || minutes < 0 || minutes > 59
  ) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
};

const buildActivityDateTimes = (dateStr, fromTime, toTime) => {
  const startDateTime = parseActivityDateTime(dateStr, fromTime);
  const endDateTime = parseActivityDateTime(dateStr, toTime);

  if (!startDateTime || !endDateTime) {
    return { startDateTime, endDateTime };
  }

  const normalizedEndDateTime = new Date(endDateTime);
  if (normalizedEndDateTime.getTime() <= startDateTime.getTime()) {
    normalizedEndDateTime.setUTCDate(normalizedEndDateTime.getUTCDate() + 1);
  }

  return {
    startDateTime,
    endDateTime: normalizedEndDateTime
  };
};

module.exports = {
  parseActivityDateTime,
  buildActivityDateTimes
};
