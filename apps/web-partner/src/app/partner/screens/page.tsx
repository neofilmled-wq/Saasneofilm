'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Monitor } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Skeleton,
} from '@neofilm/ui';
import { PageHeader } from '@/components/ui/page-header';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { useScreenStatusSummary } from '@/hooks/use-screen-stats';
import { io, type Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export default function ScreensPage() {
  const { user } = useAuth();
  const { data: summary } = useScreenStatusSummary();

  const { data, isLoading } = useQuery({
    queryKey: ['screens', user?.orgId],
    queryFn: () => apiFetch(`/screens?limit=1000${user?.orgId ? `&partnerOrgId=${user.orgId}` : ''}`),
    enabled: !!user,
  });

  const [liveStatuses, setLiveStatuses] = useState<Record<string, any>>({});

  useEffect(() => {
    const socket: Socket = io(`${WS_URL}/screen-status`, { transports: ['websocket', 'polling'] });
    socket.on('screen.status', (statuses: any[]) => {
      const map: Record<string, any> = {};
      statuses.forEach((s) => { map[s.screenId] = s; });
      setLiveStatuses(map);
    });
    return () => { socket.disconnect(); };
  }, []);

  const screens = data?.data?.data ?? data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Mes écrans" description="Gérez les écrans de votre réseau">
        <Link href="/partner/screens/new">
          <Button className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> Nouvel écran
          </Button>
        </Link>
      </PageHeader>

      {/* Status summary — gradient cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'En ligne', value: summary.online ?? 0, variant: 'stat-card-success' as const },
            { label: 'Hors ligne', value: summary.offline ?? 0, variant: 'stat-card-danger' as const },
            // Statut MAINTENANCE mis en pause — l'usage n'est pas encore
            // défini côté produit. À réactiver quand la sémantique sera
            // arrêtée (ex: écran en réparation vs écran suspendu par
            // partenaire vs écran hors service détecté par l'API).
            // { label: 'Maintenance', value: summary.maintenance ?? 0, variant: 'stat-card-warning' as const },
            { label: 'Total écrans', value: (summary.online ?? 0) + (summary.offline ?? 0) + (summary.needsReconnect ?? 0), variant: 'stat-card-primary' as const },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-2xl px-5 py-5 transition-all duration-200 ${s.variant}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium stat-label">{s.label}</div>
                  <div className="text-3xl font-bold mt-1 text-white">{s.value}</div>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                  <Monitor className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Screen table */}
      <Card className="rounded-2xl card-elevated overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : screens.length === 0 ? (
            <div className="py-16 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 mb-4">
                <Monitor className="h-7 w-7 text-primary" />
              </div>
              <p className="font-semibold text-foreground">Aucun écran configuré</p>
              <p className="text-sm text-muted-foreground mt-1">Ajoutez votre premier écran pour commencer</p>
              <Link href="/partner/screens/new">
                <Button className="mt-5 rounded-xl">Ajouter un écran</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Écran</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Remplissage</TableHead>
                  <TableHead>Statut DB</TableHead>
                  <TableHead>Connectivité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {screens.map((screen: any) => {
                  const live = liveStatuses[screen.id] || screen.screenLiveStatus || {};
                  const isOnline = live.isOnline ?? false;
                  return (
                    <TableRow key={screen.id}>
                      <TableCell className="font-medium">
                        <Link href={`/partner/screens/${screen.id}`} className="hover:text-primary">
                          {screen.name}
                        </Link>
                      </TableCell>
                      <TableCell>{screen.city ?? '—'}</TableCell>
                      <TableCell>
                        {(() => {
                          const fill = screen.screenFill?.activeAdvertiserCount ?? 0;
                          const max = screen.capacityMaxAdvertisers ?? 40;
                          const pct = Math.round((fill / max) * 100);
                          const color = fill >= max ? 'bg-red-500' : fill >= 1 ? 'bg-yellow-500' : 'bg-green-500';
                          return (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{fill}/{max}</span>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            screen.status === 'ACTIVE'
                              ? 'badge-success rounded-full'
                              : screen.status === 'MAINTENANCE'
                                ? 'badge-warning rounded-full'
                                : 'badge-danger rounded-full'
                          }
                        >
                          {screen.status === 'ACTIVE' ? 'Active' : screen.status === 'MAINTENANCE' ? 'Maintenance' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            isOnline
                              ? 'badge-success rounded-full'
                              : 'badge-danger rounded-full'
                          }
                        >
                          {isOnline ? 'En ligne' : 'Hors ligne'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
