'use client';

import { useEffect, useRef } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';
import { useAdInterval } from '@/hooks/use-ad-interval';
import type { TvChannel } from '@/lib/device-api';

interface TntPageProps {
  /** DB channels — streamUrl must be provided by the partner */
  channels: TvChannel[];
  /** Called when user opens an HLS channel — parent renders the full-screen player */
  onChannelOpen?: (channel: DisplayChannel) => void;
}


/** Unified channel type for display */
interface DisplayChannel {
  id: string;
  number: number;
  name: string;
  logoUrl: string | null;
  streamUrl: string | null;
  isLive: boolean;
}

/**
 * TNT page.
 *
 * Channels come exclusively from the DB (TvChannel model). The partner is
 * responsible for providing their own M3U8 stream URL per channel — the
 * platform no longer ships any hardcoded playlist or IPTV fallback.
 */
export function TntPage({ channels: dbChannels, onChannelOpen }: TntPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDpadNavigation({ containerRef, autoFocus: true, initialIndex: 0 });

  const { startInterval, stopInterval } = useAdInterval();

  // Only show channels with a streamUrl, sorted by TNT channel number (1, 2, 3…).
  const displayChannels: DisplayChannel[] = dbChannels
    .filter((ch) => !!ch.streamUrl)
    .map((ch) => ({
      id: ch.id,
      number: ch.number,
      name: ch.name,
      logoUrl: ch.logoUrl,
      streamUrl: ch.streamUrl,
      isLive: true,
    }))
    .sort((a, b) => a.number - b.number);

  // Stop ad interval when unmounted
  useEffect(() => {
    return () => stopInterval();
  }, [stopInterval]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div ref={containerRef} className="flex-1 overflow-y-auto" style={{ padding: 'var(--tv-safe-x, 1.5rem)' }}>
        {displayChannels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-[0.5em] text-center">
            <p className="text-foreground" style={{ fontSize: '1.25em', fontWeight: 600 }}>
              Aucun lien M3U8/HLS fourni.
            </p>
            <p className="text-muted-foreground" style={{ fontSize: '0.9em', maxWidth: '36em' }}>
              Veuillez fournir votre lien M3U8 pour avoir accès à cette partie.
            </p>
          </div>
        ) : (
          <div
            className="grid gap-[0.75em]"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
          >
            {displayChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  startInterval();
                  onChannelOpen?.(ch);
                }}
                data-tv-focusable
                className="tv-card tv-card--channel flex flex-col items-center justify-center"
                style={{ padding: '0.75em', aspectRatio: '4/3' }}
              >
                {ch.logoUrl ? (
                  <img
                    src={ch.logoUrl}
                    alt={ch.name}
                    className="mb-[0.25em] h-[2.5em] w-auto object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div
                    className="mb-[0.25em] flex items-center justify-center rounded-lg font-bold text-primary"
                    style={{ width: '2.5em', height: '2.5em', fontSize: '1em', background: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.25)' }}
                  >
                    {ch.name.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <span
                  className="max-w-full truncate text-center font-medium text-foreground"
                  style={{ fontSize: '0.75em' }}
                >
                  {ch.number}. {ch.name}
                </span>
                <span className="flex items-center gap-[0.2em] text-green-400" style={{ fontSize: '0.6em' }}>
                  <span className="inline-block h-[0.5em] w-[0.5em] rounded-full bg-green-400" />
                  En direct
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
