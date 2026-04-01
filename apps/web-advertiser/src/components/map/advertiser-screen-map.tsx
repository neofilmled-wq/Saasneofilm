'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@neofilm/ui';
import { formatCurrency } from '@/lib/utils';
import { OnlineStatusDot } from '@/components/common/status-badge';
import type { MockScreen } from '@/lib/mock-data';

// ─── Custom marker icons ────────────────────────────────

function createIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="#fff"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

const ICONS = {
  online: createIcon('#22c55e'),
  offline: createIcon('#ef4444'),
  selected: createIcon('#7c3aed'),
};

// ─── FitBounds helper ──────────────────────────────────

function isValidCoord(s: MockScreen) {
  return (
    s.latitude != null &&
    s.longitude != null &&
    !(s.latitude === 0 && s.longitude === 0)
  );
}

function FitBounds({ screens }: { screens: MockScreen[] }) {
  const map = useMap();
  useEffect(() => {
    const points = screens
      .filter(isValidCoord)
      .map((s) => [s.latitude, s.longitude] as [number, number]);
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [screens, map]);
  return null;
}

// ─── FlyTo helper ───────────────────────────────────────

function FlyToHandler({ flyTo }: { flyTo: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], 12, { duration: 1.2 });
    }
  }, [flyTo, map]);
  return null;
}

// ─── Types ──────────────────────────────────────────────

export interface AdvertiserScreenMapProps {
  screens: MockScreen[];
  selectedIds: Set<string>;
  onToggle: (screen: MockScreen) => void;
  flyTo?: { lat: number; lng: number } | null;
}

// ─── Map Component ──────────────────────────────────────

export function AdvertiserScreenMap({ screens, selectedIds, onToggle, flyTo }: AdvertiserScreenMapProps) {
  // Exclude screens with no coordinates (lat/lng null or (0,0) fallback)
  const visibleScreens = useMemo(
    () => screens.filter(isValidCoord),
    [screens],
  );

  return (
    <MapContainer
      center={[46.603354, 1.888334]}
      zoom={6}
      className="h-full w-full rounded-lg"
      style={{ minHeight: '350px' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds screens={visibleScreens} />
      <FlyToHandler flyTo={flyTo ?? null} />
      {visibleScreens.map((screen) => {
        const isSelected = selectedIds.has(screen.id);
        const icon = isSelected ? ICONS.selected : screen.isOnline ? ICONS.online : ICONS.offline;

        return (
          <Marker
            key={screen.id}
            position={[screen.latitude, screen.longitude]}
            icon={icon}
            eventHandlers={{ click: () => onToggle(screen) }}
          >
            <Popup minWidth={220} maxWidth={280}>
              <div className="space-y-2 p-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">{screen.name}</h3>
                  <OnlineStatusDot isOnline={screen.isOnline} />
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <p><span className="font-medium">Ville :</span> {screen.city}</p>
                  <p><span className="font-medium">Partenaire :</span> {screen.partnerOrgName}</p>
                </div>
                <Button
                  size="sm"
                  variant={isSelected ? 'destructive' : 'default'}
                  className="h-7 w-full text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(screen);
                  }}
                >
                  {isSelected ? 'Retirer' : 'Sélectionner'}
                </Button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
