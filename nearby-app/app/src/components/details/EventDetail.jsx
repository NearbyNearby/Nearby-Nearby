import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, Globe, Phone, Mail, Ticket, ExternalLink, X } from 'lucide-react';

import {
  AccSection, ContentGroup, ChipList, CategoryChipList,
  POIDetailLayout, SocialLinksGroup, hasSocialLinks,
  hasVal, asArray, copyToClipboard, getCoordinates,
} from './shared';
import ServiceAnimalAlert from './ServiceAnimalAlert';
import EventStatusBanner from './EventStatusBanner';
import { SvgDirections, SvgLatLong } from './PoiHeader';
import { EventJsonLd } from '../seo/index';
import DirectionsModal from '../common/DirectionsModal';

import { getDisplayableLocation } from '../../utils/getDisplayableLocation';
import { formatEventDateTime, getNextOccurrence } from '../../utils/eventSchedule';
import { sanitizeHtml } from '../../utils/sanitize';


/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// #142 item 17: the bottom notice keeps its wording but reads as an on-brand
// note card (same treatment as the ADA Service Animal alert the other three
// POI pages use) instead of the old yellow warning slab.
const EVENT_NOTICE = {
  title: 'Before You Go',
  body: [
    'While we work to keep event information current and accurate, details may change.',
    'We recommend confirming directly with event organizers before making plans.',
  ],
};

const IDEAL_FOR_GROUPS = ['atmosphere', 'age_group', 'social_settings', 'local_special'];

// How many occurrences of a repeating series to resolve. The first one is the
// Date row, so the "Upcoming Dates" list shows the rest (#142 item 11 asks
// for the next 5-10 dates).
const UPCOMING_LIMIT = 6;

const DAY_FMT = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
const formatDay = (d) => d.toLocaleDateString('en-US', DAY_FMT);

