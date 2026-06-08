'use client';

import { useMemo } from 'react';
import type { CatalogueListing, CreativeManifest, TvAdItem } from '@/lib/device-api';
import { AdZone } from '@/components/layout/ad-zone';

interface SidebarProps {
  catalogue: CatalogueListing[];
  houseAds: CreativeManifest[];
  rotationAds: TvAdItem[];
  adRotationMs?: number;
  onAdImpression?: (ad: TvAdItem, startTime: Date, endTime: Date, skipped: boolean) => void;
  /** When true, render codes promo only (annonce shown elsewhere on this tab). */
  promosOnly?: boolean;
  /** When true, render annonce on top + codes promo on bottom (used on TNT tab). */
  reversed?: boolean;
}

/** Seconds per promo card for the continuous vertical marquee. Lower = faster. */
const PROMO_SCROLL_SECONDS_PER_CARD = 6;

const FALLBACK_PROMO_COLORS = [
  '#c2410c',
  '#0e7490',
  '#7c3aed',
  '#059669',
  '#b91c1c',
  '#a16207',
];

function PromoRow({ listing, paletteIndex }: { listing: CatalogueListing; paletteIndex: number }) {
  const name = listing.title;
  const desc = listing.promoDescription ?? listing.description ?? listing.category;
  const discount = listing.promoCode ?? '';
  const color = FALLBACK_PROMO_COLORS[paletteIndex % FALLBACK_PROMO_COLORS.length];
  const initial = name.replace(/^Le |^La |^L'/i, '').charAt(0).toUpperCase();
  const isUrl = listing.imageUrl && /^https?:\/\//.test(listing.imageUrl);

  return (
    <div className="neo-promo">
      <div
        className="neo-promo-logo"
        style={
          isUrl
            ? {
                backgroundImage: `url(${listing.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: `linear-gradient(135deg, ${color}, ${color}dd)` }
        }
      >
        {!isUrl && initial}
      </div>
      <div className="neo-promo-body">
        <div className="neo-name-row">
          <span className="neo-name" style={{ color: 'var(--neo-t-1)' }}>{name}</span>
          {discount && <span className="neo-discount-pill">{discount}</span>}
        </div>
        <div className="neo-desc">{desc}</div>
      </div>
    </div>
  );
}

export function PromoList({ catalogue }: { catalogue: CatalogueListing[] }) {
  const promos = useMemo(
    () => catalogue.filter((c) => typeof c.promoCode === 'string' && c.promoCode.trim() !== ''),
    [catalogue],
  );

  // The list is duplicated so a single translateY(-50%) animation produces a
  // seamless infinite scroll: as the first copy disappears past the top, the
  // duplicate copy starts at where the first one was — there is no visible
  // wrap-around. Duration scales with promo count so each card always has a
  // similar amount of time on screen regardless of how many partners there are.
  const duplicated = useMemo(() => [...promos, ...promos], [promos]);
  const scrollDurationS = Math.max(20, promos.length * PROMO_SCROLL_SECONDS_PER_CARD);

  return (
    <div className="neo-panel" style={{ height: '100%', minHeight: 0 }}>
      <div className="neo-panel-head">
        <h3>Codes promo partenaires</h3>
        <span className="neo-meta">{promos.length} actif{promos.length > 1 ? 's' : ''}</span>
      </div>
      {promos.length === 0 ? (
        <div
          style={{
            padding: '1.5rem 1rem',
            border: '1px dashed var(--neo-line)',
            borderRadius: '0.75rem',
            background: 'rgba(255,255,255,0.015)',
            textAlign: 'center',
            color: 'var(--neo-t-3)',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
          }}
        >
          Aucun code promo pour l'instant.
          <br />
          <span style={{ color: 'var(--neo-t-4)', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>
            Les partenaires ajoutent leurs codes via le portail.
          </span>
        </div>
      ) : (
        <div
          className="neo-promo-marquee"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            className="neo-promo-marquee-track"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.625rem',
              animationDuration: `${scrollDurationS}s`,
            }}
          >
            {duplicated.map((p, i) => (
              <PromoRow
                key={`${p.id}-${i}`}
                listing={p}
                paletteIndex={i % Math.max(1, promos.length)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The "Annonce" panel — a glass card wrapping the AdZone with a top-right
 * label badge. Reused both inside the sidebar (default) and as a standalone
 * panel on the HOME tab (where it extends across the empty home-grid cell).
 */
export function AnnoncePanel({
  houseAds,
  rotationAds,
  adRotationMs,
  onAdImpression,
}: {
  houseAds: CreativeManifest[];
  rotationAds: TvAdItem[];
  adRotationMs?: number;
  onAdImpression?: (ad: TvAdItem, startTime: Date, endTime: Date, skipped: boolean) => void;
}) {
  return (
    <div
      className="neo-panel"
      style={{ padding: 0, overflow: 'hidden', position: 'relative', height: '100%' }}
    >
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1.125rem',
          zIndex: 4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.375rem 0.75rem',
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 100,
          fontSize: '0.65625rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#fff',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '0.375rem',
            height: '0.375rem',
            borderRadius: '50%',
            background: 'var(--neo-accent)',
            boxShadow: '0 0 0 3px rgba(var(--neo-accent-glow), 0.25)',
          }}
        />
        Annonce
      </div>
      <div style={{ width: '100%', height: '100%' }}>
        <AdZone
          houseAds={houseAds}
          targetedAds={rotationAds}
          rotationMs={adRotationMs}
          onImpression={onAdImpression}
        />
      </div>
    </div>
  );
}

/**
 * Right-side sidebar — codes promo (top) + annonce (bottom) by default.
 * In `promosOnly` mode the annonce is rendered elsewhere (e.g. on the HOME tab
 * we render it spanning across the empty home-grid cell + the sidebar bottom).
 */
export function Sidebar({
  catalogue,
  houseAds,
  rotationAds,
  adRotationMs,
  onAdImpression,
  promosOnly,
  reversed,
}: SidebarProps) {
  if (promosOnly) {
    return <PromoList catalogue={catalogue} />;
  }
  // Wrap the annonce panel in a 16:9 box. Sidebar width is fixed at 33rem,
  // so the box collapses to 33rem × 18.5625rem — exact aspect ratio of the
  // re-encoded dupplex.mp4. The video then fills it edge-to-edge with NO
  // bars and NO crop. The codes-promo row expands to take all the height
  // the annonce isn't using.
  const annonce = (
    <div style={{ width: '100%', aspectRatio: '16 / 9' }}>
      <AnnoncePanel
        houseAds={houseAds}
        rotationAds={rotationAds}
        adRotationMs={adRotationMs}
        onAdImpression={onAdImpression}
      />
    </div>
  );
  const promos = <PromoList catalogue={catalogue} />;
  return (
    <div
      style={{
        display: 'grid',
        // promos take whatever height is left after the annonce locks in 16:9.
        gridTemplateRows: reversed ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr) auto',
        gap: 'var(--neo-gap)',
        minHeight: 0,
        height: '100%',
      }}
    >
      {reversed ? annonce : promos}
      {reversed ? promos : annonce}
    </div>
  );
}
