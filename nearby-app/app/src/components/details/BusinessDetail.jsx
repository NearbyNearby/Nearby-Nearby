import { useMemo, useState } from 'react';

import {
  AccSection, ContentGroup, ChipList, CategoryChipList, QuickInfoRow,
  POIDetailLayout, QuickInfoPhotosBox, AmenitiesBox, SocialLinksGroup, hasSocialLinks,
  hasVal, asArray, getImages,
} from './shared';
import HoursDisplay from '../common/HoursDisplay';
import ServiceAnimalAlert from './ServiceAnimalAlert';
import { SvgDirections, SvgLatLong } from './PoiHeader';
import { LocalBusinessJsonLd } from '../seo/index';
import DirectionsModal from '../common/DirectionsModal';

import { Copy, Check, Globe, Phone } from 'lucide-react';
import { getOpenCloseStatusLabel } from '../../utils/hoursUtils';
import { getDisplayableLocation } from '../../utils/getDisplayableLocation';
import { copyToClipboard, getCoordinates } from './shared/poiDetailUtils';
import { sanitizeHtml } from '../../utils/sanitize';

const ALCOHOL_LABELS = {
  full_bar: 'Full Bar', beer_wine: 'Beer + Wine Only', byob: 'BYOB',
  no_alcohol: 'No Alcohol', seasonal: 'Seasonal/Event Only', nearby: 'Adjacent/Nearby Available',
};

const IDEAL_FOR_GROUPS = [
  { key: 'atmosphere', label: 'Atmosphere' },
  { key: 'age_group', label: 'For Ages' },
  { key: 'social_settings', label: 'Social Settings' },
  { key: 'local_special', label: 'Local Special' },
];

