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

function PromoList({ catalogue }: { catalogue: CatalogueListing[] }) {
  const promos = useMemo(
    () => catalogue.filter((c) => typeof c.promoCode === 'string' && c.promoCode.trim() !== ''),
    [catalogue],
  );

  return (
    <div className="neo-panel" style={{ flex: 'none' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {promos.slice(0, PROMO_LIMIT).map((p, i) => (
            <PromoRow key={p.id} listing={p} paletteIndex={i} />
          ))}
          {promos.length > PROMO_LIMIT && (
            <div
              style={{
                marginTop: '0.25rem',
                padding: '0.625rem 0.75rem',
                fontSize: '0.71875rem',
                color: 'var(--neo-t-3)',
                textAlign: 'center',
                border: '1px dashed var(--neo-line)',
                borderRadius: '0.75rem',
                background: 'rgba(255,255,255,0.015)',
              }}
            >
              + {promos.length - PROMO_LIMIT} autres codes disponibles →
            </div>
          )}
        </div>
      )}
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
  const hasAds = houseAds.length > 0 || rotationAds.length > 0;

  return (
    <div
      style={{
        display: 'grid',
        // 1:2 → la pub prend 2× plus de hauteur que les codes promo
        gridTemplateRows: 'minmax(0, 1fr) minmax(0, 2fr)',
        gap: 'var(--neo-gap)',
        minHeight: 0,
        height: '100%',
      }}
    >
      <PromoList catalogue={catalogue} />
      <div
        className="neo-panel"
        style={{ padding: 0, overflow: 'hidden', position: 'relative' }}
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
        {hasAds ? (
          <div style={{ width: '100%', height: '100%' }}>
            <AdZone
              houseAds={houseAds}
              targetedAds={rotationAds}
              rotationMs={adRotationMs}
              onImpression={onAdImpression}
            />
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '1.5rem',
              textAlign: 'center',
              color: 'var(--neo-t-3)',
              fontSize: '0.8125rem',
              background:
                'linear-gradient(160deg, rgba(230,57,70,0.04), rgba(255,255,255,0.02))',
            }}
          >
            <div
              style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '0.75rem',
                background: 'linear-gradient(135deg, var(--neo-accent), #b71c2c)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: '1.5rem',
                color: '#fff',
                boxShadow: '0 4px 14px rgba(var(--neo-accent-glow), 0.35)',
              }}
            >
              N
            </div>
            <div style={{ fontWeight: 600, color: 'var(--neo-t-1)' }}>NEOFILM TV</div>
            <div
              style={{
                fontSize: '0.6875rem',
                color: 'var(--neo-t-4)',
                letterSpacing: '0.04em',
                maxWidth: '14rem',
                lineHeight: 1.5,
              }}
            >
              Aucune campagne active sur cet écran.
              <br />
              Les annonceurs ciblent ce screen via le portail admin.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
