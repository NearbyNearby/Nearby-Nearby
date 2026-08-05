function formatTime12h(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const h24 = d.getHours();
  const m = d.getMinutes();
  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${m.toString().padStart(2, '0')}${ampm}`;
}

/**
 * formatEventDateTime — always 12-hour. e.g. "Sat Nov 9th • 8am-7pm"
 */
export function formatEventDateTime(start, end) {
  if (!start) return null;
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return null;

  const dateStr = s.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const day = s.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? 'st'
    : day % 10 === 2 && day !== 12 ? 'nd'
    : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  const dateWithOrdinal = dateStr.replace(/(\d+)$/, `$1${suffix}`);

  const startTime = formatTime12h(s);
  let endTime = null;
  if (end) {
    const e = new Date(end);
    if (!Number.isNaN(e.getTime())) endTime = formatTime12h(e);
  }

  return endTime
    ? `${dateWithOrdinal} • ${startTime}-${endTime}`
    : `${dateWithOrdinal} • ${startTime}`;
}

export function formatRecurrence(event) {
  if (!event?.is_repeating) return null;
  const rp = event.repeat_pattern;
  if (!rp) return 'This event repeats.';
  if (typeof rp === 'string') return rp;
  if (typeof rp === 'object') {
    const parts = [];
    if (rp.frequency) parts.push(rp.frequency);
    if (rp.day_of_week) parts.push(`on ${rp.day_of_week}`);
    if (rp.day_of_month) parts.push(`on day ${rp.day_of_month}`);
    if (rp.interval) parts.push(`every ${rp.interval}`);
    return parts.length > 0 ? `Repeats ${parts.join(', ')}` : 'This event repeats.';
  }
  return String(rp);
}

/**
 * getEventScheduleLine — one-line schedule summary for an event, shared by
 * EventDetail and DirectionsModal. Repeating events show their recurrence
 * pattern; one-time events show the formatted date/time.
 */
export function getEventScheduleLine(event) {
  if (!event) return null;
  if (event.is_repeating) {
    return formatRecurrence(event) || formatEventDateTime(event.start_datetime, event.end_datetime);
  }
  return formatEventDateTime(event.start_datetime, event.end_datetime);
}
