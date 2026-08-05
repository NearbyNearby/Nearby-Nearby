import ContentGroup from './ContentGroup';
import { hasVal } from './poiDetailUtils';
import { SOCIAL_ICONS } from './SocialIcons';

// Social handle -> profile URL. Values may already be full URLs (pass through).
const PLATFORMS = [
  ['facebook_username', 'Facebook', (u) => `https://www.facebook.com/${u}`],
  ['instagram_username', 'Instagram', (u) => `https://www.instagram.com/${u.replace(/^@/, '')}`],
  ['x_username', 'X', (u) => `https://x.com/${u.replace(/^@/, '')}`],
  ['tiktok_username', 'TikTok', (u) => `https://www.tiktok.com/@${u.replace(/^@/, '')}`],
  ['linkedin_username', 'LinkedIn', (u) => `https://www.linkedin.com/${u.includes('/') ? u.replace(/^\//, '') : `company/${u}`}`],
];

const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Flatten a POI's social handle columns into [{ label, url|text }]. */
export function getSocialLinks(poi) {
  const out = [];
  PLATFORMS.forEach(([key, label, toUrl]) => {
    const raw = poi?.[key];
    if (typeof raw !== 'string' || !raw.trim()) return;
    const v = raw.trim();
    out.push({ label, url: isUrl(v) ? v : toUrl(v) });
  });
  const other = poi?.other_socials;
  if (other && typeof other === 'object' && !Array.isArray(other)) {
    Object.entries(other).forEach(([platform, val]) => {
      if (!hasVal(val)) return;
      const v = typeof val === 'string' ? val.trim() : (val.url || val.link);
      if (!v) return;
      out.push(isUrl(v) ? { label: cap(platform), url: v } : { label: `${cap(platform)}: ${v}` });
    });
  }
  return out;
}

export const hasSocialLinks = (poi) => getSocialLinks(poi).length > 0;

/**
 * SocialLinksGroup — the "Social Media" content group inside the Contact
 * accordion (Barry's single-poi template, Contact col2). Self-hides when the
 * POI has no social handles.
 */
export default function SocialLinksGroup({ poi }) {
  const links = getSocialLinks(poi);
  if (links.length === 0) return null;
  return (
    <ContentGroup title="Follow Us">
      <div className="poi_social_icon_row">
        {links.map((l, i) => {
          const platform = l.label.split(':')[0];
          const Icon = SOCIAL_ICONS[platform];
          const content = Icon ? <Icon /> : l.label;
          return l.url ? (
            <a key={i} className="poi_social_icon_link" href={l.url} target="_blank" rel="noopener noreferrer" title={platform} aria-label={platform}>
              {content}
            </a>
          ) : (
            <span key={i} className="poi_social_icon_link" title={platform} aria-label={platform}>{content}</span>
          );
        })}
      </div>
    </ContentGroup>
  );
}
