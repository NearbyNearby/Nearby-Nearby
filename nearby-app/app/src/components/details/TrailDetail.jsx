import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Navigation, Copy, Check, ExternalLink } from 'lucide-react';

import {
  AccSection, ContentGroup, ChipList, QuickInfoRow,
  POIDetailLayout, QuickInfoPhotosBox, AmenitiesBox, SocialLinksGroup, hasSocialLinks,
  hasVal, asArray, copyToClipboard, getImages,
} from './shared';
import HoursDisplay from '../common/HoursDisplay';
import ServiceAnimalAlert from './ServiceAnimalAlert';
import DirectionsModal from '../common/DirectionsModal';
import { getOpenCloseStatusLabel } from '../../utils/hoursUtils';
import { getDisplayableLocation } from '../../utils/getDisplayableLocation';
import { sanitizeHtml } from '../../utils/sanitize';

function labelsFor(routeType) {
  if (routeType === 'water_trail') return { primary: 'Primary Put-In', exit: 'Primary Take-Out', accessPoints: 'Additional Put-In + Take-Out Points' };
  return { primary: 'Primary Trailhead', exit: 'Trail Exit', accessPoints: 'Access Points' };
}

const ROUTE_TYPE_LABELS = {
  loop: 'Loop', out_and_back: 'Out & Back', point_to_point: 'Point to Point',
  lollipop: 'Lollipop', stacked_loops: 'Stacked Loops', thru_trail: 'Thru-Trail', water_trail: 'Water Trail',
};

const TRAIL_LIGHTING_LABELS = { partial: 'Partial', full: 'Full', seasonal: 'Seasonal', dusk_to_dawn: 'Dusk to Dawn' };

const cap = (s) => (typeof s === 'string' && s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s);

