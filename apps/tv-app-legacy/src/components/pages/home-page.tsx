'use client';

import { useEffect, useRef } from 'react';
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

interface TileConfig {
  id: HomeDestination;
  title: string;
  subtitle: string;
  tags: string[];
  bgClass: string;
  art: 'tv' | 'streaming' | 'bonnes' | 'activites' | 'apps' | 'concierge';
  module?: string;
  hasLive?: boolean;
}

/**
 * Decorative SVG art for each home tile — pure SVG (no images = no network /
 * no Android WebView caching issues).
 */
function TileArt({ kind }: { kind: TileConfig['art'] }) {
  switch (kind) {
    case 'tv':
      return (
        <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMin slice" style={{ width: '100%', height: '100%' }}>
          <g opacity="0.18" fill="none" stroke="#fff" strokeWidth="1.5">
            <circle cx="350" cy="50" r="40" />
            <circle cx="350" cy="50" r="80" />
            <circle cx="350" cy="50" r="120" />
            <circle cx="350" cy="50" r="160" />
          </g>
          <g transform="translate(220, 30)" opacity="0.9">
            <rect x="0" y="0" width="120" height="80" rx="6" fill="rgba(0,0,0,0.35)" stroke="#fff" strokeWidth="2" strokeOpacity="0.6" />
            <rect x="50" y="86" width="20" height="14" fill="rgba(0,0,0,0.35)" />
            <rect x="30" y="100" width="60" height="4" rx="2" fill="#fff" fillOpacity="0.6" />
            <circle cx="10" cy="-8" r="6" fill="#E63946" />
          </g>
        </svg>
      );
    case 'streaming':
      return (
        <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMin slice" style={{ width: '100%', height: '100%' }}>
          <g opacity="0.9">
            <g transform="translate(250, 30) rotate(-12)">
              <rect width="100" height="60" rx="10" fill="#1f1f1f" stroke="#fff" strokeOpacity="0.3" />
              <polygon points="40,18 40,42 62,30" fill="#fff" />
            </g>
            <g transform="translate(220, 80) rotate(4)">
              <rect width="100" height="60" rx="10" fill="#7c2d12" stroke="#fff" strokeOpacity="0.3" />
              <polygon points="40,18 40,42 62,30" fill="#fff" />
            </g>
            <g transform="translate(255, 130) rotate(-3)">
              <rect width="100" height="60" rx="10" fill="#1e3a8a" stroke="#fff" strokeOpacity="0.3" />
              <polygon points="40,18 40,42 62,30" fill="#fff" />
            </g>
          </g>
        </svg>
      );
    case 'bonnes':
      return (
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMin slice" style={{ width: '100%', height: '100%' }}>
          <g opacity="0.8" transform="translate(250, 30)">
            <circle cx="60" cy="60" r="46" fill="none" stroke="#fff" strokeWidth="2" strokeOpacity="0.5" />
            <circle cx="60" cy="60" r="32" fill="none" stroke="#fff" strokeWidth="1" strokeOpacity="0.4" />
            <g stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.7">
              <line x1="20" y1="20" x2="20" y2="55" />
              <line x1="14" y1="20" x2="14" y2="40" />
              <line x1="26" y1="20" x2="26" y2="40" />
              <line x1="20" y1="55" x2="20" y2="100" />
            </g>
            <g stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.7">
              <line x1="100" y1="20" x2="100" y2="100" />
              <path d="M 100 20 Q 110 35 100 55" fill="none" />
            </g>
          </g>
        </svg>
      );
    case 'activites':
      return (
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMin slice" style={{ width: '100%', height: '100%' }}>
          <g opacity="0.7" transform="translate(240, 40)">
            <circle cx="50" cy="40" r="22" fill="#fde047" opacity="0.6" />
            <path d="M 0 130 L 50 60 L 90 110 L 130 70 L 170 130 Z" fill="#fff" fillOpacity="0.3" stroke="#fff" strokeWidth="1.5" strokeOpacity="0.6" />
            <path d="M 50 60 L 60 80 L 40 80 Z" fill="#fff" fillOpacity="0.7" />
          </g>
        </svg>
      );
    case 'apps':
      return (
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMin slice" style={{ width: '100%', height: '100%' }}>
          <g opacity="0.85" transform="translate(240, 40)">
            {[0, 1, 2].map((i) =>
              [0, 1, 2].map((j) => (
                <rect
                  key={`${i}-${j}`}
                  x={i * 40}
                  y={j * 40}
                  width="30"
                  height="30"
                  rx="6"
                  fill="#fff"
                  fillOpacity={0.15 + ((i + j) % 3) * 0.15}
                />
              )),
            )}
          </g>
        </svg>
      );
    case 'concierge':
      return (
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMin slice" style={{ width: '100%', height: '100%' }}>
          <g opacity="0.75" transform="translate(260, 40)">
            <path d="M 60 30 L 65 50 L 85 55 L 65 60 L 60 80 L 55 60 L 35 55 L 55 50 Z" fill="#fff" fillOpacity="0.85" />
            <path d="M 100 100 L 103 110 L 113 113 L 103 116 L 100 126 L 97 116 L 87 113 L 97 110 Z" fill="#fff" fillOpacity="0.65" />
            <path d="M 30 110 L 32 118 L 40 120 L 32 122 L 30 130 L 28 122 L 20 120 L 28 118 Z" fill="#fff" fillOpacity="0.5" />
          </g>
        </svg>
      );
    default:
      return null;
  }
}

/**
 * HomePage — entry point of the TV app.
 *
 * 6 tiles in a 2x3 (or 3x2 depending on layout) grid, each with chromatic
 * background, decorative SVG art, gradient overlay and a focus state with
 * red glow. The ad sidebar is rendered alongside by the parent
 * smart-tv-display, so this component only owns the left column.
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

  const allTiles: TileConfig[] = [
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
    {
      id: 'CONCIERGE',
      title: 'Recommandations',
      subtitle: 'Sélection du concierge — pour vous',
      tags: ['Nouveau'],
      bgClass: 'neo-bg-concierge',
      art: 'concierge',
    },
  ];

  const tiles = allTiles.filter((t) => !t.module || enabledModules.includes(t.module));

  return (
    <div
      ref={containerRef}
      data-tv-nav-group="home-tiles"
      className="tv-page-enter neo-stage"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
        gap: 'var(--neo-gap, 28px)',
        padding: '28px 0 12px',
        height: '100%',
        width: '100%',
      }}
    >
      {tiles.map((tile, idx) => (
        <button
          key={tile.id}
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
      ))}
    </div>
  );
}
