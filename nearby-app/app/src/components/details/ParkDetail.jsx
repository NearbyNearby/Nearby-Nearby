import { useState, useMemo } from 'react';
import { MapPin, Navigation, Copy, Check, ExternalLink, Globe, Phone } from 'lucide-react';

import {
  AccSection, ContentGroup, ChipList, CategoryChipList, QuickInfoRow, InfoPair,
  POIDetailLayout, QuickInfoPhotosBox, AmenitiesBox, SocialLinksGroup, hasSocialLinks,
  hasVal, asArray, copyToClipboard, getCoordinates, getImages,
  isYes,
} from './shared';
import HoursDisplay from '../common/HoursDisplay';
import ServiceAnimalAlert from './ServiceAnimalAlert';
import DirectionsModal from '../common/DirectionsModal';
import { getDisplayableLocation } from '../../utils/getDisplayableLocation';
import { getOpenCloseStatusLabel } from '../../utils/hoursUtils';
import { sanitizeHtml } from '../../utils/sanitize';

/* ------------------------------------------------------------------ */
/* Section builders                                                    */
/* ------------------------------------------------------------------ */

function buildSections(poi, helpers) {
  const {
    displayLoc, handleDirections, handleCopyAddress, handleCopyCoords,
    copiedAddress, copiedCoords, handleCopyPhone, copiedPhone, handleCopyEmail, copiedEmail,
  } = helpers;

  const out = [];

  /* ABOUT + HOURS */
  {
    const idealFor = poi.ideal_for && typeof poi.ideal_for === 'object' && !Array.isArray(poi.ideal_for)
      ? poi.ideal_for : null;
    const outdoorOne = asArray(poi.outdoor_types).slice(0, 1);

    const col1 = [
      hasVal(poi.teaser_paragraph) && (
        <div className="acc_content_group" key="teaser">
          <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.teaser_paragraph) }} />
        </div>
      ),
      hasVal(poi.description_long) && (
        <div className="acc_content_group" key="desc">
          <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.description_long) }} />
        </div>
      ),
      outdoorOne.length > 0 && (
        <ContentGroup key="otype" title="Outdoor Type"><ChipList items={outdoorOne} /></ContentGroup>
      ),
      idealFor && <ContentGroup key="ideal_atmos" title="Atmosphere" when={hasVal(idealFor.atmosphere)}><ChipList items={idealFor.atmosphere} /></ContentGroup>,
      idealFor && <ContentGroup key="ideal_age" title="Age Group" when={hasVal(idealFor.age_group)}><ChipList items={idealFor.age_group} /></ContentGroup>,
      idealFor && <ContentGroup key="ideal_social" title="Social Settings" when={hasVal(idealFor.social_settings)}><ChipList items={idealFor.social_settings} /></ContentGroup>,
      idealFor && <ContentGroup key="ideal_local" title="Local Special" when={hasVal(idealFor.local_special)}><ChipList items={idealFor.local_special} /></ContentGroup>,
      !idealFor && Array.isArray(poi.ideal_for) && poi.ideal_for.length > 0 && (
        <ContentGroup key="ideal_arr" title="Ideal For"><ChipList items={poi.ideal_for} /></ContentGroup>
      ),
      Array.isArray(poi.categories) && poi.categories.length > 0 && (
        <ContentGroup key="cats" title="Categories"><CategoryChipList categories={poi.categories} /></ContentGroup>
      ),
    ].filter(Boolean);

    const col2 = [
      hasVal(poi.hours) && (
        <ContentGroup key="hours" title="Hours">
          <div className="acc_content_text">
            {/* Issue #70: holiday_hours top-level field removed; holidays live in hours.holidays */}
            <HoursDisplay
              hours={poi.hours}
              appointmentBookingUrl={poi.appointment_booking_url}
              appointmentRequired={poi.hours_but_appointment_required}
              hoursNotes={poi.hours_notes}
            />
          </div>
        </ContentGroup>
      ),
    ].filter(Boolean);

    out.push({ id: 'about_hours', title: 'About + Hours', col1, col2, defaultOpen: true });
  }

  /* ADDRESS + PARKING */
  {
    const hasAddr = !displayLoc.hideExact && hasVal(poi.address_street);
    const col1 = [
      (
        <ContentGroup key="addr" title="Address" when={hasAddr || (displayLoc.hideExact && (displayLoc.city || displayLoc.region))}>
          <div className="acc_content_text">
            {displayLoc.hideExact ? (
              <p><MapPin size={14} /> {displayLoc.full}</p>
            ) : hasAddr && (
              <p>
                <MapPin size={14} />{' '}
                {[poi.address_street, poi.address_city, poi.address_state, poi.address_zip]
                  .filter(Boolean).join(', ')}
              </p>
            )}
            {!displayLoc.hideExact && (
              <div className="pd-addr__actions">
                <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleDirections}>
                  <Navigation size={14} className="poi_button_icon" aria-hidden="true" style={{fill:'none'}} /> <span className="poi_button_title">Get Directions</span>
                </button>
                {hasAddr && (
                  <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleCopyAddress}>
                    {copiedAddress ? <Check size={14} /> : <Copy size={14} />}
                    <span className="poi_button_title">{copiedAddress ? 'Copied!' : 'Copy Address'}</span>
                  </button>
                )}
                <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleCopyCoords}>
                  {copiedCoords ? <Check size={14} /> : <Copy size={14} />}
                  <span className="poi_button_title">{copiedCoords ? 'Copied!' : 'Copy Lat+Long'}</span>
                </button>
              </div>
            )}
          </div>
        </ContentGroup>
      ),
      hasVal(poi.park_entry_notes) && (
        <ContentGroup key="entry" title="Park Entry">
          <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.park_entry_notes) }} />
        </ContentGroup>
      ),
    ].filter(Boolean);

    const col2 = [
      hasVal(poi.parking_types) && (
        <ContentGroup key="parking" title="Parking"><ChipList items={poi.parking_types} /></ContentGroup>
      ),
      hasVal(poi.arrival_methods) && (
        <ContentGroup key="arrival" title="Arrival"><ChipList items={poi.arrival_methods} /></ContentGroup>
      ),
      poi.expect_to_pay_parking === true && (
        <ContentGroup key="paypark">
          <div className="acc_content_text"><p>Expect to pay for parking.</p></div>
        </ContentGroup>
      ),
      hasVal(poi.parking_notes) && (
        <ContentGroup key="parking_notes">
          <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.parking_notes) }} />
        </ContentGroup>
      ),
      asArray(poi.parking_types).includes('Accessible Parking') && hasVal(poi.accessible_parking_details) && (
        <ContentGroup key="adaparking" title="Accessible Parking Details"><ChipList items={poi.accessible_parking_details} /></ContentGroup>
      ),
    ].filter(Boolean);

    if (col1.length || col2.length) out.push({ id: 'address_parking', title: 'Address + Parking', col1, col2 });
  }

  /* PRICING + PASSES */
  {
    const cost = poi.park?.cost ?? poi.cost;
    const passInfo = poi.park?.pass_info ?? poi.membership_passes ?? poi.membership_details;
    const passText = Array.isArray(passInfo) ? (passInfo.length ? passInfo.join(', ') : null) : passInfo;

    const col1 = [
      <InfoPair key="cost" title="Cost" value={cost} />,
      <InfoPair key="passes" title="Passes" value={passText} />,
      hasVal(poi.pricing_details) && (
        <ContentGroup key="pdetails" title="Pricing Details">
          <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.pricing_details) }} />
        </ContentGroup>
      ),
    ].filter(Boolean);
    const col2 = [
      hasVal(poi.payment_methods) && (
        <ContentGroup key="paymeth" title="Payment Methods"><ChipList items={poi.payment_methods} /></ContentGroup>
      ),
      hasVal(poi.discounts) && (
        <ContentGroup key="disc" title="Discounts">
          {Array.isArray(poi.discounts) ? (
            <div className="acc_list_group_1">
              {poi.discounts.map((d, i) => <span key={i}>{typeof d === 'string' ? d : (d?.description || d?.title)}</span>)}
            </div>
          ) : (
            <div className="acc_content_text"><p>{poi.discounts}</p></div>
          )}
        </ContentGroup>
      ),
    ].filter(Boolean);
    if (col1.length || col2.length) out.push({ id: 'pricing_passes', title: 'Pricing + Passes', col1, col2 });
  }

  /* PUBLIC RESTROOMS */
  {
    const col1 = [
      hasVal(poi.public_toilets) && <ContentGroup key="pt" title="Public Restrooms"><ChipList items={poi.public_toilets} /></ContentGroup>,
      hasVal(poi.toilet_description) && <ContentGroup key="td"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.toilet_description) }} /></ContentGroup>,
    ].filter(Boolean);
    const col2 = [
      poi.accessible_restroom && hasVal(poi.accessible_restroom_details) && (
        <ContentGroup key="adarest" title="Accessible Restroom Details"><ChipList items={poi.accessible_restroom_details} /></ContentGroup>
      ),
    ].filter(Boolean);
    if (col1.length || col2.length) out.push({ id: 'public_restrooms', title: 'Public Restrooms', col1, col2 });
  }

  /* PLAYGROUND */
  if (poi.playground_available || hasVal(poi.playground_types)) {
    const col1 = [
      hasVal(poi.playground_types) && <ContentGroup key="pt" title="Types"><ChipList items={poi.playground_types} /></ContentGroup>,
      hasVal(poi.playground_surface_types) && <ContentGroup key="ps" title="Surface"><ChipList items={poi.playground_surface_types} /></ContentGroup>,
      hasVal(poi.playground_notes) && <ContentGroup key="pn"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.playground_notes) }} /></ContentGroup>,
    ].filter(Boolean);
    const col2 = [
      hasVal(poi.playground_age_groups) && <ContentGroup key="pa" title="Age Groups"><ChipList items={poi.playground_age_groups} /></ContentGroup>,
      hasVal(poi.playground_ada_checklist) && <ContentGroup key="pada" title="ADA Accessibility"><ChipList items={poi.playground_ada_checklist} /></ContentGroup>,
      poi.inclusive_playground && <ContentGroup key="incl" title="Inclusive Playground"><div className="acc_list_group_1"><span>Inclusive Playground</span></div></ContentGroup>,
    ].filter(Boolean);
    if (col1.length || col2.length) out.push({ id: 'playground', title: 'Playground', col1, col2 });
  }

  /* WHEELCHAIR + MOBILITY ACCESS */
  {
    // wheelchair_accessible chip removed — column dropped (Issue #45 PR2 Migration B)
    const col1 = [];
    const col2 = hasVal(poi.wheelchair_details) ? [<ContentGroup key="wd"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.wheelchair_details) }} /></ContentGroup>] : [];
    if (col1.length || col2.length) out.push({ id: 'mobility_access', title: 'Wheelchair and Mobility Access', col1, col2 });
  }

  /* PET POLICY — single column per Rhonda's punch list (#144/#139/#145) */
  if (hasVal(poi.pet_options) || hasVal(poi.pet_policy)) {
    const col1 = [
      hasVal(poi.pet_options) && <ContentGroup key="po" title="Pet Options"><ChipList items={poi.pet_options} /></ContentGroup>,
      hasVal(poi.pet_policy) && <ContentGroup key="pp"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.pet_policy) }} /></ContentGroup>,
      <div className="acc_content_group" key="sa"><ServiceAnimalAlert /></div>,
    ].filter(Boolean);
    out.push({ id: 'pet_policy', title: 'Pet Policy', col1, col2: [], singleColumn: true });
  }

  /* DRONE POLICY */
  if (hasVal(poi.drone_usage) || hasVal(poi.drone_policy)) {
    const col1 = [<InfoPair key="du" title="Drone Usage" value={poi.drone_usage} />].filter(Boolean);
    const col2 = [
      hasVal(poi.drone_policy) && <ContentGroup key="dp"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.drone_policy) }} /></ContentGroup>,
    ].filter(Boolean);
    if (col1.length || col2.length) out.push({ id: 'drone_policy', title: 'Drone Policy', col1, col2 });
  }

  /* ALCOHOL + SMOKING */
  if (hasVal(poi.alcohol_available) || hasVal(poi.alcohol_options) || hasVal(poi.alcohol_availability) || poi.byob_allowed === true || hasVal(poi.alcohol_notes) || hasVal(poi.smoking_options) || hasVal(poi.smoking_details) || hasVal(poi.alcohol_policy_details)) {
    const col1 = [
      <InfoPair key="aa" title="Alcohol" value={poi.alcohol_available} />,
      hasVal(poi.alcohol_availability) && <ContentGroup key="aav" title="Available"><ChipList items={poi.alcohol_availability} /></ContentGroup>,
      hasVal(poi.alcohol_options) && <ContentGroup key="ao" title="Alcohol Options"><ChipList items={poi.alcohol_options} /></ContentGroup>,
      poi.byob_allowed === true && <ContentGroup key="byob"><div className="acc_content_text"><p>BYOB allowed.</p></div></ContentGroup>,
      hasVal(poi.alcohol_policy_details) && <ContentGroup key="apd"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.alcohol_policy_details) }} /></ContentGroup>,
      hasVal(poi.alcohol_notes) && <ContentGroup key="an" title="Notes"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.alcohol_notes) }} /></ContentGroup>,
    ].filter(Boolean);
    const col2 = [
      hasVal(poi.smoking_options) && <ContentGroup key="so" title="Smoking"><ChipList items={poi.smoking_options} /></ContentGroup>,
      hasVal(poi.smoking_details) && <ContentGroup key="sd"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.smoking_details) }} /></ContentGroup>,
    ].filter(Boolean);
    if (col1.length || col2.length) out.push({ id: 'alcohol_smoking', title: 'Alcohol + Smoking', col1, col2 });
  }

  /* NIGHT SKY VIEWING */
  if (hasVal(poi.night_sky_viewing) && poi.night_sky_viewing !== false) {
    const val = poi.night_sky_viewing;
    const body = typeof val === 'string'
      ? <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(val) }} />
      : <div className="acc_content_text"><p>Night sky viewing available.</p></div>;
    out.push({ id: 'night_sky', title: 'Night Sky Viewing', col1: [<ContentGroup key="ns">{body}</ContentGroup>], col2: [] });
  }

  /* BIRDING + WILDLIFE */
  if (hasVal(poi.birding_wildlife)) {
    out.push({
      id: 'birding_wildlife', title: 'Birding + Wildlife',
      col1: [<ContentGroup key="bw"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.birding_wildlife) }} /></ContentGroup>], col2: [],
    });
  }

  /* HUNTING + FISHING */
  const huntingAllowed = isYes(poi.hunting_allowed) || isYes(poi.hunting_fishing_allowed);
  const fishingAllowed = isYes(poi.fishing_allowed);
  if (huntingAllowed || fishingAllowed) {
    const col1 = [];
    if (huntingAllowed) {
      col1.push(
        <ContentGroup key="hunt" title="Hunting">
          {hasVal(poi.hunting_types) && <ChipList items={poi.hunting_types} />}
          {hasVal(poi.hunting_notes) && <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.hunting_notes) }} />}
        </ContentGroup>
      );
    }
    const col2 = [];
    if (fishingAllowed) {
      col2.push(
        <ContentGroup key="fish" title="Fishing">
          {hasVal(poi.fishing_types) && <ChipList items={poi.fishing_types} />}
          {hasVal(poi.fishing_notes) && <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.fishing_notes) }} />}
        </ContentGroup>
      );
    }
    if (hasVal(poi.hunting_fishing_info)) col2.push(<ContentGroup key="hfi"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.hunting_fishing_info) }} /></ContentGroup>);
    if (hasVal(poi.licenses_required)) col2.push(<ContentGroup key="lic" title="Licenses Required"><ChipList items={poi.licenses_required} /></ContentGroup>);
    out.push({ id: 'hunting_fishing', title: 'Hunting + Fishing', col1, col2 });
  }

  /* RENTALS */
  if (poi.available_for_rent === true) {
    const col1 = [hasVal(poi.rental_info) && <ContentGroup key="ri"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.rental_info) }} /></ContentGroup>].filter(Boolean);
    const col2 = [
      <InfoPair key="rp" title="Pricing" value={poi.rental_pricing} />,
      hasVal(poi.rental_link) && (
        <ContentGroup key="rl" title="Link">
          <div className="acc_content_text">
            <a href={poi.rental_link.startsWith('http') ? poi.rental_link : `https://${poi.rental_link}`} className="pd-link" target="_blank" rel="noopener noreferrer">
              Rental Info <ExternalLink size={12} />
            </a>
          </div>
        </ContentGroup>
      ),
    ].filter(Boolean);
    if (col1.length || col2.length) out.push({ id: 'rentals', title: 'Rentals', col1, col2 });
  }

  /* LOCALLY FOUND + HISTORY */
  if (hasVal(poi.locally_found_at) || hasVal(poi.history_paragraph) || hasVal(poi.community_impact)) {
    const col1 = [
      hasVal(poi.locally_found_at) && (
        <ContentGroup key="lf" title="Locally Found At">
          {Array.isArray(poi.locally_found_at) ? (
            <div className="acc_list_group_1">
              {poi.locally_found_at.map((item, i) => <span key={i}>{typeof item === 'string' ? item : (item?.name || item?.title)}</span>)}
            </div>
          ) : (
            <div className="acc_content_text"><p>{poi.locally_found_at}</p></div>
          )}
        </ContentGroup>
      ),
    ].filter(Boolean);
    const col2 = [
      hasVal(poi.history_paragraph) && <ContentGroup key="hist" title="History"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.history_paragraph) }} /></ContentGroup>,
      hasVal(poi.community_impact) && <ContentGroup key="ci" title="Community Impact"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.community_impact) }} /></ContentGroup>,
    ].filter(Boolean);
    if (col1.length || col2.length) out.push({ id: 'locally_history', title: 'Locally Found + History', col1, col2 });
  }

  /* CONTACT */
  if (hasVal(poi.website_url) || hasVal(poi.phone_number) || hasVal(poi.email) || hasSocialLinks(poi)) {
    const col1 = [
      hasVal(poi.phone_number) && (
        <ContentGroup key="ph" title="Phone">
          <div className="acc_list_group_1 poi_contact_row">
            <Phone size={16} />
            <a href={`tel:${poi.phone_number}`}>{poi.phone_number}</a>
            <button type="button" className="btn_reset poi_contact_copy_btn" onClick={handleCopyPhone}>
              {copiedPhone ? <Check size={14} /> : <Copy size={14} />} {copiedPhone ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </ContentGroup>
      ),
      hasVal(poi.website_url) && (
        <ContentGroup key="web" title="Website">
          <div className="acc_list_group_1 poi_contact_row">
            <Globe size={16} />
            <a href={poi.website_url.startsWith('http') ? poi.website_url : `https://${poi.website_url}`} target="_blank" rel="noopener noreferrer">
              Visit {poi.name} Website
            </a>
          </div>
        </ContentGroup>
      ),
    ].filter(Boolean);
    const col2 = [
      hasVal(poi.email) && (
        <ContentGroup key="em" title="Email">
          <div className="acc_list_group_1 poi_contact_row">
            <a href={`mailto:${poi.email}`}>{poi.email}</a>
            <button type="button" className="btn_reset poi_contact_copy_btn" onClick={handleCopyEmail}>
              {copiedEmail ? <Check size={14} /> : <Copy size={14} />} {copiedEmail ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </ContentGroup>
      ),
      hasSocialLinks(poi) && <SocialLinksGroup key="soc" poi={poi} />,
      <div className="acc_content_group" key="fb"><div className="acc_content_text"><a href="/feedback" className="pd-link">Questions or Feedback?</a></div></div>,
    ].filter(Boolean);
    if (col1.length || col2.length) out.push({ id: 'contact', title: 'Contact', col1, col2 });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function ParkDetail({ poi }) {
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);

  const displayLoc = getDisplayableLocation(poi);
  const coords = getCoordinates(poi, displayLoc.hideExact);
  const images = useMemo(() => getImages(poi), [poi]);
  const _coords = poi?.location?.coordinates;
  const _lat = Array.isArray(_coords) ? _coords[1] : null;
  const _lng = Array.isArray(_coords) ? _coords[0] : null;
  const { variant: _statusVariant, label: _statusLabel } = poi.hours
    ? getOpenCloseStatusLabel(poi.hours, new Date(), _lat, _lng)
    : { variant: null, label: null };

  const handleDirections = () => setDirectionsOpen(true);
  const handleCopyCoords = async () => {
    if (!coords) return;
    if (await copyToClipboard(`${coords.lat}, ${coords.lng}`)) {
      setCopiedCoords(true); setTimeout(() => setCopiedCoords(false), 2000);
    }
  };
  const handleCopyAddress = async () => {
    const a = [poi.address_street, poi.address_city, poi.address_state, poi.address_zip].filter(Boolean).join(', ');
    if (!a) return;
    if (await copyToClipboard(a)) {
      setCopiedAddress(true); setTimeout(() => setCopiedAddress(false), 2000);
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

  const subtitle = poi?.categories?.[0]?.name || asArray(poi.outdoor_types)[0] || '';

  const thingsToDo = (() => {
    const list = asArray(poi.things_to_do).length > 0 ? asArray(poi.things_to_do) : asArray(poi.park?.activities);
    return list.length ? list : asArray(poi.amenities?.recreation);
  })();

  const idealForLocal = (poi.ideal_for && !Array.isArray(poi.ideal_for))
    ? asArray(poi.ideal_for.local_special).join(', ') : null;
  const costValue = poi.park?.cost || poi.cost || (poi.listing_type === 'free' ? 'Free' : null);

  const amenitiesFlat = useMemo(() => {
    const a = poi?.amenities;
    const out = [];
    if (a && typeof a === 'object') {
      Object.values(a).forEach((v) => {
        if (Array.isArray(v)) v.forEach((x) => hasVal(x) && out.push(typeof x === 'object' ? (x.name || x.label || '') : String(x)));
      });
    }
    // Server-computed icon booleans, shown as plain-text pills alongside the rest.
    if (poi?.icon_public_restroom) out.push('Public Restroom');
    if (poi?.icon_free_wifi) out.push('Wi-Fi Access');
    if (poi?.icon_wheelchair_accessible) out.push('Wheelchair Accessible');
    if (poi?.icon_pet_friendly) out.push('Pet Friendly');
    if (poi?.playground_available || (Array.isArray(poi?.playground_types) && poi.playground_types.length > 0)) out.push('Playgrounds');
    if (Array.isArray(poi?.parking_types) && poi.parking_types.length > 0) out.push('Parking Facilities');
    return Array.from(new Set(out.filter(Boolean)));
  }, [poi]);
  const petSummary = asArray(poi.pet_options).join(', ');

  // Accordions hidden per the POI Accordion show/hide doc. Park keeps About+Hours,
  // Address+Parking, Public Restrooms, Playground, Pet Policy, Contact.
  // (Pricing + Passes hidden for now — Pittsboro parks are free.)
  const HIDDEN_ACCORDIONS = new Set([
    'pricing_passes', 'mobility_access', 'drone_policy', 'alcohol_smoking',
    'night_sky', 'birding_wildlife', 'hunting_fishing', 'rentals', 'locally_history',
  ]);
  const sections = buildSections(poi, {
    displayLoc, handleDirections, handleCopyAddress, handleCopyCoords, copiedAddress, copiedCoords,
    handleCopyPhone, copiedPhone, handleCopyEmail, copiedEmail,
  }).filter((s) => !HIDDEN_ACCORDIONS.has(s.id));

  return (
    <>
    <POIDetailLayout
      poi={poi}
      mainCategory={subtitle}
      statusVariant={_statusVariant || undefined}
      statusLabel={_statusLabel}
      hideStatus
    >
      {({ images: imgs, openLightbox }) => (
        <>
          <QuickInfoPhotosBox
            title={poi.description_short}
            quickInfoRows={
              <>
                <QuickInfoRow title="Best For:" value={idealForLocal} />
                <QuickInfoRow title="Cost:" value={costValue} />
                <QuickInfoRow title="At-A-Glance:" value={poi.description_short} />
                <QuickInfoRow title="Pets:" value={petSummary} />
              </>
            }
            images={imgs}
            onOpenLightbox={openLightbox}
          />

          <AmenitiesBox title="Amenities" amenitiesList={amenitiesFlat} />

          {thingsToDo.length > 0 && (
            <div id="poi_things_to_do_box" className="box_style_1">
              <div className="poi_quick_info_title">Things To Do</div>
              <div className="poi_amenities_list">
                {thingsToDo.map((item, i) => <span className="aaa" key={`${item}-${i}`}>{item}</span>)}
              </div>
            </div>
          )}

          <div id="accordion_1_box" className="poi_accordion_box">
            <div id="accordion_1_parent" className="poi_accordion_parent accordionjs">
              {sections.map((s) => (
                s.singleColumn
                  ? <AccSection key={s.id} title={s.title} defaultOpen={false}>{s.col1}</AccSection>
                  : <AccSection key={s.id} title={s.title} defaultOpen={false} col1={s.col1} col2={s.col2} />
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
