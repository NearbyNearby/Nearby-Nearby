/**
 * Hours utility functions for nearby-app
 * Handles display of business hours with proper override logic:
 * 1. Exception hours (highest priority)
 * 2. Holiday hours
 * 3. Seasonal hours (with date ranges)
 * 4. Regular hours (fallback)
 */

import SunCalc from 'suncalc';

/**
 * Resolve a time object (fixed, dawn, or dusk) to an "HH:MM" string.
 * Returns null when the type is unresolvable or when coordinates are missing
 * for a solar-relative type (dawn/dusk).
 *
 * @param {object} timeObj  - e.g. {type:'fixed',time:'06:00'} or {type:'dawn'}
 * @param {Date}   date     - the date to compute sunrise/sunset for
 * @param {number|null} lat - latitude  (WGS-84)
 * @param {number|null} lng - longitude (WGS-84)
 * @returns {string|null}   "HH:MM" or null
 */
function resolveTime(timeObj, date, lat, lng) {
  if (!timeObj) return null;

  if (timeObj.type === 'fixed') {
    return timeObj.time || null;
  }

  // Solar types require coordinates
  if (timeObj.type === 'dawn' || timeObj.type === 'dusk') {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;

    const sunTimes = SunCalc.getTimes(date, lat, lng);
    const solar = timeObj.type === 'dawn' ? sunTimes.sunrise : sunTimes.sunset;

    // Guard against polar edge cases where the value may be Invalid Date
    if (!solar || isNaN(solar.getTime())) return null;

    const hh = String(solar.getHours()).padStart(2, '0');
    const mm = String(solar.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  return null;
}

const DAYS_SHORT = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun'
};

const DAYS_FULL = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

const DAYS_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Holiday date calculations
const HOLIDAY_CALCULATORS = {
  'new_year': (year) => new Date(year, 0, 1),
  'mlk_day': (year) => getNthWeekdayOfMonth(year, 0, 1, 3), // 3rd Monday of January
  'presidents_day': (year) => getNthWeekdayOfMonth(year, 1, 1, 3), // 3rd Monday of February
  'memorial_day': (year) => getLastWeekdayOfMonth(year, 4, 1), // Last Monday of May
  'juneteenth': (year) => new Date(year, 5, 19),
  'independence_day': (year) => new Date(year, 6, 4),
  'labor_day': (year) => getNthWeekdayOfMonth(year, 8, 1, 1), // 1st Monday of September
  'columbus_day': (year) => getNthWeekdayOfMonth(year, 9, 1, 2), // 2nd Monday of October
  'veterans_day': (year) => new Date(year, 10, 11),
  'thanksgiving': (year) => getNthWeekdayOfMonth(year, 10, 4, 4), // 4th Thursday of November
  'black_friday': (year) => {
    const thanksgiving = getNthWeekdayOfMonth(year, 10, 4, 4);
    return new Date(thanksgiving.getTime() + 24 * 60 * 60 * 1000);
  },
  'christmas_eve': (year) => new Date(year, 11, 24),
  'christmas': (year) => new Date(year, 11, 25),
  'new_year_eve': (year) => new Date(year, 11, 31),
  'easter': (year) => calculateEaster(year),
  'good_friday': (year) => {
    const easter = calculateEaster(year);
    return new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000);
  },
  'mothers_day': (year) => getNthWeekdayOfMonth(year, 4, 0, 2), // 2nd Sunday of May
  'fathers_day': (year) => getNthWeekdayOfMonth(year, 5, 0, 3), // 3rd Sunday of June
  'halloween': (year) => new Date(year, 9, 31),
  'valentines_day': (year) => new Date(year, 1, 14)
};

/**
 * Canonical holiday list (#116) in admin-form order.
 *
 * The same 20 holidays, in the same order, live in
 * nearby-admin/frontend/src/components/HoursSelector.jsx (COMMON_HOLIDAYS) and
 * shared/utils/hours_resolution.py (HOLIDAYS). Keep all three in lockstep.
 */
export const HOLIDAYS = [
  { key: 'new_year', name: "New Year's Day" },
  { key: 'mlk_day', name: 'MLK Jr. Day' },
  { key: 'presidents_day', name: "Presidents' Day" },
  { key: 'memorial_day', name: 'Memorial Day' },
  { key: 'juneteenth', name: 'Juneteenth' },
  { key: 'independence_day', name: 'Independence Day' },
  { key: 'labor_day', name: 'Labor Day' },
  { key: 'columbus_day', name: 'Columbus Day' },
  { key: 'veterans_day', name: 'Veterans Day' },
  { key: 'thanksgiving', name: 'Thanksgiving' },
  { key: 'black_friday', name: 'Black Friday' },
  { key: 'christmas_eve', name: 'Christmas Eve' },
  { key: 'christmas', name: 'Christmas Day' },
  { key: 'new_year_eve', name: "New Year's Eve" },
  { key: 'easter', name: 'Easter Sunday' },
  { key: 'good_friday', name: 'Good Friday' },
  { key: 'mothers_day', name: "Mother's Day" },
  { key: 'fathers_day', name: "Father's Day" },
  { key: 'halloween', name: 'Halloween' },
  { key: 'valentines_day', name: "Valentine's Day" }
];

