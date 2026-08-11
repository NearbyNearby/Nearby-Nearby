function formatTime12h(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const h24 = d.getHours();
  const m = d.getMinutes();
  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${m.toString().padStart(2, '0')}${ampm}`;
}

/**
 * formatEventDateTime: always 12-hour. e.g. "Sat Nov 9th • 8am-7pm"
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

/* ------------------------------------------------------------------ */
/* Next-occurrence resolution (#141)                                   */
/*                                                                     */
/* A repeating event is ONE POI whose start_datetime is the FIRST      */
/* occurrence of the series. Rendering that date makes a weekly market  */
/* that began in 2020 look like a stale 2020 listing. Everything that   */
/* shows an event's date resolves the current occurrence instead.       */
/* Mirrors shared/utils/recurring_events.py, minus the query window.    */
/* ------------------------------------------------------------------ */

const WEEKDAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

// Never look further ahead than this; guards against a malformed pattern
// turning the search into an unbounded loop.
const MAX_LOOKAHEAD_YEARS = 5;
const MAX_STEPS = 2000;

/** Parse a date-ish string as LOCAL time ("2026-08-10" must not shift a day). */
function parseLocalish(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || value === '') return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thu" / "TH" / "thursday" / 4 -> 4. Returns null when unrecognized. */
function toWeekdayIndex(token) {
  if (typeof token === 'number' && token >= 0 && token <= 6) return token;
  const t = String(token || '').trim().toLowerCase();
  if (t.length < 2) return null;
  const idx = WEEKDAY_NAMES.findIndex((name) => name.startsWith(t));
  return idx === -1 ? null : idx;
}

/** Same calendar day as `day`, at the clock time of `timeRef`. */
function atTimeOf(day, timeRef) {
  return new Date(
    day.getFullYear(), day.getMonth(), day.getDate(),
    timeRef.getHours(), timeRef.getMinutes(), timeRef.getSeconds(), 0,
  );
}

function startOfToday(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDateKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Ordered candidate occurrences of the rule, starting at the series start. */
function* ruleOccurrences(start, pattern, horizon) {
  const frequency = String(pattern?.frequency || '').trim().toLowerCase();
  const interval = Math.max(1, Number(pattern?.interval) || 1);

  if (frequency === 'weekly') {
    // Mirror shared/utils/recurring_events.py: `days_of_week or days`, where a
    // present-but-EMPTY days_of_week array is falsy and falls through to days.
    // Plain `||` would not do that here, since [] is truthy in JS.
    const daysOfWeek = pattern?.days_of_week;
    const hasDays = Array.isArray(daysOfWeek) ? daysOfWeek.length > 0 : Boolean(daysOfWeek);
    const rawDays = hasDays ? daysOfWeek : (pattern?.days || []);
    const days = [...new Set(
      (Array.isArray(rawDays) ? rawDays : [rawDays])
        .map(toWeekdayIndex)
        .filter((d) => d !== null),
    )].sort((a, b) => a - b);
    const weekdays = days.length > 0 ? days : [start.getDay()];
    for (let week = 0; week < MAX_STEPS; week += 1) {
      const weekBase = new Date(
        start.getFullYear(), start.getMonth(),
        start.getDate() - start.getDay() + week * interval * 7,
      );
      if (weekBase > horizon) return;
      for (const dow of weekdays) {
        const day = new Date(
          weekBase.getFullYear(), weekBase.getMonth(), weekBase.getDate() + dow,
        );
        const candidate = atTimeOf(day, start);
        if (candidate >= start) yield candidate;
      }
    }
    return;
  }

  for (let step = 0; step < MAX_STEPS; step += 1) {
    let candidate;
    if (frequency === 'daily') {
      candidate = new Date(
        start.getFullYear(), start.getMonth(), start.getDate() + step * interval,
        start.getHours(), start.getMinutes(), start.getSeconds(),
      );
    } else if (frequency === 'monthly') {
      candidate = new Date(
        start.getFullYear(), start.getMonth() + step * interval, start.getDate(),
        start.getHours(), start.getMinutes(), start.getSeconds(),
      );
    } else if (frequency === 'yearly') {
      candidate = new Date(
        start.getFullYear() + step * interval, start.getMonth(), start.getDate(),
        start.getHours(), start.getMinutes(), start.getSeconds(),
      );
    } else {
      // No / unknown frequency: the series is effectively a single date.
      if (step === 0) yield start;
      return;
    }
    if (candidate > horizon) return;
    yield candidate;
  }
}

/**
 * getNextOccurrence: the occurrence of `event` a visitor is looking at today.
 *
 * Returns `{ start: Date, end: Date|null }` for the first occurrence that has
 * not finished before today, or `null` when the event has no usable date (or
 * its recurrence already ended). Non-repeating events return their own date so
 * callers can use one code path.
 */
export function getNextOccurrence(event, now = new Date()) {
  const start = parseLocalish(event?.start_datetime);
  if (!start) return null;

  const rawEnd = parseLocalish(event?.end_datetime);
  const end = rawEnd && rawEnd > start ? rawEnd : null;
  const durationMs = end ? end.getTime() - start.getTime() : 0;
  const withEnd = (occStart) => ({
    start: occStart,
    end: durationMs > 0 ? new Date(occStart.getTime() + durationMs) : null,
  });

  if (!event?.is_repeating) return withEnd(start);

  const cutoff = startOfToday(now);
  const recurrenceEnd = parseLocalish(event?.recurrence_end_date);
  const horizon = new Date(
    now.getFullYear() + MAX_LOOKAHEAD_YEARS, now.getMonth(), now.getDate(),
  );
  const excluded = new Set(
    (Array.isArray(event?.excluded_dates) ? event.excluded_dates : [])
      .map((d) => String(d).slice(0, 10)),
  );

  let best = null;
  for (const candidate of ruleOccurrences(start, event?.repeat_pattern, horizon)) {
    if (recurrenceEnd && candidate > recurrenceEnd) break;
    if (excluded.has(toDateKey(candidate))) continue;
    if (candidate.getTime() + durationMs >= cutoff.getTime()) {
      best = candidate;
      break;
    }
  }

  // Manual dates are explicit one-off additions to the series; they are not
  // bounded by the recurrence rule.
  for (const manual of (Array.isArray(event?.manual_dates) ? event.manual_dates : [])) {
    const raw = typeof manual === 'object' && manual !== null ? manual.date : manual;
    const day = parseLocalish(raw);
    if (!day) continue;
    let candidate = atTimeOf(day, start);
    const startTime = typeof manual === 'object' && manual !== null ? manual.start_time : null;
    if (typeof startTime === 'string' && startTime.includes(':')) {
      const [h, m] = startTime.split(':');
      candidate = new Date(
        day.getFullYear(), day.getMonth(), day.getDate(), Number(h), Number(m),
      );
    }
    if (excluded.has(toDateKey(candidate))) continue;
    if (candidate.getTime() + durationMs < cutoff.getTime()) continue;
    if (!best || candidate < best) best = candidate;
  }

  return best ? withEnd(best) : null;
}

/**
 * eventOccursOnDate: does `event` have an occurrence overlapping the given
 * calendar date (a "YYYY-MM-DD" string)? Used by the Nearby date filter
 * (Today / Tomorrow / This Weekend / custom) to test a specific day rather
 * than "today", the way getNextOccurrence does. A repeating event is resolved
 * through the same rule engine (repeat_pattern, recurrence_end_date,
 * excluded_dates), just checked against the target date instead of now.
 */
export function eventOccursOnDate(event, dateStr) {
  const target = parseLocalish(dateStr);
  const start = parseLocalish(event?.start_datetime);
  if (!target || !start) return false;

  const rawEnd = parseLocalish(event?.end_datetime);
  const end = rawEnd && rawEnd > start ? rawEnd : null;
  const durationMs = end ? end.getTime() - start.getTime() : 0;

  const dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const spansDay = (occStart) => {
    const occEnd = durationMs > 0 ? new Date(occStart.getTime() + durationMs) : occStart;
    return occStart < dayEnd && occEnd >= dayStart;
  };

  if (!event?.is_repeating) return spansDay(start);

  const recurrenceEnd = parseLocalish(event?.recurrence_end_date);
  const excluded = new Set(
    (Array.isArray(event?.excluded_dates) ? event.excluded_dates : [])
      .map((d) => String(d).slice(0, 10)),
  );

  for (const candidate of ruleOccurrences(start, event?.repeat_pattern, dayEnd)) {
    if (recurrenceEnd && candidate > recurrenceEnd) break;
    if (excluded.has(toDateKey(candidate))) continue;
    if (spansDay(candidate)) return true;
  }

  // Manual dates are explicit one-off additions to the series (see
  // getNextOccurrence); they are not bounded by the recurrence rule.
  for (const manual of (Array.isArray(event?.manual_dates) ? event.manual_dates : [])) {
    const raw = typeof manual === 'object' && manual !== null ? manual.date : manual;
    const day = parseLocalish(raw);
    if (!day) continue;
    let candidate = atTimeOf(day, start);
    const startTime = typeof manual === 'object' && manual !== null ? manual.start_time : null;
    if (typeof startTime === 'string' && startTime.includes(':')) {
      const [h, m] = startTime.split(':');
      candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(h), Number(m));
    }
    if (excluded.has(toDateKey(candidate))) continue;
    if (spansDay(candidate)) return true;
  }

  return false;
}

/**
 * getEventScheduleLine: one-line schedule summary for an event, shared by
 * EventDetail and DirectionsModal. Repeating events resolve to the occurrence
 * that is current today (#141), not to the first date of the series.
 */
export function getEventScheduleLine(event) {
  if (!event) return null;
  const next = getNextOccurrence(event);
  if (next) return formatEventDateTime(next.start, next.end);
  if (event.is_repeating) {
    return formatRecurrence(event) || formatEventDateTime(event.start_datetime, event.end_datetime);
  }
  return formatEventDateTime(event.start_datetime, event.end_datetime);
}
