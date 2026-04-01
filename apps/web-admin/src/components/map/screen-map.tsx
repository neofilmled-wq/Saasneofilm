'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { Button, Badge } from '@neofilm/ui';
import { ExternalLink, Power, PowerOff } from 'lucide-react';
import type { Screen } from '@/lib/admin-api';

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
  disabled: createIcon('#9ca3af'),
};

// ─── Fit bounds helper ──────────────────────────────────

function FitBounds({ screens }: { screens: Screen[] }) {
  const map = useMap();
  useEffect(() => {
    const points = screens
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => [s.latitude!, s.longitude!] as [number, number]);
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

export interface ScreenMapProps {
  screens: Screen[];
  liveStatuses: Record<string, any>;
  filters: {
    statusFilter: string;
    partnerFilter: string;
    cityFilter: string;
    searchFilter: string;
  };
  onToggleScreen?: (screenId: string, enable: boolean) => void;
  flyTo?: { lat: number; lng: number } | null;
}

// ─── Map Component ──────────────────────────────────────

export function ScreenMap({ screens, liveStatuses, filters, onToggleScreen, flyTo }: ScreenMapProps) {
  const filteredScreens = useMemo(() => {
    return screens.filter((screen) => {
      if (!screen.latitude || !screen.longitude) return false;

      const live = liveStatuses[screen.id] || screen.screenLiveStatus;
      const isOnline = live?.isOnline ?? false;
      const isDisabled = screen.status === 'INACTIVE' || screen.status === 'DECOMMISSIONED';

      // Status filter
      if (filters.statusFilter === 'online' && (!isOnline || isDisabled)) return false;
      if (filters.statusFilter === 'offline' && (isOnline || isDisabled)) return false;
      if (filters.statusFilter === 'disabled' && !isDisabled) return false;

      // Partner filter
      if (filters.partnerFilter && filters.partnerFilter !== '__all__' && screen.partnerOrgId !== filters.partnerFilter) return false;

      // City filter
      if (filters.cityFilter && filters.cityFilter !== '__all__' && screen.city !== filters.cityFilter) return false;

      // Search
      if (filters.searchFilter) {
        const q = filters.searchFilter.toLowerCase();
        if (!screen.name.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [screens, liveStatuses, filters]);

  return (
    <MapContainer
      center={[46.603354, 1.888334]}
      zoom={6}
      className="h-full w-full rounded-lg"
      style={{ minHeight: '500px' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds screens={filteredScreens} />
      <FlyToHandler flyTo={flyTo ?? null} />
      {filteredScreens.map((screen) => {
        const live = liveStatuses[screen.id] || screen.screenLiveStatus || {};
        const isOnline = live?.isOnline ?? false;
        const isDisabled = screen.status === 'INACTIVE' || screen.status === 'DECOMMISSIONED';
        const icon = isDisabled ? ICONS.disabled : isOnline ? ICONS.online : ICONS.offline;

        return (
          <Marker
            key={screen.id}
            position={[screen.latitude!, screen.longitude!]}
            icon={icon}
          >
            <Popup minWidth={280} maxWidth={350}>
              <div className="space-y-2 p-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm">{screen.name}</h3>
                  <Badge variant={isDisabled ? 'secondary' : isOnline ? 'default' : 'destructive'} className="text-[10px]">
                    {isDisabled ? 'Désactivé' : isOnline ? 'En ligne' : 'Hors ligne'}
                  </Badge>
                </div>

                <div className="text-xs space-y-1 text-gray-600">
                  <p><span className="font-medium">Partenaire:</span> {screen.partnerOrg?.name || '—'}</p>
                  <p><span className="font-medium">Ville:</span> {screen.city || '—'}</p>
                  {screen.address && <p><span className="font-medium">Adresse:</span> {screen.address}</p>}
                  {screen.devices?.[0] && (
                    <p><span className="font-medium">Appareil:</span> {screen.devices[0].serialNumber}</p>
                  )}
                  {live.lastHeartbeatAt && (
                    <p><span className="font-medium">Dernier ping:</span> {new Date(live.lastHeartbeatAt).toLocaleString('fr-FR')}</p>
                  )}
                  {live.cpuPercent != null && (
                    <p>
                      <span className="font-medium">CPU:</span>{' '}
                      <span className={live.cpuPercent > 80 ? 'text-red-600 font-bold' : ''}>{Math.round(live.cpuPercent)}%</span>
                      {' · '}
                      <span className="font-medium">RAM:</span>{' '}
                      <span className={live.memoryPercent > 80 ? 'text-red-600 font-bold' : ''}>{Math.round(live.memoryPercent || 0)}%</span>
                    </p>
                  )}
                  {live.currentCampaignId && (
                    <p><span className="font-medium">Campagne active:</span> Oui</p>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Link href={`/admin/screens/${screen.id}`}>
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                      <ExternalLink className="h-3 w-3" /> Détails
                    </Button>
                  </Link>
                  {onToggleScreen && (
                    <Button
                      size="sm"
                      variant={isDisabled ? 'default' : 'destructive'}
                      className="text-xs h-7 gap-1"
                      onClick={() => onToggleScreen(screen.id, isDisabled)}
                    >
                      {isDisabled ? (
                        <><Power className="h-3 w-3" /> Activer</>
                      ) : (
                        <><PowerOff className="h-3 w-3" /> Désactiver</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
