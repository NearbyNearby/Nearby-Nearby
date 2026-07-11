import { useMemo } from 'react';

import {
  AccSection, ContentGroup, ChipList, QuickInfoRow,
  POIDetailLayout, QuickInfoPhotosBox, AmenitiesBox, SocialLinksGroup, hasSocialLinks,
  hasVal, getImages,
} from './shared';
import HoursDisplay from '../common/HoursDisplay';
import SEO from '../SEO';
import { truncateText, getPOIUrl } from '../../utils/slugify';
import { getDisplayableLocation } from '../../utils/getDisplayableLocation';
import { getOpenCloseStatusLabel } from '../../utils/hoursUtils';
import { sanitizeHtml } from '../../utils/sanitize';

export default function GenericDetail({ poi }) {
  const displayLoc = getDisplayableLocation(poi);
  const _coords = poi?.location?.coordinates;
  const _lat = Array.isArray(_coords) ? _coords[1] : null;
  const _lng = Array.isArray(_coords) ? _coords[0] : null;
  const { variant: _statusVariant, label: _statusLabel } = poi.hours
    ? getOpenCloseStatusLabel(poi.hours, new Date(), _lat, _lng)
    : { variant: null, label: null };
  const images = useMemo(() => getImages(poi), [poi]);

  const categoryFromPoiType = (() => {
    const t = poi.poi_type;
    if (!t) return null;
    return t.toString().toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  })();
  const primaryCategory =
    (poi.categories && poi.categories.length > 0 && (poi.categories[0]?.name || poi.categories[0]?.category?.name)) ||
    poi.main_category?.name || categoryFromPoiType;

  const seoTitle = poi.name;
  const seoDescription = truncateText(
    poi.description_long || poi.description_short || poi.teaser_paragraph ||
    `Discover ${poi.name}${poi.address_city ? ' in ' + poi.address_city : ''}.`, 155
  );
  const seoImage = poi.featured_image || (poi.images && poi.images[0]?.url) || null;
  const seoUrl = `${window.location.origin}${getPOIUrl(poi)}`;

  const contactAny =
    hasVal(poi.phone_number) || hasVal(poi.email) || hasVal(poi.website_url) || hasSocialLinks(poi);

  const addressAny =
    hasVal(poi.address_street) || hasVal(poi.address_city) ||
    hasVal(poi.parking_types) || hasVal(poi.parking_notes) ||
    hasVal(poi.arrival_methods) || poi.expect_to_pay_parking === true;

  /* ── Accordion sections ── */
  const aboutCol1 = [
    hasVal(poi.teaser_paragraph) && (
      <ContentGroup key="teaser">
        <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.teaser_paragraph) }} />
      </ContentGroup>
    ),
    hasVal(poi.description_long) && (
      <ContentGroup key="desc" title="About">
        <div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.description_long) }} />
      </ContentGroup>
    ),
  ].filter(Boolean);
  const aboutCol2 = [
    hasVal(poi.hours) && (
      <ContentGroup key="hours" title="Hours">
        <div className="acc_content_text">
          {/* Issue #70: holiday_hours top-level field removed; holidays live in hours.holidays */}
          <HoursDisplay hours={poi.hours}
            appointmentBookingUrl={poi.appointment_booking_url}
            appointmentRequired={poi.hours_but_appointment_required}
            hoursNotes={poi.hours_notes} />
        </div>
      </ContentGroup>
    ),
  ].filter(Boolean);

  const addrCol1 = [
    hasVal(poi.address_street) && (
      <ContentGroup key="addr" title="Address">
        <div className="acc_content_text">
          {!displayLoc.hideExact && poi.address_street && <div>{poi.address_street}</div>}
          {(poi.address_city || poi.address_state) && (
            <div>{[poi.address_city, poi.address_county, poi.address_state].filter(Boolean).join(', ')}</div>
          )}
          {!displayLoc.hideExact && poi.address_zip && <div>{poi.address_zip}</div>}
        </div>
      </ContentGroup>
    ),
  ].filter(Boolean);
  const addrCol2 = [
    hasVal(poi.parking_types) && <ContentGroup key="parking" title="Parking"><ChipList items={poi.parking_types} /></ContentGroup>,
    hasVal(poi.arrival_methods) && <ContentGroup key="arrival" title="Arrival"><ChipList items={poi.arrival_methods} /></ContentGroup>,
    poi.expect_to_pay_parking === true && <ContentGroup key="paypark"><div className="acc_content_text"><p>Expect to pay for parking.</p></div></ContentGroup>,
    hasVal(poi.parking_notes) && <ContentGroup key="pnotes"><div className="acc_content_text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(poi.parking_notes) }} /></ContentGroup>,
  ].filter(Boolean);

  const contactCol1 = [
    hasVal(poi.phone_number) && <ContentGroup key="ph" title="Phone"><div className="acc_list_group_1"><a href={`tel:${poi.phone_number}`}>{poi.phone_number}</a></div></ContentGroup>,
    hasVal(poi.website_url) && (
      <ContentGroup key="web" title="Website">
        <div className="acc_list_group_1">
          <a href={poi.website_url.startsWith('http') ? poi.website_url : `https://${poi.website_url}`} target="_blank" rel="noopener noreferrer">{poi.website_url}</a>
        </div>
      </ContentGroup>
    ),
  ].filter(Boolean);
  const contactCol2 = [
    hasVal(poi.email) && <ContentGroup key="em" title="Email"><div className="acc_list_group_1"><a href={`mailto:${poi.email}`}>{poi.email}</a></div></ContentGroup>,
    hasSocialLinks(poi) && <SocialLinksGroup key="soc" poi={poi} />,
  ].filter(Boolean);

  const sections = [
    (aboutCol1.length || aboutCol2.length) && { key: 'about', title: 'About + Hours', open: true, col1: aboutCol1, col2: aboutCol2 },
    addressAny && { key: 'addr', title: 'Address + Parking', open: false, col1: addrCol1, col2: addrCol2 },
    contactAny && { key: 'contact', title: 'Contact', open: false, col1: contactCol1, col2: contactCol2 },
  ].filter(Boolean);

  return (
    <>
      <SEO title={seoTitle} description={seoDescription} image={seoImage} url={seoUrl} type="place" />
      <POIDetailLayout
        poi={poi}
        mainCategory={primaryCategory}
        statusVariant={_statusVariant || undefined}
        statusLabel={_statusLabel}
      >
        {({ images: imgs, openLightbox }) => (
          <>
            <QuickInfoPhotosBox
              title={hasVal(poi.description_short) ? poi.description_short : undefined}
              quickInfoRows={
                <>
                  <QuickInfoRow title="Category:" value={primaryCategory} />
                  <QuickInfoRow title="Cost:" value={poi.price_range || poi.cost} />
                  <QuickInfoRow title="Pets:" value={Array.isArray(poi.pet_options) && poi.pet_options.length > 0 ? poi.pet_options.join(', ') : null} />
                  <QuickInfoRow title="Parking:" value={Array.isArray(poi.parking_types) && poi.parking_types.length > 0 ? poi.parking_types.join(', ') : null} />
                </>
              }
              images={imgs}
              onOpenLightbox={openLightbox}
            />

            <AmenitiesBox poi={poi} title="Amenities" />

            {/* ONE accordion stack per page (Barry's single-poi layout): the
                registry-driven auto sections render inside the same parent. */}
            <div id="accordion_1_box" className="poi_accordion_box">
              <div id="accordion_1_parent" className="poi_accordion_parent accordionjs">
                {sections.map((s) => (
                  <AccSection key={s.key} title={s.title} defaultOpen={s.open}
                    col1={s.col1.length > 0 ? s.col1 : null}
                    col2={s.col2.length > 0 ? s.col2 : null} />
                ))}
              </div>
            </div>
          </>
        )}
      </POIDetailLayout>
    </>
  );
}