/** 12-hour clock in the same style as the header line ("3pm", "3:30pm"). */
function formatClock(d) {
  const h24 = d.getHours();
  const m = d.getMinutes();
  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

const sameDay = (a, b) => a.toDateString() === b.toDateString();

/** #142 item 3: "ENDED" is judged on the CURRENT occurrence (#141), not the
    series start, and rides behind the date instead of the status block. */
function isEventEnded(event, occurrence) {
  if (!event?.start_datetime) return false;
  const start = occurrence?.start ?? new Date(event.start_datetime);
  const end = occurrence
    ? (occurrence.end ?? start)
    : (event.end_datetime ? new Date(event.end_datetime) : start);
  return Date.now() > end.getTime();
}

/** A zero amount is free, however the editor typed it (0, "0", "0.00", "$0"). */
function isFreeAmount(v) {
  if (v === 0) return true;
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  if (s === '') return false;
  if (s === 'free') return true;
  const n = Number(s.replace(/^\$/, ''));
  return Number.isFinite(n) && n === 0;
}

function formatCost(event, poi) {
  const t = event?.cost_type;
  if (t === 'free') return 'Free';
  if (t === 'single_price' && hasVal(event?.price)) {
    return isFreeAmount(event.price) ? 'Free' : `$${event.price}`;
  }
  if (t === 'range' && event?.cost_min != null && event?.cost_max != null)
    return `$${event.cost_min} - $${event.cost_max}`;
  if (hasVal(event?.price)) return isFreeAmount(event.price) ? 'Free' : `$${event.price}`;
  if (event?.cost_min != null && event?.cost_max != null) return `$${event.cost_min} - $${event.cost_max}`;
  // The public event payload carries cost_type only; the human-readable amount
  // lives in the POI's own `cost` column. Neither Business nor Park has a
  // zero-cost convention (both would print a literal "0"), so events set one:
  // a zero amount reads "Free" rather than "0" (#142 follow-up).
  if (isFreeAmount(poi?.cost)) return 'Free';
  if (typeof poi?.cost === 'string' && poi.cost.trim() !== '') return poi.cost.trim();
  return null;
}

/**
 * The next occurrences of a repeating series, walked out of the shared
 * getNextOccurrence by moving the cursor past each hit.
 *
 * A recurring series is ONE listing in the data model, so there is no per-date
 * page to link to: these render as plain chips (product decision, #142 item 11).
 */
function getUpcomingOccurrences(event, limit) {
  if (!event?.is_repeating) return [];
  const out = [];
  let cursor = new Date();
  for (let i = 0; i < limit; i += 1) {
    const occ = getNextOccurrence(event, cursor);
    if (!occ) break;
    out.push(occ);
    const last = occ.end ?? occ.start;
    cursor = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
  }
  return out;
}

/** #142 item 4: the top-of-page hours accordion is gone; a recurring event gets
    a note that jumps to the Upcoming Dates list instead. AccSection derives its
    DOM id from the title and does its own smooth scroll when it opens. */
function openAboutDetails() {
  const section = document.getElementById('poi_acc_about_details');
  if (!section) return;
  if (section.classList.contains('acc_active')) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    section.querySelector('.acc_head')?.click();
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function EventDetail({ poi }) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);

  const event = poi.event || null;
  const displayLoc = getDisplayableLocation(poi);
  const hideExact = displayLoc.hideExact || poi.dont_display_location === true;
  // #141: a repeating event is one POI whose start_datetime is the FIRST date of
  // the series. Everything date-shaped on this page reads the occurrence that is
  // current today instead, so a weekly market does not present as a stale listing.
  const occurrence = getNextOccurrence(event);
  const ended = isEventEnded(event, occurrence);
  const isCanceled = event?.event_status === 'cancelled' || event?.event_status === 'Canceled';

  // Address, coordinates and parking come from the POI's own columns. When the
  // event links to a venue with address/parking inheritance the backend has
  // already resolved the venue's values into them (#124), so there is nothing
  // venue-shaped to read off the event itself.
  const coords = getCoordinates(poi, hideExact);
  const addressLine = hasVal(poi.address_street)
    ? [poi.address_street, poi.address_city, poi.address_state, poi.address_zip].filter(Boolean).join(', ')
    : null;

  const handleDirections = () => setDirectionsOpen(true);
  const handleCopyAddress = async () => {
    if (!addressLine) return;
    if (await copyToClipboard(addressLine)) {
      setCopiedAddress(true); setTimeout(() => setCopiedAddress(false), 2000);
    }
  };
  const handleCopyCoords = async () => {
    if (!coords) return;
    if (await copyToClipboard(`${coords.lat}, ${coords.lng}`)) {
      setCopiedCoords(true); setTimeout(() => setCopiedCoords(false), 2000);
    }
  };
  const handleCopyPhone = async () => {
    if (!poi.phone_number) return;
    if (await copyToClipboard(poi.phone_number)) {
      setCopiedPhone(true); setTimeout(() => setCopiedPhone(false), 2000);
    }
  };
  const handleCopyEmail = async () => {
    if (!poi.email) return;
    if (await copyToClipboard(poi.email)) {
      setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  /* ---- derived display data ---- */
  const venueName = event?.venue_name || event?.venue_name_snapshot || event?.venue?.name || null;
  const dateTimeLine = occurrence
    ? formatEventDateTime(occurrence.start, occurrence.end)
    : formatEventDateTime(event?.start_datetime, event?.end_datetime);

  const occStart = occurrence?.start || null;
  const occEnd = occurrence?.end || null;
  const dateText = occStart
    ? (occEnd && !sameDay(occStart, occEnd) ? `${formatDay(occStart)} to ${formatDay(occEnd)}` : formatDay(occStart))
    : null;
  const timeText = occStart
    ? (occEnd ? `${formatClock(occStart)} - ${formatClock(occEnd)}` : formatClock(occStart))
    : null;

  const upcoming = useMemo(() => getUpcomingOccurrences(event, UPCOMING_LIMIT), [event]);
  const upcomingLabels = upcoming.slice(1).map((o) => formatEventDateTime(o.start, o.end)).filter(Boolean);

  // ticket links: [{ platform, url }] on poi.event
  const ticketLinksRaw = Array.isArray(event?.ticket_links) ? event.ticket_links
    : (Array.isArray(poi.ticket_links) ? poi.ticket_links : []);
  const ticketLinks = ticketLinksRaw.filter((t) => t && (typeof t === 'string' ? t : t.url));
  const hasTickets = ticketLinks.length > 0;
  const ticketHref = (t) => {
    const url = typeof t === 'string' ? t : t.url;
    return url.startsWith('http') ? url : `https://${url}`;
  };
  const ticketLabel = (t) => (typeof t === 'string' ? null : (t.platform || t.name)) || null;

  const costLabel = formatCost(event, poi);

  const idealForItems = useMemo(() => {
    const ideal = poi?.ideal_for;
    if (!ideal || typeof ideal !== 'object') return [];
    if (Array.isArray(ideal)) return asArray(ideal);
    const out = [];
    IDEAL_FOR_GROUPS.forEach((key) => { out.push(...asArray(ideal[key])); });
    return out;
  }, [poi]);

  const wifiItems = asArray(poi.wifi_options);
  const organizerSocials = event?.organizer_social_media;
  const hasOrganizerSocials = hasSocialLinks({ other_socials: organizerSocials });
  const hasOrganizer =
    hasVal(event?.organizer_name) || hasVal(event?.organizer_email) ||
    hasVal(event?.organizer_phone) || hasVal(event?.organizer_website) ||
    hasOrganizerSocials;

  const webHref = poi?.website_url
    ? (String(poi.website_url).startsWith('http') ? poi.website_url : `https://${poi.website_url}`)
    : null;

  /* ---- ABOUT + DETAILS (#142 items 7-11) ---- */
  // Two columns: the narrative on the left, the "when / what it costs / what is
  // on site" facts on the right. The teaser paragraph and the Organizer and
  // Repeats rows are deliberately NOT here any more (items 8 and 10).
  const aboutCol1 = [
    hasVal(poi.description_long) && (
      <ContentGroup key="desc">
        <div
          className="acc_content_text poi_description"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.description_long) }}
        />
      </ContentGroup>
    ),
    idealForItems.length > 0 && (
      <ContentGroup key="ideal" title="Ideal For">
        {/* Explore has no ideal_for facet, so a chip searches on its phrase. */}
        <ChipList
          items={idealForItems}
          renderItem={(item, i) => (
            <Link key={i} to={`/explore?q=${encodeURIComponent(item)}`} className="poi_category_chip_link">
              {item}
            </Link>
          )}
        />
      </ContentGroup>
    ),
    Array.isArray(poi.categories) && poi.categories.length > 0 && (
      <ContentGroup key="cats" title="Categories"><CategoryChipList categories={poi.categories} /></ContentGroup>
    ),
  ].filter(Boolean);

  const aboutCol2 = [
    dateText && <ContentGroup key="date" title="Date"><div className="acc_content_text"><p>{dateText}</p></div></ContentGroup>,
    timeText && <ContentGroup key="time" title="Time"><div className="acc_content_text"><p>{timeText}</p></div></ContentGroup>,
    upcomingLabels.length > 0 && (
      <ContentGroup key="upcoming" title="Upcoming Dates">
        <ChipList
          items={upcomingLabels}
          renderItem={(label, i) => <span key={i} className="ed-date-chip">{label}</span>}
        />
      </ContentGroup>
    ),
    (costLabel || hasTickets) && (
      <ContentGroup key="cost" title="Cost">
        {costLabel && <div className="acc_content_text"><p>{costLabel}</p></div>}
        {hasTickets && (
          <div className="pd-addr__actions">
            {ticketLinks.map((t, i) => (
              <a
                key={i}
                className="btn_reset button btn_poi_button_1 ed-ticket-btn"
                href={ticketHref(t)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Ticket size={14} className="poi_button_icon" />
                <span className="poi_button_title">
                  {ticketLabel(t) ? `Get Tickets · ${ticketLabel(t)}` : 'Get Tickets'}
                </span>
              </a>
            ))}
          </div>
        )}
      </ContentGroup>
    ),
    hasVal(poi.pricing_details) && (
      <ContentGroup key="pricing" title="Pricing Details">
        <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.pricing_details) }} />
      </ContentGroup>
    ),
    hasVal(poi.payment_methods) && (
      <ContentGroup key="paymeth" title="Payment Methods"><ChipList items={poi.payment_methods} /></ContentGroup>
    ),
    hasVal(event?.venue_settings) && (
      <ContentGroup key="setting" title="Venue Setting"><ChipList items={event.venue_settings} /></ContentGroup>
    ),
    wifiItems.length > 0 && <ContentGroup key="wifi" title="Wifi"><ChipList items={wifiItems} /></ContentGroup>,
    wifiItems.length === 0 && poi.icon_free_wifi === true && (
      <ContentGroup key="wifi" title="Wifi"><div className="acc_content_text"><p>Free Wi-Fi available.</p></div></ContentGroup>
    ),
  ].filter(Boolean);

  /* ---- VENUE ADDRESS + PARKING (#142 item 12) ---- */
  // Same shape as the Business page's Address + Parking accordion, reading the
  // POI's own address/parking columns (venue-inherited server side, #124).
  const venueCol1 = [
    venueName && (
      <ContentGroup key="venue" title="Venue">
        <div className="acc_content_text">
          {event?.venue_poi_id ? <a href={`/poi/${event.venue_poi_id}`}>{venueName}</a> : <p>{venueName}</p>}
        </div>
      </ContentGroup>
    ),
    !hideExact && (addressLine || coords) && (
      <ContentGroup key="addr" title="Address">
        <div className="acc_content_text">
          {addressLine && <div>{addressLine}</div>}
          <div className="pd-addr__actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleDirections}>
              <SvgDirections /> <span className="poi_button_title">Directions</span>
            </button>
            {addressLine && (
              <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleCopyAddress}>
                {copiedAddress ? <Check size={14} /> : <Copy size={14} />}
                <span className="poi_button_title">{copiedAddress ? 'Copied!' : 'Copy Address'}</span>
              </button>
            )}
            {coords && (
              <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleCopyCoords}>
                {copiedCoords ? <Check size={14} /> : <SvgLatLong />}
                <span className="poi_button_title">{copiedCoords ? 'Copied!' : 'Lat + Long'}</span>
              </button>
            )}
          </div>
        </div>
      </ContentGroup>
    ),
    hasVal(event?.event_entry_notes) && (
      <ContentGroup key="entry" title="Entry Notes">
        <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.event_entry_notes) }} />
      </ContentGroup>
    ),
  ].filter(Boolean);

  const venueCol2 = [
    hasVal(poi.parking_types) && <ContentGroup key="parking" title="Parking"><ChipList items={poi.parking_types} /></ContentGroup>,
    hasVal(poi.arrival_methods) && <ContentGroup key="arrival" title="Arrival"><ChipList items={poi.arrival_methods} /></ContentGroup>,
    poi.expect_to_pay_parking === true && (
      <ContentGroup key="paypark"><div className="acc_content_text"><p>Expect to pay for parking.</p></div></ContentGroup>
    ),
    hasVal(poi.parking_notes) && (
      <ContentGroup key="pnotes"><div className="acc_content_text"><p>{poi.parking_notes}</p></div></ContentGroup>
    ),
    hasVal(poi.accessible_parking_details) && (
      <ContentGroup key="adapark" title="Accessible Parking Details"><ChipList items={poi.accessible_parking_details} /></ContentGroup>
    ),
  ].filter(Boolean);

  /* ---- PUBLIC RESTROOMS (#142 item 13, Business model) ---- */
  const restroomCol1 = [
    hasVal(poi.public_toilets) && <ContentGroup key="pt" title="Restrooms"><ChipList items={poi.public_toilets} /></ContentGroup>,
    hasVal(poi.toilet_description) && <ContentGroup key="td" title="Details"><div className="acc_content_text">{poi.toilet_description}</div></ContentGroup>,
  ].filter(Boolean);
  const restroomCol2 = [
    poi.accessible_restroom === true && hasVal(poi.accessible_restroom_details) && (
      <ContentGroup key="ard" title="Accessible Restroom Details"><ChipList items={poi.accessible_restroom_details} /></ContentGroup>
    ),
  ].filter(Boolean);

  /* ---- PLAYGROUND (#142 item 15, Business model) ---- */
  const playgroundCol1 = [
    hasVal(poi.playground_types) && <ContentGroup key="pt" title="Playground Types"><ChipList items={poi.playground_types} /></ContentGroup>,
    hasVal(poi.playground_surface_types) && <ContentGroup key="ps" title="Surface"><ChipList items={poi.playground_surface_types} /></ContentGroup>,
  ].filter(Boolean);
  const playgroundCol2 = [
    hasVal(poi.playground_age_groups) && <ContentGroup key="pag" title="Age Groups"><ChipList items={poi.playground_age_groups} /></ContentGroup>,
    hasVal(poi.playground_notes) && (
      <ContentGroup key="pgn" title="Notes">
        <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.playground_notes) }} />
      </ContentGroup>
    ),
    poi.inclusive_playground === true && hasVal(poi.playground_ada_checklist) && (
      <ContentGroup key="pad" title="Inclusive Playground Checklist"><ChipList items={poi.playground_ada_checklist} /></ContentGroup>
    ),
  ].filter(Boolean);

  /* ---- PET POLICY (#142 item 14, Business model, single column) ---- */
  const petCol1 = [
    hasVal(poi.pet_options) && <ContentGroup key="pets" title="Pet Policy"><ChipList items={poi.pet_options} /></ContentGroup>,
    hasVal(poi.pet_policy) && (
      <ContentGroup key="pp"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.pet_policy) }} /></ContentGroup>
    ),
    hasVal(poi.pet_options) && <ContentGroup key="sa"><ServiceAnimalAlert /></ContentGroup>,
  ].filter(Boolean);

  /* ---- CONTACT (#142 item 16: Business layout + the Event Organizer) ---- */
  const contactCol1 = [
    hasOrganizer && (
      <ContentGroup key="organizer" title="Event Organizer">
        <div className="acc_content_text">
          {hasVal(event?.organizer_name) && <p>{event.organizer_name}</p>}
          {hasVal(event?.organizer_phone) && (
            <p><a href={`tel:${event.organizer_phone}`}>{event.organizer_phone}</a></p>
          )}
          {hasVal(event?.organizer_email) && (
            <p><a href={`mailto:${event.organizer_email}`}>{event.organizer_email}</a></p>
          )}
          {hasVal(event?.organizer_website) && (
            <p>
              <a
                href={event.organizer_website.startsWith('http') ? event.organizer_website : `https://${event.organizer_website}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {event.organizer_website}
              </a>
            </p>
          )}
        </div>
        {hasOrganizerSocials && <SocialLinksGroup poi={{ other_socials: organizerSocials }} />}
        {event?.contact_organizer_toggle === true && hasVal(event?.organizer_email) && (
          <a href={`mailto:${event.organizer_email}`} className="ed-contact-organizer-btn">
            <Mail size={14} /> Contact Organizer
          </a>
        )}
      </ContentGroup>
    ),
    hasVal(poi.phone_number) && (
      <ContentGroup key="phone" title="Phone">
        <div className="acc_list_group_1 poi_contact_row">
          <Phone size={16} />
          <a href={`tel:${poi.phone_number}`}>{poi.phone_number}</a>
          <button type="button" className="btn_reset poi_contact_copy_btn" onClick={handleCopyPhone}>
            {copiedPhone ? <Check size={14} /> : <Copy size={14} />} {copiedPhone ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </ContentGroup>
    ),
    webHref && (
      <ContentGroup key="web" title="Website">
        <div className="acc_list_group_1 poi_contact_row">
          <Globe size={16} />
          <a href={webHref} target="_blank" rel="noreferrer">Visit {poi.name} Website</a>
        </div>
      </ContentGroup>
    ),
  ].filter(Boolean);
  const contactCol2 = [
    hasVal(poi.email) && (
      <ContentGroup key="email" title="Email">
        <div className="acc_list_group_1 poi_contact_row">
          <a href={`mailto:${poi.email}`}>{poi.email}</a>
          <button type="button" className="btn_reset poi_contact_copy_btn" onClick={handleCopyEmail}>
            {copiedEmail ? <Check size={14} /> : <Copy size={14} />} {copiedEmail ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </ContentGroup>
    ),
    hasSocialLinks(poi) && <SocialLinksGroup key="soc" poi={poi} />,
  ].filter(Boolean);

  /* ---- sections kept but hidden (see HIDDEN_ACCORDIONS below) ---- */
  const vendorCol1 = event?.has_vendors === true && hasVal(event?.vendor_types)
    ? [<ContentGroup key="vt" title="Vendor Types"><ChipList items={event.vendor_types} /></ContentGroup>]
    : [];
  const vendorCol2 = event?.has_vendors === true && Array.isArray(event?.vendors) && event.vendors.length > 0
    ? [(
      <ContentGroup key="vl" title="Vendors">
        <div className="acc_list_group_1">
          {event.vendors.map((v, i) => (
            v.poi_id ? <a key={v.id || i} href={`/poi/${v.poi_id}`}>{v.name}</a> : <span key={v.id || i}>{v.name}</span>
          ))}
        </div>
      </ContentGroup>
    )]
    : [];

  const mobilityCol1 = hasVal(poi.wheelchair_details)
    ? [<ContentGroup key="wd" title="Details"><div className="acc_content_text">{poi.wheelchair_details}</div></ContentGroup>]
    : [];
  const mobilityCol2 = hasVal(poi.mobility_access)
    ? [<ContentGroup key="ma" title="Mobility Access"><ChipList items={poi.mobility_access} /></ContentGroup>]
    : [];

  const droneCol1 = hasVal(poi.drone_usage)
    ? [<ContentGroup key="du" title="Drone Usage"><ChipList items={poi.drone_usage} /></ContentGroup>]
    : [];
  const droneCol2 = hasVal(poi.drone_policy)
    ? [<ContentGroup key="dp" title="Policy"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.drone_policy) }} /></ContentGroup>]
    : [];

  const alcoholCol1 = [
    hasVal(poi.alcohol_available) && <ContentGroup key="aa" title="Alcohol"><ChipList items={poi.alcohol_available} /></ContentGroup>,
    hasVal(poi.alcohol_availability) && <ContentGroup key="aav" title="Available"><ChipList items={poi.alcohol_availability} /></ContentGroup>,
    poi.byob_allowed === true && <ContentGroup key="byob"><div className="acc_content_text"><p>BYOB allowed.</p></div></ContentGroup>,
    hasVal(poi.alcohol_notes) && <ContentGroup key="an" title="Notes"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.alcohol_notes) }} /></ContentGroup>,
  ].filter(Boolean);
  const alcoholCol2 = [
    hasVal(poi.smoking_options) && <ContentGroup key="so" title="Smoking"><ChipList items={poi.smoking_options} /></ContentGroup>,
    hasVal(poi.smoking_details) && <ContentGroup key="sd" title="Smoking Details"><div className="acc_content_text">{poi.smoking_details}</div></ContentGroup>,
  ].filter(Boolean);

  const rentalCol1 = poi.available_for_rent === true
    ? [<ContentGroup key="rent"><div className="acc_content_text"><p>Available for rent.</p></div></ContentGroup>]
    : [];
  const rentalCol2 = poi.available_for_rent === true && hasVal(poi.rental_info)
    ? [<ContentGroup key="ri" title="Details"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.rental_info) }} /></ContentGroup>]
    : [];

  const historyCol1 = hasVal(poi.history_paragraph)
    ? [<ContentGroup key="hist" title="History"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.history_paragraph) }} /></ContentGroup>]
    : [];
  const historyCol2 = hasVal(poi.community_impact)
    ? [<ContentGroup key="ci" title="Community Impact"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.community_impact) }} /></ContentGroup>]
    : [];

  const sponsorCol1 = Array.isArray(event?.sponsors) && event.sponsors.length > 0
    ? [(
      <ContentGroup key="sponsors" title="Tiers">
        <div className="ed-sponsors__grid">
          {event.sponsors.map((s, i) => (
            <div key={s.id || i} className="ed-sponsor-card">
              {s.logo_url && (
                <img className="ed-sponsor-card__logo" src={s.logo_url} alt={`${s.name} logo`} loading="lazy" />
              )}
              <div className="ed-sponsor-card__info">
                {s.url ? (
                  <a
                    href={s.url.startsWith('http') ? s.url : `https://${s.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ed-sponsor-card__name"
                  >
                    {s.name}
                  </a>
                ) : (
                  <span className="ed-sponsor-card__name">{s.name}</span>
                )}
                {s.tier && <span className="ed-sponsor-card__tier">{s.tier}</span>}
              </div>
            </div>
          ))}
        </div>
      </ContentGroup>
    )]
    : [];

  /* ---- section manifest ----
     Single list. The server tier-gates the underlying fields, so paid-only
     sections self-hide for free tier when both their columns come back empty. */
  const ALL_SECTIONS = [
    { key: 'about_details', title: 'About + Details', col1: aboutCol1, col2: aboutCol2 },
    { key: 'venue_parking', title: 'Venue Address + Parking', col1: venueCol1, col2: venueCol2 },
    { key: 'restrooms', title: 'Public Restrooms', col1: restroomCol1, col2: restroomCol2 },
    { key: 'vendors', title: 'Vendors', col1: vendorCol1, col2: vendorCol2 },
    { key: 'playground', title: 'Playground', col1: playgroundCol1, col2: playgroundCol2 },
    { key: 'mobility', title: 'Wheelchair and Mobility Access', col1: mobilityCol1, col2: mobilityCol2 },
    { key: 'pets', title: 'Pet Policy', col1: petCol1, col2: [], singleColumn: true },
    { key: 'drone', title: 'Drone Policy', col1: droneCol1, col2: droneCol2 },
    { key: 'alcohol_smoking', title: 'Alcohol + Smoking', col1: alcoholCol1, col2: alcoholCol2 },
    { key: 'rentals', title: 'Rentals', col1: rentalCol1, col2: rentalCol2 },
    { key: 'locally_found', title: 'Locally Found + History', col1: historyCol1, col2: historyCol2 },
    { key: 'contact', title: 'Contact', col1: contactCol1, col2: contactCol2 },
    { key: 'sponsors', title: 'Sponsors', col1: sponsorCol1, col2: [] },
  ];

  // Accordions hidden per the POI Accordion show/hide doc. Events keep
  // About+Details, Venue Address+Parking, Public Restrooms, Playground,
  // Pet Policy and Contact (#142 items 13 and 15 added the last two).
  // Restore one by removing its key from this set.
  const HIDDEN_ACCORDIONS = new Set(['vendors', 'mobility', 'drone', 'alcohol_smoking', 'rentals', 'locally_found', 'sponsors']);
  const sections = ALL_SECTIONS
    .filter((s) => !HIDDEN_ACCORDIONS.has(s.key))
    .filter((s) => s.col1.length > 0 || s.col2.length > 0);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  const ticketButtons = (() => {
    const btns = [];
    if (hasTickets) {
      if (ticketLinks.length > 1) {
        btns.push({ label: 'GET TICKETS', svg: <Ticket size={14} className="poi_button_icon" />, onClick: () => setTicketsOpen(true), extraClass: 'ed-ticket-btn' });
      } else {
        const t = ticketLinks[0];
        const platform = ticketLabel(t);
        btns.push({ label: platform ? `GET TICKETS · ${platform}` : 'GET TICKETS', svg: <Ticket size={14} className="poi_button_icon" />, href: ticketHref(t), target: '_blank', rel: 'noopener noreferrer', extraClass: 'ed-ticket-btn' });
      }
    }
    return btns;
  })();

  return (
    <>
    <POIDetailLayout
      poi={poi}
      mainCategory={
        <>
          {dateTimeLine}
          {ended && <span className="ed-ended-badge">Ended</span>}
        </>
      }
      // #142 item 4: events never show the hours pill or the "show all hours"
      // accordion hanging off it. An explicit null keeps POIDetailLayout from
      // deriving one from poi.hours (undefined opts into that derivation).
      statusVariant={null}
      statusLabel={null}
      extraButtons={ticketButtons}
      subtitleExtras={
        <>
          {venueName && <p className="ed-venue-line">{venueName}</p>}
          {event?.is_repeating === true && (
            <button type="button" className="btn_reset ed-recurring-note" onClick={openAboutDetails}>
              This is a recurring event, see other dates
            </button>
          )}
          {isCanceled && hasVal(event?.cancellation_paragraph) && (
            <div className="ed-cancellation" role="alert">{event.cancellation_paragraph}</div>
          )}
        </>
      }
      seoComponent={<EventJsonLd poi={poi} />}
      beforeHeader={
        <div className="wrapper_default">
          <EventStatusBanner
            eventStatus={event?.event_status}
            statusExplanation={event?.status_explanation}
            cancellationParagraph={event?.cancellation_paragraph}
            contactOrganizerToggle={event?.contact_organizer_toggle}
            newEventLink={event?.new_event_link}
            onlineEventUrl={event?.online_event_url}
          />
        </div>
      }
      // #142 item 2: the admin Status + Status Message block is not the event's
      // status. EventStatusBanner above owns that job for events.
      hideStatus
    >
      {() => (
        <>
          {/* #142 item 1: events never lead with a featured image, so the
              quick-info + photos box is not rendered on this page at all. */}
          {sections.length > 0 && (
            <div id="accordion_1_box" className="poi_accordion_box">
              <div id="accordion_1_parent" className="poi_accordion_parent accordionjs">
                {sections.map((s) => (
                  s.singleColumn
                    ? <AccSection key={s.key} title={s.title} defaultOpen={false}>{s.col1}</AccSection>
                    : (
                      <AccSection
                        key={s.key}
                        title={s.title}
                        defaultOpen={false}
                        col1={s.col1.length > 0 ? s.col1 : null}
                        col2={s.col2.length > 0 ? s.col2 : null}
                      />
                    )
                ))}
              </div>
            </div>
          )}

          <aside className="ed-disclaimer" role="note" aria-label="Event information notice">
            <h4 className="ed-disclaimer__title">{EVENT_NOTICE.title}</h4>
            {EVENT_NOTICE.body.map((sentence, i) => <p key={i}>{sentence}</p>)}
          </aside>

          {ticketsOpen && (
            <div className="ed-modal-backdrop" onClick={() => setTicketsOpen(false)}>
              <div className="ed-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="ed-modal__header">
                  <h3>Get Tickets</h3>
                  <button type="button" className="ed-modal__close" onClick={() => setTicketsOpen(false)} aria-label="Close"><X size={18} /></button>
                </div>
                <ul className="ed-modal__list">
                  {ticketLinks.map((t, i) => (
                    <li key={i}>
                      <a href={ticketHref(t)} target="_blank" rel="noopener noreferrer">
                        <Ticket size={16} /> <span>{ticketLabel(t) || 'Tickets'}</span> <ExternalLink size={14} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </POIDetailLayout>
    <DirectionsModal
      isOpen={directionsOpen}
      onClose={() => setDirectionsOpen(false)}
      poiName={poi?.name}
      coords={coords}
      poi={poi}
    />
    </>
  );
}

export default EventDetail;
