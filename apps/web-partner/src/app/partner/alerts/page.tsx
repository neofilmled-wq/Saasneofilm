'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@neofilm/ui';
import { cn } from '@neofilm/ui';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Download,
  CheckCircle2,
  Eye,
  ExternalLink,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { StatCard } from '@/components/ui/stat-card';
import { useAlerts, useAcknowledgeAlert, useResolveAlert } from '@/hooks/use-alerts';
import { useRebootDevice, useClearCache, useRequestLogs } from '@/hooks/use-device-commands';
import { formatRelative, formatDateTime } from '@/lib/utils';
import type { MockAlert } from '@/lib/mock-data';

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Critique' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100', label: 'Avertissement' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Info' },
} as const;

const STATUS_LABELS: Record<string, string> = {
  open: 'Ouvert',
  acknowledged: 'Pris en charge',
  resolved: 'Résolu',
};

const TYPE_LABELS: Record<string, string> = {
  offline: 'Appareil hors ligne',
  crash: 'Crash application',
  missing_media: 'Média manquant',
  cache_failure: 'Échec cache',
  storage_full: 'Stockage plein',
  ota_failed: 'Mise à jour échouée',
};

export default function AlertsPage() {
  const [filters, setFilters] = useState<{ severity?: string; status?: string }>({});
  const { data: alerts, isLoading } = useAlerts(filters);
  const acknowledgeAlert = useAcknowledgeAlert();
  const resolveAlert = useResolveAlert();
  const reboot = useRebootDevice();
  const clearCache = useClearCache();
  const requestLogs = useRequestLogs();

  const [selectedAlert, setSelectedAlert] = useState<MockAlert | null>(null);

  if (isLoading) return <LoadingState />;

  const openCount = alerts?.filter((a) => a.status === 'open').length ?? 0;
  const criticalCount = alerts?.filter((a) => a.severity === 'critical' && a.status !== 'resolved').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Centre d'alertes" description="Surveillez et gérez les incidents de vos appareils" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Alertes ouvertes" value={String(openCount)} icon={AlertTriangle} variant="warning" />
        <StatCard label="Critiques" value={String(criticalCount)} icon={AlertCircle} variant="danger" />
        <StatCard label="Total" value={String(alerts?.length ?? 0)} icon={Info} variant="primary" />
      </div>

      <div className="flex gap-3">
        <Select
          value={filters.severity ?? 'all'}
          onValueChange={(v) => setFilters({ ...filters, severity: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-48 rounded-xl">
            <SelectValue placeholder="Toutes sévérités" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sévérités</SelectItem>
            <SelectItem value="critical">Critique</SelectItem>
            <SelectItem value="warning">Avertissement</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status ?? 'all'}
          onValueChange={(v) => setFilters({ ...filters, status: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-48 rounded-xl">
            <SelectValue placeholder="Tous statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="open">Ouvert</SelectItem>
            <SelectItem value="acknowledged">Pris en charge</SelectItem>
            <SelectItem value="resolved">Résolu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {alerts && alerts.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {alerts.map((alert) => {
              const sev = SEVERITY_CONFIG[alert.severity];
              const SevIcon = sev.icon;
              return (
                <Card
                  key={alert.id}
                  className={cn(
                    'cursor-pointer transition-all hover:bg-accent/50 rounded-2xl card-elevated',
                    selectedAlert?.id === alert.id && 'ring-2 ring-primary',
                  )}
                  onClick={() => setSelectedAlert(alert)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn('rounded-full p-2', sev.bg)}>
                        <SevIcon className={cn('h-4 w-4', sev.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate">{alert.message}</p>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {STATUS_LABELS[alert.status]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{TYPE_LABELS[alert.type] ?? alert.type}</span>
                          <span>·</span>
                          <span>{alert.screenName}</span>
                          <span>·</span>
                          <span>{formatRelative(alert.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detail panel */}
          <div>
            {selectedAlert ? (
              <Card className="sticky top-24 rounded-2xl card-elevated">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{TYPE_LABELS[selectedAlert.type]}</CardTitle>
                  <p className="text-sm text-muted-foreground">{selectedAlert.screenName}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">{selectedAlert.message}</p>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Timeline</p>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3 w-3 text-red-500" />
                        <span>Créé {formatDateTime(selectedAlert.createdAt)}</span>
                      </div>
                      {selectedAlert.acknowledgedAt && (
                        <div className="flex items-center gap-2">
                          <Eye className="h-3 w-3 text-amber-500" />
                          <span>Pris en charge {formatDateTime(selectedAlert.acknowledgedAt)} par {selectedAlert.acknowledgedBy}</span>
                        </div>
                      )}
                      {selectedAlert.resolvedAt && (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          <span>Résolu {formatDateTime(selectedAlert.resolvedAt)} par {selectedAlert.resolvedBy}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Actions</p>
                    <div className="flex flex-col gap-2">
                      {selectedAlert.status === 'open' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => acknowledgeAlert.mutate(selectedAlert.id)}
                          disabled={acknowledgeAlert.isPending}
                        >
                          <Eye className="mr-2 h-3.5 w-3.5" />
                          Prendre en charge
                        </Button>
                      )}
                      {selectedAlert.status !== 'resolved' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => resolveAlert.mutate(selectedAlert.id)}
                          disabled={resolveAlert.isPending}
                        >
                          <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                          Marquer résolu
                        </Button>
                      )}
                      {selectedAlert.deviceId && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => reboot.mutate(selectedAlert.deviceId!)}
                            disabled={reboot.isPending}
                          >
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                            {reboot.isPending ? 'Redémarrage...' : 'Redémarrer l\'appareil'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => clearCache.mutate(selectedAlert.deviceId!)}
                            disabled={clearCache.isPending}
                          >
                            <HardDrive className="mr-2 h-3.5 w-3.5" />
                            Vider le cache
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => requestLogs.mutate(selectedAlert.deviceId!)}
                            disabled={requestLogs.isPending}
                          >
                            <Download className="mr-2 h-3.5 w-3.5" />
                            Demander les logs
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <Button size="sm" variant="ghost" className="w-full" asChild>
                    <Link href={`/partner/screens/${selectedAlert.screenId}`}>
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      Voir l'écran
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="rounded-2xl card-elevated">
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Sélectionnez une alerte pour voir les détails
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="Aucune alerte"
          description="Tout fonctionne correctement. Aucune alerte active."
        />
      )}
    </div>
  );
}