/**
 * Holidays where an unconfirmed entry is worth telling visitors about (#116, P1).
 * The other 11 fall through to the normal schedule silently.
 */
export const MAJOR_CLOSURE_HOLIDAYS = new Set([
  'new_year',
  'memorial_day',
  'independence_day',
  'labor_day',
  'thanksgiving',
  'christmas_eve',
  'christmas',
  'new_year_eve',
  'easter'
]);

// Visitor-facing text for a major holiday the business has not answered for.
export const HOLIDAY_UNCONFIRMED_TEXT =
  'Holiday hours not confirmed - please check with the business';

// Format a holiday key to human-readable name
function formatHolidayName(key) {
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * Resolve a holiday entry to one of the #116 modes:
 * 'follows_regular' | 'open' | 'closed' | 'modified' | 'unconfirmed'.
 *
 * `mode` wins when present. Otherwise the legacy `status` is mapped so pre-#116
 * rows keep the meaning they have in production: 'open' meant "no special
 * hours, use the normal schedule", NOT the new always-open mode. A missing
 * entry is 'unconfirmed' (absence is the answer, we never write stub rows).
 *
 * Python twin: shared/utils/hours_resolution.py get_holiday_mode().
 */
export function getHolidayMode(entry) {
  if (!entry || typeof entry !== 'object') return 'unconfirmed';
  if (entry.mode) return entry.mode;
  if (entry.status === 'open') return 'follows_regular';
  if (entry.status === 'closed') return 'closed';
  if (entry.status === 'modified') return 'modified';
  return 'unconfirmed';
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** Return the canonical HOLIDAYS entry falling on `date`, or null. */
function getCanonicalHolidayForDate(date) {
  for (const holiday of HOLIDAYS) {
    const calculator = HOLIDAY_CALCULATORS[holiday.key];
    if (calculator && isSameLocalDay(calculator(date.getFullYear()), date)) {
      return holiday;
    }
  }
  return null;
}

/**
 * Get upcoming holidays for display (#116).
 *
 * Iterates the canonical HOLIDAYS list rather than only the configured keys, so
 * a major holiday nobody answered for can still be surfaced as unconfirmed.
 * Minor holidays with no entry are skipped: they just follow the normal
 * schedule (P1).
 *
 * Issue #70: holidays are read from `hours.holidays` only; the legacy top-level
 * `holiday_hours` column is deprecated and never consulted.
 *
 * @param {object} hoursData - the FULL hours blob (needs .holidays plus the
 *                             regular/seasonal schedule to derive results)
 * @param {number|null} count - cap the number of rows returned
 * @returns {Array<{key,name,date,dateStr,hours,mode,note,statusText,unconfirmed}>}
 */
export function getUpcomingHolidays(hoursData, count = null) {
  if (!hoursData || typeof hoursData !== 'object') return [];

  const holidayEntries = hoursData.holidays || {};
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const currentYear = now.getFullYear();
  const upcoming = [];

  for (const { key, name } of HOLIDAYS) {
    const calculator = HOLIDAY_CALCULATORS[key];
    if (!calculator) continue;

    let holidayDate = calculator(currentYear);
    // If holiday already passed this year, get next year's date
    if (holidayDate < now) {
      holidayDate = calculator(currentYear + 1);
    }

    const entry = holidayEntries[key];
    const mode = getHolidayMode(entry);
    if (mode === 'unconfirmed' && !MAJOR_CLOSURE_HOLIDAYS.has(key)) continue;

    const effective = getEffectiveHoursForDate(hoursData, holidayDate);
    const statusText = effective.source === 'holiday_unconfirmed'
      ? HOLIDAY_UNCONFIRMED_TEXT
      : formatDayHours(effective.hours);
    if (!statusText) continue;

    upcoming.push({
      key,
      name: entry?.name || name || formatHolidayName(key),
      date: holidayDate,
      dateStr: holidayDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      }),
      hours: entry || null,
      mode,
      note: entry?.note || null,
      statusText,
      unconfirmed: mode === 'unconfirmed'
    });
  }

  upcoming.sort((a, b) => a.date - b.date);
  return count ? upcoming.slice(0, count) : upcoming;
}

/**
 * Format a time string from "HH:MM" to "Ham/pm" format
 */
function formatTimeString(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  if (minutes === '00') {
    return `${displayHour}${ampm}`;
  }
  return `${displayHour}:${minutes}${ampm}`;
}

/**
 * Format legacy hours format (object with day keys and time strings/arrays)
 * Returns array of { day, dayShort, hours } for display
 */
