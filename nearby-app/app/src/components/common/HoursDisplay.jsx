import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import {
  getWeekHours,
  formatLegacyHours,
  getUpcomingHolidays,
  formatHolidayStatus
} from '../../utils/hoursUtils';
import { sanitizeHtml } from '../../utils/sanitize';

/**
 * HoursDisplay - Reusable component for displaying POI hours
 * Shows day-by-day hours, holiday hours, and appointment links
 *
 * Props:
 * - hours: JSONB hours data (new format with regular/seasonal/holidays/exceptions)
 * - appointmentLinks: Array of {title, url} for appointment services
 * - appointmentBookingUrl: Single URL string for booking
 * - appointmentRequired: Boolean flag for "appointment required" notice
 * - hoursNotes: General notes about hours
 *
 * Issue #70: the legacy `holidayHours` prop (fed from the now-deprecated
 * top-level `holiday_hours` column) has been removed. Holiday hours are read
 * exclusively from the nested `hours.holidays` key.
 */
function HoursDisplay({
  hours,
  appointmentLinks,
  appointmentBookingUrl,
  appointmentRequired,
  hoursNotes
}) {
  const [showAllHolidays, setShowAllHolidays] = useState(false);
  const INITIAL_HOLIDAY_COUNT = 4;

  // Get week hours using the utility function
  const weekHours = hours ? getWeekHours(hours) : [];

  // Handle legacy hours format (simple day: time strings)
  const legacyHours = !weekHours.length && hours ? formatLegacyHours(hours) : [];

  // Issue #70: only read holidays from the canonical nested key.
  const upcomingHolidays = getUpcomingHolidays(hours?.holidays);

  // Determine which holidays to show
  const visibleHolidays = showAllHolidays
    ? upcomingHolidays
    : upcomingHolidays.slice(0, INITIAL_HOLIDAY_COUNT);

  const hasMoreHolidays = upcomingHolidays.length > INITIAL_HOLIDAY_COUNT;

  // Check if we have any content to display
  const hasHours = weekHours.length > 0 || legacyHours.length > 0;
  const hasHolidays = upcomingHolidays.length > 0;
  const hasAppointments = (appointmentLinks && appointmentLinks.length > 0) || appointmentBookingUrl;
  const hasNotes = hoursNotes || appointmentRequired;

  if (!hasHours && !hasHolidays && !hasAppointments && !hasNotes) {
    return null;
  }

  return (
    <div className="hours-display">
      {/* Regular Hours Section */}
      {hasHours && (
        <div className="hours-display__section">
          <h4 className="hours-display__header">HOURS</h4>
          <div className="hours-display__days">
            {weekHours.length > 0 ? (
              // New format hours
              weekHours.map((day) => (
                <div
                  key={day.dayName}
                  className={`hours-display__day-row ${day.isToday ? 'hours-display__day-row--today' : ''} ${day.isModified ? 'hours-display__day-row--modified' : ''}`}
                >
                  <span className="hours-display__day-label">{day.dayShort}:</span>
                  <span className="hours-display__day-hours">
                    {day.formattedHours}
                    {day.label && <span className="hours-display__day-note"> ({day.label})</span>}
                  </span>
                </div>
              ))
            ) : (
              // Legacy format hours
              legacyHours.map((day) => (
                <div key={day.day} className="hours-display__day-row">
                  <span className="hours-display__day-label">{day.dayShort}:</span>
                  <span className="hours-display__day-hours">{day.hours}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* General Hour Notes */}
      {hasNotes && (
        <div className="hours-display__section">
          <h4 className="hours-display__header">GENERAL HOUR NOTES</h4>
          <div className="hours-display__notes">
            {appointmentRequired && (
              <p className="hours-display__notice hours-display__notice--appointment">
                Appointment required for this location.
              </p>
            )}
            {hoursNotes && (
              <div
                className="hours-display__notes-text"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(hoursNotes) }}
              />
            )}
          </div>
        </div>
      )}

      {/* Upcoming Hour Changes (Holiday Hours) */}
      {hasHolidays && (
        <div className="hours-display__section">
          <h4 className="hours-display__header">UPCOMING HOUR CHANGES</h4>
          <div className="hours-display__holidays">
            {visibleHolidays.map((holiday, idx) => (
              <div key={holiday.key} className="hours-display__holiday-row">
                <span className="hours-display__holiday-prefix">
                  {idx === 0 ? 'Next:' : ''}
                </span>
                <span className="hours-display__holiday-name">{holiday.name}</span>
                <span className="hours-display__holiday-date">{holiday.dateStr}</span>
                <span className={`hours-display__holiday-status hours-display__holiday-status--${holiday.hours?.status || 'default'}`}>
                  {formatHolidayStatus(holiday.hours)}
                </span>
              </div>
            ))}
          </div>

          {/* SEE MORE / SEE LESS toggle */}
          {hasMoreHolidays && (
            <button
              type="button"
              className="hours-display__see-more"
              onClick={() => setShowAllHolidays(!showAllHolidays)}
            >
              {showAllHolidays ? (
                <>SEE LESS <ChevronDown size={14} className="hours-display__see-more-icon hours-display__see-more-icon--up" /></>
              ) : (
                <>SEE MORE ({upcomingHolidays.length - INITIAL_HOLIDAY_COUNT} more) <ChevronDown size={14} className="hours-display__see-more-icon" /></>
              )}
            </button>
          )}
        </div>
      )}

      {/* Appointments Section */}
      {hasAppointments && (
        <div className="hours-display__section">
          <h4 className="hours-display__header">APPOINTMENTS</h4>
          <div className="hours-display__appointments">
            {/* Appointment Links Array */}
            {appointmentLinks && appointmentLinks.length > 0 && (
              <div className="hours-display__appointment-links">
                {appointmentLinks.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url || link.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hours-display__service-btn"
                  >
                    <ExternalLink size={14} />
                    {link.title || link.name || link.label || 'Book Appointment'}
                  </a>
                ))}
              </div>
            )}

            {/* Single Appointment URL fallback */}
            {!appointmentLinks?.length && appointmentBookingUrl && (
              <a
                href={appointmentBookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hours-display__service-btn"
              >
                <ExternalLink size={14} />
                Book an Appointment
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default HoursDisplay;
