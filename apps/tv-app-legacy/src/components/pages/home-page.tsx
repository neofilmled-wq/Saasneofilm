'use client';

import { useEffect, useRef } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';

export type HomeDestination = 'TNT' | 'ACTIVITIES' | 'STREAMING' | 'APPS';

interface HomePageProps {
  onNavigate: (dest: HomeDestination) => void;
  enabledModules: string[];
}

/** Card config — each has a background image, gradient overlay, and accent */
const NAV_CARDS: {
  key: HomeDestination;
  label: string;
  sublabel: string;
  module?: string;
  imageUrl: string;
  overlayGradient: string;
  accentColor: string;
}[] = [
  {
    key: 'TNT',
    label: 'TV en Direct',
    sublabel: 'TNT · IPTV · Chaines en direct',
    module: 'TNT',
    imageUrl: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600&h=400&fit=crop&q=80',
    overlayGradient: 'linear-gradient(135deg, rgba(37, 99, 235, 0.7) 0%, rgba(30, 30, 80, 0.85) 100%)',
    accentColor: 'rgba(59, 130, 246, 0.5)',
  },
  {
    key: 'ACTIVITIES',
    label: 'Bonnes Adresses',
    sublabel: 'Restaurants · Spa · Shopping · Loisirs',
    module: 'ACTIVITIES',
    imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop&q=80',
    overlayGradient: 'linear-gradient(135deg, rgba(234, 88, 12, 0.65) 0%, rgba(30, 30, 80, 0.85) 100%)',
    accentColor: 'rgba(234, 88, 12, 0.45)',
  },
  {
    key: 'STREAMING',
    label: 'Streaming',
    sublabel: 'Netflix · YouTube · Prime · Disney+',
    module: 'STREAMING',
    imageUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=400&fit=crop&q=80',
    overlayGradient: 'linear-gradient(135deg, rgba(124, 58, 237, 0.65) 0%, rgba(20, 20, 60, 0.85) 100%)',
    accentColor: 'rgba(124, 58, 237, 0.4)',
  },
  {
    key: 'APPS',
    label: 'Applications',
    sublabel: 'Gerer vos applications',
    imageUrl: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=600&h=400&fit=crop&q=80',
    overlayGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.65) 0%, rgba(30, 30, 80, 0.85) 100%)',
    accentColor: 'rgba(16, 185, 129, 0.45)',
  },
];

/**
 * HomePage — TV entry point.
 *
 * Full width: 2x2 grid of visual cards with real photos + gradient overlays.
 * Ad rendering is handled by the global AdZone in smart-tv-display.
 * Focus: first card on mount.
 */
export function HomePage({ onNavigate, enabledModules }: HomePageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { focusFirst } = useDpadNavigation({ containerRef, autoFocus: true, initialIndex: 0 });

  useEffect(() => {
    const t = setTimeout(focusFirst, 120);
    return () => clearTimeout(t);
  }, [focusFirst]);

  const visible = NAV_CARDS.filter((c) => !c.module || enabledModules.includes(c.module));

  return (
    <div
      ref={containerRef}
      className="flex h-full overflow-hidden tv-page-enter"
      style={{ padding: '1.5vw', gap: '1.2vw' }}
    >
      {/* Card grid — fills the page (ad zone is global in smart-tv-display) */}
      <div
        data-tv-nav-group="home-cards"
        className="grid min-w-0"
        style={{
          flex: 1,
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: `repeat(${Math.ceil(visible.length / 2)}, 1fr)`,
          gap: '1vw',
          alignContent: 'stretch',
        }}
      >
        {visible.map((card, cardIdx) => (
          <button
            key={card.key}
            data-tv-focusable
            data-tv-row={1 + Math.floor(cardIdx / 2)}
            data-tv-col={cardIdx % 2}
            className="tv-card group relative overflow-hidden"
            onClick={() => onNavigate(card.key)}
            style={{
              background: 'transparent',
              border: `1px solid rgba(255, 255, 255, 0.15)`,
              borderRadius: '1.25rem',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
            }}
          >
            {/* Background image */}
            <img
              src={card.imageUrl}
              alt=""
              style={{
                position: 'absolute',
                top: 0, right: 0, bottom: 0, left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '1.25rem',
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />

            {/* Gradient overlay for text readability */}
            <div
              style={{
                position: 'absolute',
                top: 0, right: 0, bottom: 0, left: 0,
                background: card.overlayGradient,
                borderRadius: '1.25rem',
              }}
            />

            {/* Accent glow — top right corner */}
            <div
              style={{
                position: 'absolute',
                top: '-20%',
                right: '-15%',
                width: '60%',
                height: '70%',
                background: `radial-gradient(ellipse, ${card.accentColor} 0%, transparent 70%)`,
                filter: 'blur(30px)',
                pointerEvents: 'none',
              }}
            />

            {/* Text content — bottom left */}
            <div style={{ position: 'relative', zIndex: 2, padding: '1.5vw', width: '100%' }}>
              <div
                className="font-bold text-white"
                style={{
                  fontSize: '1.2em',
                  lineHeight: 1.2,
                  marginBottom: '0.25em',
                  textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                {card.label}
              </div>
              <div
                style={{
                  fontSize: '0.75em',
                  color: 'rgba(255,255,255,0.7)',
                  textShadow: '0 1px 4px rgba(0,0,0,0.4)',
                }}
              >
                {card.sublabel}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Ad zone is now rendered ONCE at the smart-tv-display level, shared
          across all tabs — see smart-tv-display.tsx. */}
    </div>
  );
}