export function formatLegacyHours(hours) {
  if (!hours || typeof hours !== 'object') return [];

  const result = [];

  for (const day of DAYS_ORDER) {
    const dayData = hours[day];
    let hoursText = 'Closed';

    if (dayData) {
      if (typeof dayData === 'string') {
        // Simple string like "9:00-17:00" or "Closed"
        if (dayData.toLowerCase() === 'closed') {
          hoursText = 'Closed';
        } else if (dayData.includes('-')) {
          const [open, close] = dayData.split('-').map(t => t.trim());
          hoursText = `${formatTimeString(open)} - ${formatTimeString(close)}`;
        } else {
          hoursText = dayData;
        }
      } else if (Array.isArray(dayData)) {
        // Array of periods like [{open: "9:00", close: "12:00"}, {open: "13:00", close: "17:00"}]
        const periods = dayData.map(period => {
          if (period.open && period.close) {
            return `${formatTimeString(period.open)} - ${formatTimeString(period.close)}`;
          }
          return '';
        }).filter(Boolean);
        hoursText = periods.length > 0 ? periods.join(', ') : 'Closed';
      } else if (typeof dayData === 'object') {
        // Object format with status and periods
        if (dayData.status === 'closed') {
          hoursText = 'Closed';
        } else if (dayData.status === '24hours') {
          hoursText = 'Open 24 Hours';
        } else if (dayData.status === 'open' && dayData.periods) {
          const periods = dayData.periods.map(period => {
            const open = period.open?.time || period.open;
            const close = period.close?.time || period.close;
            if (open && close) {
              return `${formatTimeString(open)} - ${formatTimeString(close)}`;
            }
            return '';
          }).filter(Boolean);
          hoursText = periods.length > 0 ? periods.join(', ') : 'Hours not set';
        }
      }
    }

    result.push({
      day,
      dayShort: DAYS_SHORT[day],
      dayFull: DAYS_FULL[day],
      hours: hoursText
    });
  }

  return result;
}

/**
 * Format holiday hours status for display.
 *
 * Preferred input is a row from getUpcomingHolidays(), which already carries
 * the derived `statusText` for that year's date. The legacy path below still
 * handles a raw `hours.holidays[key]` entry.
 */
export function formatHolidayStatus(hours) {
  if (!hours) return 'Regular Hours';
  if (hours.statusText) return hours.statusText;
  if (hours.status === 'closed' || hours === 'closed') return 'Closed';
  if (hours.status === '24hours') return 'Open 24 Hours';
  if (hours.status === 'modified' && hours.periods) {
    const periods = hours.periods.map(p => {
      const open = formatTimeString(p.open?.time || p.open);
      const close = formatTimeString(p.close?.time || p.close);
      return `${open} - ${close}`;
    });
    return periods.join(', ');
  }
  if (typeof hours === 'string') return hours;
  return 'Modified Hours';
}

// Get nth weekday of month (0=Sunday, 1=Monday, etc.)
function getNthWeekdayOfMonth(year, month, weekday, n) {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  let dayOffset = weekday - firstWeekday;
  if (dayOffset < 0) dayOffset += 7;
  const day = 1 + dayOffset + (n - 1) * 7;
  return new Date(year, month, day);
}

// Get last weekday of month
function getLastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(year, month + 1, 0);
  const lastDayWeekday = lastDay.getDay();
  let dayOffset = lastDayWeekday - weekday;
  if (dayOffset < 0) dayOffset += 7;
  return new Date(year, month + 1, -dayOffset);
}

// Calculate Easter Sunday (using Anonymous Gregorian algorithm)
function calculateEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// Format time from 24hr to 12hr
export function formatTime(timeObj) {
  if (!timeObj) return '';

  if (timeObj.type === 'fixed' && timeObj.time) {
    const [hours, minutes] = timeObj.time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  if (timeObj.type === 'dawn') return 'Dawn';
  if (timeObj.type === 'dusk') return 'Dusk';
  if (timeObj.type === 'appointment') return 'By Appointment';
  if (timeObj.type === 'call') return 'Call for Hours';

  return '';
}

// Format a single day's hours. Returns null when there is nothing to say.
export function formatDayHours(hours) {
  if (!hours) return 'Closed';

  // #118 - a location with no weekly schedule never renders a day line, and
  // must never render "Closed".
  if (hours.status === 'no_regular_hours') return null;

  if (hours.status === 'closed') return 'Closed';
  if (hours.status === '24hours') return 'Open 24 Hours';
  if (hours.status === 'appointment') return 'By Appointment';
  // #116 P3 - open for the holiday but the hours were never filled in.
  if (hours.status === 'open' && hours.hoursVary) return 'Open - hours vary, call ahead';

  if (hours.status === 'open' && hours.periods) {
    return hours.periods.map(period => {
      const open = formatTime(period.open);
      const close = formatTime(period.close);
      return `${open} - ${close}`;
    }).join(', ');
  }

  return 'Hours not set';
}

// Check if a date matches a recurring monthly exception
function matchesRecurringException(date, exception) {
  if (!exception || exception.type !== 'recurring' || !exception.pattern) return false;

  const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, etc.
  const month = date.getMonth() + 1; // 1-12

  // Map day names to numbers
  const dayMap = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6
  };

  // Map ordinal to number
  const ordinalMap = {
    'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'last': 'last'
  };

  const { ordinal, dayOfWeek: targetDayName, months } = exception.pattern;

  // Check if this month is included (empty array means all months)
  if (months && months.length > 0) {
    if (!months.includes(String(month))) return false;
  }

  // Check if this is the correct day of week
  const targetDay = dayMap[targetDayName?.toLowerCase()];
  if (targetDay === undefined || dayOfWeek !== targetDay) return false;

  // Calculate which occurrence of this weekday in the month
  const dayOfMonth = date.getDate();
  const weekOfMonth = Math.ceil(dayOfMonth / 7);

  if (ordinal === 'last') {
    // Check if this is the last occurrence of this weekday
    const nextWeek = new Date(date);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.getMonth() !== date.getMonth();
  }

  const targetWeek = ordinalMap[ordinal];
  return weekOfMonth === targetWeek;
}