export default function TrailDetail({ poi }) {
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);

  const displayLoc = getDisplayableLocation(poi);
  const trail = poi?.trail || {};
  const routeType = trail.route_type || null;
  const labels = labelsFor(routeType);
  const images = useMemo(() => getImages(poi), [poi]);

  const getCoords = () => {
    if (displayLoc.hideExact) return null;
    if (trail?.trailhead_latitude && trail?.trailhead_longitude) return { lat: trail.trailhead_latitude, lng: trail.trailhead_longitude };
    if (poi?.front_door_latitude && poi?.front_door_longitude) return { lat: poi.front_door_latitude, lng: poi.front_door_longitude };
    if (poi?.location?.coordinates) return { lat: poi.location.coordinates[1], lng: poi.location.coordinates[0] };
    return null;
  };
  const coords = getCoords();

  const handleDirections = () => setDirectionsOpen(true);
  const handleCopyCoords = async () => {
    if (!coords) return;
    if (await copyToClipboard(`${coords.lat}, ${coords.lng}`)) { setCopiedCoords(true); setTimeout(() => setCopiedCoords(false), 2000); }
  };
  const handleCopyAddress = async () => {
    const addr = [poi.address_street, poi.address_city, poi.address_state, poi.address_zip].filter(Boolean).join(', ');
    if (!addr) return;
    if (await copyToClipboard(addr)) { setCopiedAddress(true); setTimeout(() => setCopiedAddress(false), 2000); }
  };

  const subtitleParts = [];
  if (routeType && ROUTE_TYPE_LABELS[routeType]) subtitleParts.push(ROUTE_TYPE_LABELS[routeType]);
  else if (routeType) subtitleParts.push(routeType);
  if (trail.length_text) subtitleParts.push(trail.length_text);
  if (trail.difficulty) subtitleParts.push(cap(trail.difficulty));
  const subtitleText = subtitleParts.join(', ');

  const _coords = poi?.location?.coordinates;
  const _lat = Array.isArray(_coords) ? _coords[1] : null;
  const _lng = Array.isArray(_coords) ? _coords[0] : null;
  const { variant: statusVariant, label: statusLabel } = poi.hours
    ? getOpenCloseStatusLabel(poi.hours, new Date(), _lat, _lng)
    : { variant: null, label: null };

  const relList = poi.poi_relationships || poi.relationships || [];
  const trailInParkRel = Array.isArray(relList) ? relList.find((r) => (r.relationship_type || r.type) === 'trail_in_park') : null;
  const linkedParkFromRel = trailInParkRel ? (trailInParkRel.target_poi || trailInParkRel.related_poi || trailInParkRel.park || null) : null;
  const linkedParkId = trail.park_poi_id || linkedParkFromRel?.id || trailInParkRel?.target_poi_id || null;
  const linkedParkName = trail.park_name || trail.park?.name || linkedParkFromRel?.name || null;

  const ig = (poi.ideal_for && typeof poi.ideal_for === 'object' && !Array.isArray(poi.ideal_for)) ? poi.ideal_for : null;
  const accessPoints = Array.isArray(trail.access_points) ? trail.access_points.filter(Boolean) : [];
  const hasTrailGuide = !!(trail.mile_markers || trail.trailhead_signage || trail.audio_guide_available || trail.qr_trail_guide || trail.trail_guide_notes || trail.trail_lighting || accessPoints.length > 0);

  /* ── Accordion section definitions ── */
  const aboutCol1 = [
    hasVal(poi.teaser_paragraph) && <ContentGroup key="teaser"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.teaser_paragraph) }} /></ContentGroup>,
    hasVal(poi.description_long) && <ContentGroup key="desc" title="About"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.description_long) }} /></ContentGroup>,
    // Per doc: Trail About pulls Outdoor Features as NATURAL FEATURES only.
    hasVal(poi.natural_features) && <ContentGroup key="nf" title="Natural Features"><ChipList items={poi.natural_features.map((f) => (typeof f === 'string' ? f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : f))} /></ContentGroup>,
    // Per doc: "Categories + Discovery" for a trail = its Trail Experience categories.
    hasVal(poi.categories) && <ContentGroup key="te" title="Trail Experience"><ChipList items={poi.categories} /></ContentGroup>,
    ig && Object.entries(ig).filter(([k]) => k !== '_legacy').map(([group, items]) =>
      Array.isArray(items) && items.length > 0 && (
        <ContentGroup key={group} title={group.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}><ChipList items={items} /></ContentGroup>
      )
    ),
  ].flat().filter(Boolean);

  const aboutCol2 = [
    hasVal(poi.hours) && (
      <ContentGroup key="hours" title="Hours">
        <div className="acc_content_text">
          {/* Issue #70: holiday_hours top-level field removed; holidays live in hours.holidays */}
          <HoursDisplay hours={poi.hours} appointmentBookingUrl={poi.appointment_booking_url} appointmentRequired={poi.hours_but_appointment_required} hoursNotes={poi.hours_notes} />
        </div>
      </ContentGroup>
    ),
  ].filter(Boolean);

  const addrCol1 = [
    <ContentGroup key="addr" title="Address" when={hasVal(poi.address_street) || (displayLoc.hideExact && displayLoc.full)}>
      <div className="acc_content_text">
        {displayLoc.hideExact ? (
          <div><MapPin size={14} /> {displayLoc.full}</div>
        ) : hasVal(poi.address_street) && (
          <div><MapPin size={14} /> {[poi.address_street, poi.address_city, poi.address_state, poi.address_zip].filter(Boolean).join(', ')}</div>
        )}
      </div>
      {!displayLoc.hideExact && (
        <div className="pd-addr__actions">
          <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleDirections}>
            <Navigation size={14} className="poi_button_icon" aria-hidden="true" style={{fill:'none'}} /> <span className="poi_button_title">Get Directions</span>
          </button>
          {hasVal(poi.address_street) && (
            <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleCopyAddress}>
              {copiedAddress ? <Check size={14} /> : <Copy size={14} />} <span className="poi_button_title">{copiedAddress ? 'Copied!' : 'Copy Address'}</span>
            </button>
          )}
          {coords && (
            <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleCopyCoords}>
              {copiedCoords ? <Check size={14} /> : <Copy size={14} />} <span className="poi_button_title">{copiedCoords ? 'Copied!' : 'Copy Lat+Long'}</span>
            </button>
          )}
        </div>
      )}
    </ContentGroup>,
  ].filter(Boolean);

  const addrCol2 = [
    hasVal(poi.parking_types) && <ContentGroup key="parking" title="Parking"><ChipList items={poi.parking_types} /></ContentGroup>,
    hasVal(poi.arrival_methods) && <ContentGroup key="arrival" title="Arrival"><ChipList items={poi.arrival_methods} /></ContentGroup>,
    poi.expect_to_pay_parking === true && <ContentGroup key="paypark"><div className="acc_content_text"><p>Expect to pay for parking.</p></div></ContentGroup>,
    hasVal(poi.parking_notes) && <ContentGroup key="pnotes"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.parking_notes) }} /></ContentGroup>,
    hasVal(poi.accessible_parking_details) && <ContentGroup key="adaparking" title="ADA Accessible Parking"><ChipList items={poi.accessible_parking_details} /></ContentGroup>,
  ].filter(Boolean);

  const trailGuideCol1 = [
    linkedParkName && linkedParkId && (
      <ContentGroup key="park" title="Located In">
        <div className="acc_content_text"><Link to={`/poi/${linkedParkId}`} className="pd-link">{linkedParkName} <ExternalLink size={12} /></Link></div>
      </ContentGroup>
    ),
    (coords || accessPoints.length > 0) && (
      <ContentGroup key="primary" title={labels.primary}>
        <div className="acc_content_text">
          {trail.mile_markers && <div><strong>Mile Markers:</strong> Yes</div>}
          {trail.trailhead_signage && <div><strong>Trailhead Signage:</strong> Yes</div>}
          {trail.audio_guide_available && <div><strong>Audio Guide:</strong> Yes</div>}
          {trail.qr_trail_guide && <div><strong>QR Trail Guide:</strong> Yes</div>}
          {trail.trail_lighting && <div><strong>Trail Lighting:</strong> {TRAIL_LIGHTING_LABELS[trail.trail_lighting] || trail.trail_lighting}</div>}
          {trail.trail_guide_notes && <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(trail.trail_guide_notes) }} />}
        </div>
      </ContentGroup>
    ),
  ].filter(Boolean);

  const trailGuideCol2 = [
    hasVal(trail.trail_exit_notes) && <ContentGroup key="exit" title={labels.exit}><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(trail.trail_exit_notes) }} /></ContentGroup>,
    accessPoints.length > 0 && (
      <ContentGroup key="ap" title={labels.accessPoints}>
        <div className="acc_content_text">
          {accessPoints.map((ap, idx) => (
            <div key={ap.id || idx} style={{ marginBottom: 12 }}>
              {ap.name && <h5>{ap.name}</h5>}
              {(ap.latitude != null && ap.longitude != null) && <div><strong>Lat / Long:</strong> {ap.latitude}, {ap.longitude}</div>}
              {/* #41: what3words is backend-only per spec — never rendered publicly. */}
              {ap.notes && <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(ap.notes) }} />}
            </div>
          ))}
        </div>
      </ContentGroup>
    ),
  ].filter(Boolean);

  // Accordions hidden per the POI Accordion show/hide doc. Trail keeps About+Hours,
  // Address+Parking, Trail Guide, Public Restrooms, Pet Policy, Contact.
  // (Pricing + Passes hidden for now — Pittsboro trails/parks are free.)
  const HIDDEN_ACCORDIONS = new Set(['mobility', 'drone', 'locally_history', 'pricing']);
  const sections = [
    (aboutCol1.length || aboutCol2.length) && { id: 'about_hours', title: 'About + Hours', defaultOpen: true, col1: aboutCol1, col2: aboutCol2 },
    (addrCol1.length || addrCol2.length) && { id: 'address_parking', title: 'Address + Parking', col1: addrCol1, col2: addrCol2 },
    hasTrailGuide && { id: 'trail_guide', title: 'Trail Guide', col1: trailGuideCol1, col2: trailGuideCol2 },
    (hasVal(trail.cost) || hasVal(trail.pass_info) || hasVal(poi.discounts) || hasVal(poi.pricing_details) || hasVal(poi.payment_methods)) && {
      id: 'pricing', title: 'Pricing + Passes',
      col1: [
        hasVal(trail.cost) && <ContentGroup key="cost" title="Cost"><div className="acc_content_text">{trail.cost}</div></ContentGroup>,
        hasVal(trail.pass_info) && <ContentGroup key="pass" title="Passes"><div className="acc_content_text">{trail.pass_info}</div></ContentGroup>,
        hasVal(poi.pricing_details) && <ContentGroup key="pdetails" title="Pricing Details"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.pricing_details) }} /></ContentGroup>,
      ].filter(Boolean),
      col2: [
        hasVal(poi.payment_methods) && <ContentGroup key="paymeth" title="Payment Methods"><ChipList items={poi.payment_methods} /></ContentGroup>,
        hasVal(poi.discounts) && <ContentGroup key="disc" title="Discounts"><div className="acc_content_text">{typeof poi.discounts === 'string' ? <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.discounts) }} /> : <ChipList items={poi.discounts} />}</div></ContentGroup>,
      ].filter(Boolean),
    },
    (hasVal(poi.public_toilets) || hasVal(poi.toilet_description)) && {
      id: 'restrooms', title: 'Public Restrooms',
      col1: [hasVal(poi.public_toilets) && <ContentGroup key="pt" title="Available"><ChipList items={poi.public_toilets} /></ContentGroup>, hasVal(poi.toilet_description) && <ContentGroup key="td" title="Details"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.toilet_description) }} /></ContentGroup>].filter(Boolean),
      col2: [hasVal(poi.accessible_restroom_details) && <ContentGroup key="ada" title="ADA Accessible Restrooms"><ChipList items={poi.accessible_restroom_details} /></ContentGroup>].filter(Boolean),
    },
    // wheelchair_accessible chip removed — column dropped (Issue #45 PR2 Migration B)
    hasVal(poi.wheelchair_details) && {
      id: 'mobility', title: 'Wheelchair and Mobility Access',
      col1: [hasVal(poi.wheelchair_details) && <ContentGroup key="wd" title="Details"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.wheelchair_details) }} /></ContentGroup>].filter(Boolean),
      col2: [hasVal(poi.mobility_access) && <ContentGroup key="ma" title="Mobility Access"><ChipList items={Array.isArray(poi.mobility_access) ? poi.mobility_access : Object.keys(poi.mobility_access).filter((k) => poi.mobility_access[k] === true)} /></ContentGroup>].filter(Boolean),
    },
    (hasVal(poi.pet_options) || hasVal(poi.pet_policy)) && {
      id: 'pets', title: 'Pet Policy',
      col1: [hasVal(poi.pet_options) && <ContentGroup key="po" title="Pets"><ChipList items={poi.pet_options} /></ContentGroup>, hasVal(poi.pet_policy) && <ContentGroup key="pp" title="Policy"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.pet_policy) }} /></ContentGroup>].filter(Boolean),
      col2: [<div className="acc_content_group" key="sa"><ServiceAnimalAlert /></div>],
    },
    (hasVal(poi.drone_policy) || hasVal(poi.drone_usage)) && {
      id: 'drone', title: 'Drone Policy',
      col1: [
        hasVal(poi.drone_usage) && <ContentGroup key="du" title="Drone Usage"><div className="acc_content_text"><p>{Array.isArray(poi.drone_usage) ? poi.drone_usage.join(', ') : poi.drone_usage}</p></div></ContentGroup>,
        hasVal(poi.drone_policy) && <ContentGroup key="dp" title="Drone Policy"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.drone_policy) }} /></ContentGroup>,
      ].filter(Boolean), col2: [],
    },
    (hasVal(poi.history_paragraph) || hasVal(poi.community_impact)) && {
      id: 'locally_history', title: 'Locally Found + History',
      col1: [
        hasVal(poi.history_paragraph) && <ContentGroup key="hist" title="History"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.history_paragraph) }} /></ContentGroup>,
      ].filter(Boolean),
      col2: [
        hasVal(poi.community_impact) && <ContentGroup key="ci" title="Community Impact"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.community_impact) }} /></ContentGroup>,
      ].filter(Boolean),
    },
    (hasVal(poi.website_url) || hasVal(poi.phone_number) || hasVal(poi.email) || hasSocialLinks(poi)) && {
      id: 'contact', title: 'Contact',
      col1: [
        hasVal(poi.phone_number) && <ContentGroup key="ph" title="Phone"><div className="acc_list_group_1"><a href={`tel:${poi.phone_number}`}>{poi.phone_number}</a></div></ContentGroup>,
        hasVal(poi.website_url) && <ContentGroup key="web" title="Website"><div className="acc_list_group_1"><a href={poi.website_url.startsWith('http') ? poi.website_url : `https://${poi.website_url}`} target="_blank" rel="noopener noreferrer">{poi.website_url}</a></div></ContentGroup>,
      ].filter(Boolean),
      col2: [
        hasVal(poi.email) && <ContentGroup key="em" title="Email"><div className="acc_list_group_1"><a href={`mailto:${poi.email}`}>{poi.email}</a></div></ContentGroup>,
        hasSocialLinks(poi) && <SocialLinksGroup key="soc" poi={poi} />,
      ].filter(Boolean),
    },
  ].filter(Boolean).filter((s) => !HIDDEN_ACCORDIONS.has(s.id));

  return (
    <>
    <POIDetailLayout
      poi={poi}
      mainCategory={subtitleText}
      statusVariant={statusVariant || undefined}
      statusLabel={statusLabel}
    >
      {({ images: imgs, openLightbox }) => (
        <>
          <QuickInfoPhotosBox
            title={poi.description_short}
            quickInfoRows={
              <>
                <QuickInfoRow title="Trail:" value={subtitleText} />
                <QuickInfoRow title="Cost:" value={trail.cost} />
                <QuickInfoRow title="Pets:" value={Array.isArray(poi.pet_options) && poi.pet_options.length > 0 ? poi.pet_options.join(', ') : null} />
                <QuickInfoRow title="Parking:" value={Array.isArray(poi.parking_types) && poi.parking_types.length > 0 ? poi.parking_types.join(', ') : null} />
              </>
            }
            images={imgs}
            onOpenLightbox={openLightbox}
          />

          <AmenitiesBox poi={poi} title="Amenities" />

          <div id="accordion_1_box" className="poi_accordion_box">
            <div id="accordion_1_parent" className="poi_accordion_parent accordionjs">
              {sections.map((s) => (
                <AccSection key={s.id} title={s.title} defaultOpen={false} col1={s.col1} col2={s.col2} />
              ))}
            </div>
          </div>
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
