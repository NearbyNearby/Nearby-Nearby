import { useState, useEffect, memo, useCallback, useMemo, useRef } from 'react';
import {
  Stack, Group, Text, Button, Select, Switch, ActionIcon,
  Checkbox, Divider, Card, Badge, Tabs, Alert, TextInput,
  SegmentedControl, Collapse, SimpleGrid, NumberInput,
  Tooltip, MultiSelect, Modal, CloseButton
} from '@mantine/core';
import { TimeInput, DatePickerInput } from '@mantine/dates';
import {
  IconPlus, IconTrash, IconCopy, IconSun, IconMoon,
  IconCalendar, IconClock, IconAlertCircle, IconSnowflake,
  IconFlower, IconLeaf, IconSunHigh, IconRepeat
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

// Ordinal week options for recurring exceptions
const ORDINAL_OPTIONS = [
  { value: 'first', label: 'First' },
  { value: 'second', label: 'Second' },
  { value: 'third', label: 'Third' },
  { value: 'fourth', label: 'Fourth' },
  { value: 'last', label: 'Last' }
];

const MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

// Common holiday definitions
const COMMON_HOLIDAYS = [
  { value: 'new_year', label: "New Year's Day", date: '01-01' },
  { value: 'mlk_day', label: 'Martin Luther King Jr. Day', date: 'third_monday_january' },
  { value: 'presidents_day', label: "Presidents' Day", date: 'third_monday_february' },
  { value: 'memorial_day', label: 'Memorial Day', date: 'last_monday_may' },
  { value: 'juneteenth', label: 'Juneteenth', date: '06-19' },
  { value: 'independence_day', label: 'Independence Day', date: '07-04' },
  { value: 'labor_day', label: 'Labor Day', date: 'first_monday_september' },
  { value: 'columbus_day', label: 'Columbus Day', date: 'second_monday_october' },
  { value: 'veterans_day', label: "Veterans Day", date: '11-11' },
  { value: 'thanksgiving', label: 'Thanksgiving', date: 'fourth_thursday_november' },
  { value: 'black_friday', label: 'Black Friday', date: 'day_after_thanksgiving' },
  { value: 'christmas_eve', label: 'Christmas Eve', date: '12-24' },
  { value: 'christmas', label: 'Christmas Day', date: '12-25' },
  { value: 'new_year_eve', label: "New Year's Eve", date: '12-31' },
  { value: 'easter', label: 'Easter Sunday', date: 'easter_calculation' },
  { value: 'good_friday', label: 'Good Friday', date: 'two_days_before_easter' },
  { value: 'mothers_day', label: "Mother's Day", date: 'second_sunday_may' },
  { value: 'fathers_day', label: "Father's Day", date: 'third_sunday_june' },
  { value: 'halloween', label: 'Halloween', date: '10-31' },
  { value: 'valentines_day', label: "Valentine's Day", date: '02-14' }
];

// Holiday date calculators (#116). Same 20 holidays, same order, as HOLIDAYS in
// nearby-app/app/src/utils/hoursUtils.js and shared/utils/hours_resolution.py.
function getNthWeekdayOfMonth(year, month, weekday, n) {
  const firstWeekday = new Date(year, month, 1).getDay();
  let dayOffset = weekday - firstWeekday;
  if (dayOffset < 0) dayOffset += 7;
  return new Date(year, month, 1 + dayOffset + (n - 1) * 7);
}

function getLastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(year, month + 1, 0);
  let dayOffset = lastDay.getDay() - weekday;
  if (dayOffset < 0) dayOffset += 7;
  return new Date(year, month + 1, -dayOffset);
}

// Anonymous Gregorian algorithm
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

const HOLIDAY_CALCULATORS = {
  new_year: (y) => new Date(y, 0, 1),
  mlk_day: (y) => getNthWeekdayOfMonth(y, 0, 1, 3),
  presidents_day: (y) => getNthWeekdayOfMonth(y, 1, 1, 3),
  memorial_day: (y) => getLastWeekdayOfMonth(y, 4, 1),
  juneteenth: (y) => new Date(y, 5, 19),
  independence_day: (y) => new Date(y, 6, 4),
  labor_day: (y) => getNthWeekdayOfMonth(y, 8, 1, 1),
  columbus_day: (y) => getNthWeekdayOfMonth(y, 9, 1, 2),
  veterans_day: (y) => new Date(y, 10, 11),
  thanksgiving: (y) => getNthWeekdayOfMonth(y, 10, 4, 4),
  black_friday: (y) => new Date(getNthWeekdayOfMonth(y, 10, 4, 4).getTime() + 24 * 60 * 60 * 1000),
  christmas_eve: (y) => new Date(y, 11, 24),
  christmas: (y) => new Date(y, 11, 25),
  new_year_eve: (y) => new Date(y, 11, 31),
  easter: (y) => calculateEaster(y),
  good_friday: (y) => new Date(calculateEaster(y).getTime() - 2 * 24 * 60 * 60 * 1000),
  mothers_day: (y) => getNthWeekdayOfMonth(y, 4, 0, 2),
  fathers_day: (y) => getNthWeekdayOfMonth(y, 5, 0, 3),
  halloween: (y) => new Date(y, 9, 31),
  valentines_day: (y) => new Date(y, 1, 14)
};

// #116 - what the business is telling visitors about this holiday.
const HOLIDAY_MODE_OPTIONS = [
  { label: 'Not confirmed', value: 'unconfirmed' },
  { label: 'Follows regular hours', value: 'follows_regular' },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
  { label: 'Modified', value: 'modified' }
];