// Check if a date falls within a seasonal date range
function isInSeasonalRange(date, seasonData) {
  if (!seasonData) return false;

  // If season has custom date range, use it
  if (seasonData.startDate && seasonData.endDate) {
    const start = new Date(seasonData.startDate);
    const end = new Date(seasonData.endDate);
    return date >= start && date <= end;
  }

  // Fall back to month-based seasons
  const month = date.getMonth() + 1;
  const seasonMonths = {
    'spring': [3, 4, 5],
    'summer': [6, 7, 8],
    'fall': [9, 10, 11],
    'winter': [12, 1, 2]
  };

  for (const [season, months] of Object.entries(seasonMonths)) {
    if (seasonData[season] && months.includes(month)) {
      return season;
    }
  }

  return false;
}

// Get current active season
function getActiveSeason(date, seasonalData) {
  if (!seasonalData) return null;

  const currentYear = date.getFullYear();
  const month = date.getMonth() + 1;
  const dayOfMonth = date.getDate();

  // Check each season for custom date ranges first (useDateRange flag)
  for (const [seasonName, seasonData] of Object.entries(seasonalData)) {
    if (seasonData.useDateRange && seasonData.startDate && seasonData.endDate) {
      // Parse MM-DD format and compare with current date
      const [startMonth, startDay] = seasonData.startDate.split('-').map(Number);
      const [endMonth, endDay] = seasonData.endDate.split('-').map(Number);

      // Create dates for comparison (handle year wrap for ranges like Dec-Feb)
      let startDate = new Date(currentYear, startMonth - 1, startDay);
      let endDate = new Date(currentYear, endMonth - 1, endDay);

      // If end is before start, the range wraps around the year
      if (endDate < startDate) {
        // Check if date is after start OR before end
        const dateThisYear = new Date(currentYear, month - 1, dayOfMonth);
        if (dateThisYear >= startDate || dateThisYear <= endDate) {
          return seasonName;
        }
      } else {
        // Normal range within same year
        const dateThisYear = new Date(currentYear, month - 1, dayOfMonth);
        if (dateThisYear >= startDate && dateThisYear <= endDate) {
          return seasonName;
        }
      }
    }
  }

  // Fall back to month-based seasons for seasons without custom date ranges
  const seasonMonths = {
    'spring': [3, 4, 5],
    'summer': [6, 7, 8],
    'fall': [9, 10, 11],
    'winter': [12, 1, 2]
  };

  for (const [seasonName, months] of Object.entries(seasonMonths)) {
    if (seasonalData[seasonName] && !seasonalData[seasonName].useDateRange && months.includes(month)) {
      return seasonName;
    }
  }

  return null;
}

// Check if a date is a holiday
function getHolidayForDate(date, holidaysData) {
  if (!holidaysData) return null;

  const year = date.getFullYear();
  const dateStr = date.toISOString().split('T')[0];

  for (const [holidayId, holiday] of Object.entries(holidaysData)) {
    // Try to calculate the holiday date
    if (HOLIDAY_CALCULATORS[holidayId]) {
      const holidayDate = HOLIDAY_CALCULATORS[holidayId](year);
      if (holidayDate.toISOString().split('T')[0] === dateStr) {
        return { id: holidayId, ...holiday };
      }
    }

    // Check fixed date format (MM-DD)
    if (holiday.date && holiday.date.match(/^\d{2}-\d{2}$/)) {
      const [month, day] = holiday.date.split('-');
      const holidayDate = new Date(year, parseInt(month) - 1, parseInt(day));
      if (holidayDate.toISOString().split('T')[0] === dateStr) {
        return { id: holidayId, ...holiday };
      }
    }
  }

  return null;
}

