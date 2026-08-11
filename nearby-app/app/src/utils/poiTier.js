/**
 * POI tier and display utilities.
 *
 * PAID tier = listing_type ∈ {paid, paid_founding, community_comped} OR is_sponsor=true.
 * Everything else is FREE.
 */

const PAID_LISTING_TYPES = ['paid', 'paid_founding', 'community_comped'];

export function isPaidTier(poi) {
  if (!poi) return false;
  return poi.is_sponsor === true || PAID_LISTING_TYPES.includes(poi.listing_type);
}

/**
 * Produce the sponsor chip label per plan §2.2.
 *   platform → "Platform Sponsor"
 *   state    → "State Sponsor"
 *   county   → "{county} Sponsor"  (strips " County" suffix if present)
 *   town     → "{city} Sponsor"
 *   null/unknown → "Sponsor"
 */
export function sponsorLabel(poi) {
  if (!poi || !poi.is_sponsor) return null;
  const level = poi.sponsor_level;
  if (level === 'platform') return 'Platform Sponsor';
  if (level === 'state') return 'State Sponsor';
  if (level === 'county') {
    const county = (poi.address_county || '').replace(/\s+County$/i, '').trim();
    return county ? `${county} Sponsor` : 'Sponsor';
  }
  if (level === 'town') {
    const city = (poi.address_city || '').trim();
    return city ? `${city} Sponsor` : 'Sponsor';
  }
  return 'Sponsor';
}
