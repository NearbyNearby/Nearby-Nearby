import { useState, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';

import NearbySection from '../../nearby-feature/NearbySection';
import PhotoLightbox from '../PhotoLightbox';
import HeroBanner from '../HeroBanner';
import SuggestEditOverlay from '../SuggestEditOverlay';
import PoiHeader from '../PoiHeader';
import DirectionsModal from '../../common/DirectionsModal';
import AttributeSections from '../AttributeSections';
import { bespokeAutoKeysFor } from '../widgets/bespokeCoverage';

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
  showHero = true,
  children,
  seoComponent,
  beforeHeader,
  afterMain,
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
  const handleCopyCoords = async () => {
    if (!coords) return;
    if (await copyToClipboard(`${coords.lat}, ${coords.lng}`)) {
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 2000);
    }
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
      {showHero && <HeroBanner poi={poi} />}

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
      />

      <main id="main_content" className="pb50px">
        <div className="wrapper_default">
          {/* Registry-driven auto fields: every public render==="auto" field
              for this POI type. render!=="auto" fields are excluded by
              groupsFor; auto fields a detail page already renders in a curated
              section are excluded via bespokeAutoKeysFor so nothing is
              double-rendered. Function children receive them as bare
              `autoSections` and MUST place them inside their own
              poi_accordion_parent — one accordion stack per page (Barry's
              single-poi layout), never a second stack below it. */}
          {typeof children === 'function'
            ? children({
                images, openLightbox, paid, displayLoc, coords, copiedCoords,
                autoSections: (
                  <AttributeSections poi={poi} bare excludeKeys={bespokeAutoKeysFor(poi?.poi_type)} />
                ),
              })
            : (
              <>
                {children}
                <AttributeSections poi={poi} excludeKeys={bespokeAutoKeysFor(poi?.poi_type)} />
              </>
            )}
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