// Get exception for a specific date
function getExceptionForDate(date, exceptionsData) {
  if (!date || !exceptionsData) return null;

  const dateStr = date.toISOString().split('T')[0];

  // Check all exceptions - both one-time and recurring are now in the same array
  for (const exception of exceptionsData) {
    // One-time exception
    if (!exception.type || exception.type === 'one-time') {
      if (exception.date === dateStr) {
        return { ...exception, type: 'one-time' };
      }
    }
    // Recurring exception
    else if (exception.type === 'recurring') {
      if (matchesRecurringException(date, exception)) {
        return exception;
      }
    }
  }

  return null;
}

/**
 * Get the effective hours for a specific date
 * Returns { hours, source, label } where source indicates override type
 */
/**
 * Convert the backend's flat hours shape
 *   { monday: [{open:"06:30", close:"17:00"}], tuesday: {closed:true}, ... }
 * into the structured shape these helpers expect
 *   { regular: { monday: { status:'open', periods:[{open:{type:'fixed',time}, close:{type:'fixed',time}}] }, ... } }
 * Pass-through if already in the structured shape (has `regular` key).
 */
function normalizeHoursData(hoursData) {
  if (!hoursData || typeof hoursData !== 'object') return hoursData;
  if (hoursData.regular) return hoursData;

  const dayKeys = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const hasDayKey = dayKeys.some((d) => d in hoursData);
  if (!hasDayKey) return hoursData;

  const regular = {};
  for (const day of dayKeys) {
    const v = hoursData[day];
    if (v == null) continue;
    if (Array.isArray(v)) {
      const periods = v
        .filter((p) => p && p.open && p.close)
        .map((p) => ({
          open: { type: 'fixed', time: p.open },
          close: { type: 'fixed', time: p.close },
        }));
      regular[day] = periods.length ? { status: 'open', periods } : { status: 'closed' };
    } else if (typeof v === 'object') {
      if (v.closed === true || v.status === 'closed') regular[day] = { status: 'closed' };
      else if (v.status === '24hours') regular[day] = { status: '24hours' };
      else if (v.status === 'appointment') regular[day] = { status: 'appointment' };
      else if (v.status === 'open' && Array.isArray(v.periods)) regular[day] = v;
    } else if (typeof v === 'string' && v.toLowerCase() === 'closed') {
      regular[day] = { status: 'closed' };
    }
  }
  return {
    regular,
    exceptions: hoursData.exceptions,
    holidays: hoursData.holidays,
    seasonal: hoursData.seasonal,
    seasonal_only: hoursData.seasonal_only,
    no_regular_hours: hoursData.no_regular_hours,
  };
}

/**
 * Resolve the schedule that applies when no exception or holiday overrides the
 * date: the #118 no-regular-hours flag, then seasonal, then regular.
 * Returns the same { hours, source, label } shape as getEffectiveHoursForDate.
 */
function resolveBaseHoursForDate(hoursData, date, dayName) {
  // #118 - this location keeps no weekly schedule at all. Wins over
  // seasonal_only and regular (P4); exceptions and holidays still apply.
  if (hoursData.no_regular_hours === true) {
    return {
      hours: { status: 'no_regular_hours' },
      source: 'no_regular_hours',
      label: 'No regular hours',
    };
  }

  const activeSeason = getActiveSeason(date, hoursData.seasonal);
  if (activeSeason && hoursData.seasonal[activeSeason]) {
    const seasonalDayHours = hoursData.seasonal[activeSeason][dayName];
    if (seasonalDayHours) {
      const seasonNames = {
        'spring': 'Spring Hours',
        'summer': 'Summer Hours',
        'fall': 'Fall Hours',
        'winter': 'Winter Hours'
      };
      return { hours: seasonalDayHours, source: 'seasonal', label: seasonNames[activeSeason] };
    }
  }

  // Fall back to regular hours, UNLESS this location is seasonal-only (#46).
  // When seasonal_only===true and no seasonal period is active for today, report
  // closed-by-seasonal-schedule rather than leaking stale regular hours.
  if (hoursData.seasonal_only === true) {
    return {
      hours: { status: 'closed' },
      source: 'seasonal',
      label: 'Closed — see seasonal schedule',
    };
  }

  const regularHours = hoursData.regular?.[dayName];
  return { hours: regularHours, source: 'regular', label: null };
}

