'use client';

import { ClockWidget } from '@/components/common/clock-widget';
import { StatusIndicator } from '@/components/common/status-indicator';

interface TickerBarProps {
  isConnected: boolean;
  isOffline?: boolean;
  lastSyncAt?: string;
  tickerHeight?: number;
}

/**
 * Bottom ticker bar — clock, branding, connection status.
 * Height scales with TV resolution via the adaptive layout engine.
 * At 1080p: 48px. At 720p: ~32px. At 4K: ~96px.
 */
export function TickerBar({ isConnected, isOffline, lastSyncAt, tickerHeight }: TickerBarProps) {
  return (
    <div
      className="tv-glass-panel tv-glass-panel--bottom flex w-full flex-shrink-0 items-center justify-between"
      style={{
        height: tickerHeight ?? 'var(--tv-ticker-h, 48px)',
        paddingLeft: 'var(--tv-safe-x, 1.5rem)',
        paddingRight: 'var(--tv-safe-x, 1.5rem)',
      }}
    >
      <div className="flex items-center gap-[1em]">
        <ClockWidget />
        <div className="bg-border" style={{ width: '1px', height: '1.25em' }} />
        <span className="font-semibold tracking-wider" style={{ fontSize: '0.875em' }}>
          <span className="text-primary">NEO</span>FILM
        </span>
      </div>

      <div className="flex items-center gap-[1em]">
        {isOffline && (
          <span className="text-yellow-400" style={{ fontSize: '0.875em' }}>
            Mode hors-ligne
            {lastSyncAt && ` — Derniere sync: ${new Date(lastSyncAt).toLocaleTimeString('fr-FR')}`}
          </span>
        )}
        <StatusIndicator connected={isConnected} />
      </div>
    </div>
  );
}
