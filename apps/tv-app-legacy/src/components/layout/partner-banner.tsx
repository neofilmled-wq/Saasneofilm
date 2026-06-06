'use client';

import { Wifi, QrCode, Clock } from 'lucide-react';

interface PartnerBannerProps {
  partnerName: string | null;
  city: string | null;
  partnerBannerUrl?: string | null;
  wifiName?: string | null;
  checkoutTime?: string | null;
}

/**
 * Bottom banner: "Votre conciergerie · Bienvenue chez NAME" + utility pills
 * (WiFi, QR for the welcome booklet, check-out time).
 *
 * If `partnerBannerUrl` is set, we render the partner's own custom banner
 * image instead and let it span full width — that's the legacy behaviour for
 * partners who already uploaded a branded strip.
 */
export function PartnerBanner({
  partnerName,
  city,
  partnerBannerUrl,
  wifiName,
  checkoutTime,
}: PartnerBannerProps) {
  if (partnerBannerUrl) {
    return (
      <div
        className="neo-partner-banner"
        style={{ padding: 0, background: '#000', border: '1px solid var(--neo-line)' }}
      >
        <img
          src={partnerBannerUrl}
          alt="Bannière partenaire"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  const initial = partnerName ? partnerName.charAt(0).toUpperCase() : 'N';

  return (
    <div className="neo-partner-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, position: 'relative', zIndex: 1 }}>
        <div className="neo-partner-mark">{initial}</div>
        <div className="neo-partner-text">
          <div className="neo-small">Votre conciergerie</div>
          <div className="neo-big">
            <strong>Bienvenue chez nous</strong>
            {city && ` · ${city}`}
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          color: 'var(--neo-t-2)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {wifiName && (
          <div className="neo-pill">
            <Wifi size={14} /> WiFi : {wifiName}
          </div>
        )}
        <div className="neo-pill">
          <QrCode size={14} /> Scan livret d'accueil
        </div>
        {checkoutTime && (
          <div className="neo-pill">
            <Clock size={14} /> Check-out {checkoutTime}
          </div>
        )}
      </div>
    </div>
  );
}