export default function BusinessDetail({ poi }) {
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const displayLoc = getDisplayableLocation(poi);
  const hideExact = displayLoc.hideExact;
  const coords = getCoordinates(poi, hideExact);
  const _coords = poi?.location?.coordinates;
  const _lat = Array.isArray(_coords) ? _coords[1] : null;
  const _lng = Array.isArray(_coords) ? _coords[0] : null;
  const { variant: _statusVariant, label: _statusLabel } = poi?.hours
    ? getOpenCloseStatusLabel(poi.hours, new Date(), _lat, _lng)
    : { variant: null, label: null };
  const images = useMemo(() => getImages(poi), [poi]);

  const primaryCategory = poi?.categories?.[0]?.name || poi?.business?.primary_category || '';

  const petsLabel = Array.isArray(poi?.pet_options) && poi.pet_options.length > 0 ? poi.pet_options.join(', ') : null;
  const goodForLabel = (() => {
    const ideal = poi?.ideal_for;
    if (!ideal || typeof ideal !== 'object') return null;
    const parts = [];
    IDEAL_FOR_GROUPS.forEach(({ key }) => { const arr = ideal[key]; if (Array.isArray(arr) && arr.length) parts.push(...arr); });
    return parts.length ? parts.join(', ') : null;
  })();
  const costLabel = poi?.business?.price_range || poi?.price_range_per_person || poi?.pricing || null;
  const parkingLabel = Array.isArray(poi?.parking_types) && poi.parking_types.length > 0 ? poi.parking_types.join(', ') : null;

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

  const webHref = poi?.website_url ? (poi.website_url.startsWith('http') ? poi.website_url : `https://${poi.website_url}`) : null;
  const phoneHref = poi?.phone_number ? `tel:${poi.phone_number}` : null;
  const addressLine = hasVal(poi?.address_street)
    ? [poi.address_street, poi.address_city, poi.address_state, poi.address_zip].filter(Boolean).join(', ')
    : null;
  const alcoholLabel = poi?.alcohol_available ? (ALCOHOL_LABELS[poi.alcohol_available] || poi.alcohol_available) : null;

  const menuLinks = poi?.menu_link ? [{ title: 'Menu', url: poi.menu_link }] : null;
  const buildLinkGroup = (title, items) => {
    const list = asArray(items).filter((x) => x && (x.url || x.link));
    if (list.length === 0) return null;
    return (
      <ContentGroup key={title} title={title}>
        <div className="acc_list_group_1">
          {list.map((item, i) => <a key={i} href={item.url || item.link} target="_blank" rel="noreferrer">{item.title || item.label || item.url}</a>)}
        </div>
      </ContentGroup>
    );
  };

  /* ── Accordion sections ──────────────────────────────────────── */
  const aboutCol1 = [
    hasVal(poi?.teaser_paragraph) && <ContentGroup key="teaser"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.teaser_paragraph) }} /></ContentGroup>,
    hasVal(poi?.description_long) && <ContentGroup key="desc"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.description_long) }} /></ContentGroup>,
    goodForLabel && (
      <ContentGroup key="ideal" title="Ideal For">
        <ChipList items={(() => { const parts = []; IDEAL_FOR_GROUPS.forEach(({ key }) => { const arr = poi?.ideal_for?.[key]; if (Array.isArray(arr)) parts.push(...arr); }); return parts; })()} />
      </ContentGroup>
    ),
    Array.isArray(poi?.categories) && poi.categories.length > 0 && (
      <ContentGroup key="cats" title="Categories"><CategoryChipList categories={poi.categories} /></ContentGroup>
    ),
  ].filter(Boolean);

  const aboutCol2 = [
    hasVal(poi?.hours) && (
      <ContentGroup key="hours" title="Hours">
        <div className="acc_content_text">
          {/* Issue #70: holiday_hours top-level field removed; holidays live in hours.holidays */}
          <HoursDisplay hours={poi.hours} appointmentBookingUrl={poi.appointment_booking_url} appointmentRequired={poi.hours_but_appointment_required} hoursNotes={poi.hours_notes} />
        </div>
      </ContentGroup>
    ),
  ].filter(Boolean);

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
    if (!poi?.phone_number) return;
    if (await copyToClipboard(poi.phone_number)) { setCopiedPhone(true); setTimeout(() => setCopiedPhone(false), 2000); }
  };
  const handleCopyEmail = async () => {
    if (!poi?.email) return;
    if (await copyToClipboard(poi.email)) { setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000); }
  };

  const addrCol1 = !hideExact && (addressLine || coords) ? [(
    <ContentGroup key="addr" title="Address">
      <div className="acc_content_text">
        {addressLine && <div>{addressLine}</div>}
        <div className="pd-addr__actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={() => setDirectionsOpen(true)}>
            <SvgDirections /> <span className="poi_button_title">Directions</span>
          </button>
          {addressLine && (
            <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleCopyAddress}>
              {copiedAddress ? <Check size={14} /> : <Copy size={14} />} <span className="poi_button_title">{copiedAddress ? 'Copied!' : 'Copy Address'}</span>
            </button>
          )}
          {coords && (
            <button type="button" className="btn_reset button btn_outline_teal btn_poi_button_1" onClick={handleCopyCoords}>
              {copiedCoords ? <Check size={14} /> : <SvgLatLong />} <span className="poi_button_title">{copiedCoords ? 'Copied!' : 'Lat + Long'}</span>
            </button>
          )}
        </div>
      </div>
    </ContentGroup>
  )] : [];
  // Entry notes belong with the address (how to find / get in the door).
  if (hasVal(poi?.business_entry_notes)) {
    addrCol1.push(
      <ContentGroup key="entry" title="Entry Notes">
        <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.business_entry_notes) }} />
      </ContentGroup>
    );
  }

  const addrCol2 = [
    hasVal(poi?.parking_types) && <ContentGroup key="parking" title="Parking"><ChipList items={poi.parking_types} /></ContentGroup>,
    hasVal(poi?.arrival_methods) && <ContentGroup key="arrival" title="Arrival"><ChipList items={poi.arrival_methods} /></ContentGroup>,
    poi?.expect_to_pay_parking === true && (
      <ContentGroup key="paypark">
        <div className="acc_content_text"><p>Expect to pay for parking.</p></div>
      </ContentGroup>
    ),
    hasVal(poi?.parking_notes) && (
      <ContentGroup key="pnotes">
        <div className="acc_content_text"><p>{poi.parking_notes}</p></div>
      </ContentGroup>
    ),
  ].filter(Boolean);

  const pricingCol1 = [
    hasVal(costLabel) && <ContentGroup key="price" title="Average Price"><div className="acc_content_text">{costLabel}</div></ContentGroup>,
    // NOTE: the API field is pricing_details (description_pricing never existed
    // on the wire — it silently rendered nothing).
    hasVal(poi?.pricing_details) && <ContentGroup key="pricing" title="Pricing Details"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.pricing_details) }} /></ContentGroup>,
  ].filter(Boolean);
  const pricingCol2 = [
    hasVal(poi?.payment_methods) && <ContentGroup key="paymeth" title="Payment Methods"><ChipList items={poi.payment_methods} /></ContentGroup>,
    hasVal(poi?.discounts) && (
      <ContentGroup key="disc" title="Discounts + Offers">
        <div className="acc_content_text"><ul>{asArray(poi.discounts).map((d, i) => <li key={i}>{typeof d === 'object' ? (d.title || d.label || d.name || '') : d}</li>)}</ul></div>
      </ContentGroup>
    ),
  ].filter(Boolean);

  const menuCol1 = [buildLinkGroup('Menu', menuLinks), buildLinkGroup('Reservations', poi?.reservation_links)].filter(Boolean);
  const menuCol2 = [
    buildLinkGroup('Delivery + Takeout', poi?.delivery_links),
    buildLinkGroup('Online Ordering', poi?.online_ordering_links),
    buildLinkGroup('Appointments', poi?.appointment_links),
  ].filter(Boolean);

  const alcSmokCol1 = [
    hasVal(alcoholLabel) && <ContentGroup key="alc" title="Alcohol"><div className="acc_content_text">{alcoholLabel}</div></ContentGroup>,
    hasVal(poi?.alcohol_availability) && <ContentGroup key="alcav" title="Available"><ChipList items={poi.alcohol_availability} /></ContentGroup>,
    hasVal(poi?.alcohol_options) && <ContentGroup key="alcopt" title="Options"><ChipList items={poi.alcohol_options} /></ContentGroup>,
    poi?.byob_allowed === true && <ContentGroup key="byob"><div className="acc_content_text"><p>BYOB allowed.</p></div></ContentGroup>,
    hasVal(poi?.alcohol_policy_details) && <ContentGroup key="alcp" title="Alcohol Policy"><div className="acc_content_text">{poi.alcohol_policy_details}</div></ContentGroup>,
    hasVal(poi?.alcohol_notes) && <ContentGroup key="alcn" title="Notes"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.alcohol_notes) }} /></ContentGroup>,
  ].filter(Boolean);
  const alcSmokCol2 = [
    hasVal(poi?.smoking_options) && <ContentGroup key="smokeopt" title="Smoking"><ChipList items={poi.smoking_options} /></ContentGroup>,
    hasVal(poi?.smoking_details) && <ContentGroup key="smoke" title="Smoking Details"><div className="acc_content_text">{poi.smoking_details}</div></ContentGroup>,
  ].filter(Boolean);

  const restroomCol1 = [
    hasVal(poi?.public_toilets) && <ContentGroup key="pt" title="Restrooms"><ChipList items={poi.public_toilets} /></ContentGroup>,
    hasVal(poi?.toilet_description) && <ContentGroup key="td" title="Details"><div className="acc_content_text">{poi.toilet_description}</div></ContentGroup>,
  ].filter(Boolean);
  const restroomCol2 = [
    poi?.accessible_restroom === true && hasVal(poi?.accessible_restroom_details) && <ContentGroup key="ard" title="Accessible Restroom Details"><ChipList items={poi.accessible_restroom_details} /></ContentGroup>,
  ].filter(Boolean);

  const wheelchairCol1 = [
    // wheelchair_accessible chip removed — column dropped (Issue #45 PR2 Migration B)
    hasVal(poi?.wheelchair_details) && <ContentGroup key="wd" title="Details"><div className="acc_content_text">{poi.wheelchair_details}</div></ContentGroup>,
  ].filter(Boolean);
  const wheelchairCol2 = [
    hasVal(poi?.mobility_access) && <ContentGroup key="ma" title="Mobility Access"><ChipList items={Array.isArray(poi.mobility_access) ? poi.mobility_access : Object.keys(poi.mobility_access).filter((k) => poi.mobility_access[k] === true)} /></ContentGroup>,
  ].filter(Boolean);

  const petCol1 = [
    hasVal(poi?.pet_options) && <ContentGroup key="pets" title="Pet Policy"><ChipList items={poi.pet_options} /></ContentGroup>,
    hasVal(poi?.pet_policy) && <ContentGroup key="pp"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.pet_policy) }} /></ContentGroup>,
    hasVal(poi?.pet_options) && <ContentGroup key="sa"><ServiceAnimalAlert /></ContentGroup>,
  ].filter(Boolean);
  const petCol2 = [];

  const playgroundCol1 = [
    hasVal(poi?.playground_types) && <ContentGroup key="pt" title="Playground Types"><ChipList items={poi.playground_types} /></ContentGroup>,
    hasVal(poi?.playground_surface_types) && <ContentGroup key="ps" title="Surface"><ChipList items={poi.playground_surface_types} /></ContentGroup>,
  ].filter(Boolean);
  const playgroundCol2 = [
    hasVal(poi?.playground_age_groups) && <ContentGroup key="pag" title="Age Groups"><ChipList items={poi.playground_age_groups} /></ContentGroup>,
    hasVal(poi?.playground_notes) && <ContentGroup key="pgn" title="Notes"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.playground_notes) }} /></ContentGroup>,
    poi?.inclusive_playground === true && hasVal(poi?.playground_ada_checklist) && <ContentGroup key="pad" title="Inclusive Playground Checklist"><ChipList items={poi.playground_ada_checklist} /></ContentGroup>,
  ].filter(Boolean);

  const contactCol1 = [
    phoneHref && (
      <ContentGroup key="phone" title="Phone">
        <div className="acc_list_group_1 poi_contact_row">
          <Phone size={16} />
          <a href={phoneHref}>{poi.phone_number}</a>
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
    hasVal(poi?.email) && (
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

  // Single section list. The server tier-gates the underlying fields, so
  // free-tier listings naturally have empty Menu/Alcohol/Playground sections
  // and those sections self-hide via the empty-column filter below.
  // Accordions hidden per the POI Accordion show/hide doc. The builders above
  // are kept intact; to restore an accordion, remove its key from this set.
  const HIDDEN_ACCORDIONS = new Set(['menu', 'alc', 'wc', 'play']);

  const ALL_SECTIONS = [
    { key: 'about', title: 'About + Hours', open: true, col1: aboutCol1, col2: aboutCol2 },
    { key: 'addr', title: 'Address + Parking', open: true, col1: addrCol1, col2: addrCol2 },
    { key: 'price', title: 'Pricing + Offers', open: false, col1: pricingCol1, col2: pricingCol2 },
    { key: 'menu', title: 'Menu + Ordering', open: false, col1: menuCol1, col2: menuCol2 },
    { key: 'alc', title: 'Alcohol + Smoking', open: false, col1: alcSmokCol1, col2: alcSmokCol2 },
    { key: 'rest', title: 'Public Restrooms', open: false, col1: restroomCol1, col2: restroomCol2 },
    { key: 'wc', title: 'Wheelchair Accessible', open: false, col1: wheelchairCol1, col2: wheelchairCol2 },
    { key: 'pet', title: 'Pet Policy', open: false, col1: petCol1, col2: petCol2, singleColumn: true },
    { key: 'play', title: 'Playground', open: false, col1: playgroundCol1, col2: playgroundCol2 },
    { key: 'contact', title: 'Contact', open: false, col1: contactCol1, col2: contactCol2 },
  ];
  const sections = ALL_SECTIONS.filter((s) => !HIDDEN_ACCORDIONS.has(s.key) && (s.col1.length > 0 || s.col2.length > 0));

  return (
    <>
    <POIDetailLayout
      poi={poi}
      mainCategory={primaryCategory}
      statusVariant={_statusVariant || undefined}
      statusLabel={_statusLabel}
      seoComponent={<LocalBusinessJsonLd poi={poi} />}
      hideStatus
    >
      {({ images: imgs, openLightbox }) => (
        <>
          <QuickInfoPhotosBox
            title={hasVal(poi?.description_short) ? poi.description_short : undefined}
            quickInfoRows={
              <>
                <QuickInfoRow title="Category:" value={primaryCategory} />
                <QuickInfoRow title="Cost:" value={costLabel} />
                <QuickInfoRow title="Good For:" value={goodForLabel} />
                <QuickInfoRow title="Pets:" value={petsLabel} />
                <QuickInfoRow title="Parking:" value={parkingLabel} />
              </>
            }
            images={imgs}
            onOpenLightbox={openLightbox}
          />

          <AmenitiesBox title="Amenities" amenitiesList={amenitiesFlat} />

          {sections.length > 0 && (
            <div id="accordion_1_box" className="poi_accordion_box">
              <div id="accordion_1_parent" className="poi_accordion_parent accordionjs">
                {sections.map((s) => (
                  s.singleColumn
                    ? <AccSection key={s.key} title={s.title} defaultOpen={false}>{s.col1}</AccSection>
                    : <AccSection key={s.key} title={s.title} defaultOpen={false} col1={s.col1.length > 0 ? s.col1 : null} col2={s.col2.length > 0 ? s.col2 : null} />
                ))}
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
