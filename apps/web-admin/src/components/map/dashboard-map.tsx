'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Screen } from '@/lib/admin-api';

// ─── Fit bounds on mount ──────────────────────────────────

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    } else {
      // Default to France
      map.setView([46.6, 2.3], 6);
    }
  }, [points, map]);
  return null;
}

// ─── Props ────────────────────────────────────────────────

interface DashboardMapProps {
  screens: Screen[];
  liveStatuses: Record<string, any>;
}

export default function DashboardMap({ screens, liveStatuses }: DashboardMapProps) {
  const points = useMemo(() =>
    screens
      .filter(s => s.latitude != null && s.longitude != null)
      .map(s => [s.latitude!, s.longitude!] as [number, number]),
    [screens],
  );

  const screenData = useMemo(() =>
    screens
      .filter(s => s.latitude != null && s.longitude != null)
      .map(s => {
        const live = liveStatuses[s.id] ?? s.screenLiveStatus;
        const isOnline = live?.isOnline ?? false;
        return { ...s, isOnline };
      }),
    [screens, liveStatuses],
  );

  const onlineCount = screenData.filter(s => s.isOnline).length;

  return (
    <div className="relative h-full min-h-[350px]">
      {/* Overlay stats */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(240_6%_8%/0.85)] backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-foreground border border-[hsl(240_4%_16%)]">
          <span className="h-2 w-2 rounded-full bg-[hsl(152_60%_45%)] shadow-[0_0_4px_hsl(152_60%_45%/0.5)]" />
          {onlineCount} en ligne
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(240_6%_8%/0.85)] backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-muted-foreground border border-[hsl(240_4%_16%)]">
          {screenData.length} écrans
        </span>
      </div>

      <MapContainer
        center={[46.6, 2.3]}
        zoom={6}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={false}
        style={{ background: 'hsl(240, 6%, 6%)' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <FitBounds points={points} />

        {screenData.map((screen) => (
          <CircleMarker
            key={screen.id}
            center={[screen.latitude!, screen.longitude!]}
            radius={screen.isOnline ? 6 : 4}
            pathOptions={{
              color: screen.isOnline ? 'hsl(152, 60%, 45%)' : 'hsl(0, 0%, 35%)',
              fillColor: screen.isOnline ? 'hsl(152, 60%, 45%)' : 'hsl(0, 0%, 35%)',
              fillOpacity: screen.isOnline ? 0.8 : 0.5,
              weight: screen.isOnline ? 2 : 1,
              opacity: screen.isOnline ? 0.6 : 0.3,
            }}
          >
            <Tooltip
              direction="top"
              className="chirp-map-tooltip"
            >
              <div className="text-xs">
                <p className="font-semibold">{screen.name}</p>
                {screen.city && <p className="text-muted-foreground">{screen.city}</p>}
                <p className={screen.isOnline ? 'text-[hsl(152,60%,55%)]' : 'text-[hsl(0,0%,50%)]'}>
                  {screen.isOnline ? 'En ligne' : 'Hors ligne'}
                </p>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
