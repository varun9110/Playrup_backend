const parseActivityDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;

  const normalizedTime = String(timeStr).trim();
  const amPmMatch = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);

  if (amPmMatch) {
    const [, hourPart, minutePart, meridiem] = amPmMatch;
    let hours = Number(hourPart);
    const minutes = Number(minutePart);

    if (meridiem.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    }
    if (meridiem.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }

    const dateTime = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(dateTime.getTime())) {
      return null;
    }

    dateTime.setHours(hours, minutes, 0, 0);
    return dateTime;
  }

  const withSeconds = normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime;
  const dateTime = new Date(`${dateStr}T${withSeconds}`);
  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
};

module.exports = {
  parseActivityDateTime
};
