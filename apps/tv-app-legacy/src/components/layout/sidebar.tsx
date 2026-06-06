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
}

const PROMO_LIMIT = 3;

// Tailwind-ish soft palette used when a listing has no specific color.
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
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            color: 'var(--neo-t-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--neo-t-3)',
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {desc}
        </div>
      </div>
      <div className="neo-discount">
        {discount.length > 6 ? discount.slice(0, 6) : discount}
        <small>code</small>
      </div>
    </div>
  );
}

function PromoList({ catalogue }: { catalogue: CatalogueListing[] }) {
  const promos = useMemo(
    () => catalogue.filter((c) => typeof c.promoCode === 'string' && c.promoCode.trim() !== ''),
    [catalogue],
  );

  if (promos.length === 0) return null;

  return (
    <div className="neo-panel" style={{ flex: 'none' }}>
      <div className="neo-panel-head">
        <h3>Codes promo partenaires</h3>
        <span className="neo-meta">{promos.length} actifs</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {promos.slice(0, PROMO_LIMIT).map((p, i) => (
          <PromoRow key={p.id} listing={p} paletteIndex={i} />
        ))}
        {promos.length > PROMO_LIMIT && (
          <div
            style={{
              marginTop: 4,
              padding: '10px 12px',
              fontSize: 11.5,
              color: 'var(--neo-t-3)',
              textAlign: 'center',
              border: '1px dashed var(--neo-line)',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.015)',
            }}
          >
            + {promos.length - PROMO_LIMIT} autres codes disponibles →
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Right-side sidebar shown across all TV screens.
 * Top: PromoList (3 promo codes). Bottom: rotating AdZone video player
 * wrapped in the NEOFILM glass panel.
 */
export function Sidebar({
  catalogue,
  houseAds,
  rotationAds,
  adRotationMs,
  onAdImpression,
}: SidebarProps) {
  const hasPromos = catalogue.some((c) => c.promoCode && c.promoCode.trim() !== '');
  const hasAds = houseAds.length > 0 || rotationAds.length > 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: hasPromos && hasAds ? '1fr 1fr' : '1fr',
        gap: 'var(--neo-gap, 28px)',
        minHeight: 0,
        height: '100%',
      }}
    >
      {hasPromos && <PromoList catalogue={catalogue} />}
      {hasAds && (
        <div
          className="neo-panel"
          style={{ padding: 0, overflow: 'hidden', position: 'relative' }}
        >
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 18,
              zIndex: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 100,
              fontSize: 10.5,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#fff',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
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
      )}
    </div>
  );
}
