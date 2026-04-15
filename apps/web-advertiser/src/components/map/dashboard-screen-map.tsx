'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function createIcon(color: string, size = 24) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${size * 1.5}">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="#fff"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size, size * 1.5],
    iconAnchor: [size / 2, size * 1.5],
    popupAnchor: [0, -size * 1.5],
  });
}

const ICONS = {
  targeted: createIcon('#f97316', 28),   // orange — targeted by this advertiser
  other: createIcon('#94a3b8', 20),       // gray — other screens
};

interface DashboardScreen {
  id: string;
  name: string;
  city?: string | null;
  latitude: number | null;
  longitude: number | null;
}

function isValidCoord(s: DashboardScreen) {
  return (
    s.latitude != null &&
    s.longitude != null &&
    !(s.latitude === 0 && s.longitude === 0)
  );
}

function FitBounds({ screens }: { screens: DashboardScreen[] }) {
  const map = useMap();
  useEffect(() => {
    const points = screens
      .filter(isValidCoord)
      .map((s) => [s.latitude as number, s.longitude as number] as [number, number]);
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
  }, [screens, map]);
  return null;
}

export interface DashboardScreenMapProps {
  screens: DashboardScreen[];
  highlightedIds: Set<string>;
}

export function DashboardScreenMap({ screens, highlightedIds }: DashboardScreenMapProps) {
  const visibleScreens = useMemo(() => screens.filter(isValidCoord), [screens]);
  // Prioritize targeted screens for fitBounds if any exist
  const fitTarget = useMemo(() => {
    const targeted = visibleScreens.filter((s) => highlightedIds.has(s.id));
    return targeted.length > 0 ? targeted : visibleScreens;
  }, [visibleScreens, highlightedIds]);

  return (
    <MapContainer
      center={[46.603354, 1.888334]}
      zoom={6}
      className="h-full w-full"
      style={{ minHeight: '300px' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds screens={fitTarget} />
      {visibleScreens.map((screen) => {
        const isTargeted = highlightedIds.has(screen.id);
        return (
          <Marker
            key={screen.id}
            position={[screen.latitude as number, screen.longitude as number]}
            icon={isTargeted ? ICONS.targeted : ICONS.other}
            opacity={isTargeted ? 1 : 0.55}
          >
            <Popup minWidth={180}>
              <div className="space-y-1 p-1">
                <p className="text-sm font-bold">{screen.name}</p>
                {screen.city && <p className="text-xs text-gray-600">{screen.city}</p>}
                {isTargeted && (
                  <p className="text-xs font-semibold text-orange-600">Diffuse vos pubs</p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
