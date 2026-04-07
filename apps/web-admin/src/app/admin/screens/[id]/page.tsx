'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ArrowLeft,
  Power,
  PowerOff,
  Wifi,
  WifiOff,
  Cpu,
  HardDrive,
  MapPin,
  Building2,
  Monitor,
  Clock,
  Calendar,
  Pencil,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Button,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Textarea,
} from '@neofilm/ui';
import { adminApi, type Screen } from '@/lib/admin-api';

// ─── Helpers ──────────────────────────────────────────────

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

const ENV_LABELS: Record<string, string> = {
  CINEMA_HALL: 'Salle de cinéma',
  CINEMA_LOBBY: 'Hall de cinéma',
  SHOPPING_MALL: 'Centre commercial',
  TRANSIT: 'Transport',
  OUTDOOR: 'Extérieur',
  INDOOR: 'Intérieur',
};

const ORIENTATION_LABELS: Record<string, string> = {
  LANDSCAPE: 'Paysage',
  PORTRAIT: 'Portrait',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  MAINTENANCE: 'Maintenance',
  DECOMMISSIONED: 'Décommissionné',
  PENDING_APPROVAL: 'En attente d\'approbation',
  SUSPENDED: 'Suspendu',
};

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACTIVE: 'default',
  INACTIVE: 'secondary',
  MAINTENANCE: 'outline',
  DECOMMISSIONED: 'destructive',
  PENDING_APPROVAL: 'outline',
  SUSPENDED: 'destructive',
};

// ─── Component ────────────────────────────────────────────

