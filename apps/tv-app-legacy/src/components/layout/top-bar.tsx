'use client';

import { useState } from 'react';
import { ClockWidget } from '@/components/common/clock-widget';

interface TopBarProps {
  partnerLogoUrl: string | null;
  welcomeMessage: string | null;
  isConnected: boolean;
  screenName: string | null;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * NEOFILM TopBar (Netflix-grade cinematic design).
 *
 * Left: the official `neofilm-wordmark.png` (or partner logo override).
 * Right: clock, screen name, connectivity badge.
 */
export function TopBar({ partnerLogoUrl, welcomeMessage, isConnected, screenName }: TopBarProps) {
  const [partnerLogoFailed, setPartnerLogoFailed] = useState(false);
  const showPartnerLogo = partnerLogoUrl && !partnerLogoFailed;

  return (
    <div className="neo-topbar">
      <div className="neo-logo">
        {showPartnerLogo ? (
          <img
            src={partnerLogoUrl}
            alt="Partner"
            style={{ height: '2.75rem', width: 'auto' }}
            onError={() => setPartnerLogoFailed(true)}
          />
        ) : (
          <img
            src={`${BASE_PATH}/neofilm-wordmark.png`}
            alt="NEOFILM"
            style={{ height: '3rem', width: 'auto', display: 'block' }}
          />
        )}
      </div>

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