// Legacy `status` mirror, written alongside `mode` for one release so older
// readers keep working. 'follows_regular' maps to the legacy 'open', which has
// always meant "no special hours, use the normal schedule".
const LEGACY_STATUS_FOR_MODE = {
  follows_regular: 'open',
  open: 'open',
  closed: 'closed',
  modified: 'modified'
};

// Mirrors getHolidayMode() in nearby-app/app/src/utils/hoursUtils.js.
function getHolidayMode(entry) {
  if (!entry || typeof entry !== 'object') return 'unconfirmed';
  if (entry.mode) return entry.mode;
  if (entry.status === 'open') return 'follows_regular';
  if (entry.status === 'closed') return 'closed';
  if (entry.status === 'modified') return 'modified';
  return 'unconfirmed';
}

// Next occurrence of a holiday, this year or next.
function nextHolidayDate(holidayId, from = new Date()) {
  const calculator = HOLIDAY_CALCULATORS[holidayId];
  if (!calculator) return null;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const thisYear = calculator(today.getFullYear());
  return thisYear < today ? calculator(today.getFullYear() + 1) : thisYear;
}

const SEASON_DEFINITIONS = [
  { value: 'spring', label: 'Spring', icon: IconFlower, months: [3, 4, 5], color: 'green' },
  { value: 'summer', label: 'Summer', icon: IconSunHigh, months: [6, 7, 8], color: 'yellow' },
  { value: 'fall', label: 'Fall/Autumn', icon: IconLeaf, months: [9, 10, 11], color: 'orange' },
  { value: 'winter', label: 'Winter', icon: IconSnowflake, months: [12, 1, 2], color: 'blue' }
];

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Monday', short: 'Mon' },
  { value: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { value: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { value: 'thursday', label: 'Thursday', short: 'Thu' },
  { value: 'friday', label: 'Friday', short: 'Fri' },
  { value: 'saturday', label: 'Saturday', short: 'Sat' },
  { value: 'sunday', label: 'Sunday', short: 'Sun' }
];

const TIME_TYPES = [
  { value: 'fixed', label: 'Fixed Time' },
  { value: 'dawn', label: 'Dawn/Sunrise' },
  { value: 'dusk', label: 'Dusk/Sunset' },
  { value: 'appointment', label: 'By Appointment' },
  { value: 'call', label: 'Call for Hours' }
];

// Component for a single time period (handles multiple periods per day)
function TimePeriod({ period, onChange, onRemove, showRemove }) {
  const handleTimeTypeChange = (field, type) => {
    if (type === 'dawn' || type === 'dusk') {
      onChange({
        ...period,
        [field]: { type, offset: 0 }
      });
    } else if (type === 'appointment' || type === 'call') {
      onChange({
        ...period,
        [field]: { type }
      });
    } else {
      onChange({
        ...period,
        [field]: { type: 'fixed', time: field === 'open' ? '09:00' : '17:00' }
      });
    }
  };

  const getTimeValue = (timeData) => {
    if (!timeData) return '';
    if (timeData.type === 'fixed') return timeData.time || '';
    if (timeData.type === 'dawn' || timeData.type === 'dusk') {
      const offsetStr = timeData.offset > 0 ? `+${timeData.offset}` : timeData.offset || '0';
      return `${timeData.type} ${offsetStr} min`;
    }
    return timeData.type;
  };

  const flexItem = { flex: '1 1 110px', minWidth: 0 };
  return (
    <Group wrap="wrap" gap="xs" align="flex-end">
      <Select
        size="xs"
        style={flexItem}
        data={TIME_TYPES}
        value={period.open?.type || 'fixed'}
        onChange={(value) => handleTimeTypeChange('open', value)}
      />

      {period.open?.type === 'fixed' && (
        <TimeInput
          size="xs"
          style={flexItem}
          value={period.open?.time || '09:00'}
          onChange={(event) => onChange({
            ...period,
            open: { type: 'fixed', time: event.target.value }
          })}
        />
      )}

      {(period.open?.type === 'dawn' || period.open?.type === 'dusk') && (
        <Group gap={5} style={flexItem}>
          <NumberInput
            size="xs"
            style={{ flex: 1, minWidth: 0 }}
            value={period.open?.offset || 0}
            onChange={(value) => onChange({
              ...period,
              open: { ...period.open, offset: value }
            })}
            suffix=" min"
            step={15}
          />
          <Tooltip label={`Minutes ${period.open?.offset >= 0 ? 'after' : 'before'} ${period.open?.type}`}>
            <IconAlertCircle size={16} />
          </Tooltip>
        </Group>
      )}

      <Text size="sm" px={4}>to</Text>

      <Select
        size="xs"
        style={flexItem}
        data={TIME_TYPES}
        value={period.close?.type || 'fixed'}
        onChange={(value) => handleTimeTypeChange('close', value)}
      />

      {period.close?.type === 'fixed' && (
        <TimeInput
          size="xs"
          style={flexItem}
          value={period.close?.time || '17:00'}
          onChange={(event) => onChange({
            ...period,
            close: { type: 'fixed', time: event.target.value }
          })}
        />
      )}

      {(period.close?.type === 'dawn' || period.close?.type === 'dusk') && (
        <Group gap={5} style={flexItem}>
          <NumberInput
            size="xs"
            style={{ flex: 1, minWidth: 0 }}
            value={period.close?.offset || 0}
            onChange={(value) => onChange({
              ...period,
              close: { ...period.close, offset: value }
            })}
            suffix=" min"
            step={15}
          />
          <Tooltip label={`Minutes ${period.close?.offset >= 0 ? 'after' : 'before'} ${period.close?.type}`}>
            <IconAlertCircle size={16} />
          </Tooltip>
        </Group>
      )}

      {period.note && (
        <TextInput
          size="xs"
          placeholder="Note (e.g., 'Kitchen closes at 9pm')"
          value={period.note}
          onChange={(e) => onChange({ ...period, note: e.target.value })}
          style={{ flex: '1 1 100%', minWidth: 0 }}
        />
      )}

      {showRemove && (
        <ActionIcon color="red" size="md" onClick={onRemove} aria-label="Remove time period">
          <IconTrash size={16} />
        </ActionIcon>
      )}
    </Group>
  );
}

// Component for daily hours
function DayHours({ day, hours, onChange, onCopy, disabled = false, onStatusChange }) {
  // Initialize with default open status if not set
  const initialHours = hours || {
    status: 'open',
    periods: [{
      open: { type: 'fixed', time: '09:00' },
      close: { type: 'fixed', time: '17:00' }
    }]
  };

  const [isOpen, setIsOpen] = useState(initialHours.status === 'open');
  const [showDetails, setShowDetails] = useState(false);

  const handleStatusChange = (status) => {
    setIsOpen(status === 'open');
    let next;
    if (status === 'closed') {
      next = { status: 'closed' };
    } else if (status === '24hours') {
      next = { status: '24hours' };
    } else if (status === 'appointment') {
      next = {
        status: 'appointment',
        periods: [{
          open: { type: 'appointment' },
          close: { type: 'appointment' }
        }]
      };
    } else {
      next = {
        status: 'open',
        periods: initialHours.periods || [{
          open: { type: 'fixed', time: '09:00' },
          close: { type: 'fixed', time: '17:00' }
        }]
      };
    }
    onChange(next);
    if (typeof onStatusChange === 'function') {
      onStatusChange(status, next);
    }
  };

  const addPeriod = () => {
    const newPeriods = [...(initialHours.periods || []), {
      open: { type: 'fixed', time: '09:00' },
      close: { type: 'fixed', time: '17:00' }
    }];
    onChange({ ...initialHours, periods: newPeriods });
  };

  const updatePeriod = (index, period) => {
    const newPeriods = [...(initialHours.periods || [])];
    newPeriods[index] = period;
    onChange({ ...initialHours, periods: newPeriods });
  };

  const removePeriod = (index) => {
    const newPeriods = initialHours.periods?.filter((_, i) => i !== index) || [];
    onChange({ ...initialHours, periods: newPeriods });
  };

  return (
    <Card p="sm" withBorder style={disabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined} aria-disabled={disabled || undefined}>
      <Group justify="space-between" mb="xs">
        <Group>
          <Text fw={500}>{day.label}</Text>
          <SegmentedControl
            size="xs"
            value={initialHours.status}
            onChange={handleStatusChange}
            disabled={disabled}
            data={[
              { label: 'Open', value: 'open' },
              { label: 'Closed', value: 'closed' },
              { label: '24 Hours', value: '24hours' },
              { label: 'By Appt', value: 'appointment' }
            ]}
          />
        </Group>
        <Group>
          <Tooltip label="Copy hours to other days">
            <ActionIcon size="sm" variant="subtle" onClick={onCopy} disabled={disabled}>
              <IconCopy size={16} />
            </ActionIcon>
          </Tooltip>
          {initialHours.status === 'open' && (
            <Switch
              size="xs"
              label="Multiple periods"
              checked={showDetails}
              onChange={(e) => setShowDetails(e.currentTarget.checked)}
              disabled={disabled}
            />
          )}
        </Group>
      </Group>

      {initialHours.status === 'open' && (
        <Stack gap="xs">
          {initialHours.periods?.map((period, index) => (
            <TimePeriod
              key={index}
              period={period}
              onChange={(p) => updatePeriod(index, p)}
              onRemove={() => removePeriod(index)}
              showRemove={initialHours.periods.length > 1}
            />
          ))}

          {showDetails && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={addPeriod}
              disabled={disabled}
            >
              Add time period (e.g., lunch break)
            </Button>
          )}
        </Stack>
      )}
    </Card>
  );
}