export function getEffectiveHoursForDate(hoursData, date) {
  hoursData = normalizeHoursData(hoursData);
  if (!hoursData) {
    return { hours: null, source: 'none', label: null };
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[date.getDay()];

  // 1. Check exceptions first (highest priority) - both one-time and recurring are in exceptions array
  const exception = getExceptionForDate(date, hoursData.exceptions);
  if (exception) {
    const label = exception.reason || (exception.type === 'recurring' ? 'Modified Schedule' : 'Special Hours');
    if (exception.status === 'closed') {
      return { hours: { status: 'closed' }, source: 'exception', label };
    }
    if (exception.status === 'modified' && exception.periods) {
      return { hours: { status: 'open', periods: exception.periods }, source: 'exception', label };
    }
    if (exception.status === 'open') {
      // Fall through to regular hours but mark as exception
      const regularHours = hoursData.regular?.[dayName];
      return { hours: regularHours, source: 'exception', label };
    }
  }

  // 2. Check holiday hours (#116) - mode driven, with legacy status mapping
  const holiday = getHolidayForDate(date, hoursData.holidays);
  const canonical = getCanonicalHolidayForDate(date);
  let holidayLabel = null;
  let holidayNote = null;

  if (holiday) {
    const mode = getHolidayMode(holiday);
    holidayLabel = holiday.name || canonical?.name || null;
    holidayNote = holiday.note || null;
    const periods = holiday.periods;

    if (mode === 'closed') {
      return { hours: { status: 'closed' }, source: 'holiday', label: holidayLabel, note: holidayNote };
    }
    if (mode === 'modified' && periods?.length) {
      return { hours: { status: 'open', periods }, source: 'holiday', label: holidayLabel, note: holidayNote };
    }
    if (mode === 'open') {
      if (periods?.length) {
        return { hours: { status: 'open', periods }, source: 'holiday', label: holidayLabel, note: holidayNote };
      }
      // No holiday-specific periods saved: reuse the day's normal schedule when
      // there is one, otherwise say the hours are unknown (P3).
      const base = resolveBaseHoursForDate(hoursData, date, dayName);
      const baseHours = base.hours || {};
      if (baseHours.status === 'open' && baseHours.periods?.length) {
        return {
          hours: { status: 'open', periods: baseHours.periods },
          source: 'holiday',
          label: holidayLabel,
          note: holidayNote,
        };
      }
      if (baseHours.status === '24hours') {
        return { hours: { status: '24hours' }, source: 'holiday', label: holidayLabel, note: holidayNote };
      }
      return {
        hours: { status: 'open', hoursVary: true },
        source: 'holiday',
        label: holidayLabel,
        note: holidayNote,
      };
    }
    // follows_regular (and a modified entry with no periods) falls through to
    // the normal schedule, carrying the holiday name for the UI.
  } else if (canonical && MAJOR_CLOSURE_HOLIDAYS.has(canonical.key)) {
    // Nobody answered for a holiday people plan around (P1/P2).
    return {
      hours: null,
      source: 'holiday_unconfirmed',
      label: canonical.name,
      unconfirmed: true,
    };
  }

  // 3. no_regular_hours (#118) → 4. seasonal → 5. regular
  const base = resolveBaseHoursForDate(hoursData, date, dayName);
  return holidayLabel ? { ...base, label: holidayLabel, note: holidayNote } : base;
}

/**
 * Get hours for a week starting from a given date
 * Returns array of { date, dayName, hours, source, label, isToday }
 */
export function getWeekHours(hoursData, startDate = new Date()) {
  // #118 - no weekly schedule means no day grid at all.
  if (hoursData?.no_regular_hours === true) return [];

  const weekHours = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[date.getDay()];

    const effective = getEffectiveHoursForDate(hoursData, date);

    weekHours.push({
      date,
      dayName,
      dayLabel: DAYS_FULL[dayName],
      dayShort: DAYS_SHORT[dayName],
      hours: effective.hours,
      formattedHours: effective.source === 'holiday_unconfirmed'
        ? HOLIDAY_UNCONFIRMED_TEXT
        : formatDayHours(effective.hours),
      source: effective.source,
      label: effective.label,
      note: effective.note || null,
      isToday: date.getTime() === today.getTime(),
      isModified: effective.source !== 'regular'
    });
  }

  return weekHours;
}

/**
 * Check if currently open based on all override rules.
 *
 * @param {object}      hoursData - structured hours object from POI
 * @param {number|null} lat       - POI latitude  (poi.location.coordinates[1])
 * @param {number|null} lng       - POI longitude (poi.location.coordinates[0])
 */
