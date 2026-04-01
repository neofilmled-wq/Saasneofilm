'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Badge } from '@neofilm/ui';
import type { ScreenWithStatus } from '@/types/screen.types';

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
  degraded: createIcon('#f59e0b'),
  inactive: createIcon('#9ca3af'),
  maintenance: createIcon('#6366f1'),
  full: createIcon('#dc2626'),      // 40/40 advertisers (red = full)
  partial: createIcon('#3b82f6'),   // has advertisers but not full (blue)
  empty: createIcon('#9ca3af'),     // 0 advertisers (gray)
};

// ─── Fit bounds helper ──────────────────────────────────

function FitBounds({ screens }: { screens: ScreenWithStatus[] }) {
  const map = useMap();
  useEffect(() => {
    const points = screens
      .filter((s) => s.latitude != null && s.longitude != null && (s.latitude !== 0 || s.longitude !== 0))
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
      map.flyTo([flyTo.lat, flyTo.lng], 14, { duration: 1.2 });
    }
  }, [flyTo, map]);
  return null;
}

// ─── Types ──────────────────────────────────────────────

interface Occupancy {
  advertisersCount: number;
  capacity: number;
  remainingSlots: number;
  isFull: boolean;
  fillPercent: number;
}

interface ScreenWithOccupancy extends ScreenWithStatus {
  occupancy?: Occupancy;
}

interface PartnerScreenMapProps {
  screens: ScreenWithOccupancy[];
  flyTo: { lat: number; lng: number } | null;
  onMarkerClick?: (screen: ScreenWithOccupancy) => void;
  selectedScreenId?: string;
  showOccupancy?: boolean;
}

function getIconKey(screen: ScreenWithOccupancy, showOccupancy = false): keyof typeof ICONS {
  if (screen.status === 'MAINTENANCE') return 'maintenance';
  if (screen.status === 'INACTIVE') return 'inactive';

  if (showOccupancy && screen.occupancy) {
    if (screen.occupancy.isFull) return 'full';
    if (screen.occupancy.advertisersCount > 0) return 'partial';
    return 'empty';
  }

  if (!screen.liveStatus) return 'offline';
  if (screen.liveStatus.isOnline && screen.liveStatus.errorCount24h > 5) return 'degraded';
  return screen.liveStatus.isOnline ? 'online' : 'offline';
}

// ─── Map Component ──────────────────────────────────────

export function PartnerScreenMap({ screens, flyTo, onMarkerClick, selectedScreenId: _selectedScreenId, showOccupancy = false }: PartnerScreenMapProps) {
  const geoScreens = useMemo(
    () => screens.filter((s) => s.latitude != null && s.longitude != null && (s.latitude !== 0 || s.longitude !== 0)),
    [screens],
  );

  // Group screens by same coordinates (same address)
  const groupedScreens = useMemo(() => {
    const groups = new Map<string, ScreenWithOccupancy[]>();
    for (const s of geoScreens) {
      const key = `${s.latitude!.toFixed(5)},${s.longitude!.toFixed(5)}`;
      const existing = groups.get(key) ?? [];
      existing.push(s);
      groups.set(key, existing);
    }
    return Array.from(groups.values());
  }, [geoScreens]);

  return (
    <MapContainer
      center={[46.603354, 1.888334]}
      zoom={6}
      className="h-full w-full rounded-lg"
      style={{ minHeight: '500px' }}
      worldCopyJump={true}
      maxBounds={[[-90, -180], [90, 180]]}
      maxBoundsViscosity={1.0}
      minZoom={3}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        noWrap={true}
      />
      <FitBounds screens={geoScreens} />
      <FlyToHandler flyTo={flyTo} />
      {groupedScreens.map((group) => {
        const first = group[0];
        const iconKey = getIconKey(first, showOccupancy);
        const icon = group.length > 1
          ? createIcon('#6366f1') // purple for multi-screen locations
          : ICONS[iconKey];

        return (
          <Marker
            key={`${first.latitude}-${first.longitude}`}
            position={[first.latitude!, first.longitude!]}
            icon={icon}
            eventHandlers={{
              click: () => onMarkerClick?.(first),
            }}
          >
            <Popup minWidth={260} maxHeight={300}>
              <div className="space-y-2 p-1">
                {group.length > 1 && (
                  <div className="text-xs font-semibold text-indigo-600 mb-1">{group.length} écrans à cette adresse</div>
                )}
                {group.map((screen) => {
                  const sIconKey = getIconKey(screen, showOccupancy);
                  const statusLabel =
                    !screen.activeDeviceId ? 'Non appairé' :
                    screen.status === 'ACTIVE' ? 'Actif' : 'Inactif';
                  const statusColor =
                    !screen.activeDeviceId ? 'secondary' as const :
                    screen.status === 'ACTIVE' ? 'default' as const : 'destructive' as const;

                  return (
                    <div key={screen.id} className={`${group.length > 1 ? 'border-b last:border-b-0 pb-2 last:pb-0' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-sm">{screen.name}</h3>
                        <Badge variant={statusColor} className="text-[10px]">
                          {statusLabel}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600">{screen.city}</p>
                      {screen.address && (
                        <p className="text-xs text-gray-500">{screen.address}</p>
                      )}
                      <button
                        className="text-xs text-indigo-600 hover:underline mt-1 cursor-pointer"
                        onClick={() => onMarkerClick?.(screen)}
                      >
                        Voir les détails
                      </button>
                    </div>
                  );
                })}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
