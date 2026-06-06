'use client';

import { ClockWidget } from '@/components/common/clock-widget';

interface TopBarProps {
  partnerLogoUrl: string | null;
  welcomeMessage: string | null;
  isConnected: boolean;
  screenName: string | null;
}

/**
 * NEOFILM TopBar (Netflix-grade cinematic design).
 *
 * ┌───────────────────────────────────────────────────────────────┐
 * │ [NEOFILM logo]                14:32  Logement Loft·Lyon ● Online │
 * └───────────────────────────────────────────────────────────────┘
 *
 * Uses neofilm-wordmark.png on the left and shows the partner name +
 * connection status on the right. Partner logo only replaces the
 * wordmark when explicitly provided.
 */
export function TopBar({ partnerLogoUrl, welcomeMessage, isConnected, screenName }: TopBarProps) {
  return (
    <div className="neo-topbar">
      {/* Left: NEOFILM wordmark (or partner logo override) */}
      <div className="neo-logo">
        {partnerLogoUrl ? (
          <img
            src={partnerLogoUrl}
            alt="Partner"
            style={{ height: 44, width: 'auto' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/neofilm-wordmark.png`}
            alt="NEOFILM"
          />
        )}
      </div>

      {/* Right: clock + stay name + connectivity badge */}
      <div className="neo-right">
        <div className="neo-clock">
          <ClockWidget />
        </div>
        {(screenName || welcomeMessage) && (
          <div className="neo-stay">
            <span className="neo-label">Logement</span>
            <span className="neo-name">{screenName || welcomeMessage}</span>
          </div>
        )}
        <div className="neo-status">
          <span
            className="neo-dot"
            style={!isConnected ? { background: '#ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.22), 0 0 12px rgba(239,68,68,0.8)' } : undefined}
          />
          {isConnected ? 'Online' : 'Offline'}
        </div>
      </div>
    </div>
  );
}
