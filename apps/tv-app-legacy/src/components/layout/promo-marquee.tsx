'use client';

import { useMemo } from 'react';
import type { CatalogueListing } from '@/lib/device-api';

interface PromoMarqueeProps {
  catalogue: CatalogueListing[];
  /** Pixels per second scroll speed. Lower = slower. Default 20. */
  speedPxPerSec?: number;
}

/**
 * Infinite vertical marquee for partner promo codes.
 * Shuffles the list once on mount, duplicates it, and scrolls upward infinitely.
 * When the first copy has fully scrolled off, the animation seamlessly restarts.
 */
export function PromoMarquee({ catalogue, speedPxPerSec = 20 }: PromoMarqueeProps) {
  const promos = useMemo(() => {
    const withPromo = catalogue.filter((c) => c.promoCode && c.promoCode.trim() !== '');
    // Fisher–Yates shuffle
    const shuffled = [...withPromo];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [catalogue]);

  if (promos.length === 0) {
    return null;
  }

  // Approx card height (px) — used to compute animation duration.
  // Keeps scroll speed stable regardless of list length.
  const approxItemPx = 90;
  const durationSec = (promos.length * approxItemPx) / speedPxPerSec;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <style>{`
        @keyframes promoMarquee {
          from { transform: translateY(0); }
          to   { transform: translateY(-50%); }
        }
      `}</style>
      <div
        className="flex flex-col gap-[0.4em]"
        style={{
          animation: `promoMarquee ${durationSec}s linear infinite`,
          willChange: 'transform',
        }}
      >
        {[...promos, ...promos].map((c, i) => (
          <div
            key={`${c.id}-${i}`}
            className="flex items-center gap-[0.7em] rounded-lg border border-primary/20 bg-primary/5 px-[0.9em] py-[0.6em]"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-foreground" style={{ fontSize: '1.1em' }}>
                {c.title}
              </div>
              {c.address && (
                <div className="truncate text-muted-foreground" style={{ fontSize: '0.85em' }}>
                  {c.address}
                </div>
              )}
              {c.promoDescription && (
                <div className="truncate text-muted-foreground/80" style={{ fontSize: '0.85em' }}>
                  {c.promoDescription}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-[0.4em]">
              <span className="text-muted-foreground" style={{ fontSize: '0.8em' }}>
                Code promo :
              </span>
              <span
                className="rounded bg-green-500/20 px-[0.7em] py-[0.3em] font-mono font-bold text-green-400"
                style={{ fontSize: '0.95em' }}
              >
                {c.promoCode}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