export function isCurrentlyOpen(hoursData, lat = null, lng = null) {
  if (!hoursData) return { isOpen: false, status: 'unknown' };

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const { hours, source, label } = getEffectiveHoursForDate(hoursData, now);

  if (!hours) {
    return { isOpen: false, status: 'Hours not set' };
  }

  // #118 - never report "Closed" for a location that keeps no schedule.
  if (hours.status === 'no_regular_hours') {
    return { isOpen: false, status: 'No regular hours', source, label };
  }

  if (hours.status === 'closed') {
    return {
      isOpen: false,
      status: label ? `Closed - ${label}` : 'Closed',
      source,
      label
    };
  }

  if (hours.status === '24hours') {
    return {
      isOpen: true,
      status: 'Open 24 Hours',
      source,
      label
    };
  }

  if (hours.status === 'appointment') {
    return {
      isOpen: false,
      status: 'By Appointment Only',
      source,
      label
    };
  }

  if (hours.status === 'open' && hours.periods) {
    for (const period of hours.periods) {
      // Skip non-time-of-day period types (e.g. call-ahead)
      if (!period.open || !period.close) continue;

      const openType = period.open.type;
      const closeType = period.close.type;

      // appointment/call periods — leave as-is, no open status
      if (openType === 'appointment' || closeType === 'appointment' ||
          openType === 'call' || closeType === 'call') {
        continue;
      }

      // Resolve both ends; if either is a solar type without coords, return unknown
      const openTime = resolveTime(period.open, now, lat, lng);
      const closeTime = resolveTime(period.close, now, lat, lng);

      if (!openTime || !closeTime) {
        // Dawn/dusk period but no coordinates — honest unknown, not false "Closed"
        return {
          isOpen: false,
          status: 'Hours vary by season',
          source,
          label
        };
      }

      // Handle times that cross midnight
      if (closeTime < openTime) {
        if (currentTime >= openTime || currentTime < closeTime) {
          return {
            isOpen: true,
            status: `Open until ${formatTime(period.close)}`,
            source,
            label
          };
        }
      } else {
        if (currentTime >= openTime && currentTime < closeTime) {
          return {
            isOpen: true,
            status: `Open until ${formatTime(period.close)}`,
            source,
            label
          };
        }
      }
    }

    // Check if we're before opening (use resolved time for first period)
    const firstPeriod = hours.periods[0];
    if (firstPeriod?.open) {
      const firstOpenTime = resolveTime(firstPeriod.open, now, lat, lng);
      if (firstOpenTime && currentTime < firstOpenTime) {
        return {
          isOpen: false,
          status: `Opens at ${formatTime(firstPeriod.open)}`,
          source,
          label
        };
      }
    }
  }

  return {
    isOpen: false,
    status: 'Closed',
    source,
    label
  };
}

/**
 * Find the next open transition after `fromDate`.
 * Walks today's remaining periods (if any), then days 1..7 forward.
 * Returns { dayLabel, openLabel } or null (closed all week / no hours).
 *
 * @param {object}      hoursData - structured hours object from POI
 * @param {Date}        fromDate  - the reference "now" date
 * @param {number|null} lat       - POI latitude  (GeoJSON: coordinates[1])
 * @param {number|null} lng       - POI longitude (GeoJSON: coordinates[0])
 * @returns {{ dayLabel: string, openLabel: string }|null}
 */
