'use client';

import { useState } from 'react';
import {
  Wifi,
  Utensils,
  Clock,
  Coffee,
  QrCode,
  MapPin,
  Phone,
  Info,
  Star,
  Bed,
  Bath,
  Car,
  Dumbbell,
  Tv,
  Sparkles,
  Croissant,
  GlassWater,
  Plane,
  Ticket,
  KeyRound,
} from 'lucide-react';
import type { ComponentType } from 'react';

/** Whitelist of pill icons — IDs match the partner-facing
 *  `BanderoleSlotsEditor` so picking one there always resolves to a real
 *  component here. Unknown IDs render no icon (label-only pill). */
const ICON_MAP: Record<string, ComponentType<{ size?: number }>> = {
  wifi: Wifi,
  utensils: Utensils,
  clock: Clock,
  coffee: Coffee,
  qr: QrCode,
  mappin: MapPin,
  phone: Phone,
  info: Info,
  star: Star,
  bed: Bed,
  bath: Bath,
  car: Car,
  dumbbell: Dumbbell,
  tv: Tv,
  sparkles: Sparkles,
  croissant: Croissant,
  glass: GlassWater,
  plane: Plane,
  ticket: Ticket,
  key: KeyRound,
};

/** Map ISO country code → French label for the footer. Falls back to the
 *  raw code if unknown (keeps the UI from breaking on uncommon countries). */
const COUNTRY_LABEL: Record<string, string> = {
  FR: 'France',
  BE: 'Belgique',
  CH: 'Suisse',
  LU: 'Luxembourg',
  MC: 'Monaco',
  CA: 'Canada',
  GB: 'Royaume-Uni',
  US: 'États-Unis',
  ES: 'Espagne',
  IT: 'Italie',
  DE: 'Allemagne',
  PT: 'Portugal',
  NL: 'Pays-Bas',
  MA: 'Maroc',
  TN: 'Tunisie',
  DZ: 'Algérie',
};

function formatCountry(code: string | null): string | null {
  if (!code) return null;
  return COUNTRY_LABEL[code.toUpperCase()] ?? code;
}

interface LocationFooterProps {
  partnerName: string | null;
  city: string | null;
  country: string | null;
  /** Up to 3 pills displayed on the right side of the bandeau. Each pill
   *  has a Lucide icon (resolved via ICON_MAP) and a free-text label set
   *  by the partner in the web portal. */
  slots?: { icon: string; label: string }[];
  /** Free-text custom message set by the partner in the web portal, shown as a
   *  dedicated line under the partner name. Hidden when empty. */
  bottomMessage?: string | null;
  /** Partner logo (PartnerProfile.logoUrl). When set (and it loads), it replaces
   *  the red initial badge on the left. Falls back to the initial on load error. */
  logoUrl?: string | null;
}

/**
 * Bottom-left footer rendered in the screen shell — replaces the old
 * PartnerBanner. Keeps the same wide-strip look (badge + overline + big text)
 * but pulls real data: partner organisation name (in red) plus the screen's
 * city / country.
 *
 * Hidden entirely when no data is available, so screens that haven't filled
 * in the partner profile don't render an empty bar.
 */
export function LocationFooter({ partnerName, city, country, slots, bottomMessage, logoUrl }: LocationFooterProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const validSlots = (slots ?? [])
    .filter((s) => s && typeof s.icon === 'string' && typeof s.label === 'string' && s.label.length > 0)
    .slice(0, 3);
  const message = bottomMessage?.trim() || null;
  const logo = logoUrl?.trim() || null;
  if (!partnerName && !city && validSlots.length === 0 && !message && !logo) return null;

  const showLogo = !!logo && !logoFailed;
  const initial = (partnerName ?? 'N').charAt(0).toUpperCase();
  const countryLabel = formatCountry(country);
  // "Paris, France" / "Paris" / "France" depending on what we have.
  const locationLabel = [city, countryLabel].filter(Boolean).join(', ') || null;

  return (
    <div
      style={{
        // 4th row of the .neo-fit-stage grid (the `auto` row that used to
        // host the PartnerBanner). Full-bleed strip: spans the whole width of
        // the shell ("sur toute la longueur") instead of a boxed bottom-left
        // card. Horizontal padding uses the TV safe-area so text never touches
        // the physical bezel.
        position: 'relative',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '1.125rem',
        padding: '0.75rem var(--tv-safe-x, 3rem)',
        background:
          'linear-gradient(90deg, rgba(20, 12, 25, 0.9) 0%, rgba(40, 18, 30, 0.72) 60%, rgba(20, 12, 25, 0.6) 100%)',
        borderTop: '1px solid rgba(230, 57, 70, 0.3)',
        borderRadius: 0,
        pointerEvents: 'none',
      }}
    >
      {/* Partner logo (if set) — otherwise a red badge with the first initial */}
      {showLogo ? (
        <img
          src={logo!}
          alt={partnerName ?? 'Logo'}
          onError={() => setLogoFailed(true)}
          style={{
            height: '2.75rem',
            width: 'auto',
            maxWidth: '9rem',
            flexShrink: 0,
            objectFit: 'contain',
            borderRadius: '0.5rem',
          }}
        />
      ) : (
        <div
          style={{
            width: '2.5rem',
            height: '2.5rem',
            flexShrink: 0,
            borderRadius: '0.625rem',
            background: 'linear-gradient(135deg, #E63946 0%, #b71c2c 100%)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
            fontSize: '1.125rem',
            letterSpacing: '0.04em',
            boxShadow: '0 4px 12px rgba(230, 57, 70, 0.35)',
          }}
        >
          {initial}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, lineHeight: 1.2 }}>
        <div
          style={{
            fontSize: '0.6875rem',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.55)',
            marginBottom: '0.125rem',
          }}
        >
          Votre conciergerie
        </div>
        <div
          style={{
            fontSize: '1.0625rem',
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.92)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {partnerName && (
            <span
              style={{
                color: '#E63946',
                fontWeight: 700,
                letterSpacing: '0.01em',
              }}
            >
              {partnerName}
            </span>
          )}
          {partnerName && locationLabel && (
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', margin: '0 0.5rem' }}>·</span>
          )}
          {locationLabel && <span>{locationLabel}</span>}
        </div>
      </div>

      {/* Custom partner message — dead-centered on the whole strip (not stacked
       *  under the partner name) and larger, per partner request ("vraiment au
       *  milieu et assez grand"). Absolutely positioned so it stays centered on
       *  the bandeau regardless of the left/right block widths. pointerEvents
       *  stays off (inherited) and it never wraps. */}
      {message && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: '52%',
            textAlign: 'center',
            fontSize: '1.5rem',
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.95)',
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {message}
        </div>
      )}

      {validSlots.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            flexShrink: 0,
            color: 'rgba(255, 255, 255, 0.82)',
          }}
        >
          {validSlots.map((slot, i) => {
            const Icon = ICON_MAP[slot.icon];
            return (
              <div
                key={`${slot.icon}-${i}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4375rem 0.875rem',
                  borderRadius: '999px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.10)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                {Icon && <Icon size={14} />}
                <span>{slot.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
