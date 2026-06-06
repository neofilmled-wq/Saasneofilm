'use client';

import { useState } from 'react';
import { ClockWidget } from '@/components/common/clock-widget';

interface TopBarProps {
  partnerLogoUrl: string | null;
  welcomeMessage: string | null;
  isConnected: boolean;
  screenName: string | null;
}

/** Inline text logo — no static asset dependency, no basePath issues. */
function NeofilmWordmark() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontFamily: 'inherit',
        fontWeight: 800,
        letterSpacing: '0.05em',
        fontSize: '1.625rem',
        color: '#ffffff',
        textShadow: '0 2px 12px rgba(230, 57, 70, 0.35)',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '0.6rem',
          height: '1.5rem',
          background: 'linear-gradient(180deg, #E63946, #b71c2c)',
          borderRadius: '0.15rem',
          boxShadow: '0 0 14px rgba(230, 57, 70, 0.55)',
        }}
      />
      <span>
        NEO<span style={{ color: '#E63946' }}>FILM</span>
      </span>
    </span>
  );
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
  const [partnerLogoFailed, setPartnerLogoFailed] = useState(false);
  const showPartnerLogo = partnerLogoUrl && !partnerLogoFailed;

  return (
    <div className="neo-topbar">
      {/* Left: NEOFILM wordmark (or partner logo override) */}
      <div className="neo-logo">
        {showPartnerLogo ? (
          <img
            src={partnerLogoUrl}
            alt="Partner"
            style={{ height: '2.75rem', width: 'auto' }}
            onError={() => setPartnerLogoFailed(true)}
          />
        ) : (
          <NeofilmWordmark />
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
