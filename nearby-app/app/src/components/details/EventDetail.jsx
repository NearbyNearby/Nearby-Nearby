import { useState, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  Mail, ExternalLink, Ticket, X,
} from 'lucide-react';

import {
  AccSection, QuickInfoRow, QuickInfoPhotosBox, SocialLinksGroup, hasSocialLinks,
  hasVal, copyToClipboard, getCoordinates, getImages,
} from './shared';
import InfoRow from './InfoRow';
import ServiceAnimalAlert from './ServiceAnimalAlert';
import EventStatusBanner from './EventStatusBanner';
import { POIDetailLayout } from './shared';
import { EventJsonLd } from '../seo/index';
import DirectionsModal from '../common/DirectionsModal';

import { getDisplayableLocation } from '../../utils/getDisplayableLocation';


/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const EVENT_DISCLAIMER = [
  'While we work to keep event information current and accurate, details may change.',
  'We recommend confirming directly with event organizers before making plans.',
];

const hasContent = (v) => {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;
  return true;
};

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
function formatEventDateTime(start, end) {
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

/** Event-time derived open/closed label. */
function deriveEventStatus(event) {
  if (!event?.start_datetime) return null;
  const now = Date.now();
  const s = new Date(event.start_datetime).getTime();
  const e = event.end_datetime ? new Date(event.end_datetime).getTime() : s;
  if (now < s) return { text: 'Upcoming', cls: 'poi_page_hours_opensoon' };
  if (now > e) return { text: 'Ended', cls: 'poi_page_hours_closed' };
  return { text: 'Fully Open', cls: 'poi_page_hours_opennow' };
}

function formatCost(event) {
  if (!event) return null;
  const t = event.cost_type;
  if (t === 'free') return 'Free';
  if (t === 'single_price' && event.price != null && event.price !== '') return `$${event.price}`;
  if (t === 'range' && event.cost_min != null && event.cost_max != null)
    return `$${event.cost_min} - $${event.cost_max}`;
  if (event.price != null && event.price !== '') return `$${event.price}`;
  if (event.cost_min != null && event.cost_max != null) return `$${event.cost_min} - $${event.cost_max}`;
  if (typeof event.cost === 'string' && event.cost.trim() !== '') return event.cost;
  return null;
}

function formatRecurrence(event) {
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
/* Component                                                           */
/* ------------------------------------------------------------------ */

function EventDetail({ poi }) {
  const [searchParams] = useSearchParams();
  const viewMode = searchParams.get('view');
  const allOpen = viewMode === 'detail';

  const [copiedCoords, setCopiedCoords] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);

  const event = poi.event || null;
  const displayLoc = getDisplayableLocation(poi);
  const dontDisplayLocation = poi.dont_display_location === true;
  const hideExact = displayLoc.hideExact || dontDisplayLocation;
  const status = deriveEventStatus(event);
  const isCanceled = event?.event_status === 'cancelled' || event?.event_status === 'Canceled';

  const getEventCoords = () => {
    if (hideExact) return null;
    if (event?.venue_front_door_latitude && event?.venue_front_door_longitude)
      return { lat: event.venue_front_door_latitude, lng: event.venue_front_door_longitude };
    if (event?.venue_latitude && event?.venue_longitude)
      return { lat: event.venue_latitude, lng: event.venue_longitude };
    return getCoordinates(poi, hideExact);
  };

  const coords = getEventCoords();
  const handleDirections = () => setDirectionsOpen(true);
  const handleCopyCoords = async () => {
    if (!coords) return;
    if (await copyToClipboard(`${coords.lat}, ${coords.lng}`)) {
      setCopiedCoords(true); setTimeout(() => setCopiedCoords(false), 2000);
    }
  };

  /* ---- derived display data ---- */
  const venueName = event?.venue_name_snapshot || event?.venue?.name || event?.venue_name || null;
  const dateTimeLine = formatEventDateTime(event?.start_datetime, event?.end_datetime);

  const petOptionsStr = Array.isArray(poi.pet_options) && poi.pet_options.length > 0
    ? poi.pet_options.join(', ')
    : null;
  // venue_parking_* snapshot fields are not exposed in the public payload;
  // read the POI's own parking fields instead.
  const parkingTypes = Array.isArray(poi.parking_types) ? poi.parking_types : [];

  const venueAddrStr = [
    event?.venue_address_street,
    event?.venue_address_city,
    event?.venue_address_state,
    event?.venue_address_zip,
  ].filter(Boolean).join(', ');

  const hasVenueSnapshot =
    hasContent(event?.venue_address_street) ||
    hasContent(event?.venue_address_city) ||
    parkingTypes.length > 0 ||
    hasContent(poi.parking_notes);

  // ticket links: [{ platform, url }] on poi.event
  const ticketLinksRaw = Array.isArray(event?.ticket_links) ? event.ticket_links
    : (Array.isArray(poi.ticket_links) ? poi.ticket_links : []);
  const ticketLinks = ticketLinksRaw.filter((t) => t && (typeof t === 'string' ? t : t.url));
  const hasTickets = ticketLinks.length > 0;

  const locationLine = hideExact
    ? [displayLoc.city, displayLoc.region].filter(Boolean).join(', ')
    : displayLoc.full;

  const idealForSpecial = poi.ideal_for?.local_special && (
    Array.isArray(poi.ideal_for.local_special)
      ? poi.ideal_for.local_special.join(', ')
      : poi.ideal_for.local_special
  );
  const costLabel = formatCost(event);

  /* ---- section renderers ---- */
  const renderAboutDetails = () => {
    const hasDesc = hasContent(poi.description_long);
    const hasTeaser = hasContent(poi.teaser_paragraph);
    const recur = formatRecurrence(event);
    const hasOrganizer =
      hasContent(event?.organizer_name) ||
      hasContent(event?.organizer_email) ||
      hasContent(event?.organizer_phone) ||
      hasContent(event?.organizer_website);
    if (!hasDesc && !hasTeaser && !recur && !hasOrganizer && !costLabel && !isCanceled && !hasContent(event?.status_explanation)) {
      return null;
    }
    return (
      <>
        {hasTeaser && (
          <div
            className="poi_description"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poi.teaser_paragraph) }}
          />
        )}
        {hasDesc && (
          <div
            className="poi_description"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poi.description_long) }}
          />
        )}
        {costLabel && <InfoRow label="Cost">{costLabel}</InfoRow>}
        {recur && <InfoRow label="Repeats">{recur}</InfoRow>}
        {isCanceled && hasContent(event?.cancellation_paragraph) && (
          <div className="ed-cancellation" role="alert">
            {event.cancellation_paragraph}
          </div>
        )}
        {hasContent(event?.status_explanation) && !isCanceled && (
          <InfoRow label="Status Details">{event.status_explanation}</InfoRow>
        )}
        {hasOrganizer && (
          <div className="ed-organizer-block">
            <div className="acc_content_title_style_1">Organizer</div>
            {hasContent(event?.organizer_name) && <InfoRow label="Name">{event.organizer_name}</InfoRow>}
            {hasContent(event?.organizer_email) && (
              <InfoRow label="Email">
                <a href={`mailto:${event.organizer_email}`}>{event.organizer_email}</a>
              </InfoRow>
            )}
            {hasContent(event?.organizer_phone) && (
              <InfoRow label="Phone">
                <a href={`tel:${event.organizer_phone}`}>{event.organizer_phone}</a>
              </InfoRow>
            )}
            {hasContent(event?.organizer_website) && (
              <InfoRow label="Website">
                <a
                  href={event.organizer_website.startsWith('http') ? event.organizer_website : `https://${event.organizer_website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {event.organizer_website}
                </a>
              </InfoRow>
            )}
          </div>
        )}
      </>
    );
  };

  const renderVenue = () => {
    if (!hasVenueSnapshot && !venueName && !hasContent(poi.arrival_methods) && poi.expect_to_pay_parking !== true) return null;
    return (
      <>
        {venueName && (
          <InfoRow label="Venue">
            {event?.venue_poi_id
              ? <a href={`/poi/${event.venue_poi_id}`}>{venueName}</a>
              : venueName}
          </InfoRow>
        )}
        {!hideExact && hasContent(venueAddrStr) && (
          <InfoRow label="Address">{venueAddrStr}</InfoRow>
        )}
        {parkingTypes.length > 0 && (
          <InfoRow label="Parking">
            <div className="poi_chip_row">
              {parkingTypes.map((t, i) => <span key={i} className="poi_chip">{t}</span>)}
            </div>
          </InfoRow>
        )}
        {hasContent(poi.arrival_methods) && (
          <InfoRow label="Arrival">
            <div className="poi_chip_row">
              {(Array.isArray(poi.arrival_methods) ? poi.arrival_methods : [poi.arrival_methods]).map((t, i) => <span key={i} className="poi_chip">{t}</span>)}
            </div>
          </InfoRow>
        )}
        {poi.expect_to_pay_parking === true && (
          <InfoRow label="Parking Fees">Expect to pay for parking.</InfoRow>
        )}
        {hasContent(poi.parking_notes) && (
          <InfoRow label="Parking Notes">{poi.parking_notes}</InfoRow>
        )}
      </>
    );
  };

  const renderRestrooms = () => {
    if (!hasContent(poi.public_toilets) && !hasContent(poi.toilet_description)) return null;
    return (
      <>
        {hasContent(poi.public_toilets) && (
          <InfoRow label="Available">
            <div className="poi_chip_row">
              {(Array.isArray(poi.public_toilets) ? poi.public_toilets : [poi.public_toilets]).map((t, i) => (
                <span key={i} className="poi_chip">{t}</span>
              ))}
            </div>
          </InfoRow>
        )}
        {hasContent(poi.toilet_description) && (
          <InfoRow label="Details">{poi.toilet_description}</InfoRow>
        )}
        {poi.accessible_restroom && hasContent(poi.accessible_restroom_details) && (
          <aside className="poi_ada_sub_card">
            <h4 className="poi_ada_sub_card_title">ADA Accessible Restroom</h4>
            <div>{Array.isArray(poi.accessible_restroom_details) ? poi.accessible_restroom_details.join(', ') : poi.accessible_restroom_details}</div>
          </aside>
        )}
      </>
    );
  };

  const renderVendors = () => {
    if (event?.has_vendors !== true) return null;
    const types = Array.isArray(event.vendor_types) ? event.vendor_types : [];
    const vendors = Array.isArray(event.vendors) ? event.vendors : [];
    if (types.length === 0 && vendors.length === 0) return null;
    return (
      <>
        {types.length > 0 && (
          <InfoRow label="Vendor Types">
            <div className="poi_chip_row">
              {types.map((t, i) => <span key={i} className="poi_chip">{t}</span>)}
            </div>
          </InfoRow>
        )}
        {vendors.length > 0 && (
          <InfoRow label="Vendors">
            <ul className="ed-vendor-list">
              {vendors.map((v, i) => (
                <li key={v.id || i}>
                  {v.poi_id ? <a href={`/poi/${v.poi_id}`}>{v.name}</a> : v.name}
                </li>
              ))}
            </ul>
          </InfoRow>
        )}
      </>
    );
  };

  const renderPlayground = () => {
    const hasAny =
      hasContent(poi.playground_types) ||
      hasContent(poi.playground_surface_types) ||
      hasContent(poi.playground_age_groups) ||
      hasContent(poi.playground_notes) ||
      poi.inclusive_playground === true;
    if (!hasAny) return null;
    return (
      <>
        {hasContent(poi.playground_types) && (
          <InfoRow label="Playground Types">
            {Array.isArray(poi.playground_types) ? poi.playground_types.join(', ') : poi.playground_types}
          </InfoRow>
        )}
        {hasContent(poi.playground_surface_types) && (
          <InfoRow label="Surface">
            {Array.isArray(poi.playground_surface_types) ? poi.playground_surface_types.join(', ') : poi.playground_surface_types}
          </InfoRow>
        )}
        {hasContent(poi.playground_age_groups) && (
          <InfoRow label="Age Groups">
            {Array.isArray(poi.playground_age_groups) ? poi.playground_age_groups.join(', ') : poi.playground_age_groups}
          </InfoRow>
        )}
        {poi.inclusive_playground === true && (
          <InfoRow label="Inclusive Playground">Yes</InfoRow>
        )}
        {hasContent(poi.playground_notes) && (
          <InfoRow label="Notes">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poi.playground_notes) }} />
          </InfoRow>
        )}
        {Array.isArray(poi.playground_ada_checklist) && poi.playground_ada_checklist.length > 0 && (
          <InfoRow label="ADA">{poi.playground_ada_checklist.join(', ')}</InfoRow>
        )}
      </>
    );
  };

  const renderWheelchair = () => {
    // wheelchair_accessible chip removed — column dropped (Issue #45 PR2 Migration B)
    if (!hasContent(poi.wheelchair_details)) return null;
    return (
      <>
        <InfoRow label="Details">{poi.wheelchair_details}</InfoRow>
      </>
    );
  };

  const renderPetPolicy = () => {
    if (!hasContent(poi.pet_options)) return null;
    return (
      <>
        <InfoRow label="Pets Allowed">
          <div className="poi_chip_row">
            {poi.pet_options.map((p, i) => <span key={i} className="poi_chip">{p}</span>)}
          </div>
        </InfoRow>
        {hasContent(poi.pet_policy) && (
          <InfoRow label="Policy">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poi.pet_policy) }} />
          </InfoRow>
        )}
        <ServiceAnimalAlert />
      </>
    );
  };

  const renderDrone = () => {
    if (!hasContent(poi.drone_usage) && !hasContent(poi.drone_policy)) return null;
    return (
      <>
        {hasContent(poi.drone_usage) && (
          <InfoRow label="Drone Usage">
            {Array.isArray(poi.drone_usage) ? poi.drone_usage.join(', ') : poi.drone_usage}
          </InfoRow>
        )}
        {hasContent(poi.drone_policy) && (
          <InfoRow label="Policy">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poi.drone_policy) }} />
          </InfoRow>
        )}
      </>
    );
  };

  const renderAlcoholSmoking = () => {
    if (!hasContent(poi.alcohol_available) && !hasContent(poi.alcohol_availability) && poi.byob_allowed !== true && !hasContent(poi.alcohol_notes) && !hasContent(poi.smoking_options) && !hasContent(poi.smoking_details)) return null;
    return (
      <>
        {hasContent(poi.alcohol_available) && (
          <InfoRow label="Alcohol">
            {Array.isArray(poi.alcohol_available) ? poi.alcohol_available.join(', ') : poi.alcohol_available}
          </InfoRow>
        )}
        {hasContent(poi.alcohol_availability) && (
          <InfoRow label="Available">
            {Array.isArray(poi.alcohol_availability) ? poi.alcohol_availability.join(', ') : poi.alcohol_availability}
          </InfoRow>
        )}
        {poi.byob_allowed === true && (
          <InfoRow label="BYOB">Allowed</InfoRow>
        )}
        {hasContent(poi.alcohol_notes) && (
          <InfoRow label="Notes">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poi.alcohol_notes) }} />
          </InfoRow>
        )}
        {hasContent(poi.smoking_options) && (
          <InfoRow label="Smoking">
            {Array.isArray(poi.smoking_options) ? poi.smoking_options.join(', ') : poi.smoking_options}
          </InfoRow>
        )}
        {hasContent(poi.smoking_details) && (
          <InfoRow label="Smoking Details">
            {poi.smoking_details}
          </InfoRow>
        )}
      </>
    );
  };

  const renderRentals = () => {
    if (poi.available_for_rent !== true) return null;
    return (
      <>
        <InfoRow label="Available for Rent">Yes</InfoRow>
        {hasContent(poi.rental_info) && (
          <InfoRow label="Details">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poi.rental_info) }} />
          </InfoRow>
        )}
      </>
    );
  };

  const renderLocallyFound = () => {
    const hasAny =
      hasContent(poi.history_paragraph) ||
      hasContent(poi.community_impact);
    if (!hasAny) return null;
    return (
      <>
        {hasContent(poi.history_paragraph) && (
          <InfoRow label="History">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poi.history_paragraph) }} />
          </InfoRow>
        )}
        {hasContent(poi.community_impact) && (
          <InfoRow label="Community Impact">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poi.community_impact) }} />
          </InfoRow>
        )}
      </>
    );
  };

  const renderContact = () => {
    // Organizer name/email/phone/website are shown in the "About + Details"
    // (Event Details) section via renderAboutDetails; the Contact section only
    // adds organizer socials + the Contact Organizer button to avoid
    // double-rendering the same organizer fields.
    const hasAny =
      (Array.isArray(event?.organizer_socials) && event.organizer_socials.length > 0) ||
      hasSocialLinks(poi) ||
      (event?.contact_organizer_toggle === true && hasContent(event?.organizer_email));
    if (!hasAny) return null;
    return (
      <>
        {hasSocialLinks(poi) && <SocialLinksGroup poi={poi} />}
        {Array.isArray(event?.organizer_socials) && event.organizer_socials.length > 0 && (
          <InfoRow label="Socials">
            <div className="poi_chip_row">
              {event.organizer_socials.map((s, i) => {
                const url = typeof s === 'string' ? s : s.url;
                const label = typeof s === 'string' ? s : (s.platform || s.label || s.url);
                if (!url) return null;
                return (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="poi_chip ed-chip-link">
                    {label}
                  </a>
                );
              })}
            </div>
          </InfoRow>
        )}
        {event?.contact_organizer_toggle === true && hasContent(event?.organizer_email) && (
          <a href={`mailto:${event.organizer_email}`} className="ed-contact-organizer-btn">
            <Mail size={14} /> Contact Organizer
          </a>
        )}
      </>
    );
  };

  const renderSponsors = () => {
    if (!Array.isArray(event?.sponsors) || event.sponsors.length === 0) return null;
    return (
      <>
        <div className="ed-sponsors__label">Tiers</div>
        <div className="ed-sponsors__grid">
          {event.sponsors.map((s, i) => (
            <div key={s.id || i} className="ed-sponsor-card">
              {s.logo_url && (
                <img className="ed-sponsor-card__logo" src={s.logo_url} alt={`${s.name} logo`} loading="lazy" />
              )}
              <div className="ed-sponsor-card__info">
                {s.website ? (
                  <a
                    href={s.website.startsWith('http') ? s.website : `https://${s.website}`}
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
      </>
    );
  };

  /* ---- section manifest ----
     Single list. The server tier-gates the underlying fields, so paid-only
     sections (vendors/playground/drone/alcohol/rentals/sponsors) self-hide
     for free tier when their render() returns null. */
  const ALL_SECTIONS = [
    { id: 'about_details', title: 'About + Details', defaultOpen: true, render: renderAboutDetails },
    { id: 'venue_parking', title: 'Venue Address + Parking', defaultOpen: true, render: renderVenue },
    { id: 'restrooms', title: 'Public Restrooms', defaultOpen: false, render: renderRestrooms },
    { id: 'vendors', title: 'Vendors', defaultOpen: false, render: renderVendors },
    { id: 'playground', title: 'Playground', defaultOpen: false, render: renderPlayground },
    { id: 'mobility', title: 'Wheelchair and Mobility Access', defaultOpen: false, render: renderWheelchair },
    { id: 'pets', title: 'Pet Policy', defaultOpen: false, render: renderPetPolicy },
    { id: 'drone', title: 'Drone Policy', defaultOpen: false, render: renderDrone },
    { id: 'alcohol_smoking', title: 'Alcohol + Smoking', defaultOpen: false, render: renderAlcoholSmoking },
    { id: 'rentals', title: 'Rentals', defaultOpen: false, render: renderRentals },
    { id: 'locally_found', title: 'Locally Found + History', defaultOpen: false, render: renderLocallyFound },
    { id: 'contact', title: 'Contact', defaultOpen: false, render: renderContact },
    { id: 'sponsors', title: 'Sponsors', defaultOpen: false, render: renderSponsors },
  ];

  // Accordions hidden per the POI Accordion show/hide doc. Events keep only
  // About+Details, Venue Address+Parking, Public Restrooms, Pet Policy, Contact.
  // Restore one by removing its id from this set.
  const HIDDEN_ACCORDIONS = new Set(['vendors', 'playground', 'mobility', 'drone', 'alcohol_smoking', 'rentals', 'locally_found', 'sponsors']);
  const sections = ALL_SECTIONS
    .filter((s) => !HIDDEN_ACCORDIONS.has(s.id))
    .map((s) => ({ ...s, body: s.render() }))
    .filter((s) => s.body != null);

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
        const url = typeof t === 'string' ? t : t.url;
        const platform = typeof t === 'string' ? null : (t.platform || t.name);
        if (url) btns.push({ label: platform ? `GET TICKETS · ${platform}` : 'GET TICKETS', svg: <Ticket size={14} className="poi_button_icon" />, href: url.startsWith('http') ? url : `https://${url}`, target: '_blank', rel: 'noopener noreferrer', extraClass: 'ed-ticket-btn' });
      }
    }
    return btns;
  })();

  return (
    <>
    <POIDetailLayout
      poi={poi}
      mainCategory={dateTimeLine}
      statusVariant={status && !isCanceled ? (status.cls?.includes('open') ? 'open' : status.cls?.includes('soon') ? 'opensoon' : 'closed') : undefined}
      statusLabel={status && !isCanceled ? status.text : undefined}
      extraButtons={ticketButtons}
      subtitleExtras={
        <>
          {venueName && <p className="ed-venue-line">{venueName}</p>}
          {isCanceled && hasContent(event?.cancellation_paragraph) && (
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
    >
      {({ images: imgs, openLightbox }) => (
        <>
          <QuickInfoPhotosBox
            title={hasContent(poi.description_short) ? poi.description_short : undefined}
            quickInfoRows={
              <>
                <QuickInfoRow title="Cost:" value={costLabel} />
                <QuickInfoRow title="Pets:" value={petOptionsStr} />
                <QuickInfoRow title="Best For:" value={idealForSpecial} />
              </>
            }
            images={imgs}
            onOpenLightbox={openLightbox}
          />

          <div id="accordion_1_box" className="poi_accordion_box">
            <div id="accordion_1_parent" className="poi_accordion_parent accordionjs">
              {sections.map((s) => (
                <AccSection key={s.id} title={s.title} defaultOpen={allOpen}>
                  {s.body}
                </AccSection>
              ))}
            </div>
          </div>

          <div className="ed-disclaimer">
            {EVENT_DISCLAIMER.map((sentence, i) => <p key={i}>{sentence}</p>)}
          </div>

          {ticketsOpen && (
            <div className="ed-modal-backdrop" onClick={() => setTicketsOpen(false)}>
              <div className="ed-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="ed-modal__header">
                  <h3>Get Tickets</h3>
                  <button type="button" className="ed-modal__close" onClick={() => setTicketsOpen(false)} aria-label="Close"><X size={18} /></button>
                </div>
                <ul className="ed-modal__list">
                  {ticketLinks.map((t, i) => {
                    const url = typeof t === 'string' ? t : t.url;
                    const platform = typeof t === 'string' ? 'Tickets' : (t.platform || t.name || 'Tickets');
                    if (!url) return null;
                    return (
                      <li key={i}>
                        <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer">
                          <Ticket size={16} /> <span>{platform}</span> <ExternalLink size={14} />
                        </a>
                      </li>
                    );
                  })}
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
