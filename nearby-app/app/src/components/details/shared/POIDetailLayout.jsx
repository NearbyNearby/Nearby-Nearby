import { useState, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';

import NearbySection from '../../nearby-feature/NearbySection';
import PhotoLightbox from '../PhotoLightbox';
import SuggestEditOverlay from '../SuggestEditOverlay';
import PoiHeader from '../PoiHeader';
import AccordionGroup from './AccordionGroup';
import DirectionsModal from '../../common/DirectionsModal';
// Auto-dump sections (Core Information / Business Details / Pricing / Metadata)
// hidden per the POI Accordion show/hide doc — see the commented render below.
// import AttributeSections from '../AttributeSections';
// import { bespokeAutoKeysFor } from '../widgets/bespokeCoverage';

import { getDisplayableLocation } from '../../../utils/getDisplayableLocation';
import { isPaidTier } from '../../../utils/poiTier';
import { getOpenCloseStatusLabel } from '../../../utils/hoursUtils';
import { copyToClipboard, getCoordinates, getImages } from './poiDetailUtils';

export default function POIDetailLayout({
  poi,
  mainCategory,
  statusVariant: statusVariantProp,
  statusLabel: statusLabelProp,
  extraButtons,
  titleLeader,
  subtitleExtras,
  typeInfoBox,
  children,
  seoComponent,
  beforeHeader,
  afterMain,
  hideStatus,
}) {
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const suggestEditRef = useRef(null);

  const displayLoc = getDisplayableLocation(poi);
  const paid = isPaidTier(poi);
  const coords = getCoordinates(poi, displayLoc.hideExact);
  const images = useMemo(() => getImages(poi), [poi]);

  const _coords = poi?.location?.coordinates;
  const _lat = Array.isArray(_coords) ? _coords[1] : null;
  const _lng = Array.isArray(_coords) ? _coords[0] : null;

  let statusVariant = statusVariantProp;
  let statusLabel = statusLabelProp;
  if (statusVariant === undefined && poi?.hours) {
    const derived = getOpenCloseStatusLabel(poi.hours, new Date(), _lat, _lng);
    statusVariant = derived.variant || undefined;
    statusLabel = derived.label;
  }

  // Breadcrumb (Barry's design replaces the single back-link): Home \ Explore \ Type \ Name
  const _typeRaw = (poi?.poi_type || '').toString();
  const typeParam = _typeRaw.toUpperCase();
  const typeLabel = _typeRaw ? _typeRaw.charAt(0).toUpperCase() + _typeRaw.slice(1).toLowerCase() : '';

  const handleDirections = () => setDirectionsOpen(true);
  // Returns whether the copy landed so PoiHeader's "Copied!" flash can stay
  // honest when the clipboard write fails (#142 item 5).
  const handleCopyCoords = async () => {
    if (!coords) return false;
    const ok = await copyToClipboard(`${coords.lat}, ${coords.lng}`);
    if (ok) {
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 2000);
    }
    return ok;
  };
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: poi?.name, url }); return; } catch { /* ignore */ }
    }
    await copyToClipboard(url);
  };
  const scrollToNearby = () => {
    document.querySelector('.nearby-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openLightbox = (idx = 0) => {
    setLightboxIndex(idx);
    setLightboxOpen(true);
  };

  return (
    <div className="poi_detail_page">
      {seoComponent}

      <div id="search_back_wrapper">
        <div id="show_back_or_breadcrumbs" className="wrapper_default">
          <nav className="poi_breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span className="poi_breadcrumb_sep" aria-hidden="true">\</span>
            <Link to="/explore">Explore</Link>
            {typeLabel && (
              <>
                <span className="poi_breadcrumb_sep" aria-hidden="true">\</span>
                <Link className="poi_breadcrumb_type" to={`/explore?type=${typeParam}`}>{typeLabel}</Link>
              </>
            )}
            <span className="poi_breadcrumb_sep" aria-hidden="true">\</span>
            <span aria-current="page">{poi?.name}</span>
          </nav>
        </div>
      </div>

      {beforeHeader}

      <PoiHeader
        poi={poi}
        paid={paid}
        displayLoc={displayLoc}
        mainCategory={mainCategory}
        statusVariant={statusVariant}
        statusLabel={statusLabel}
        onDirections={handleDirections}
        onCopyLatLong={handleCopyCoords}
        onShare={handleShare}
        onViewNearby={scrollToNearby}
        onSuggestEdit={() => suggestEditRef.current?.open()}
        extraButtons={extraButtons}
        titleLeader={titleLeader}
        subtitleExtras={subtitleExtras}
        typeInfoBox={typeInfoBox}
        hideStatus={hideStatus}
      />

      <main id="main_content" className="pb50px">
        <div className="wrapper_default">
          {/* Single-open accordions: only one POI accordion open at a time */}
          <AccordionGroup>
            {typeof children === 'function'
              ? children({ images, openLightbox, paid, displayLoc, coords, copiedCoords })
              : children}
          </AccordionGroup>

          {/* Registry-driven auto fields (Core Information / Business Details /
              Pricing / Metadata) hidden per the POI Accordion show/hide doc so
              only the bespoke, doc-specified accordions show. Restore by
              uncommenting this line and the two imports at the top of the file.
              <AttributeSections poi={poi} excludeKeys={bespokeAutoKeysFor(poi?.poi_type)} /> */}
        </div>
      </main>

      {afterMain}

      <NearbySection currentPOI={poi} />

      <PhotoLightbox
        images={images}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        initialIndex={lightboxIndex}
      />

      <SuggestEditOverlay
        poiName={poi?.name}
        poiId={poi?.id}
        triggerRef={suggestEditRef}
      />

      <DirectionsModal
        isOpen={directionsOpen}
        onClose={() => setDirectionsOpen(false)}
        poiName={poi?.name}
        coords={coords}
        poi={poi}
      />
    </div>
  );
}
