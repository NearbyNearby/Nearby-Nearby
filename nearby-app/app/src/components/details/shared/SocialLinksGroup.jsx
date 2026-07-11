import ContentGroup from './ContentGroup';
import { hasVal } from './poiDetailUtils';

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
    <ContentGroup title="Social Media">
      <div className="acc_list_group_1">
        {links.map((l, i) =>
          l.url
            ? <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
            : <span key={i}>{l.label}</span>
        )}
      </div>
    </ContentGroup>
  );
}