// Main HoursSelector component - memoized to prevent unnecessary re-renders
const HoursSelector = memo(({ value = {}, onChange, poiType, form }) => {
  const [activeTab, setActiveTab] = useState('regular');
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySource, setCopySource] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const appointmentUrlRef = useRef(null);

  // Initialize with default structure and default hours for each day
  const getDefaultDayHours = () => ({
    status: 'open',
    periods: [{
      open: { type: 'fixed', time: '09:00' },
      close: { type: 'fixed', time: '17:00' }
    }]
  });

  const defaultRegular = {};
  DAYS_OF_WEEK.forEach(day => {
    defaultRegular[day.value] = (value?.regular && value.regular[day.value]) || getDefaultDayHours();
  });

  const hours = {
    regular: defaultRegular,
    seasonal: value.seasonal || {},
    holidays: value.holidays || {},
    exceptions: value.exceptions || [],
    timezone: value.timezone || 'America/New_York',
    notes: value.notes || '',
    seasonal_only: !!value.seasonal_only,
    no_regular_hours: !!value.no_regular_hours,
  };

  const seasonalOnly = !!hours.seasonal_only;
  // #118 - locations with nothing to put on a weekly grid.
  const noRegularHours = !!hours.no_regular_hours;

  const updateHours = (updates) => {
    onChange({ ...hours, ...updates });
  };

  // #118 - hours_but_appointment_required is never auto-cleared by a regular-hours
  // edit. A business can keep posted hours AND require appointments (a law firm
  // open Mon-Fri that only sees clients by appointment). The flag is set by the
  // "By Appointment Only" preset or the Switch, and cleared only by the Switch.

  // Copy hours from one day to others
  const handleCopyHours = (sourceDay) => {
    setCopySource(sourceDay);
    setSelectedDays([]);
    setCopyModalOpen(true);
  };

  const applyCopyHours = () => {
    if (!copySource || selectedDays.length === 0) return;
    
    const sourceHours = hours.regular[copySource];
    const newRegular = { ...hours.regular };
    
    selectedDays.forEach(day => {
      newRegular[day] = { ...sourceHours };
    });
    
    updateHours({ regular: newRegular });
    setCopyModalOpen(false);
    notifications.show({
      title: 'Hours copied',
      message: `Hours from ${copySource} copied to selected days`,
      color: 'green'
    });
  };

  // Add seasonal hours
  const addSeasonalHours = (season) => {
    const newSeasonal = {
      ...hours.seasonal,
      [season]: {
        ...DAYS_OF_WEEK.reduce((acc, day) => ({
          ...acc,
          [day.value]: { status: 'open', periods: [{ 
            open: { type: 'fixed', time: '09:00' }, 
            close: { type: 'fixed', time: '17:00' } 
          }] }
        }), {})
      }
    };
    updateHours({ seasonal: newSeasonal });
  };

  // ── Holidays (#116) ───────────────────────────────────────────────────────

  // All 20 holidays, soonest first. Dates are computed, never typed.
  const holidayRows = useMemo(() => {
    const today = new Date();
    return COMMON_HOLIDAYS
      .map(holiday => ({ ...holiday, nextDate: nextHolidayDate(holiday.value, today) }))
      .sort((a, b) => a.nextDate - b.nextDate);
  }, []);

  const defaultHolidayPeriod = () => ({
    open: { type: 'fixed', time: '10:00' },
    close: { type: 'fixed', time: '16:00' }
  });

  // The regular-hours entry for the weekday a holiday lands on this time round.
  const regularHoursForDate = (d) => {
    if (!d) return null;
    const dayKey = DAYS_OF_WEEK[(d.getDay() + 6) % 7].value;
    return hours.regular?.[dayKey] || null;
  };

  const formatTimeEnd = (t) => {
    if (!t) return '';
    if (t.type === 'fixed') return t.time || '';
    if (t.type === 'dawn') return 'dawn';
    if (t.type === 'dusk') return 'dusk';
    if (t.type === 'appointment') return 'by appointment';
    if (t.type === 'call') return 'call for hours';
    return '';
  };

  const describeRegularDay = (dayHours) => {
    if (!dayHours || dayHours.status === 'closed') return 'Closed';
    if (dayHours.status === '24hours') return 'Open 24 hours';
    if (dayHours.status === 'appointment') return 'By appointment';
    const periods = (dayHours.periods || [])
      .map(p => `${formatTimeEnd(p.open)} to ${formatTimeEnd(p.close)}`)
      .filter(p => p !== ' to ');
    return periods.length ? periods.join(', ') : 'Hours not set';
  };

  const updateHolidayEntry = (holidayId, updates) => {
    const existing = hours.holidays[holidayId];
    if (!existing) return;
    updateHours({
      holidays: { ...hours.holidays, [holidayId]: { ...existing, ...updates } }
    });
  };

  // Writes BOTH the new mode and the closest legacy status. 'Not confirmed'
  // deletes the key: absence is how we record "nobody answered".
  const setHolidayMode = (holiday, mode, withPeriods = false) => {
    const newHolidays = { ...hours.holidays };
    if (mode === 'unconfirmed') {
      delete newHolidays[holiday.value];
    } else {
      const existing = newHolidays[holiday.value] || {};
      const entry = {
        ...existing,
        name: holiday.label,
        date: holiday.date,
        mode,
        status: LEGACY_STATUS_FOR_MODE[mode]
      };
      if (withPeriods && !existing.periods?.length) {
        entry.periods = [defaultHolidayPeriod()];
      }
      newHolidays[holiday.value] = entry;
    }
    updateHours({ holidays: newHolidays });
  };

  const setAllHolidaysFollowRegular = () => {
    const newHolidays = { ...hours.holidays };
    COMMON_HOLIDAYS.forEach(holiday => {
      newHolidays[holiday.value] = {
        ...(newHolidays[holiday.value] || {}),
        name: holiday.label,
        date: holiday.date,
        mode: 'follows_regular',
        status: LEGACY_STATUS_FOR_MODE.follows_regular
      };
    });
    updateHours({ holidays: newHolidays });
  };

  // Add exception date (one-time)
  const addException = () => {
    const newExceptions = [
      ...hours.exceptions,
      {
        type: 'one-time',
        date: new Date().toISOString().split('T')[0],
        status: 'closed',
        reason: '',
        periods: []
      }
    ];
    updateHours({ exceptions: newExceptions });
  };

  // Add recurring exception (e.g., "closed every 3rd Wednesday")
  const addRecurringException = () => {
    const newExceptions = [
      ...hours.exceptions,
      {
        type: 'recurring',
        pattern: {
          ordinal: 'first',
          dayOfWeek: 'wednesday',
          months: [] // empty = all months
        },
        status: 'closed',
        reason: '',
        periods: []
      }
    ];
    updateHours({ exceptions: newExceptions });
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" fw={500}>Business Hours</Text>
        <Select
          size="xs"
          w={200}
          label="Timezone"
          value={hours.timezone}
          onChange={(value) => updateHours({ timezone: value })}
          data={[
            { value: 'America/New_York', label: 'Eastern Time' },
            { value: 'America/Chicago', label: 'Central Time' },
            { value: 'America/Denver', label: 'Mountain Time' },
            { value: 'America/Phoenix', label: 'Arizona Time' },
            { value: 'America/Los_Angeles', label: 'Pacific Time' },
            { value: 'America/Anchorage', label: 'Alaska Time' },
            { value: 'Pacific/Honolulu', label: 'Hawaii Time' }
          ]}
        />
      </Group>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="regular" leftSection={<IconClock size={14} />}>
            Regular Hours
          </Tabs.Tab>
          <Tabs.Tab
            value="seasonal"
            leftSection={<IconCalendar size={14} />}
            rightSection={seasonalOnly ? <Badge color="red" size="xs" variant="filled">Required</Badge> : null}
          >
            Seasonal Hours
          </Tabs.Tab>
          <Tabs.Tab value="holidays" leftSection={<IconCalendar size={14} />}>
            Holiday Hours
          </Tabs.Tab>
          <Tabs.Tab value="exceptions" leftSection={<IconAlertCircle size={14} />}>
            Exceptions
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="regular" pt="md">
          <Stack>
            <Alert color="blue" variant="light">
              Set your standard operating hours. You can add multiple time periods per day for breaks.
            </Alert>

            {/* #46 — Quick-set buttons moved to TOP of Regular Hours panel */}
            <Group>
              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  const defaultHours = {
                    status: 'open',
                    periods: [{
                      open: { type: 'fixed', time: '09:00' },
                      close: { type: 'fixed', time: '17:00' }
                    }]
                  };
                  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
                  const newRegular = { ...hours.regular };
                  weekdays.forEach(day => {
                    newRegular[day] = defaultHours;
                  });
                  // Clear seasonal_only when applying any other preset (#46 exit path)
                  updateHours({ regular: newRegular, seasonal_only: false, no_regular_hours: false });
                }}
              >
                Set Mon-Fri: 9am-5pm
              </Button>

              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  const newRegular = {};
                  DAYS_OF_WEEK.forEach(day => {
                    newRegular[day.value] = { status: '24hours' };
                  });
                  updateHours({ regular: newRegular, seasonal_only: false, no_regular_hours: false });
                }}
              >
                Set 24/7
              </Button>

              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  const appointmentHours = {
                    status: 'appointment',
                    periods: [{
                      open: { type: 'appointment' },
                      close: { type: 'appointment' }
                    }]
                  };
                  const newRegular = {};
                  DAYS_OF_WEEK.forEach(day => {
                    newRegular[day.value] = appointmentHours;
                  });
                  updateHours({ regular: newRegular, seasonal_only: false, no_regular_hours: false });
                  // #54 — "By Appointment Only" button flips the boolean flag on
                  if (form) {
                    form.setFieldValue('hours_but_appointment_required', true);
                  }
                  // Focus the URL input so the admin sees it as next step
                  setTimeout(() => {
                    if (appointmentUrlRef.current) {
                      appointmentUrlRef.current.focus();
                    }
                  }, 0);
                }}
              >
                By Appointment Only
              </Button>

              {/* #46 — 4th quick-set button: Seasonal Hours Only */}
              <Button
                size="sm"
                variant={seasonalOnly ? 'filled' : 'light'}
                color="indigo"
                onClick={() => {
                  updateHours({ seasonal_only: true, no_regular_hours: false });
                  setActiveTab('seasonal');
                }}
              >
                Set to Seasonal Hours Only
              </Button>

              {/* #118 - 5th quick-set button: No Regular Hours */}
              <Button
                size="sm"
                variant={noRegularHours ? 'filled' : 'light'}
                color="grape"
                onClick={() => updateHours({ no_regular_hours: true, seasonal_only: false })}
              >
                No Regular Hours
              </Button>
            </Group>

            {seasonalOnly && (
              <Alert color="blue" variant="light">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm">
                    This location operates on seasonal hours only — see Seasonal Hours below.
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => updateHours({ seasonal_only: false })}
                  >
                    Clear Seasonal-Only Mode
                  </Button>
                </Group>
              </Alert>
            )}

            {noRegularHours && (
              <Alert color="grape" variant="light">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm">
                    This location has no regular hours. Visitors see a single "No regular hours"
                    line instead of a weekly grid. Use General Hours Notes at the bottom of this
                    section to tell them how to find out (call ahead, by request, watch our page).
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => updateHours({ no_regular_hours: false })}
                  >
                    Clear No-Regular-Hours Mode
                  </Button>
                </Group>
              </Alert>
            )}

            {DAYS_OF_WEEK.map(day => (
              <DayHours
                key={day.value}
                day={day}
                hours={hours.regular[day.value]}
                disabled={seasonalOnly || noRegularHours}
                onChange={(dayHours) => {
                  const newRegular = { ...hours.regular, [day.value]: dayHours };
                  updateHours({ regular: newRegular });
                }}
                onStatusChange={(status) => {
                  // #54 - When a day becomes 'appointment', auto-flip the flag ON.
                  // #118 - nothing ever auto-flips it OFF.
                  if (status === 'appointment' && form && !form.values?.hours_but_appointment_required) {
                    form.setFieldValue('hours_but_appointment_required', true);
                  }
                }}
                onCopy={() => handleCopyHours(day.value)}
              />
            ))}

            {/* #54 — Appointments subsection (top-level POI fields, not inside hours blob) */}
            {form && (
              <Card withBorder p="md">
                <Stack gap="xs">
                  <Text fw={600} size="sm">Appointments</Text>
                  <Switch
                    label="Appointments required"
                    description="Can be combined with regular hours. Editing the days above never changes this."
                    checked={!!form.values?.hours_but_appointment_required}
                    onChange={(e) => form.setFieldValue('hours_but_appointment_required', e.currentTarget.checked)}
                  />
                  <TextInput
                    ref={appointmentUrlRef}
                    label="Appointment Booking URL"
                    placeholder="https://example.com/book"
                    description="Where visitors should book if appointments are required (Calendly, Acuity, your own form, etc.). Optional — if empty, the public site will show 'By appointment only — call to book.'"
                    {...form.getInputProps('appointment_booking_url')}
                  />
                </Stack>
              </Card>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="seasonal" pt="md">
          <Stack>
            {seasonalOnly && (
              <Alert color="orange" variant="light" title="Seasonal Hours Required">
                Add at least one seasonal period before saving — this location operates on seasonal hours only.
              </Alert>
            )}
            <Alert color="blue" variant="light">
              Override regular hours during specific seasons or date ranges. Seasonal hours take precedence over regular hours.
              You can use predefined seasons OR specify exact date ranges (e.g., "Summer hours: June 1 - Aug 15").
            </Alert>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {SEASON_DEFINITIONS.map(season => {
                const SeasonIcon = season.icon;
                const hasHours = hours.seasonal[season.value];

                return (
                  <Card key={season.value} withBorder p="sm">
                    <Group justify="space-between" mb="xs">
                      <Group>
                        <SeasonIcon size={20} color={`var(--mantine-color-${season.color}-6)`} />
                        <Text fw={500}>{season.label}</Text>
                      </Group>
                      {!hasHours ? (
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => addSeasonalHours(season.value)}
                        >
                          Add Hours
                        </Button>
                      ) : (
                        <ActionIcon
                          color="red"
                          size="sm"
                          onClick={() => {
                            const newSeasonal = { ...hours.seasonal };
                            delete newSeasonal[season.value];
                            updateHours({ seasonal: newSeasonal });
                          }}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      )}
                    </Group>

                    {hasHours && (
                      <Text size="xs" c="dimmed">
                        Custom hours set for {season.label}
                      </Text>
                    )}
                  </Card>
                );
              })}
            </SimpleGrid>

            {Object.entries(hours.seasonal).map(([season, seasonHours]) => {
              const seasonDef = SEASON_DEFINITIONS.find(s => s.value === season);
              if (!seasonDef) return null;

              return (
                <Collapse key={season} in={true}>
                  <Stack>
                    <Divider label={`${seasonDef.label} Hours`} />

                    {/* Date range controls for seasonal hours */}
                    <Card withBorder p="sm" bg="gray.0">
                      <Group mb="xs">
                        <Switch
                          size="xs"
                          label="Use specific date range instead of default season dates"
                          checked={seasonHours.useDateRange || false}
                          onChange={(e) => updateHours({
                            seasonal: {
                              ...hours.seasonal,
                              [season]: {
                                ...seasonHours,
                                useDateRange: e.currentTarget.checked
                              }
                            }
                          })}
                        />
                      </Group>

                      {seasonHours.useDateRange ? (
                        <Group>
                          <DatePickerInput
                            size="xs"
                            label="Start date"
                            placeholder="Pick start date"
                            value={seasonHours.startDate ? new Date(seasonHours.startDate) : null}
                            onChange={(date) => updateHours({
                              seasonal: {
                                ...hours.seasonal,
                                [season]: {
                                  ...seasonHours,
                                  startDate: date ? date.toISOString().split('T')[0] : null
                                }
                              }
                            })}
                            w={150}
                          />
                          <DatePickerInput
                            size="xs"
                            label="End date"
                            placeholder="Pick end date"
                            value={seasonHours.endDate ? new Date(seasonHours.endDate) : null}
                            onChange={(date) => updateHours({
                              seasonal: {
                                ...hours.seasonal,
                                [season]: {
                                  ...seasonHours,
                                  endDate: date ? date.toISOString().split('T')[0] : null
                                }
                              }
                            })}
                            w={150}
                          />
                          <Text size="xs" c="dimmed" mt={20}>
                            (Repeats annually)
                          </Text>
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed">
                          Using default {seasonDef.label} months: {seasonDef.months.map(m => MONTHS.find(mo => mo.value === String(m))?.label).join(', ')}
                        </Text>
                      )}
                    </Card>

                    {DAYS_OF_WEEK.map(day => (
                      <DayHours
                        key={`${season}-${day.value}`}
                        day={day}
                        hours={seasonHours[day.value]}
                        onChange={(dayHours) => updateHours({
                          seasonal: {
                            ...hours.seasonal,
                            [season]: {
                              ...seasonHours,
                              [day.value]: dayHours
                            }
                          }
                        })}
                        onCopy={() => {}}
                      />
                    ))}
                  </Stack>
                </Collapse>
              );
            })}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="holidays" pt="md">
          <Stack>
            <Alert color="blue" variant="light">
              Answer for every holiday. Anything left "Not confirmed" tells visitors the holiday
              hours have not been confirmed, so they know to check before driving out. Holiday
              settings override both regular and seasonal hours.
            </Alert>

            <Group>
              <Button size="xs" variant="light" onClick={setAllHolidaysFollowRegular}>
                Set all to Follows regular hours
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => updateHours({ holidays: {} })}
              >
                Clear all
              </Button>
            </Group>

            <Stack>
              {holidayRows.map(holiday => {
                const entry = hours.holidays[holiday.value];
                const mode = getHolidayMode(entry);
                const regularDay = regularHoursForDate(holiday.nextDate);
                const normallyOpen = !!regularDay
                  && (regularDay.status === 'open' || regularDay.status === '24hours');
                const showPeriods = mode === 'modified' || (mode === 'open' && !normallyOpen);
                const periods = entry?.periods?.length ? entry.periods : [defaultHolidayPeriod()];
                const weekday = holiday.nextDate.toLocaleDateString('en-US', { weekday: 'long' });

                return (
                  <Card key={holiday.value} withBorder p="sm">
                    <Group justify="space-between" mb="xs" wrap="wrap">
                      <Group gap="xs">
                        <Text fw={500}>{holiday.label}</Text>
                        <Badge size="sm" variant="light">
                          {holiday.nextDate.toLocaleDateString('en-US', {
                            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                          })}
                        </Badge>
                      </Group>
                      <SegmentedControl
                        size="xs"
                        value={mode}
                        onChange={(nextMode) => setHolidayMode(
                          holiday,
                          nextMode,
                          nextMode === 'modified' || (nextMode === 'open' && !normallyOpen)
                        )}
                        data={HOLIDAY_MODE_OPTIONS}
                      />
                    </Group>

                    {mode === 'follows_regular' && (
                      <Text size="xs" c="dimmed">
                        {holiday.nextDate.toLocaleDateString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric'
                        })} falls on a {weekday}: {describeRegularDay(regularDay)}
                      </Text>
                    )}

                    {mode === 'open' && !normallyOpen && (
                      <Alert color="yellow" variant="light" mb="xs">
                        You are normally closed on {weekday}s. Add the hours you will be open,
                        otherwise visitors see "Open - hours vary, call ahead".
                      </Alert>
                    )}

                    {showPeriods && (
                      <Stack gap="xs">
                        {periods.map((period, index) => (
                          <TimePeriod
                            key={index}
                            period={period}
                            onChange={(p) => {
                              const newPeriods = [...periods];
                              newPeriods[index] = p;
                              updateHolidayEntry(holiday.value, { periods: newPeriods });
                            }}
                            onRemove={() => {
                              updateHolidayEntry(holiday.value, {
                                periods: periods.filter((_, i) => i !== index)
                              });
                            }}
                            showRemove={periods.length > 1}
                          />
                        ))}
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconPlus size={14} />}
                          onClick={() => updateHolidayEntry(holiday.value, {
                            periods: [...periods, defaultHolidayPeriod()]
                          })}
                        >
                          Add time period
                        </Button>
                      </Stack>
                    )}

                    {mode !== 'unconfirmed' && (
                      <TextInput
                        size="xs"
                        mt="xs"
                        label="Note shown to visitors"
                        placeholder="e.g., 'Closing at 2pm, reopening December 26'"
                        value={entry?.note || ''}
                        onChange={(e) => updateHolidayEntry(holiday.value, { note: e.target.value })}
                      />
                    )}
                  </Card>
                );
              })}
            </Stack>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="exceptions" pt="md">
          <Stack>
            <Alert color="blue" variant="light">
              Add exceptions for specific dates or recurring patterns (e.g., "closed every 3rd Wednesday").
              Exceptions take highest priority and override all other hours settings.
            </Alert>

            <Group>
              <Button
                variant="light"
                leftSection={<IconPlus size={16} />}
                onClick={addException}
              >
                Add One-Time Exception
              </Button>
              <Button
                variant="light"
                color="violet"
                leftSection={<IconRepeat size={16} />}
                onClick={addRecurringException}
              >
                Add Recurring Exception
              </Button>
            </Group>

            {hours.exceptions.map((exception, index) => (
              <Card key={index} withBorder p="sm">
                {/* One-time exception */}
                {(!exception.type || exception.type === 'one-time') && (
                  <>
                    <Group justify="space-between" mb="xs">
                      <Group>
                        <Badge size="sm" variant="light" color="blue">One-time</Badge>
                        <input
                          type="date"
                          value={exception.date}
                          onChange={(e) => {
                            const newExceptions = [...hours.exceptions];
                            newExceptions[index] = { ...exception, type: 'one-time', date: e.target.value };
                            updateHours({ exceptions: newExceptions });
                          }}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ced4da' }}
                        />
                        <SegmentedControl
                          size="xs"
                          value={exception.status}
                          onChange={(status) => {
                            const newExceptions = [...hours.exceptions];
                            newExceptions[index] = { ...exception, status };
                            updateHours({ exceptions: newExceptions });
                          }}
                          data={[
                            { label: 'Open', value: 'open' },
                            { label: 'Closed', value: 'closed' },
                            { label: 'Modified', value: 'modified' }
                          ]}
                        />
                      </Group>
                      <ActionIcon
                        color="red"
                        size="sm"
                        onClick={() => {
                          const newExceptions = hours.exceptions.filter((_, i) => i !== index);
                          updateHours({ exceptions: newExceptions });
                        }}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>

                    <TextInput
                      size="xs"
                      placeholder="Reason for exception (e.g., 'Staff training day')"
                      value={exception.reason || ''}
                      onChange={(e) => {
                        const newExceptions = [...hours.exceptions];
                        newExceptions[index] = { ...exception, reason: e.target.value };
                        updateHours({ exceptions: newExceptions });
                      }}
                    />
                  </>
                )}

                {/* Recurring exception */}
                {exception.type === 'recurring' && (
                  <>
                    <Group justify="space-between" mb="xs">
                      <Group>
                        <Badge size="sm" variant="light" color="violet">
                          <Group gap={4}>
                            <IconRepeat size={12} />
                            Recurring
                          </Group>
                        </Badge>
                        <Select
                          size="xs"
                          w={100}
                          value={exception.pattern?.ordinal || 'first'}
                          onChange={(ordinal) => {
                            const newExceptions = [...hours.exceptions];
                            newExceptions[index] = {
                              ...exception,
                              pattern: { ...exception.pattern, ordinal }
                            };
                            updateHours({ exceptions: newExceptions });
                          }}
                          data={ORDINAL_OPTIONS}
                        />
                        <Select
                          size="xs"
                          w={130}
                          value={exception.pattern?.dayOfWeek || 'wednesday'}
                          onChange={(dayOfWeek) => {
                            const newExceptions = [...hours.exceptions];
                            newExceptions[index] = {
                              ...exception,
                              pattern: { ...exception.pattern, dayOfWeek }
                            };
                            updateHours({ exceptions: newExceptions });
                          }}
                          data={DAYS_OF_WEEK}
                        />
                        <Text size="xs" c="dimmed">of</Text>
                        <MultiSelect
                          size="xs"
                          w={200}
                          placeholder="All months"
                          value={exception.pattern?.months || []}
                          onChange={(months) => {
                            const newExceptions = [...hours.exceptions];
                            newExceptions[index] = {
                              ...exception,
                              pattern: { ...exception.pattern, months }
                            };
                            updateHours({ exceptions: newExceptions });
                          }}
                          data={MONTHS}
                          clearable
                        />
                      </Group>
                      <ActionIcon
                        color="red"
                        size="sm"
                        onClick={() => {
                          const newExceptions = hours.exceptions.filter((_, i) => i !== index);
                          updateHours({ exceptions: newExceptions });
                        }}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>

                    <Group mb="xs">
                      <SegmentedControl
                        size="xs"
                        value={exception.status}
                        onChange={(status) => {
                          const newExceptions = [...hours.exceptions];
                          newExceptions[index] = { ...exception, status };
                          updateHours({ exceptions: newExceptions });
                        }}
                        data={[
                          { label: 'Open', value: 'open' },
                          { label: 'Closed', value: 'closed' },
                          { label: 'Modified Hours', value: 'modified' }
                        ]}
                      />
                    </Group>

                    <TextInput
                      size="xs"
                      placeholder="Reason (e.g., 'Staff meeting day')"
                      value={exception.reason || ''}
                      onChange={(e) => {
                        const newExceptions = [...hours.exceptions];
                        newExceptions[index] = { ...exception, reason: e.target.value };
                        updateHours({ exceptions: newExceptions });
                      }}
                    />

                    <Text size="xs" c="dimmed" mt="xs">
                      {exception.pattern?.months?.length > 0
                        ? `Every ${exception.pattern?.ordinal} ${DAYS_OF_WEEK.find(d => d.value === exception.pattern?.dayOfWeek)?.label} of ${exception.pattern.months.map(m => MONTHS.find(mo => mo.value === m)?.label).join(', ')}`
                        : `Every ${exception.pattern?.ordinal} ${DAYS_OF_WEEK.find(d => d.value === exception.pattern?.dayOfWeek)?.label} of every month`
                      }
                    </Text>
                  </>
                )}

                {/* Modified hours periods (shared by both types) */}
                {exception.status === 'modified' && (
                  <Stack gap="xs" mt="xs">
                    {(exception.periods || [{
                      open: { type: 'fixed', time: '10:00' },
                      close: { type: 'fixed', time: '16:00' }
                    }]).map((period, periodIndex) => (
                      <TimePeriod
                        key={periodIndex}
                        period={period}
                        onChange={(p) => {
                          const newExceptions = [...hours.exceptions];
                          const newPeriods = [...(exception.periods || [])];
                          newPeriods[periodIndex] = p;
                          newExceptions[index] = { ...exception, periods: newPeriods };
                          updateHours({ exceptions: newExceptions });
                        }}
                        onRemove={() => {
                          const newExceptions = [...hours.exceptions];
                          const newPeriods = exception.periods.filter((_, i) => i !== periodIndex);
                          newExceptions[index] = { ...exception, periods: newPeriods };
                          updateHours({ exceptions: newExceptions });
                        }}
                        showRemove={exception.periods?.length > 1}
                      />
                    ))}
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconPlus size={14} />}
                      onClick={() => {
                        const newExceptions = [...hours.exceptions];
                        const newPeriods = [
                          ...(exception.periods || []),
                          { open: { type: 'fixed', time: '10:00' }, close: { type: 'fixed', time: '16:00' } }
                        ];
                        newExceptions[index] = { ...exception, periods: newPeriods };
                        updateHours({ exceptions: newExceptions });
                      }}
                    >
                      Add time period
                    </Button>
                  </Stack>
                )}
              </Card>
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Divider my="md" />
      
      <TextInput
        label="General Hours Notes"
        placeholder="e.g., 'Kitchen closes 1 hour before closing time'"
        value={hours.notes}
        onChange={(e) => updateHours({ notes: e.target.value })}
      />

      {/* Copy Hours Modal */}
      <Modal
        opened={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
        title={`Copy hours from ${copySource}`}
      >
        <Stack>
          <Text size="sm">Select days to copy hours to:</Text>
          <Checkbox.Group value={selectedDays} onChange={setSelectedDays}>
            <Stack>
              {DAYS_OF_WEEK.filter(d => d.value !== copySource).map(day => (
                <Checkbox key={day.value} value={day.value} label={day.label} />
              ))}
            </Stack>
          </Checkbox.Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCopyModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyCopyHours} disabled={selectedDays.length === 0}>
              Apply
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
});

HoursSelector.displayName = 'HoursSelector';

export default HoursSelector;