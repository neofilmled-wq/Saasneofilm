'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MapPin, Search, Wifi, WifiOff, Ban, Monitor,
} from 'lucide-react';
import {
  Button, Card, CardContent, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton, AddressAutocomplete,
} from '@neofilm/ui';
import type { AddressSelection } from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi, type Screen } from '@/lib/admin-api';
import { io, type Socket } from 'socket.io-client';
import nextDynamic from 'next/dynamic';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

// Dynamic import of Leaflet map (no SSR)
const ScreenMap = nextDynamic(
  () => import('@/components/map/screen-map').then((mod) => mod.ScreenMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-125 bg-muted/30 rounded-lg">
        <div className="text-center text-muted-foreground">
          <MapPin className="h-8 w-8 mx-auto mb-2 animate-pulse" />
          <p className="text-sm">Chargement de la carte...</p>
        </div>
      </div>
    ),
  },
);

export default function LiveMapPage() {
  const queryClient = useQueryClient();
  const [liveStatuses, setLiveStatuses] = useState<Record<string, any>>({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('__all__');
  const [cityFilter, setCityFilter] = useState('__all__');
  const [searchFilter, setSearchFilter] = useState('');
  const [addressSearch, setAddressSearch] = useState('');
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);

  // Fetch all screens with status
  const { data: screensData, isLoading } = useQuery({
    queryKey: ['dashboard', 'screens'],
    queryFn: () => adminApi.getAllScreensWithStatus(),
  });

  // Fetch partners for filter dropdown
  const { data: partnersData } = useQuery({
    queryKey: ['dashboard', 'partners'],
    queryFn: () => adminApi.getPartners(),
  });

  const screens: Screen[] = screensData?.data?.data || [];
  const partners = partnersData?.data?.data || [];

  // Unique cities from screens
  const cities = useMemo(() => {
    const set = new Set<string>();
    screens.forEach((s) => { if (s.city) set.add(s.city); });
    return Array.from(set).sort();
  }, [screens]);

  // WebSocket for real-time status
  useEffect(() => {
    const socket: Socket = io(`${WS_URL}/screen-status`, {
      transports: ['websocket', 'polling'],
    });

    socket.on('screen.status', (statuses: any[]) => {
      const map: Record<string, any> = {};
      statuses.forEach((s) => { map[s.screenId] = s; });
      setLiveStatuses(map);
    });

    return () => { socket.disconnect(); };
  }, []);

  // Toggle screen enable/disable
  const toggleMutation = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      adminApi.updateScreen(id, { status: enable ? 'ACTIVE' : 'INACTIVE' } as any),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'screens'] });
      toast.success(vars.enable ? 'Écran activé' : 'Écran désactivé');
    },
    onError: (err: any) => toast.error(err.message || 'Erreur'),
  });

  const handleToggleScreen = useCallback((screenId: string, enable: boolean) => {
    toggleMutation.mutate({ id: screenId, enable });
  }, [toggleMutation]);

  // Stats
  const stats = useMemo(() => {
    let online = 0, offline = 0, disabled = 0;
    screens.forEach((s) => {
      const isDisabled = s.status === 'INACTIVE' || s.status === 'DECOMMISSIONED';
      if (isDisabled) { disabled++; return; }
      const live = liveStatuses[s.id] || s.screenLiveStatus;
      if (live?.isOnline) online++;
      else offline++;
    });
    return { online, offline, disabled, total: screens.length };
  }, [screens, liveStatuses]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Carte live"
        description="Visualisation temps réel de tous les écrans"
      />

      {/* Stats strip */}
      <div className="grid gap-3 grid-cols-4">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-green-100 p-1.5"><Wifi className="h-3.5 w-3.5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">En ligne</p>
              <p className="text-lg font-bold">{isLoading ? '...' : stats.online}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-red-100 p-1.5"><WifiOff className="h-3.5 w-3.5 text-red-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Hors ligne</p>
              <p className="text-lg font-bold">{isLoading ? '...' : stats.offline}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-gray-100 p-1.5"><Ban className="h-3.5 w-3.5 text-gray-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Désactivés</p>
              <p className="text-lg font-bold">{isLoading ? '...' : stats.disabled}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-blue-100 p-1.5"><Monitor className="h-3.5 w-3.5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">{isLoading ? '...' : stats.total}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-50">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un écran..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            <div className="min-w-64">
              <AddressAutocomplete
                value={addressSearch}
                onChange={setAddressSearch}
                onSelect={(sel: AddressSelection) => {
                  setAddressSearch(sel.label);
                  setFlyTo({ lat: sel.lat, lng: sel.lng });
                }}
                placeholder="Aller à une adresse..."
                className="h-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-37.5 h-9">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="online">En ligne</SelectItem>
                <SelectItem value="offline">Hors ligne</SelectItem>
                <SelectItem value="disabled">Désactivés</SelectItem>
              </SelectContent>
            </Select>

            <Select value={partnerFilter} onValueChange={setPartnerFilter}>
              <SelectTrigger className="w-50 h-9">
                <SelectValue placeholder="Partenaire" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous les partenaires</SelectItem>
                {partners.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="w-37.5 h-9">
                <SelectValue placeholder="Ville" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes les villes</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(statusFilter !== 'all' || partnerFilter !== '__all__' || cityFilter !== '__all__' || searchFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setStatusFilter('all');
                  setPartnerFilter('__all__');
                  setCityFilter('__all__');
                  setSearchFilter('');
                }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      <Card>
        <CardContent className="p-0 overflow-hidden rounded-lg" style={{ height: '600px' }}>
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ScreenMap
              screens={screens}
              liveStatuses={liveStatuses}
              filters={{ statusFilter, partnerFilter, cityFilter, searchFilter }}
              onToggleScreen={handleToggleScreen}
              flyTo={flyTo}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
