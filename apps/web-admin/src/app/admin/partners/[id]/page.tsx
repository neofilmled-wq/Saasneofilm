'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Monitor, DollarSign, Settings2, Wifi, WifiOff,
  Wrench, CheckCircle, XCircle, RotateCcw, ShieldAlert, ShieldCheck,
  Loader2, MapPin, Mail, Building2, FileText, User,
  Save, KeyRound, ToggleLeft, ToggleRight, AlertTriangle,
  Plus, Trash2, QrCode, Pencil, MoreHorizontal,
} from 'lucide-react';
import {
  Button, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Skeleton, Badge, Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
  Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi, type AdminPartnerDetail, type ScreenTvConfig } from '@/lib/admin-api';
import { useAdminSocket } from '@/hooks/use-admin-socket';

// ─── Helpers ──────────────────────────────────────────────

function fmt(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function StatusPill({ online }: { online: boolean }) {
  return online ? (
    <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
      <Wifi className="h-3.5 w-3.5" /> En ligne
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
      <WifiOff className="h-3.5 w-3.5" /> Hors ligne
    </span>
  );
}

// ─── Constants ────────────────────────────────────────────

const ENVIRONMENTS = [
  { value: 'CINEMA_LOBBY', label: 'Hall de cinéma' },
  { value: 'CINEMA_HALLWAY', label: 'Couloir de cinéma' },
  { value: 'HOTEL_LOBBY', label: 'Lobby hôtel' },
  { value: 'HOTEL_ROOM', label: 'Chambre hôtel' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'RETAIL', label: 'Commerce' },
  { value: 'OUTDOOR', label: 'Extérieur' },
  { value: 'OTHER', label: 'Autre' },
] as const;

// ─── TV_CONFIG MODULE LABELS ──────────────────────────────

const TV_MODULES = [
  { key: 'TNT', label: 'IPTV / TNT' },
  { key: 'STREAMING', label: 'Streaming' },
  { key: 'ACTIVITIES', label: 'Activités / Catalogue' },
] as const;

const TV_TABS = [
  { key: 'TNT', label: 'TNT' },
  { key: 'STREAMING', label: 'Streaming' },
  { key: 'ACTIVITIES', label: 'Activités' },
  { key: 'SETTINGS', label: 'Paramètres' },
] as const;

// ─── Screen row component ─────────────────────────────────

function ScreenRow({ screen, onAction, onDelete, onPair }: {
  screen: any;
  onAction: () => void;
  onDelete: (screenId: string) => void;
  onPair: (screenId: string) => void;
}) {
  const queryClient = useQueryClient();

  const maintenanceMutation = useMutation({
    mutationFn: (on: boolean) =>
      adminApi.updateAdminScreen(screen.id, { maintenanceMode: on }),
    onSuccess: (_, on) => {
      toast.success(on ? 'Écran mis en maintenance' : 'Maintenance retirée');
      onAction();
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      adminApi.updateAdminScreen(screen.id, { status }),
    onSuccess: () => {
      toast.success('Statut mis à jour');
      onAction();
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const busy = maintenanceMutation.isPending || statusMutation.isPending;

  return (
    <TableRow className={screen.status === 'SUSPENDED' ? 'opacity-60' : ''}>
      <TableCell>
        <Link href={`/admin/screens/${screen.id}`} className="font-medium hover:text-primary flex items-center gap-1.5">
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
          {screen.name}
        </Link>
      </TableCell>
      <TableCell>
        {screen.city ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3" /> {screen.city}
          </span>
        ) : '-'}
      </TableCell>
      <TableCell>
        <StatusPill online={screen.isOnline} />
        {screen.maintenanceMode && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-yellow-600">
            <Wrench className="h-3 w-3" /> Maintenance
          </span>
        )}
      </TableCell>
      <TableCell>
        {(() => {
          const fill = screen.screenFill?.activeAdvertiserCount ?? 0;
          const max = screen.capacityMaxAdvertisers ?? 40;
          const pct = Math.round((fill / max) * 100);
          const color = fill >= max ? 'bg-red-500' : fill >= 1 ? 'bg-yellow-500' : 'bg-green-500';
          return (
            <div className="flex items-center gap-2">
              <div className="h-2 w-16 rounded-full bg-muted relative overflow-hidden">
                <div className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-medium tabular-nums whitespace-nowrap">
                {fill}/{max}
              </span>
            </div>
          );
        })()}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {!screen.maintenanceMode ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => maintenanceMutation.mutate(true)}
            >
              <Wrench className="h-3 w-3 mr-1" />
              Maintenance
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => maintenanceMutation.mutate(false)}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Retirer maint.
            </Button>
          )}
          {screen.status === 'ACTIVE' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-red-600 hover:text-red-700"
              disabled={busy}
              onClick={() => statusMutation.mutate('SUSPENDED')}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Désactiver
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-green-700"
              disabled={busy}
              onClick={() => statusMutation.mutate('ACTIVE')}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Activer
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPair(screen.id)}>
                <QrCode className="h-4 w-4 mr-2" />
                Appairer
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={() => onDelete(screen.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── TV Config row ────────────────────────────────────────

function TvConfigRow({ config, partnerId, onUpdated }: {
  config: ScreenTvConfig;
  partnerId: string;
  onUpdated: () => void;
}) {
  const [modules, setModules] = useState<string[]>(config.tvConfig?.enabledModules ?? []);
  const [defaultTab, setDefaultTab] = useState(config.tvConfig?.defaultTab ?? 'TNT');
  const [dirty, setDirty] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateScreenTvConfig(partnerId, config.screenId, { enabledModules: modules, defaultTab }),
    onSuccess: () => {
      toast.success(`Config TV de "${config.screenName}" mise à jour`);
      setDirty(false);
      onUpdated();
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  function toggleModule(key: string) {
    setModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
    setDirty(true);
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{config.screenName}</div>
        {config.city && <div className="text-xs text-muted-foreground">{config.city}</div>}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1.5">
          {TV_MODULES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleModule(key)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${
                modules.includes(key)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {modules.includes(key) ? (
                <ToggleRight className="h-3 w-3" />
              ) : (
                <ToggleLeft className="h-3 w-3" />
              )}
              {label}
            </button>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <select
          value={defaultTab}
          onChange={(e) => { setDefaultTab(e.target.value); setDirty(true); }}
          className="text-sm border rounded-md px-2 py-1 bg-transparent"
        >
          {TV_TABS.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Save className="h-3 w-3 mr-1" />
          )}
          Enregistrer
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Main Page ────────────────────────────────────────────

export default function PartnerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();

  // ── Admin socket for real-time sync ──
  useAdminSocket();

  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [complianceForm, setComplianceForm] = useState({
    directorFullName: '',
    kbisUrl: '',
    directorIdCardUrl: '',
    siretNumber: '',
    isVerified: false,
  });
  const [commissionValue, setCommissionValue] = useState('');
  const [commissionEditing, setCommissionEditing] = useState(false);

  // ── Screen creation dialog state ──
  const [createScreenOpen, setCreateScreenOpen] = useState(false);
  const [screenForm, setScreenForm] = useState({
    name: '',
    address: '',
    city: '',
    postCode: '',
    environment: '',
    siteId: '',
    resolution: '1920x1080',
    orientation: 'LANDSCAPE',
  });

  // ── Screen delete dialog state ──
  const [deleteScreenOpen, setDeleteScreenOpen] = useState(false);
  const [deleteScreenId, setDeleteScreenId] = useState<string | null>(null);

  // ── Screen pairing dialog state ──
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingPin, setPairingPin] = useState<string | null>(null);
  const [pairingExpires, setPairingExpires] = useState<string | null>(null);

  // ── Venue dialog state ──
  const [createVenueOpen, setCreateVenueOpen] = useState(false);
  const [venueForm, setVenueForm] = useState({ name: '', category: 'other', address: '', city: '', postCode: '' });
  const [editVenueOpen, setEditVenueOpen] = useState(false);
  const [editVenueId, setEditVenueId] = useState<string | null>(null);
  const [editVenueForm, setEditVenueForm] = useState({ name: '', category: '', address: '', city: '' });
  const [deleteVenueOpen, setDeleteVenueOpen] = useState(false);
  const [deleteVenueId, setDeleteVenueId] = useState<string | null>(null);

  // ── Queries ──
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'partner-detail', id],
    queryFn: () => adminApi.getAdminPartnerDetail(id),
    enabled: !!id,
  });

  const partner: AdminPartnerDetail | undefined = (data as any)?.data;

  const tvConfigQuery = useQuery({
    queryKey: ['admin', 'partner-tv-config', id],
    queryFn: () => adminApi.getPartnerTvConfig(id),
    enabled: !!id,
  });

  const tvConfigs: ScreenTvConfig[] = (tvConfigQuery.data as any)?.data ?? [];

  const venuesQuery = useQuery({
    queryKey: ['admin', 'partner-venues', id],
    queryFn: () => adminApi.getPartnerVenues(id),
    enabled: !!id,
  });

  const venues: any[] = (venuesQuery.data as any)?.data ?? [];

  // ── Mutations ──
  const resetPasswordMutation = useMutation({
    mutationFn: () => adminApi.resetPartnerPassword(id),
    onSuccess: (res: any) => {
      const pw = res?.data?.temporaryPassword;
      toast.success(
        `Mot de passe réinitialisé. Mot de passe temporaire : ${pw ?? '(voir logs)'}`,
        { duration: 10000 }
      );
      setResetPasswordOpen(false);
    },
    onError: () => toast.error('Erreur lors de la réinitialisation'),
  });

  const suspendMutation = useMutation({
    mutationFn: (suspend: boolean) =>
      adminApi.updateAdminPartner(id, {
        isSuspended: suspend,
        suspensionReason: suspend ? suspendReason : undefined,
      }),
    onSuccess: (_, suspend) => {
      toast.success(suspend ? 'Partenaire suspendu' : 'Partenaire réactivé');
      setSuspendOpen(false);
      setSuspendReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const commissionMutation = useMutation({
    mutationFn: (rate: number) => adminApi.updateAdminPartner(id, { commissionRate: rate }),
    onSuccess: () => {
      toast.success('Taux de commission mis à jour');
      setCommissionEditing(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const complianceMutation = useMutation({
    mutationFn: () =>
      adminApi.updateAdminPartner(id, {
        directorFullName: complianceForm.directorFullName || undefined,
        kbisUrl: complianceForm.kbisUrl || undefined,
        directorIdCardUrl: complianceForm.directorIdCardUrl || undefined,
        siretNumber: complianceForm.siretNumber || undefined,
        isVerified: complianceForm.isVerified,
      }),
    onSuccess: () => {
      toast.success('Informations mises à jour');
      setComplianceOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-detail', id] });
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  // ── Screen creation mutation ──
  const createScreenMutation = useMutation({
    mutationFn: () =>
      adminApi.createScreenForPartner({
        partnerOrgId: id,
        name: screenForm.name,
        address: screenForm.address || undefined,
        city: screenForm.city || undefined,
        postCode: screenForm.postCode || undefined,
        environment: screenForm.environment || undefined,
        siteId: screenForm.siteId || undefined,
        resolution: screenForm.resolution || undefined,
        orientation: screenForm.orientation || undefined,
      }),
    onSuccess: () => {
      toast.success('Écran créé avec succès');
      setCreateScreenOpen(false);
      setScreenForm({
        name: '', address: '', city: '', postCode: '',
        environment: '', siteId: '', resolution: '1920x1080', orientation: 'LANDSCAPE',
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    },
    onError: () => toast.error('Erreur lors de la création de l\'écran'),
  });

  // ── Screen delete mutation ──
  const deleteScreenMutation = useMutation({
    mutationFn: (screenId: string) => adminApi.deleteScreenFromAdmin(screenId),
    onSuccess: () => {
      toast.success('Écran supprimé');
      setDeleteScreenOpen(false);
      setDeleteScreenId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  // ── Screen pairing mutation ──
  const pairingMutation = useMutation({
    mutationFn: (screenId: string) => adminApi.generateScreenPairing(screenId),
    onSuccess: (res: any) => {
      const d = res?.data;
      setPairingPin(d?.pin ?? null);
      setPairingExpires(d?.expiresAt ?? null);
      setPairingOpen(true);
    },
    onError: () => toast.error('Erreur lors de la génération du code d\'appairage'),
  });

  // ── Venue mutations ──
  const createVenueMutation = useMutation({
    mutationFn: () =>
      adminApi.createVenueForPartner(id, {
        name: venueForm.name,
        category: venueForm.category || undefined,
        address: venueForm.address || undefined,
        city: venueForm.city || undefined,
        postCode: venueForm.postCode || undefined,
      }),
    onSuccess: () => {
      toast.success('Site créé avec succès');
      setCreateVenueOpen(false);
      setVenueForm({ name: '', category: 'other', address: '', city: '', postCode: '' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-venues', id] });
    },
    onError: () => toast.error('Erreur lors de la création du site'),
  });

  const updateVenueMutation = useMutation({
    mutationFn: () =>
      adminApi.updateVenue(editVenueId!, {
        name: editVenueForm.name,
        category: editVenueForm.category || undefined,
        address: editVenueForm.address || undefined,
        city: editVenueForm.city || undefined,
      }),
    onSuccess: () => {
      toast.success('Site mis à jour');
      setEditVenueOpen(false);
      setEditVenueId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-venues', id] });
    },
    onError: () => toast.error('Erreur lors de la mise à jour du site'),
  });

  const deleteVenueMutation = useMutation({
    mutationFn: (venueId: string) => adminApi.deleteVenue(venueId),
    onSuccess: () => {
      toast.success('Site supprimé');
      setDeleteVenueOpen(false);
      setDeleteVenueId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-venues', id] });
    },
    onError: () => toast.error('Erreur lors de la suppression du site'),
  });

  // ── Loading / Error ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (isError || !partner) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/partners"><ArrowLeft className="h-4 w-4 mr-1" /> Retour</Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Ce partenaire n'existe pas ou a été supprimé.
          </CardContent>
        </Card>
      </div>
    );
  }

  const m = partner.metrics;
  const isSuspended = partner.partnerProfile?.isSuspended ?? false;
  const isVerified = partner.partnerProfile?.isVerified ?? false;
  const commissionPct = partner.commissionRate != null ? Math.round(partner.commissionRate * 100) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/partners"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <PageHeader
          title={partner.name}
          description={[partner.city, partner.address].filter(Boolean).join(' — ') || 'Partenaire cinéma'}
          action={
            <div className="flex items-center gap-2">
              {isVerified ? (
                <Badge className="gap-1 bg-green-100 text-green-700 border-green-200">
                  <CheckCircle className="h-3 w-3" /> Vérifié
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="h-3 w-3" /> Non vérifié
                </Badge>
              )}
              {isSuspended && (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="h-3 w-3" /> Suspendu
                </Badge>
              )}
            </div>
          }
        />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Écrans</p>
              <p className="text-xl font-bold">{m.screensTotal}</p>
              <p className="text-xs text-muted-foreground">
                {m.screensConnected} connectés · {m.screensMaintenance} maint.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">En diffusion</p>
              <p className="text-xl font-bold">{m.screensWithCampaign}</p>
              <p className="text-xs text-muted-foreground">écrans avec campagne active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
              <DollarSign className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rétro à venir</p>
              <p className="text-xl font-bold">{fmt(m.upcomingCommissionCents)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rétro versée</p>
              <p className="text-xl font-bold">{fmt(m.paidCommissionCents)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="network">
        <TabsList>
          <TabsTrigger value="network">
            <Wifi className="h-4 w-4 mr-1.5" /> Réseau
          </TabsTrigger>
          <TabsTrigger value="sites">
            <Building2 className="h-4 w-4 mr-1.5" /> Sites
          </TabsTrigger>
          <TabsTrigger value="admin">
            <FileText className="h-4 w-4 mr-1.5" /> Admin
          </TabsTrigger>
          <TabsTrigger value="finance">
            <DollarSign className="h-4 w-4 mr-1.5" /> Finance
          </TabsTrigger>
          <TabsTrigger value="tvconfig">
            <Settings2 className="h-4 w-4 mr-1.5" /> Config TV
          </TabsTrigger>
        </TabsList>

        {/* ── RÉSEAU TAB ── */}
        <TabsContent value="network" className="space-y-4">
          {/* Screen status summary */}
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: 'Connectés', value: m.screensConnected, color: 'text-green-700', icon: Wifi },
              { label: 'Déconnectés', value: m.screensOffline, color: 'text-red-600', icon: WifiOff },
              { label: 'Maintenance', value: m.screensMaintenance, color: 'text-yellow-600', icon: Wrench },
              { label: 'En diffusion', value: m.screensWithCampaign, color: 'text-blue-600', icon: Monitor },
            ].map(({ label, value, color, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="p-3 flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <div>
                    <p className="text-lg font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Screen list */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Liste des écrans</CardTitle>
                  <CardDescription>Capacité : max {'{capacityMax}'} annonceurs par écran</CardDescription>
                </div>
                <Button size="sm" asChild>
                  <Link href={`/admin/partners/${id}/screens/new`}>
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter un écran
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(partner.screens ?? []).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Monitor className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Aucun écran configuré.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Lieu</TableHead>
                      <TableHead>Statut live</TableHead>
                      <TableHead>Pubs actives</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(partner.screens ?? []).map((screen: any) => (
                      <ScreenRow
                        key={screen.id}
                        screen={screen}
                        onAction={() => refetch()}
                        onDelete={(screenId) => {
                          setDeleteScreenId(screenId);
                          setDeleteScreenOpen(true);
                        }}
                        onPair={(screenId) => pairingMutation.mutate(screenId)}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Members */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Membres ({m.memberCount})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(partner.memberships ?? []).length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">Aucun membre</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Dernière connexion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(partner.memberships ?? []).map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.user.firstName} {m.user.lastName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{m.user.email}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{m.role}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-xs">{fmtDate(m.user.lastLoginAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SITES TAB ── */}
        <TabsContent value="sites" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Sites / Lieux</CardTitle>
                  <CardDescription>Gérez les sites et lieux associés à ce partenaire.</CardDescription>
                </div>
                <Button size="sm" onClick={() => setCreateVenueOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Ajouter un site
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {venuesQuery.isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : venues.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Building2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Aucun site configuré.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Adresse</TableHead>
                      <TableHead>Ville</TableHead>
                      <TableHead>Écrans</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {venues.map((venue: any) => (
                      <TableRow key={venue.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {venue.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          {venue.category ? (
                            <Badge variant="secondary" className="text-xs">{venue.category}</Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{venue.address ?? '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {venue.city ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {venue.city}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {venue._count?.screens ?? venue.screensCount ?? 0} écran(s)
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditVenueId(venue.id);
                                setEditVenueForm({
                                  name: venue.name ?? '',
                                  category: venue.category ?? '',
                                  address: venue.address ?? '',
                                  city: venue.city ?? '',
                                });
                                setEditVenueOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                              onClick={() => {
                                setDeleteVenueId(venue.id);
                                setDeleteVenueOpen(true);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ADMIN TAB ── */}
        <TabsContent value="admin" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Infos inscription */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  Informations administratives
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setComplianceForm({
                        directorFullName: partner.partnerProfile?.directorFullName ?? '',
                        kbisUrl: partner.partnerProfile?.kbisUrl ?? '',
                        directorIdCardUrl: partner.partnerProfile?.directorIdCardUrl ?? '',
                        siretNumber: partner.partnerProfile?.siretNumber ?? partner.vatNumber ?? '',
                        isVerified: partner.partnerProfile?.isVerified ?? false,
                      });
                      setComplianceOpen(true);
                    }}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Modifier
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Entreprise', value: partner.name, icon: Building2 },
                  { label: 'Email', value: partner.contactEmail, icon: Mail },
                  { label: 'SIRET', value: partner.partnerProfile?.siretNumber ?? partner.vatNumber, icon: FileText },
                  { label: 'Dirigeant', value: partner.partnerProfile?.directorFullName, icon: User },
                  { label: 'Adresse', value: partner.address, icon: MapPin },
                  { label: 'Ville', value: partner.city, icon: MapPin },
                  { label: 'Date inscription', value: fmtDate(partner.createdAt), icon: FileText },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <p className="text-sm font-medium">{value ?? <span className="text-muted-foreground">-</span>}</p>
                    </div>
                  </div>
                ))}

                {/* KBIS */}
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-xs text-muted-foreground">KBIS</span>
                    <p className="text-sm">
                      {partner.partnerProfile?.kbisUrl ? (
                        <a href={partner.partnerProfile.kbisUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          Voir le document
                        </a>
                      ) : <span className="text-muted-foreground">-</span>}
                    </p>
                  </div>
                </div>

                {/* Carte d'identité */}
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-xs text-muted-foreground">Pièce d'identité dirigeant</span>
                    <p className="text-sm">
                      {partner.partnerProfile?.directorIdCardUrl ? (
                        <a href={partner.partnerProfile.directorIdCardUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          Voir le document
                        </a>
                      ) : <span className="text-muted-foreground">-</span>}
                    </p>
                  </div>
                </div>

                {/* Vérification */}
                <div className="pt-2 border-t flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Partenaire vérifié</span>
                  {isVerified ? (
                    <Badge className="gap-1 bg-green-100 text-green-700">
                      <CheckCircle className="h-3 w-3" /> Oui
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Non</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Actions admin */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Actions administrateur</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Reset password */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Réinitialiser le mot de passe</p>
                    <p className="text-xs text-muted-foreground">Envoie un mot de passe temporaire au propriétaire</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setResetPasswordOpen(true)}>
                    <KeyRound className="h-4 w-4 mr-1" />
                    Reset
                  </Button>
                </div>

                {/* Suspend/Reactivate */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{isSuspended ? 'Réactiver le partenaire' : 'Suspendre le partenaire'}</p>
                    <p className="text-xs text-muted-foreground">
                      {isSuspended
                        ? `Suspendu le ${fmtDate(partner.partnerProfile?.suspendedAt ?? null)}`
                        : 'Bloque l\'accès au portail partenaire'}
                    </p>
                    {isSuspended && partner.partnerProfile?.suspensionReason && (
                      <p className="text-xs text-red-600 mt-1">Raison : {partner.partnerProfile.suspensionReason}</p>
                    )}
                  </div>
                  {isSuspended ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-700"
                      onClick={() => suspendMutation.mutate(false)}
                      disabled={suspendMutation.isPending}
                    >
                      <ShieldCheck className="h-4 w-4 mr-1" />
                      Réactiver
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200"
                      onClick={() => setSuspendOpen(true)}
                    >
                      <ShieldAlert className="h-4 w-4 mr-1" />
                      Suspendre
                    </Button>
                  )}
                </div>

                {/* Verify */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{isVerified ? 'Révoquer la vérification' : 'Marquer comme vérifié'}</p>
                    <p className="text-xs text-muted-foreground">
                      {isVerified
                        ? `Vérifié le ${fmtDate(partner.partnerProfile?.verifiedAt ?? null)}`
                        : 'Valider les documents du partenaire'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => adminApi.updateAdminPartner(id, { isVerified: !isVerified }).then(() => {
                      toast.success(isVerified ? 'Vérification révoquée' : 'Partenaire vérifié');
                      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-detail', id] });
                    }).catch(() => toast.error('Erreur'))}
                  >
                    {isVerified ? <XCircle className="h-4 w-4 mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                    {isVerified ? 'Révoquer' : 'Vérifier'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── FINANCE TAB ── */}
        <TabsContent value="finance" className="space-y-4">
          {/* Commission rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Taux de commission</CardTitle>
              <CardDescription>Entre 5% et 20%. Modifiable par l'admin uniquement.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                {commissionEditing ? (
                  <>
                    <Input
                      type="number"
                      min={5}
                      max={20}
                      step={1}
                      value={commissionValue}
                      onChange={(e) => setCommissionValue(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    <Button
                      size="sm"
                      disabled={commissionMutation.isPending || !commissionValue}
                      onClick={() => commissionMutation.mutate(Number(commissionValue) / 100)}
                    >
                      {commissionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Valider
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setCommissionEditing(false)}>Annuler</Button>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-bold">{commissionPct ?? '-'}%</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setCommissionValue(String(commissionPct ?? 15)); setCommissionEditing(true); }}
                    >
                      Modifier
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Revenue statements */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Relevés de rétrocession</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(partner.revenueShares ?? []).length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <DollarSign className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  <p>Aucun relevé disponible</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Période</TableHead>
                      <TableHead className="text-right">CA total</TableHead>
                      <TableHead className="text-right">Part partenaire</TableHead>
                      <TableHead className="text-right">Taux</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Paiement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(partner.revenueShares ?? []).map((rs: any) => (
                      <TableRow key={rs.id}>
                        <TableCell className="text-sm">
                          {fmtDate(rs.periodStart)} — {fmtDate(rs.periodEnd)}
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmt(rs.totalRevenueCents ?? 0)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(rs.partnerShareCents ?? 0)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {rs.platformRate != null ? `${Math.round((1 - rs.platformRate) * 100)}%` : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${
                              rs.status === 'PAID' ? 'bg-green-100 text-green-700' :
                              rs.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
                              rs.status === 'CALCULATED' ? 'bg-purple-100 text-purple-700' :
                              'bg-muted text-muted-foreground'
                            }`}
                          >
                            {rs.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {rs.payout ? (
                            <span className={rs.payout.status === 'PAID' ? 'text-green-700' : ''}>
                              {rs.payout.status} {rs.payout.paidAt ? `(${fmtDate(rs.payout.paidAt)})` : ''}
                            </span>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Payouts */}
          {(partner.payouts ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Virements Stripe Connect</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(partner.payouts ?? []).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{fmtDate(p.paidAt)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(p.amountCents ?? 0)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${p.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-muted'}`}
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TV CONFIG TAB ── */}
        <TabsContent value="tvconfig" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Configuration TV par écran</CardTitle>
              <CardDescription>
                Activez/désactivez les modules pour chaque écran et définissez l'onglet par défaut au démarrage.
                Les modifications sont poussées en temps réel à la TV app.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {tvConfigQuery.isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : tvConfigs.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <Settings2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  <p>Aucun écran actif trouvé.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Écran</TableHead>
                      <TableHead>Modules activés</TableHead>
                      <TableHead>Onglet par défaut</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tvConfigs.map((config) => (
                      <TvConfigRow
                        key={config.screenId}
                        config={config}
                        partnerId={id}
                        onUpdated={() => tvConfigQuery.refetch()}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Create Screen Dialog ── */}
      <Dialog open={createScreenOpen} onOpenChange={setCreateScreenOpen}>
        <DialogContent className="bg-popover max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un écran</DialogTitle>
            <DialogDescription>
              Créer un nouvel écran pour {partner.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input
                placeholder="Ex: Écran Hall A"
                value={screenForm.name}
                onChange={(e) => setScreenForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input
                  placeholder="12 rue du cinéma"
                  value={screenForm.address}
                  onChange={(e) => setScreenForm((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input
                  placeholder="Paris"
                  value={screenForm.city}
                  onChange={(e) => setScreenForm((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Code postal</Label>
                <Input
                  placeholder="75001"
                  value={screenForm.postCode}
                  onChange={(e) => setScreenForm((p) => ({ ...p, postCode: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Environnement</Label>
                <Select
                  value={screenForm.environment}
                  onValueChange={(val) => setScreenForm((p) => ({ ...p, environment: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ENVIRONMENTS.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Site</Label>
              <Select
                value={screenForm.siteId}
                onValueChange={(val) => setScreenForm((p) => ({ ...p, siteId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucun site (optionnel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun</SelectItem>
                  {venues.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Résolution</Label>
                <Input
                  placeholder="1920x1080"
                  value={screenForm.resolution}
                  onChange={(e) => setScreenForm((p) => ({ ...p, resolution: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Orientation</Label>
                <Select
                  value={screenForm.orientation}
                  onValueChange={(val) => setScreenForm((p) => ({ ...p, orientation: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LANDSCAPE">Paysage</SelectItem>
                    <SelectItem value="PORTRAIT">Portrait</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateScreenOpen(false)}>Annuler</Button>
            <Button
              onClick={() => createScreenMutation.mutate()}
              disabled={createScreenMutation.isPending || !screenForm.name.trim()}
            >
              {createScreenMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Créer l'écran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Screen Dialog ── */}
      <Dialog open={deleteScreenOpen} onOpenChange={setDeleteScreenOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Supprimer l'écran
            </DialogTitle>
            <DialogDescription>
              Cette action est irréversible. L'écran et toutes ses données associées seront supprimés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteScreenOpen(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => deleteScreenId && deleteScreenMutation.mutate(deleteScreenId)}
              disabled={deleteScreenMutation.isPending}
            >
              {deleteScreenMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pairing PIN Dialog ── */}
      <Dialog open={pairingOpen} onOpenChange={setPairingOpen}>
        <DialogContent className="bg-popover max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Code d'appairage
            </DialogTitle>
            <DialogDescription>
              Saisissez ce code PIN sur l'écran TV pour l'appairer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="text-4xl font-mono font-bold tracking-[0.3em] bg-muted rounded-lg px-6 py-3">
              {pairingPin ?? '----'}
            </div>
            {pairingExpires && (
              <p className="text-xs text-muted-foreground">
                Expire le {fmtDate(pairingExpires)} à {new Date(pairingExpires).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPairingOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Venue/Site Dialog ── */}
      <Dialog open={createVenueOpen} onOpenChange={setCreateVenueOpen}>
        <DialogContent className="bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un site</DialogTitle>
            <DialogDescription>
              Renseignez les informations du nouveau site pour {partner.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du site *</Label>
              <Input
                placeholder="Ex: Hôtel Le Marais"
                value={venueForm.name}
                onChange={(e) => setVenueForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select
                value={venueForm.category || 'other'}
                onValueChange={(val) => setVenueForm((p) => ({ ...p, category: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cinema">Cinéma</SelectItem>
                  <SelectItem value="hotel">Hôtel</SelectItem>
                  <SelectItem value="conciergerie">Conciergerie</SelectItem>
                  <SelectItem value="airbnb">Airbnb / Location courte durée</SelectItem>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Adresse *</Label>
              <Input
                placeholder="15 Rue des Archives, 75004 Paris"
                value={venueForm.address}
                onChange={(e) => setVenueForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ville *</Label>
                <Input
                  placeholder="Paris"
                  value={venueForm.city}
                  onChange={(e) => setVenueForm((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Code postal</Label>
                <Input
                  placeholder="75004"
                  value={venueForm.postCode ?? ''}
                  onChange={(e) => setVenueForm((p) => ({ ...p, postCode: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateVenueOpen(false)}>Annuler</Button>
            <Button
              onClick={() => createVenueMutation.mutate()}
              disabled={createVenueMutation.isPending || !venueForm.name.trim()}
            >
              {createVenueMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Créer le site
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Venue Dialog ── */}
      <Dialog open={editVenueOpen} onOpenChange={setEditVenueOpen}>
        <DialogContent className="bg-popover max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le site</DialogTitle>
            <DialogDescription>
              Modifiez les informations du site.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input
                value={editVenueForm.name}
                onChange={(e) => setEditVenueForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Input
                value={editVenueForm.category}
                onChange={(e) => setEditVenueForm((p) => ({ ...p, category: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input
                value={editVenueForm.address}
                onChange={(e) => setEditVenueForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Ville</Label>
              <Input
                value={editVenueForm.city}
                onChange={(e) => setEditVenueForm((p) => ({ ...p, city: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVenueOpen(false)}>Annuler</Button>
            <Button
              onClick={() => updateVenueMutation.mutate()}
              disabled={updateVenueMutation.isPending || !editVenueForm.name.trim()}
            >
              {updateVenueMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Venue Dialog ── */}
      <Dialog open={deleteVenueOpen} onOpenChange={setDeleteVenueOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Supprimer le site
            </DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Le site sera supprimé.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteVenueOpen(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => deleteVenueId && deleteVenueMutation.mutate(deleteVenueId)}
              disabled={deleteVenueMutation.isPending}
            >
              {deleteVenueMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              Cela va générer un mot de passe temporaire pour le propriétaire de {partner.name}.
              Le mot de passe sera affiché une seule fois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Annuler</Button>
            <Button
              onClick={() => resetPasswordMutation.mutate()}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Suspend Dialog ── */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Suspendre {partner.name}
            </DialogTitle>
            <DialogDescription>
              Le partenaire n'aura plus accès au portail. Indiquez une raison.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Raison (optionnel)</Label>
            <Input
              placeholder="Ex: Documents manquants, fraude détectée..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => suspendMutation.mutate(true)}
              disabled={suspendMutation.isPending}
            >
              {suspendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Suspendre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Compliance Edit Dialog ── */}
      <Dialog open={complianceOpen} onOpenChange={setComplianceOpen}>
        <DialogContent className="bg-popover max-w-md">
          <DialogHeader>
            <DialogTitle>Informations de conformité</DialogTitle>
            <DialogDescription>
              Mettez à jour les informations légales et documents du partenaire.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du dirigeant</Label>
              <Input
                placeholder="Jean Dupont"
                value={complianceForm.directorFullName}
                onChange={(e) => setComplianceForm((p) => ({ ...p, directorFullName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Numéro SIRET</Label>
              <Input
                placeholder="123 456 789 00012"
                value={complianceForm.siretNumber}
                onChange={(e) => setComplianceForm((p) => ({ ...p, siretNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>URL KBIS (S3)</Label>
              <Input
                placeholder="https://..."
                value={complianceForm.kbisUrl}
                onChange={(e) => setComplianceForm((p) => ({ ...p, kbisUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>URL pièce d'identité dirigeant (S3)</Label>
              <Input
                placeholder="https://..."
                value={complianceForm.directorIdCardUrl}
                onChange={(e) => setComplianceForm((p) => ({ ...p, directorIdCardUrl: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isVerified"
                checked={complianceForm.isVerified}
                onChange={(e) => setComplianceForm((p) => ({ ...p, isVerified: e.target.checked }))}
                className="h-4 w-4"
              />
              <label htmlFor="isVerified" className="text-sm font-medium">
                Marquer comme vérifié
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComplianceOpen(false)}>Annuler</Button>
            <Button onClick={() => complianceMutation.mutate()} disabled={complianceMutation.isPending}>
              {complianceMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
