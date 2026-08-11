import React, { useState } from 'react';
import {
  Stack,
  Switch,
  Select,
  NumberInput,
  Chip,
  Card,
  Text,
  Group,
  Button,
  Badge,
  Divider,
} from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { REPEAT_FREQUENCY_OPTIONS } from '../../../utils/constants';

// ---------------------------------------------------------------------------
// Day-of-week options used for weekly/biweekly chip groups
// ---------------------------------------------------------------------------
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Frequencies that expose the day-of-week chip selector
const WEEKLY_FREQUENCIES = ['weekly', 'biweekly'];

// ---------------------------------------------------------------------------
// Time helpers.
//
// Per-occurrence times are stored as "HH:MM" strings (24h). The base times are
// derived from the event's top-level start/end DateTimePickers so every
// generated occurrence and manual date defaults to the event's base time and
// can be overridden individually.
// ---------------------------------------------------------------------------
function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function dateToLocalYMD(date) {
  const d = toDate(date);
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateToHM(date) {
  const d = toDate(date);
  if (!d || isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

// Format a "YYYY-MM-DD" + "HH:MM" pair as a local Date for display.
function ymdHmToDate(ymd, hm) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  let hh = 0;
  let mm = 0;
  if (hm && /^\d{1,2}:\d{2}/.test(hm)) {
    const parts = hm.split(':');
    hh = Number(parts[0]);
    mm = Number(parts[1]);
  }
  return new Date(y, (m || 1) - 1, d || 1, hh, mm);
}

// Human-readable "12:30 PM" (or empty string when no time available).
function formatTimeLabel(hm) {
  if (!hm || !/^\d{1,2}:\d{2}/.test(hm)) return '';
  const [h, m] = hm.split(':').map(Number);
  const date = new Date(2000, 0, 1, h, m);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Preview calculation helper — returns up to `limit` future occurrence Dates
// starting from `startDate`, applying the given repeat_pattern and skipping
// any dates found in `excludedDates`.
//
// Kept intentionally simple — no rrule dependency.
// ---------------------------------------------------------------------------
function calculateNextOccurrences(startDate, pattern, excludedDates = [], limit = 5) {
  if (!startDate || !pattern?.frequency) return [];

  const excluded = new Set(
    (excludedDates || []).map((d) => {
      const date = typeof d === 'string' ? new Date(d) : d;
      return date.toDateString();
    })
  );

  const interval = Math.max(1, pattern.interval || 1);
  const frequency = pattern.frequency;
  const daysOfWeek = pattern.days_of_week || [];

  // Build a lookup from short name → JS getDay() index (0=Sun … 6=Sat)
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  const results = [];
  const cursor = new Date(startDate);
  // Ensure we start from the next valid occurrence after startDate
  cursor.setHours(startDate.getHours ? startDate.getHours() : 0);

  // Safety cap — never iterate more than 1 000 steps to prevent infinite loops
  const MAX_ITERATIONS = 1000;
  let iterations = 0;

  while (results.length < limit && iterations < MAX_ITERATIONS) {
    iterations++;

    // Advance cursor by one unit *before* the first check so we don't include
    // the start date itself (it's the "current" event, not a future occurrence).
    const candidate = new Date(cursor);

    // Should this candidate be skipped based on days_of_week?
    let include = true;

    if (WEEKLY_FREQUENCIES.includes(frequency) && daysOfWeek.length > 0) {
      const candidateDay = candidate.getDay(); // 0=Sun
      const selectedIndices = daysOfWeek.map((d) => dayMap[d]).filter((i) => i !== undefined);
      include = selectedIndices.includes(candidateDay);
    }

    if (include && !excluded.has(candidate.toDateString())) {
      results.push(new Date(candidate));
    }

    // Advance the cursor by the appropriate interval
    switch (frequency) {
      case 'daily':
        cursor.setDate(cursor.getDate() + interval);
        break;
      case 'weekly':
        // For weekly with day selection, step one day at a time so we can
        // hit each selected weekday within the same week
        cursor.setDate(cursor.getDate() + 1);
        break;
      case 'biweekly':
        // Same as weekly — step daily but the outer interval semantics are
        // encoded by stepping two calendar weeks when no specific day matched
        // within the current week.  Simplify: step 1 day and let the
        // days_of_week filter do the work; after finishing the week, skip
        // the next week.
        cursor.setDate(cursor.getDate() + 1);
        // If we just moved into a new week (Mon), skip the alternate week
        if (cursor.getDay() === 1 && interval > 1) {
          cursor.setDate(cursor.getDate() + 7);
        }
        break;
      case 'monthly':
        cursor.setMonth(cursor.getMonth() + interval);
        break;
      case 'yearly':
        cursor.setFullYear(cursor.getFullYear() + interval);
        break;
      default:
        cursor.setDate(cursor.getDate() + interval);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Manual-date normalisation. Manual dates are stored as objects
// { date, start_time, end_time } so each one-off date can carry its own time.
// Legacy rows stored a bare "YYYY-MM-DD" string; treat those as { date } with
// no explicit time override (falls back to the event base time on display).
// ---------------------------------------------------------------------------
function normalizeManualDate(entry, baseStart, baseEnd) {
  if (typeof entry === 'string') {
    return { date: entry, start_time: baseStart || '', end_time: baseEnd || '' };
  }
  return {
    date: entry?.date || '',
    start_time: entry?.start_time || baseStart || '',
    end_time: entry?.end_time || baseEnd || '',
  };
}

// ---------------------------------------------------------------------------
// RecurringEventSection
// ---------------------------------------------------------------------------

export default function RecurringEventSection({ form }) {
  const [showExcludedPicker, setShowExcludedPicker] = useState(false);
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [pendingExcludedDate, setPendingExcludedDate] = useState(null);
  const [pendingManualDate, setPendingManualDate] = useState(null);
  const [pendingManualStart, setPendingManualStart] = useState('');
  const [pendingManualEnd, setPendingManualEnd] = useState('');

  const isRepeating = form.values.event?.is_repeating || false;
  const pattern = form.values.event?.repeat_pattern || {};
  const frequency = pattern.frequency || '';
  const interval = pattern.interval || 1;
  const daysOfWeek = pattern.days_of_week || [];
  // Per-occurrence time overrides for the regular recurrence, keyed by the
  // occurrence date ("YYYY-MM-DD"). Stored inside repeat_pattern (already JSONB)
  // so no schema/migration change is required.
  const occurrenceTimes = pattern.occurrence_times || {};
  const excludedDates = form.values.event?.excluded_dates || [];
  const manualDates = form.values.event?.manual_dates || [];
  const recurrenceEndDate = form.values.event?.recurrence_end_date || null;
  const startDatetime = form.values.event?.start_datetime || null;
  const endDatetime = form.values.event?.end_datetime || null;

  // Base times default every occurrence and manual date to the event's time.
  const baseStartTime = dateToHM(startDatetime);
  const baseEndTime = dateToHM(endDatetime);

  // When toggling repeating ON, initialise the pattern with sensible defaults
  function handleToggleRepeating(checked) {
    form.setFieldValue('event.is_repeating', checked);
    if (checked && !form.values.event?.repeat_pattern) {
      form.setFieldValue('event.repeat_pattern', {
        frequency: 'weekly',
        interval: 1,
        days_of_week: [],
      });
    }
  }

  function handleFrequencyChange(value) {
    const current = form.values.event?.repeat_pattern || {};
    form.setFieldValue('event.repeat_pattern', {
      ...current,
      frequency: value,
      // Clear days_of_week when switching away from weekly/biweekly
      ...(WEEKLY_FREQUENCIES.includes(value) ? {} : { days_of_week: [] }),
    });
  }

  function handleIntervalChange(value) {
    const current = form.values.event?.repeat_pattern || {};
    form.setFieldValue('event.repeat_pattern', { ...current, interval: value });
  }

  function handleDaysOfWeekChange(selected) {
    const current = form.values.event?.repeat_pattern || {};
    form.setFieldValue('event.repeat_pattern', { ...current, days_of_week: selected });
  }

  // Write a per-occurrence time override into repeat_pattern.occurrence_times.
  function handleOccurrenceTimeChange(ymd, which, value) {
    const current = form.values.event?.repeat_pattern || {};
    const times = { ...(current.occurrence_times || {}) };
    const entry = { ...(times[ymd] || {}) };
    entry[which] = value;
    // Prune empty override entries so the pattern stays clean.
    if (!entry.start_time && !entry.end_time) {
      delete times[ymd];
    } else {
      times[ymd] = entry;
    }
    form.setFieldValue('event.repeat_pattern', { ...current, occurrence_times: times });
  }

  // ---- Excluded dates: repeatable, picker stays open ----
  function handleAddExcludedDate() {
    if (!pendingExcludedDate) return;
    const dateStr = dateToLocalYMD(pendingExcludedDate);
    if (dateStr && !excludedDates.includes(dateStr)) {
      form.setFieldValue('event.excluded_dates', [...excludedDates, dateStr]);
    }
    // Keep the picker open so multiple dates can be added in a row.
    setPendingExcludedDate(null);
  }

  function handleRemoveExcludedDate(dateStr) {
    form.setFieldValue(
      'event.excluded_dates',
      excludedDates.filter((d) => d !== dateStr)
    );
  }

  // ---- Manual dates: repeatable objects with per-date times ----
  function handleAddManualDate() {
    if (!pendingManualDate) return;
    const dateStr = dateToLocalYMD(pendingManualDate);
    if (!dateStr) return;
    const alreadyAdded = manualDates.some((m) =>
      (typeof m === 'string' ? m : m?.date) === dateStr
    );
    if (!alreadyAdded) {
      const entry = {
        date: dateStr,
        start_time: pendingManualStart || baseStartTime || '',
        end_time: pendingManualEnd || baseEndTime || '',
      };
      form.setFieldValue('event.manual_dates', [...manualDates, entry]);
    }
    // Keep the picker open so multiple manual dates can be added in a row.
    setPendingManualDate(null);
    setPendingManualStart('');
    setPendingManualEnd('');
  }

  function handleRemoveManualDate(dateStr) {
    form.setFieldValue(
      'event.manual_dates',
      manualDates.filter((m) => (typeof m === 'string' ? m : m?.date) !== dateStr)
    );
  }

  // Edit the time on an already-added manual date.
  function handleManualDateTimeChange(dateStr, which, value) {
    form.setFieldValue(
      'event.manual_dates',
      manualDates.map((m) => {
        const norm = normalizeManualDate(m, baseStartTime, baseEndTime);
        if (norm.date !== dateStr) return norm;
        return { ...norm, [which]: value };
      })
    );
  }

  // Compute preview occurrences
  const previewOccurrences =
    isRepeating && startDatetime
      ? calculateNextOccurrences(
          startDatetime instanceof Date ? startDatetime : new Date(startDatetime),
          pattern,
          excludedDates
        )
      : [];

  const showDaysOfWeek = isRepeating && WEEKLY_FREQUENCIES.includes(frequency);

  return (
    <Stack>
      {/* Master toggle */}
      <Switch
        label="Repeating event"
        description="Enable if this event occurs on a recurring schedule"
        checked={isRepeating}
        onChange={(e) => handleToggleRepeating(e.currentTarget.checked)}
      />

      {isRepeating && (
        <>
          <Divider my="xs" label="Recurrence Pattern" />

          {/* Frequency + Interval row */}
          <Group align="flex-end" grow>
            <Select
              label="Frequency"
              placeholder="How often does it repeat?"
              data={REPEAT_FREQUENCY_OPTIONS}
              value={frequency || null}
              onChange={handleFrequencyChange}
            />
            <NumberInput
              label="Interval"
              description="Repeat every N periods"
              min={1}
              max={52}
              value={interval}
              onChange={handleIntervalChange}
            />
          </Group>

          {/* Day-of-week chips — only for weekly / biweekly */}
          {showDaysOfWeek && (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Days of the week
              </Text>
              <Chip.Group multiple value={daysOfWeek} onChange={handleDaysOfWeekChange}>
                <Group gap="xs">
                  {DAYS_OF_WEEK.map((day) => (
                    <Chip key={day} value={day} size="sm">
                      {day}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </Stack>
          )}

          {/* Recurrence end date */}
          <DatePickerInput
            label="Recurrence End Date"
            description="Leave blank for no end date"
            placeholder="Pick end date"
            value={
              recurrenceEndDate
                ? recurrenceEndDate instanceof Date
                  ? recurrenceEndDate
                  : new Date(recurrenceEndDate)
                : null
            }
            onChange={(val) => form.setFieldValue('event.recurrence_end_date', val)}
            clearable
          />

          {/* ---------------------------------------------------------- */}
          {/* Excluded dates                                              */}
          {/* ---------------------------------------------------------- */}
          <Divider my="xs" label="Excluded Dates" />
          <Text size="sm" c="dimmed">
            Dates when the event does NOT occur despite falling on the recurring schedule.
          </Text>

          {excludedDates.length > 0 && (
            <Group gap="xs" wrap="wrap">
              {excludedDates.map((dateStr) => (
                <Badge
                  key={dateStr}
                  color="red"
                  variant="light"
                  rightSection={
                    <button
                      type="button"
                      onClick={() => handleRemoveExcludedDate(dateStr)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0 2px',
                        lineHeight: 1,
                      }}
                      aria-label={`Remove excluded date ${dateStr}`}
                    >
                      ×
                    </button>
                  }
                >
                  {dateStr}
                </Badge>
              ))}
            </Group>
          )}

          {showExcludedPicker ? (
            <Card withBorder p="sm">
              <Stack gap="xs">
                <DatePickerInput
                  label="Select date to exclude"
                  placeholder="Pick a date"
                  value={pendingExcludedDate}
                  onChange={setPendingExcludedDate}
                />
                <Group gap="xs">
                  {/* Add keeps the picker open so multiple dates can be added. */}
                  <Button size="xs" onClick={handleAddExcludedDate} disabled={!pendingExcludedDate}>
                    Add
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => {
                      setPendingExcludedDate(null);
                      setShowExcludedPicker(false);
                    }}
                  >
                    Done
                  </Button>
                </Group>
              </Stack>
            </Card>
          ) : (
            <Button
              variant="light"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setShowExcludedPicker(true)}
            >
              Add Excluded Date
            </Button>
          )}

          {/* ---------------------------------------------------------- */}
          {/* Manual dates                                               */}
          {/* ---------------------------------------------------------- */}
          <Divider my="xs" label="Manual Dates" />
          <Text size="sm" c="dimmed">
            Additional one-off dates when this event occurs outside its regular schedule.
            Each may carry its own start / end time (defaults to the event time).
          </Text>

          {manualDates.length > 0 && (
            <Stack gap="xs">
              {manualDates.map((entry) => {
                const norm = normalizeManualDate(entry, baseStartTime, baseEndTime);
                return (
                  <Card key={norm.date} withBorder p="xs">
                    <Group justify="space-between" wrap="wrap" gap="xs">
                      <Badge color="blue" variant="light">
                        {norm.date}
                      </Badge>
                      <Group gap="xs" align="flex-end" wrap="wrap">
                        <TimeInput
                          size="xs"
                          label="Start"
                          value={norm.start_time || ''}
                          onChange={(e) =>
                            handleManualDateTimeChange(norm.date, 'start_time', e.target.value)
                          }
                        />
                        <TimeInput
                          size="xs"
                          label="End"
                          value={norm.end_time || ''}
                          onChange={(e) =>
                            handleManualDateTimeChange(norm.date, 'end_time', e.target.value)
                          }
                        />
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => handleRemoveManualDate(norm.date)}
                          aria-label={`Remove manual date ${norm.date}`}
                        >
                          Remove
                        </Button>
                      </Group>
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          )}

          {showManualPicker ? (
            <Card withBorder p="sm">
              <Stack gap="xs">
                <DatePickerInput
                  label="Select manual date"
                  placeholder="Pick a date"
                  value={pendingManualDate}
                  onChange={setPendingManualDate}
                />
                <Group gap="xs" align="flex-end" grow>
                  <TimeInput
                    label="Start time"
                    value={pendingManualStart || baseStartTime || ''}
                    onChange={(e) => setPendingManualStart(e.target.value)}
                  />
                  <TimeInput
                    label="End time"
                    value={pendingManualEnd || baseEndTime || ''}
                    onChange={(e) => setPendingManualEnd(e.target.value)}
                  />
                </Group>
                <Group gap="xs">
                  {/* Add keeps the picker open so multiple manual dates can be added. */}
                  <Button size="xs" onClick={handleAddManualDate} disabled={!pendingManualDate}>
                    Add
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => {
                      setPendingManualDate(null);
                      setPendingManualStart('');
                      setPendingManualEnd('');
                      setShowManualPicker(false);
                    }}
                  >
                    Done
                  </Button>
                </Group>
              </Stack>
            </Card>
          ) : (
            <Button
              variant="light"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setShowManualPicker(true)}
            >
              Add Manual Date
            </Button>
          )}

          {/* ---------------------------------------------------------- */}
          {/* Preview panel                                              */}
          {/* ---------------------------------------------------------- */}
          <Divider my="xs" label="Preview" />
          <Card withBorder p="md" bg="gray.0">
            <Stack gap="xs">
              <Text fw={500} size="sm">
                Next occurrences
              </Text>
              {previewOccurrences.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {frequency
                    ? 'No occurrences to preview — check frequency, interval, and days of week.'
                    : 'Select a frequency to preview upcoming occurrences.'}
                </Text>
              ) : (
                previewOccurrences.map((date, i) => {
                  const ymd = dateToLocalYMD(date);
                  const override = occurrenceTimes[ymd] || {};
                  // Per-occurrence time defaults to the event's base start time.
                  const timeStr = override.start_time || baseStartTime || '';
                  const displayDate = ymdHmToDate(ymd, timeStr) || date;
                  const timeLabel = formatTimeLabel(timeStr);
                  return (
                    <Group key={i} justify="space-between" wrap="wrap" gap="xs">
                      <Text size="sm">
                        {displayDate.toLocaleDateString(undefined, {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {timeLabel ? ` · ${timeLabel}` : ''}
                      </Text>
                      <Group gap="xs" align="flex-end" wrap="wrap">
                        <TimeInput
                          size="xs"
                          aria-label={`Start time for ${ymd}`}
                          value={override.start_time || baseStartTime || ''}
                          onChange={(e) =>
                            handleOccurrenceTimeChange(ymd, 'start_time', e.target.value)
                          }
                        />
                        <TimeInput
                          size="xs"
                          aria-label={`End time for ${ymd}`}
                          value={override.end_time || baseEndTime || ''}
                          onChange={(e) =>
                            handleOccurrenceTimeChange(ymd, 'end_time', e.target.value)
                          }
                        />
                      </Group>
                    </Group>
                  );
                })
              )}
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  );
}
