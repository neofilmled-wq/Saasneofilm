'use client';

import { useEffect, useRef } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';
import type { TvAdItem, CreativeManifest } from '@/lib/device-api';
import { resolveMediaUrl } from '@/lib/device-api';

export type HomeDestination = 'TNT' | 'ACTIVITIES' | 'STREAMING' | 'APPS';

interface HomePageProps {
  onNavigate: (dest: HomeDestination) => void;
  enabledModules: string[];
  targetedAds?: TvAdItem[];
  houseAds?: CreativeManifest[];
  rotationMs?: number;
  onImpression?: (ad: TvAdItem, startTime: Date, endTime: Date, skipped: boolean) => void;
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

type AdEntry = { id: string; fileUrl: string; mimeType: string; source?: TvAdItem };

/** Single rotating ad slot — staggered start via slotIndex */
function HomeAdSlot({ ads, slotIndex, rotationMs = 15000, onImpression }: {
  ads: AdEntry[];
  slotIndex: number;
  rotationMs?: number;
  onImpression?: (ad: TvAdItem, startTime: Date, endTime: Date, skipped: boolean) => void;
}) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const idxRef = useRef((slotIndex * 2) % Math.max(ads.length, 1));
  const startTimeRef = useRef(new Date());

  useEffect(() => {
    if (ads.length === 0) return;
    const show = (idx: number) => {
      const ad = ads[idx % ads.length];
      if (!ad) return;
      // Report impression for the previous ad
      const prevIdx = (idx - 1 + ads.length) % ads.length;
      const prevAd = ads[prevIdx];
      if (prevAd?.source && onImpression) {
        onImpression(prevAd.source, startTimeRef.current, new Date(), false);
      }
      startTimeRef.current = new Date();
      if (vidRef.current) { vidRef.current.src = ad.fileUrl; }
    };
    show(idxRef.current);
    const t = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % ads.length;
      show(idxRef.current);
    }, rotationMs);
    return () => clearInterval(t);
  }, [ads, rotationMs, onImpression]);

  const first = ads[idxRef.current % Math.max(ads.length, 1)] ?? null;

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)' }}>
      {first ? (
        <video
          ref={vidRef}
          src={first.fileUrl}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          playsInline
          loop
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1">
          <span className="font-bold text-primary" style={{ fontSize: '1.4em' }}>NEO</span>
          <span className="font-bold" style={{ fontSize: '1.4em' }}>FILM</span>
          <span className="text-muted-foreground" style={{ fontSize: '0.7em' }}>Espace pub</span>
        </div>
      )}
    </div>
  );
}

/**
 * HomePage — TV entry point.
 *
 * Left (70%): 2x2 grid of visual cards with real photos + gradient overlays.
 * Right (30%): 3 vertical ad slots, non-skippable, rotating continuously.
 * Focus: first card on mount.
 */
export function HomePage({
  onNavigate,
  enabledModules,
  targetedAds = [],
  houseAds = [],
  rotationMs = 15000,
  onImpression,
}: HomePageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { focusFirst } = useDpadNavigation({ containerRef, autoFocus: true, initialIndex: 0 });

  useEffect(() => {
    const t = setTimeout(focusFirst, 120);
    return () => clearTimeout(t);
  }, [focusFirst]);

  const adPool: AdEntry[] = [
    ...targetedAds
      .filter((a) => a.mimeType.startsWith('video/'))
      .map((a) => ({ id: a.creativeId, fileUrl: resolveMediaUrl(a.fileUrl), mimeType: a.mimeType, source: a })),
    ...houseAds
      .filter((a) => a.mimeType.startsWith('video/'))
      .map((a) => ({ id: a.creativeId, fileUrl: resolveMediaUrl(a.fileUrl), mimeType: a.mimeType })),
  ];

  const visible = NAV_CARDS.filter((c) => !c.module || enabledModules.includes(c.module));

  return (
    <div
      ref={containerRef}
      className="flex h-full overflow-hidden tv-page-enter"
      style={{ padding: '1.5vw', gap: '1.2vw' }}
    >
      {/* LEFT: visual card grid — 2x2 on 1080p+, 2x2 compact on 720p */}
      <div
        className="grid min-w-0"
        style={{
          flex: 7,
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: `repeat(${Math.ceil(visible.length / 2)}, 1fr)`,
          gap: '1vw',
          alignContent: 'stretch',
        }}
      >
        {visible.map((card) => (
          <button
            key={card.key}
            data-tv-focusable
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
                inset: 0,
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
                inset: 0,
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

      {/* RIGHT: ad slots — responsive sizing */}
      <div className="flex shrink-0 flex-col" style={{ flex: 3, minWidth: 0, gap: '0.8vh' }}>
        <p
          className="shrink-0 text-muted-foreground"
          style={{ fontSize: '0.7em', textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          Nos partenaires
        </p>
        {[0, 1, 2].map((slotIdx) => {
          // Each slot gets a distinct ad — slot 0 gets ad 0, slot 1 gets ad 1, etc.
          const slotAds = adPool.length > slotIdx ? [adPool[slotIdx]] : [];
          return (
            <HomeAdSlot
              key={slotIdx}
              ads={slotAds}
              slotIndex={0}
              rotationMs={rotationMs}
              onImpression={onImpression}
            />
          );
        })}
      </div>
    </div>
  );
}
