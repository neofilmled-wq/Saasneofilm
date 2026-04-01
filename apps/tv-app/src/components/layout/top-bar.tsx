'use client';

import { ClockWidget } from '@/components/common/clock-widget';
import { StatusIndicator } from '@/components/common/status-indicator';

interface TopBarProps {
  partnerLogoUrl: string | null;
  welcomeMessage: string | null;
  isConnected: boolean;
  screenName: string | null;
}

/**
 * Top bar for Smart TV shell.
 * ┌─────────────────────────────────────────────────┐
 * │ [LOGO]  Bienvenue...   │  14:32  ● Connecte     │
 * └─────────────────────────────────────────────────┘
 */
export function TopBar({ partnerLogoUrl, welcomeMessage, isConnected, screenName }: TopBarProps) {
  return (
    <div
      className="tv-glass-panel flex w-full shrink-0 items-center justify-between"
      style={{
        height: 'var(--tv-topbar-h, 64px)',
        paddingLeft: 'var(--tv-safe-x, 1.5rem)',
        paddingRight: 'var(--tv-safe-x, 1.5rem)',
      }}
    >
      {/* Left: logo + welcome message */}
      <div className="flex items-center gap-[1em]">
        {partnerLogoUrl ? (
          <img
            src={partnerLogoUrl}
            alt="Partner"
            className="h-[2em] w-auto object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span className="font-bold tracking-wider" style={{ fontSize: '1.25em' }}>
            <span className="text-primary">NEO</span>FILM
          </span>
        )}
        {welcomeMessage && (
          <>
            <div className="bg-border" style={{ width: '1px', height: '1.5em' }} />
            <span className="text-muted-foreground" style={{ fontSize: '0.9em' }}>
              {welcomeMessage}
            </span>
          </>
        )}
      </div>

      {/* Right: screen name + clock + status */}
      <div className="flex items-center gap-[1em]">
        {screenName && (
          <span className="text-muted-foreground" style={{ fontSize: '0.8em' }}>
            {screenName}
          </span>
        )}
        <div className="bg-border" style={{ width: '1px', height: '1.25em' }} />
        <ClockWidget />
        <StatusIndicator connected={isConnected} />
      </div>
    </div>
  );
}