export function getNextOpenTransition(hoursData, fromDate = new Date(), lat = null, lng = null) {
  if (!hoursData) return null;

  const now = fromDate;
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const toMins = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  const MAX_DAYS = 7;
  for (let i = 0; i <= MAX_DAYS; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(now.getDate() + i);
    checkDate.setHours(0, 0, 0, 0);

    const { hours } = getEffectiveHoursForDate(hoursData, checkDate);
    if (!hours || hours.status === 'closed' || hours.status === 'appointment') continue;
    if (hours.status === '24hours') {
      const label = i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : DAYS_FULL[['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][checkDate.getDay()]] || checkDate.toLocaleDateString('en-US', { weekday: 'long' }));
      return { dayLabel: label, openLabel: 'Open 24 Hours' };
    }

    if (hours.status === 'open' && Array.isArray(hours.periods)) {
      for (const period of hours.periods) {
        if (!period.open || !period.close) continue;
        if (period.open.type === 'appointment' || period.open.type === 'call') continue;

        const openTimeStr = resolveTime(period.open, checkDate, lat, lng);
        if (!openTimeStr) continue;

        const openMins = toMins(openTimeStr);
        // On day 0 (today), skip periods whose open time is already past
        if (i === 0 && openMins != null && openMins <= currentMins) continue;

        const openFormatted = formatTime(period.open);
        const dayNames7 = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        const dayKey = dayNames7[checkDate.getDay()];
        const label = i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : (DAYS_FULL[dayKey] || checkDate.toLocaleDateString('en-US', { weekday: 'long' })));
        return { dayLabel: label, openLabel: openFormatted };
      }
    }
  }

  return null;
}

/**
 * Single source-of-truth for status badge on detail pages and cards.
 * Computes open/closed status against `now` (default: current time).
 * Returns { variant, label } where:
 *   variant = 'open' | 'closed' | 'opensoon' | null
 *   label   = e.g. "Open until 8:00 PM", "Closed · Opens Tomorrow 9:00 AM"
 *
 * Unlike isCurrentlyOpen(), this function respects the `now` argument so it
 * can be used in tests with a deterministic date.
 *
 * @param {object}      hoursData - structured hours object from POI
 * @param {Date}        now       - reference "now" (default: new Date())
 * @param {number|null} lat       - POI latitude  (GeoJSON: coordinates[1])
 * @param {number|null} lng       - POI longitude (GeoJSON: coordinates[0])
 * @returns {{ variant: string|null, label: string|null }}
 */
export function getOpenCloseStatusLabel(hoursData, now = new Date(), lat = null, lng = null) {
  if (!hoursData) return { variant: null, label: null };

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const { hours, source, label: overrideLabel } = getEffectiveHoursForDate(hoursData, now);

  // No hours to judge by: an unconfirmed major holiday (#116 P2) lands here too,
  // which is exactly why the badge is suppressed rather than guessed.
  if (!hours) return { variant: null, label: null };

  // #118 - no weekly schedule, so no open/closed claim anywhere.
  if (hours.status === 'no_regular_hours') return { variant: null, label: null };

  // Special statuses
  if (hours.status === 'closed') {
    const statusStr = overrideLabel ? `Closed · ${overrideLabel}` : 'Closed';
    const next = getNextOpenTransition(hoursData, now, lat, lng);
    if (next) {
      const prefix = next.dayLabel === 'Today' ? 'Opens ' : `Opens ${next.dayLabel} `;
      return { variant: 'closed', label: `Closed · ${prefix}${next.openLabel}` };
    }
    return { variant: 'closed', label: statusStr };
  }

  if (hours.status === '24hours') {
    return { variant: 'open', label: 'Open 24 Hours' };
  }

  if (hours.status === 'appointment') {
    return { variant: 'closed', label: 'By Appointment Only' };
  }

  // #116 P3 - open for the holiday, hours never filled in.
  if (hours.status === 'open' && hours.hoursVary) {
    return { variant: 'open', label: 'Open - hours vary, call ahead' };
  }

  if (hours.status === 'open' && Array.isArray(hours.periods)) {
    // Check if we're inside an open period
    for (const period of hours.periods) {
      if (!period.open || !period.close) continue;
      if (period.open.type === 'appointment' || period.open.type === 'call' ||
          period.close.type === 'appointment' || period.close.type === 'call') continue;

      const openTime = resolveTime(period.open, now, lat, lng);
      const closeTime = resolveTime(period.close, now, lat, lng);

      if (!openTime || !closeTime) {
        // Solar type without coords — honest unknown
        return { variant: null, label: 'Hours vary by season' };
      }

      const isOpen = closeTime < openTime
        ? (currentTime >= openTime || currentTime < closeTime)
        : (currentTime >= openTime && currentTime < closeTime);

      if (isOpen) {
        return { variant: 'open', label: `Open until ${formatTime(period.close)}` };
      }
    }

    // Not in any open period — check if a future slot exists today
    const firstPeriod = hours.periods[0];
    if (firstPeriod?.open) {
      const firstOpenTime = resolveTime(firstPeriod.open, now, lat, lng);
      if (firstOpenTime && currentTime < firstOpenTime) {
        return { variant: 'opensoon', label: `Opens at ${formatTime(firstPeriod.open)}` };
      }
    }

    // Past all of today's periods — look ahead
    const next = getNextOpenTransition(hoursData, now, lat, lng);
    if (next) {
      const prefix = next.dayLabel === 'Today' ? 'Opens ' : `Opens ${next.dayLabel} `;
      return { variant: 'closed', label: `Closed · ${prefix}${next.openLabel}` };
    }

    return { variant: 'closed', label: 'Closed' };
  }

  return { variant: null, label: null };
}

/**
 * Group consecutive days with same hours for compact display
 */
export function groupHours(hoursData) {
  if (!hoursData || !hoursData.regular) return [];

  const groups = [];
  let currentGroup = null;

  DAYS_ORDER.forEach(day => {
    const dayHours = hoursData.regular[day];
    const formatted = formatDayHours(dayHours);

    if (!currentGroup || currentGroup.hours !== formatted) {
      currentGroup = {
        days: [day],
        hours: formatted
      };
      groups.push(currentGroup);
    } else {
      currentGroup.days.push(day);
    }
  });

  return groups;
}

/**
 * Format grouped hours for display
 */
export function formatGroupedHours(group) {
  const days = group.days;

  if (days.length === 1) {
    return { days: DAYS_SHORT[days[0]], hours: group.hours };
  }

  if (days.length === 7) {
    return { days: 'Every day', hours: group.hours };
  }

  if (days.length === 5 && days[0] === 'monday' && days[4] === 'friday') {
    return { days: 'Mon - Fri', hours: group.hours };
  }

  if (days.length === 2 && days[0] === 'saturday' && days[1] === 'sunday') {
    return { days: 'Sat - Sun', hours: group.hours };
  }

  const firstDay = DAYS_SHORT[days[0]];
  const lastDay = DAYS_SHORT[days[days.length - 1]];
  return { days: `${firstDay} - ${lastDay}`, hours: group.hours };
}

export default {
  HOLIDAYS,
  MAJOR_CLOSURE_HOLIDAYS,
  HOLIDAY_UNCONFIRMED_TEXT,
  formatTime,
  formatDayHours,
  getHolidayMode,
  getEffectiveHoursForDate,
  getWeekHours,
  isCurrentlyOpen,
  getNextOpenTransition,
  getOpenCloseStatusLabel,
  groupHours,
  formatGroupedHours,
  getUpcomingHolidays,
  formatLegacyHours,
  formatHolidayStatus
};