export default function ScreenDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['screens', id],
    queryFn: () => adminApi.getScreen(id),
    enabled: !!id,
  });

  const screen: Screen | undefined = data?.data;
  const live = screen?.screenLiveStatus;

  // ─── Schedules query ──────────────────────────────────────

  const { data: schedulesData } = useQuery({
    queryKey: ['schedules', { screenId: id }],
    queryFn: () => adminApi.getSchedules({ screenId: id, limit: 20 }),
    enabled: !!id,
  });

  const schedules = schedulesData?.data?.data || [];

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', address: '', city: '', postCode: '' });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // ─── Mutations ────────────────────────────────────────────

  const editMutation = useMutation({
    mutationFn: (data: Record<string, string>) => adminApi.updateAdminScreen(id, data),
    onSuccess: () => {
      toast.success('Écran mis à jour');
      queryClient.invalidateQueries({ queryKey: ['screens', id] });
      setEditOpen(false);
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const approveMutation = useMutation({
    mutationFn: () => adminApi.bulkApproveScreens([id]),
    onSuccess: () => {
      toast.success('Écran approuvé');
      queryClient.invalidateQueries({ queryKey: ['screens', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'screens'] });
    },
    onError: () => toast.error("Erreur lors de l'approbation"),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => adminApi.bulkRejectScreens([id], reason),
    onSuccess: () => {
      toast.success('Écran rejeté');
      queryClient.invalidateQueries({ queryKey: ['screens', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'screens'] });
      setRejectOpen(false);
      setRejectReason('');
    },
    onError: () => toast.error('Erreur lors du rejet'),
  });

  const activateMutation = useMutation({
    mutationFn: () => adminApi.updateScreen(id, { status: 'ACTIVE' }),
    onSuccess: () => {
      toast.success('Écran activé');
      queryClient.invalidateQueries({ queryKey: ['screens', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'screens'] });
    },
    onError: () => toast.error("Erreur lors de l'activation"),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => adminApi.updateScreen(id, { status: 'INACTIVE' }),
    onSuccess: () => {
      toast.success('Écran désactivé');
      queryClient.invalidateQueries({ queryKey: ['screens', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'screens'] });
    },
    onError: () => toast.error('Erreur lors de la désactivation'),
  });

  // ─── Loading / Error states ───────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (isError || !screen) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
        <div className="text-center py-12 text-destructive">
          Écran introuvable ou erreur de chargement.
        </div>
      </div>
    );
  }

  const isOnline = live?.isOnline ?? false;
  const isActive = screen.status === 'ACTIVE';
  const isPending = screen.status === 'PENDING_APPROVAL';

  function openEditDialog() {
    if (!screen) return;
    setEditForm({
      name: screen.name || '',
      address: screen.address || '',
      city: screen.city || '',
      postCode: screen.postCode || '',
    });
    setEditOpen(true);
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/devices">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux écrans
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{screen.name}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[screen.status] || 'secondary'}>
              {STATUS_LABELS[screen.status] || screen.status}
            </Badge>
            <Badge variant={isOnline ? 'default' : 'destructive'}>
              {isOnline ? 'En ligne' : 'Hors ligne'}
            </Badge>
          </div>
          {screen.externalRef && (
            <p className="text-sm text-muted-foreground">Réf. : {screen.externalRef}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openEditDialog}>
            <Pencil className="mr-2 h-4 w-4" />
            Modifier
          </Button>
          {isPending && (
            <>
              <Button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approuver
              </Button>
              <Button
                variant="destructive"
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Rejeter
              </Button>
            </>
          )}
          {isActive && (
            <Button
              variant="outline"
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
            >
              <PowerOff className="mr-2 h-4 w-4" />
              Désactiver
            </Button>
          )}
          {!isActive && !isPending && (
            <Button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
            >
              <Power className="mr-2 h-4 w-4" />
              Activer
            </Button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Partner & Location */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Partenaire & Lieu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Organisation</p>
              <p className="text-sm mt-0.5">{screen.partnerOrg?.name ?? '-'}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Adresse</p>
              <p className="text-sm mt-0.5 flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <span>
                  {screen.address ?? '-'}
                  {screen.city && `, ${screen.city}`}
                  {screen.postCode && ` ${screen.postCode}`}
                  {screen.country && `, ${screen.country}`}
                </span>
              </p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Environnement</p>
              <p className="text-sm mt-0.5">
                {ENV_LABELS[screen.environment] || screen.environment}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Technical info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Caractéristiques
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Résolution</p>
              <p className="text-sm mt-0.5">{screen.resolution ?? '-'}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Orientation</p>
              <p className="text-sm mt-0.5">
                {ORIENTATION_LABELS[screen.orientation] || screen.orientation}
              </p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Créé le</p>
              <p className="text-sm mt-0.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDate(screen.createdAt)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Live status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {isOnline ? (
                <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-600" />
              )}
              Statut en direct
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
              />
              <span className="text-sm font-medium">
                {isOnline ? 'En ligne' : 'Hors ligne'}
              </span>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Cpu className="h-3 w-3" />
                  CPU
                </p>
                <p className={`text-lg font-bold mt-0.5 ${live?.cpuPercent != null && live.cpuPercent > 80 ? 'text-red-600' : ''}`}>
                  {live?.cpuPercent != null ? `${Math.round(live.cpuPercent)}%` : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  Mémoire
                </p>
                <p className={`text-lg font-bold mt-0.5 ${live?.memoryPercent != null && live.memoryPercent > 80 ? 'text-red-600' : ''}`}>
                  {live?.memoryPercent != null ? `${Math.round(live.memoryPercent)}%` : '-'}
                </p>
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Dernier heartbeat
              </p>
              <p className="text-sm mt-0.5">
                {live?.lastHeartbeatAt ? formatDateTime(live.lastHeartbeatAt) : '-'}
              </p>
            </div>
            {live?.appVersion && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Version app</p>
                  <p className="text-sm mt-0.5 font-mono">{live.appVersion}</p>
                </div>
              </>
            )}
            {live?.errorCount24h != null && live.errorCount24h > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Erreurs (24h)</p>
                  <p className="text-sm mt-0.5 text-red-600 font-bold">{live.errorCount24h}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Devices table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appareils associés</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!screen.devices || screen.devices.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              Aucun appareil associé à cet écran.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro de série</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Version app</TableHead>
                  <TableHead>Dernier ping</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {screen.devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-mono text-sm">
                      {device.serialNumber}
                      {device.id === screen.activeDeviceId && (
                        <Badge variant="default" className="ml-2">
                          Actif
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          device.status === 'ACTIVE'
                            ? 'default'
                            : device.status === 'INACTIVE'
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {STATUS_LABELS[device.status] || device.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{device.appVersion ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {device.lastPingAt ? formatDateTime(device.lastPingAt) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Schedules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plannings associés</CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">
              Aucun planning associé à cet écran.
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule: any) => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{schedule.name || `Planning ${schedule.id.slice(0, 8)}`}</p>
                    {schedule.startAt && schedule.endAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDateTime(schedule.startAt)} — {formatDateTime(schedule.endAt)}
                      </p>
                    )}
                  </div>
                  {schedule.status && (
                    <Badge variant="secondary">{schedule.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l&apos;écran</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              editMutation.mutate(editForm);
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nom</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-city">Ville</Label>
                <Input
                  id="edit-city"
                  value={editForm.city}
                  onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-address">Adresse</Label>
                <Input
                  id="edit-address"
                  value={editForm.address}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-postcode">Code postal</Label>
                <Input
                  id="edit-postcode"
                  value={editForm.postCode}
                  onChange={(e) => setEditForm((f) => ({ ...f, postCode: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Reject Dialog ── */}
      <Dialog open={rejectOpen} onOpenChange={() => { setRejectOpen(false); setRejectReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter l&apos;écran</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Raison du rejet..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectReason(''); }}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate(rejectReason)}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              Rejeter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
