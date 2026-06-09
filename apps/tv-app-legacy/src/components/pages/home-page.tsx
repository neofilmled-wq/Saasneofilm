'use client';

import { useEffect, useRef, memo } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';

export type HomeDestination = 'TNT' | 'ACTIVITIES' | 'STREAMING' | 'APPS' | 'ADDRESSES' | 'CONCIERGE';

interface HomePageProps {
  onNavigate: (dest: HomeDestination) => void;
  enabledModules: string[];
  channelCount?: number;
  streamingCount?: number;
  activitiesCount?: number;
  addressesCount?: number;
}

export interface TileConfig {
  id: HomeDestination;
  title: string;
  subtitle: string;
  tags: string[];
  bgClass: string;
  art: 'tv' | 'streaming' | 'bonnes' | 'activites' | 'apps' | 'concierge';
  module?: string;
  hasLive?: boolean;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Decorative art for each home tile.
 *
 * Switched from inline JSX SVG to pre-rasterized WebP (`public/tile-art/`).
 * On the Fire Stick HD's Mali GPU, the inline SVGs (15-20 paths × 6 tiles)
 * forced a fresh raster every focus repaint and every React re-render. The
 * WebP variant is decoded once at boot, cached, and just blitted by the
 * compositor — same look, far cheaper per frame. */
export function TileArt({ kind }: { kind: TileConfig['art'] }) {
  return (
    <img
      src={`${BASE_PATH}/tile-art/${kind}.webp`}
      alt=""
      aria-hidden
      draggable={false}
      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
    />
  );
}

/** A single home tile button — extracted so smart-tv-display can lay tiles out
 * inside a custom grid (HOME tab spans the annonce across cell 6).
 *
 * Memoized: tiles re-render on every parent state change otherwise (heartbeat
 * tick, screen status WebSocket event, ad rotation, etc.). The SVG art +
 * gradient bg are cheap individually but rebuilding the React vdom for 6
 * tiles 30+ times a minute is visible on the Fire Stick HD. */
export const HomeTileCard = memo(function HomeTileCard({
  tile,
  idx,
  onNavigate,
  style,
}: {
  tile: TileConfig;
  idx: number;
  /** Stable callback. We pass `tile.id` here so the parent doesn't need to
   * recreate a per-tile arrow function on every render — which would have
   * broken React.memo's referential equality check on `onClick`. */
  onNavigate: (dest: HomeDestination) => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      data-tv-focusable
      data-tv-row={1 + Math.floor(idx / 3)}
      data-tv-col={idx % 3}
      onClick={() => onNavigate(tile.id)}
      className={`neo-tile ${tile.bgClass}`}
      style={{
        appearance: 'none',
        cursor: 'pointer',
        color: 'inherit',
        textAlign: 'left',
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {tile.hasLive && (
        <div className="neo-ribbon">
          <span className="neo-live-dot" /> En direct
        </div>
      )}
      <div className="neo-tile-art">
        <TileArt kind={tile.art} />
      </div>
      <div className="neo-tile-overlay" />
      <div className="neo-tile-content">
        <div className="neo-tile-title">{tile.title}</div>
        <div className="neo-tile-subtitle">{tile.subtitle}</div>
        <div className="neo-tile-tags">
          {tile.tags.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>
    </button>
  );
});

export function buildHomeTiles({
  channelCount,
  streamingCount,
  activitiesCount,
  addressesCount,
}: {
  channelCount?: number;
  streamingCount?: number;
  activitiesCount?: number;
  addressesCount?: number;
}): TileConfig[] {
  return [
    {
      id: 'TNT',
      title: 'TV en Direct',
      subtitle: 'TNT · Chaînes en direct',
      tags: channelCount ? [`${channelCount} chaînes`, 'HD'] : ['Direct', 'HD'],
      bgClass: 'neo-bg-tv',
      art: 'tv',
      module: 'TNT',
      hasLive: true,
    },
    {
      id: 'STREAMING',
      title: 'Streaming',
      subtitle: 'Netflix · Prime · Disney+ · YouTube',
      tags: streamingCount ? [`${streamingCount} apps`] : ['Multi-comptes'],
      bgClass: 'neo-bg-streaming',
      art: 'streaming',
      module: 'STREAMING',
    },
    {
      id: 'ADDRESSES',
      title: 'Bonnes Adresses',
      subtitle: 'Restaurants · Spa · Shopping · Café',
      tags: addressesCount ? [`${addressesCount} partenaires`] : ['Sélection locale'],
      bgClass: 'neo-bg-bonnes',
      art: 'bonnes',
      module: 'ACTIVITIES',
    },
    {
      id: 'ACTIVITIES',
      title: 'Activités',
      subtitle: 'Tours · Loisirs · Visites',
      tags: activitiesCount ? [`${activitiesCount} idées`] : ['Cette semaine'],
      bgClass: 'neo-bg-activites',
      art: 'activites',
      module: 'ACTIVITIES',
    },
    {
      id: 'APPS',
      title: 'Applications',
      subtitle: 'Gérez vos applications',
      tags: ['Installées'],
      bgClass: 'neo-bg-apps',
      art: 'apps',
    },
  ];
}

/**
 * Legacy standalone HomePage — kept for backward compatibility.
 * Smart-tv-display now renders HOME via its own custom grid so the annonce
 * panel can span across the empty 6th cell + the sidebar bottom.
 */
export function HomePage({
  onNavigate,
  enabledModules,
  channelCount,
  streamingCount,
  activitiesCount,
  addressesCount,
}: HomePageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { focusFirst } = useDpadNavigation({ containerRef, autoFocus: true, initialIndex: 0 });

  useEffect(() => {
    const t = setTimeout(focusFirst, 120);
    return () => clearTimeout(t);
  }, [focusFirst]);

  const allTiles = buildHomeTiles({
    channelCount,
    streamingCount,
    activitiesCount,
    addressesCount,
  });
  const tiles = allTiles.filter((t) => !t.module || enabledModules.includes(t.module));

  return (
    <div
      ref={containerRef}
      data-tv-nav-group="home-tiles"
      className="tv-page-enter"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
        gap: 'var(--neo-gap)',
        padding: '1.75rem 0 0.75rem',
        height: '100%',
        width: '100%',
      }}
    >
      {tiles.map((tile, idx) => (
        <HomeTileCard key={tile.id} tile={tile} idx={idx} onClick={() => onNavigate(tile.id)} />
      ))}
    </div>
  );
}
