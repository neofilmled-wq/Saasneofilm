'use client';

import { useEffect, useRef } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';
import type { CatalogueListing, ActivityPlace } from '@/lib/device-api';
import { resolveMediaUrl } from '@/lib/device-api';

type ListingItem = CatalogueListing | ActivityPlace;

interface ListingDetailPageProps {
  item: ListingItem;
  onBack: () => void;
}

function isActivity(item: ListingItem): item is ActivityPlace {
  return 'name' in item && !('title' in item);
}
function isCatalogue(item: ListingItem): item is CatalogueListing {
  return 'title' in item;
}

const CATEGORY_ICONS: Record<string, string> = {
  RESTAURANT: '🍽', SPA: '💆', SPORT: '⚽', CULTURE: '🎭',
  NIGHTLIFE: '🌙', SHOPPING: '🛍', TRANSPORT: '🚌', OTHER: '📍',
};

/**
 * ListingDetailPage — full-overlay detail for a catalogue listing or activity.
 *
 * Renders as a full-screen overlay on top of the current page.
 * D-pad: UP/DOWN navigates action buttons. BACK dismisses.
 * Focus: first action button on mount.
 */
export function ListingDetailPage({ item, onBack }: ListingDetailPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useDpadNavigation({
    containerRef,
    onBack,
    autoFocus: true,
    initialIndex: 0,
  });

  const name = isActivity(item) ? (item as ActivityPlace).name : (item as CatalogueListing).title;
  const description = item.description ?? null;
  const rawImageUrl = item.imageUrl ?? null;
  const imageUrl = rawImageUrl ? resolveMediaUrl(rawImageUrl) : null;
  const category = item.category ?? null;
  const icon = category ? (CATEGORY_ICONS[category] ?? '📍') : '📍';

  const address = isActivity(item) ? (item as ActivityPlace).address
    : isCatalogue(item) ? (item as CatalogueListing).address : null;
  const promoCode = isCatalogue(item) ? (item as CatalogueListing).promoCode : null;
  const promoDescription = isCatalogue(item) ? (item as CatalogueListing).promoDescription : null;
  const ctaUrl = isCatalogue(item) ? (item as CatalogueListing).ctaUrl : null;
  const phone = isActivity(item) ? (item as ActivityPlace).phone
    : isCatalogue(item) ? (item as CatalogueListing).phone : null;
  const website = isActivity(item) ? (item as ActivityPlace).website : null;
  const isSponsored = isActivity(item) ? (item as ActivityPlace).isSponsored : false;

  // Trap focus inside overlay and dismiss on Escape/Backspace (handled by useDpadNavigation)
  useEffect(() => {
    // Lock scroll on body (already locked globally, but enforce just in case)
    return () => {};
  }, []);

  return (
    /* Full-screen overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center tv-page-enter"
      style={{ background: 'hsl(var(--background) / 0.96)', backdropFilter: 'blur(12px)' }}
    >
      <div
        ref={containerRef}
        className="relative flex h-full w-full max-w-[1200px] items-start gap-[3rem] overflow-hidden"
        style={{ padding: 'calc(var(--tv-safe-x, 1.5rem) * 2)' }}
      >
        {/* Image / thumbnail */}
        <div
          className="relative shrink-0 overflow-hidden rounded-2xl bg-card"
          style={{ width: '38%', aspectRatio: '4/3' }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2">
              <span style={{ fontSize: '4em' }}>{icon}</span>
              <span className="text-muted-foreground" style={{ fontSize: '0.85em' }}>{category}</span>
            </div>
          )}
          {isSponsored && (
            <div
              className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-amber-500/90 px-3 py-1 text-white"
              style={{ fontSize: '0.75em' }}
            >
              ★ Partenaire
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className="flex min-w-0 flex-1 flex-col gap-[1.25em]">
          {/* Category label */}
          {category && (
            <span
              className="text-primary"
              style={{ fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}
            >
              {icon} {category}
            </span>
          )}

          {/* Name */}
          <h1
            className="font-bold text-foreground"
            style={{ fontSize: '2em', lineHeight: 1.15, margin: 0 }}
          >
            {name}
          </h1>

          {/* Description */}
          {description && (
            <p
              className="text-muted-foreground"
              style={{ fontSize: '1em', lineHeight: 1.6, maxWidth: '55ch' }}
            >
              {description}
            </p>
          )}

          {/* Meta info */}
          <div className="flex flex-col gap-[0.5em]">
            {address && (
              <span className="text-muted-foreground" style={{ fontSize: '0.9em' }}>
                📍 {address}
              </span>
            )}
            {phone && (
              <span className="text-muted-foreground" style={{ fontSize: '0.9em' }}>
                📞 {phone}
              </span>
            )}
            {website && (
              <span className="text-muted-foreground" style={{ fontSize: '0.9em' }}>
                🌐 {website}
              </span>
            )}
            {promoCode && (
              <div className="flex flex-col gap-1" style={{ marginTop: '0.25em' }}>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground" style={{ fontSize: '0.85em' }}>Code promo :</span>
                  <span
                    className="rounded-lg bg-green-500/20 px-3 py-1 font-mono font-bold text-green-400"
                    style={{ fontSize: '1em', letterSpacing: '0.1em' }}
                  >
                    {promoCode}
                  </span>
                </div>
                {promoDescription && (
                  <span className="text-muted-foreground" style={{ fontSize: '0.85em' }}>
                    {promoDescription}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-auto flex flex-col gap-[0.75em]" style={{ paddingTop: '1em' }}>
            {ctaUrl && (
              <button
                data-tv-focusable
                className="tv-home-btn tv-home-btn--active"
                style={{ maxWidth: '24em' }}
                onClick={() => { /* CTA URL shown on screen for user to act */ }}
              >
                <span style={{ fontSize: '1.1em' }}>🌐</span>
                <span>Visiter le site</span>
              </button>
            )}
            <button
              data-tv-focusable
              className="tv-home-btn"
              style={{ maxWidth: '24em' }}
              onClick={onBack}
            >
              <span style={{ fontSize: '1.1em' }}>←</span>
              <span>Retour</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
