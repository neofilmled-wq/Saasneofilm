'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { Button, Card, CardContent, CardHeader, CardTitle, AddressAutocomplete } from '@neofilm/ui';
import type { AddressSelection } from '@neofilm/ui';
import {
  MapPin,
  X,
  ExternalLink,
  Link2,
  Monitor,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/loading-state';
import { useScreens } from '@/hooks/use-screens';
import { useScreenStatusSummary } from '@/hooks/use-screen-stats';
import { usePartnerOrg } from '@/hooks/use-partner-org';
import { formatRelative, type ScreenStatusColor } from '@/lib/utils';
import type { ScreenWithStatus } from '@/types/screen.types';

type MapScreenStatus = 'active' | 'inactive' | 'unpaired';

function getMapScreenStatus(screen: ScreenWithStatus): MapScreenStatus {
  if (!screen.activeDeviceId) return 'unpaired';
  if (screen.status === 'ACTIVE') return 'active';
  return 'inactive';
}

// Keep legacy function for compatibility
function getScreenStatus(screen: ScreenWithStatus): ScreenStatusColor {
  if (!screen.liveStatus) return 'offline';
  return screen.liveStatus.isOnline ? 'online' : 'offline';
}

// Dynamic import of the map component (no SSR for Leaflet)
const PartnerScreenMap = nextDynamic(
  () => import('@/components/map/partner-screen-map').then((mod) => mod.PartnerScreenMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-muted/30 rounded-lg">
        <div className="text-center text-muted-foreground">
          <MapPin className="h-8 w-8 mx-auto mb-2 animate-pulse" />
          <p className="text-sm">Chargement de la carte...</p>
        </div>
      </div>
    ),
  },
);

export default function MapPage() {
  const { orgId } = usePartnerOrg();
  const { data: screens, isLoading } = useScreens({ limit: 5000, partnerOrgId: orgId ?? undefined });
  const { data: summary } = useScreenStatusSummary();
  const [selected, setSelected] = useState<ScreenWithStatus | null>(null);

  // Find all screens at the same location as selected
  const selectedGroup = useMemo(() => {
    if (!selected || !screens) return [];
    return screens.filter(
      (s) => s.latitude != null && selected.latitude != null &&
        s.latitude.toFixed(5) === selected.latitude.toFixed(5) &&
        s.longitude!.toFixed(5) === selected.longitude!.toFixed(5)
    );
  }, [selected, screens]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [addressSearch, setAddressSearch] = useState('');
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [showOccupancy, setShowOccupancy] = useState(false);

  const filteredScreens = useMemo(() => {
    if (!screens) return [];
    if (statusFilter === 'all') return screens;
    return screens.filter((s) => getMapScreenStatus(s) === statusFilter);
  }, [screens, statusFilter]);

  const statusCounts = useMemo(() => {
    if (!screens) return { active: 0, inactive: 0, unpaired: 0, total: 0 };
    let active = 0, inactive = 0, unpaired = 0;
    screens.forEach((s) => {
      const st = getMapScreenStatus(s);
      if (st === 'active') active++;
      else if (st === 'inactive') inactive++;
      else unpaired++;
    });
    return { active, inactive, unpaired, total: screens.length };
  }, [screens]);

  const handleAddressSelect = useCallback((sel: AddressSelection) => {
    setAddressSearch(sel.label);
    setFlyTo({ lat: sel.lat, lng: sel.lng });
  }, []);

  const handleMarkerClick = useCallback((screen: ScreenWithStatus) => {
    setSelected(screen);
  }, []);

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title="Carte live" description="Vue temps réel de tous vos écrans">
        <Button
          variant={showOccupancy ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOccupancy((v) => !v)}
        >
          {showOccupancy ? 'Mode statut' : 'Mode capacité annonceurs'}
        </Button>
      </PageHeader>

      {/* Status summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Actif', value: statusCounts.active, color: 'text-green-600' },
          { label: 'Inactif', value: statusCounts.inactive, color: 'text-orange-600' },
          { label: 'Non appairé', value: statusCounts.unpaired, color: 'text-gray-500' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card px-4 py-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Occupancy legend */}
      {showOccupancy && (
        <div className="flex items-center gap-4 text-xs">
          <span className="font-medium text-muted-foreground">Légende capacité :</span>
          {[
            { color: 'bg-gray-400', label: 'Vide (0/40)' },
            { color: 'bg-blue-500', label: 'Partiel' },
            { color: 'bg-red-600', label: 'Complet (40/40)' },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={`inline-block w-3 h-3 rounded-full ${l.color}`} />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {/* Address search + filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-64">
          <AddressAutocomplete
            value={addressSearch}
            onChange={setAddressSearch}
            onSelect={handleAddressSelect}
            placeholder="Rechercher une ville ou adresse..."
          />
        </div>
        {[
          { key: 'all', label: `Tous (${statusCounts.total})` },
          { key: 'active', label: `Actif (${statusCounts.active})` },
          { key: 'inactive', label: `Inactif (${statusCounts.inactive})` },
          { key: 'unpaired', label: `Non appairé (${statusCounts.unpaired})` },
        ].map((f) => (
          <Button
            key={f.key}
            variant={statusFilter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaflet Map */}
        <div className="lg:col-span-2 relative rounded-lg border overflow-hidden" style={{ minHeight: 500 }}>
          <PartnerScreenMap
            screens={filteredScreens}
            flyTo={flyTo}
            onMarkerClick={handleMarkerClick}
            selectedScreenId={selected?.id}
            showOccupancy={showOccupancy}
          />
        </div>

        {/* Detail drawer */}
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {selected && selectedGroup.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{selectedGroup.length} écran{selectedGroup.length > 1 ? 's' : ''} à cette adresse</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelected(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {selectedGroup.map((screen) => {
                const mapStatus = getMapScreenStatus(screen);
                const statusLabel = mapStatus === 'active' ? 'Actif' : mapStatus === 'inactive' ? 'Inactif' : 'Non appairé';
                const statusColor = mapStatus === 'active' ? 'text-green-600' : mapStatus === 'inactive' ? 'text-orange-600' : 'text-gray-500';

                return (
                  <Card key={screen.id}>
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{screen.name}</CardTitle>
                        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-2">
                      <dl className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Site</dt>
                          <dd>{screen.siteName}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Ville</dt>
                          <dd>{screen.city}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Appareil</dt>
                          <dd className="flex items-center gap-1">
                            {screen.activeDeviceId ? (
                              <><Wifi className="h-3 w-3 text-emerald-500" /> Appairé</>
                            ) : (
                              <><WifiOff className="h-3 w-3 text-gray-400" /> Non appairé</>
                            )}
                          </dd>
                        </div>
                        {screen.liveStatus && (
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Dernier signal</dt>
                            <dd>{formatRelative(screen.liveStatus.lastHeartbeatAt)}</dd>
                          </div>
                        )}
                      </dl>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="flex-1 h-7 text-xs" asChild>
                          <Link href={`/partner/screens/${screen.id}`}>
                            <ExternalLink className="mr-1 h-3 w-3" />
                            Détails
                          </Link>
                        </Button>
                        {!screen.activeDeviceId && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                            <Link href={`/partner/screens/${screen.id}/pairing`}>
                              <Link2 className="mr-1 h-3 w-3" />
                              Appairage
                            </Link>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Monitor className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Sélectionnez un écran pour voir ses détails
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
