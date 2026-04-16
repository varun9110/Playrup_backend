const parseActivityDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;

  const normalizedDate = String(dateStr).split('T')[0].trim();
  const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const normalizedTime = String(timeStr).trim();
  const amPmMatch = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);

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
    const twentyFourHourMatch = normalizedTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
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

module.exports = {
  parseActivityDateTime
};
