'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@neofilm/ui';
import { Monitor, Cpu, HardDrive, Wifi, Clock, MapPin, Tv } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatRelative, formatCurrency, type ScreenStatusColor } from '@/lib/utils';
import { cn } from '@neofilm/ui';
import type { ScreenWithStatus } from '@/types/screen.types';

interface ScreenDetailOverviewProps {
  screen: ScreenWithStatus;
  device?: any;
}

function getScreenStatus(screen: ScreenWithStatus): ScreenStatusColor {
  if (screen.status === 'MAINTENANCE') return 'maintenance';
  if (screen.status === 'INACTIVE') return 'inactive';
  if (!screen.liveStatus) return 'offline';
  if (screen.liveStatus.isOnline && screen.liveStatus.errorCount24h > 5) return 'degraded';
  return screen.liveStatus.isOnline ? 'online' : 'offline';
}

export function ScreenDetailOverview({ screen, device }: ScreenDetailOverviewProps) {
  const status = getScreenStatus(screen);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Statut"
          value={status === 'online' ? 'En ligne' : status === 'offline' ? 'Hors ligne' : status}
          icon={Monitor}
        />
        <StatCard
          label="Score de santé"
          value={screen.healthScore !== undefined ? `${screen.healthScore}%` : '—'}
          icon={Cpu}
        />
        <StatCard
          label="Erreurs (24h)"
          value={screen.liveStatus?.errorCount24h?.toString() ?? '0'}
          icon={HardDrive}
        />
        <StatCard
          label="Revenu/mois"
          value={formatCurrency(screen.monthlyPriceCents)}
          icon={Tv}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Information écran</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Type</dt>
                <dd>{screen.type === 'smartTV' ? 'Smart TV' : 'TV + Android Stick'}</dd>
              </div>
              {screen.brand && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Marque / Modèle</dt>
                  <dd>{screen.brand} {screen.model}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Résolution</dt>
                <dd>{screen.resolution}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Orientation</dt>
                <dd>{screen.orientation === 'LANDSCAPE' ? 'Paysage' : 'Portrait'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> Site
                </dt>
                <dd>{screen.siteName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="text-right max-w-50">{screen.address}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Apparel associé</CardTitle>
          </CardHeader>
          <CardContent>
            {device ? (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">N° série</dt>
                  <dd className="font-mono">{device.serialNumber}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Statut</dt>
                  <dd>
                    <StatusBadge status={device.status === 'ONLINE' ? 'online' : device.status === 'ERROR' ? 'error' : 'offline'} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Version app</dt>
                  <dd>{device.appVersion}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Firmware</dt>
                  <dd>{device.firmwareVersion}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">IP</dt>
                  <dd className="font-mono">{device.ipAddress}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Dernier ping</dt>
                  <dd>{device.lastPingAt ? formatRelative(device.lastPingAt) : '—'}</dd>
                </div>
              </dl>
            ) : (
              <div className="text-center py-6">
                <Wifi className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucun apparel associé</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Associez un apparel pour commencer la diffusion
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {screen.liveStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Métriques en temps réel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">CPU</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', screen.liveStatus.cpuPercent > 80 ? 'bg-red-500' : 'bg-primary')}
                      style={{ width: `${screen.liveStatus.cpuPercent}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-10 text-right">{screen.liveStatus.cpuPercent}%</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Mémoire</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', screen.liveStatus.memoryPercent > 80 ? 'bg-red-500' : 'bg-primary')}
                      style={{ width: `${screen.liveStatus.memoryPercent}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-10 text-right">{screen.liveStatus.memoryPercent}%</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Réseau</p>
                <div className="flex items-center gap-1.5">
                  <Wifi className="h-4 w-4 text-primary" />
                  <span className="text-sm">{screen.liveStatus.networkType === 'wifi' ? 'Wi-Fi' : 'Ethernet'}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Dernier heartbeat</p>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{formatRelative(screen.liveStatus.lastHeartbeatAt)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
