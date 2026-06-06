'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';
import { useAdInterval } from '@/hooks/use-ad-interval';
import type { TvChannel } from '@/lib/device-api';

interface TntPageProps {
  channels: TvChannel[];
  onChannelOpen?: (channel: DisplayChannel) => void;
}

interface DisplayChannel {
  id: string;
  number: number;
  name: string;
  logoUrl: string | null;
  streamUrl: string | null;
  color?: string;
  isLive: boolean;
}

// Default per-channel accents when the partner didn't upload a logo.
const CHANNEL_PALETTE = [
  '#1c4cb8',
  '#cc1818',
  '#0e7490',
  '#1e293b',
  '#7c3aed',
  '#e11d48',
  '#0a0a0a',
  '#1d4ed8',
  '#15803d',
  '#1e293b',
  '#be185d',
  '#dc2626',
  '#0369a1',
  '#9333ea',
  '#b91c1c',
];

export function TntPage({ channels: dbChannels, onChannelOpen }: TntPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDpadNavigation({ containerRef, autoFocus: true, initialIndex: 0 });

  const { startInterval, stopInterval } = useAdInterval();

  const displayChannels = useMemo<DisplayChannel[]>(
    () =>
      dbChannels
        .filter((ch) => !!ch.streamUrl)
        .map((ch, i) => ({
          id: ch.id,
          number: ch.number,
          name: ch.name,
          logoUrl: ch.logoUrl,
          streamUrl: ch.streamUrl,
          color: CHANNEL_PALETTE[i % CHANNEL_PALETTE.length],
          isLive: true,
        }))
        .sort((a, b) => a.number - b.number),
    [dbChannels],
  );

  useEffect(() => () => stopInterval(), [stopInterval]);

  return (
    <div className="neo-subscreen-main" style={{ height: '100%' }}>
      <div className="neo-sub-head">
        <div>
          <div className="neo-crumb">Accueil › TV / TNT</div>
          <h1>Chaînes en direct</h1>
        </div>
        <div className="neo-count">
          {displayChannels.length === 0
            ? 'Aucune chaîne disponible'
            : `${displayChannels.length} chaînes disponibles`}
        </div>
      </div>

      {displayChannels.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 12,
          }}
        >
          <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--neo-t-1)' }}>
            Aucun lien M3U8/HLS fourni.
          </p>
          <p style={{ fontSize: '0.9rem', maxWidth: '36em', color: 'var(--neo-t-3)' }}>
            Veuillez fournir votre lien M3U8 pour avoir accès à cette partie.
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          data-tv-nav-group="tnt-channels"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 14,
            padding: 4,
            overflow: 'auto',
          }}
        >
          {displayChannels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => {
                startInterval();
                onChannelOpen?.(ch);
              }}
              data-tv-focusable
              className="neo-channel"
              style={{
                appearance: 'none',
                color: 'inherit',
                fontFamily: 'inherit',
                cursor: 'pointer',
                background: `linear-gradient(160deg, ${ch.color}, ${ch.color}33)`,
              }}
            >
              <span className="neo-ch-num">CH {String(ch.number).padStart(2, '0')}</span>
              {ch.logoUrl ? (
                <img
                  src={ch.logoUrl}
                  alt={ch.name}
                  style={{ height: 40, width: 'auto', objectFit: 'contain' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="neo-ch-logo">{ch.name}</div>
              )}
              <div className="neo-ch-now">En direct</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
