'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CatalogueListing } from '@/lib/device-api';

interface SidebarProps {
  catalogue: CatalogueListing[];
}

const PROMO_LIMIT = 4;
const PROMO_ROTATION_MS = 7000;

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

/**
 * Right-side sidebar — codes promo only. The annonce panel moved to a wide
 * bottom row in smart-tv-display so it can fill all the empty horizontal
 * space the codes promo column leaves above the partner banner.
 */
export function Sidebar({ catalogue }: SidebarProps) {
  const promos = useMemo(
    () => catalogue.filter((c) => typeof c.promoCode === 'string' && c.promoCode.trim() !== ''),
    [catalogue],
  );

  // When there are more than PROMO_LIMIT promos, rotate the visible window
  // through the full list so every code gets airtime. Window size stays at
  // PROMO_LIMIT — only the offset changes.
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (promos.length <= PROMO_LIMIT) return;
    const t = setInterval(() => {
      setOffset((o) => (o + 1) % promos.length);
    }, PROMO_ROTATION_MS);
    return () => clearInterval(t);
  }, [promos.length]);

  const visiblePromos = useMemo(() => {
    if (promos.length <= PROMO_LIMIT) return promos;
    return Array.from({ length: PROMO_LIMIT }, (_, i) => {
      const idx = (offset + i) % promos.length;
      return Object.assign({}, promos[idx], { __paletteIndex: idx });
    });
  }, [promos, offset]);

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
          key={offset}
          className="neo-promo-fade"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {(visiblePromos as (CatalogueListing & { __paletteIndex?: number })[]).map(
            (p, i) => (
              <PromoRow
                key={`${p.id}-${i}`}
                listing={p}
                paletteIndex={p.__paletteIndex ?? i}
              />
            ),
          )}
          {promos.length > PROMO_LIMIT && (
            <div
              style={{
                marginTop: 'auto',
                padding: '0.5rem 0.75rem',
                fontSize: '0.6875rem',
                color: 'var(--neo-t-3)',
                textAlign: 'center',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {promos.length} codes · rotation {Math.round(PROMO_ROTATION_MS / 1000)}s
            </div>
          )}
        </div>
      )}
    </div>
  );
}
