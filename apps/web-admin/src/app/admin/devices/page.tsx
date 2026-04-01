'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Wifi, WifiOff, MoreHorizontal, Eye, Power, PowerOff, CheckCircle, XCircle, Search, Clock, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card, CardContent,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Badge, Skeleton, Button, Input,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Textarea,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { adminApi } from '@/lib/admin-api';
import { apiFetch } from '@/lib/api';
import { useAdminSocket } from '@/hooks/use-admin-socket';

const STATUS_TABS = [
  { value: '__all__', label: 'Tous' },
  { value: 'PENDING_APPROVAL', label: 'En attente' },
  { value: 'ACTIVE', label: 'Actifs' },
  { value: 'INACTIVE', label: 'Inactifs' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'SUSPENDED', label: 'Suspendus' },
];

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') || '__all__';

  const { connected, screenStatuses } = useAdminSocket();
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [pairDialogOpen, setPairDialogOpen] = useState(false);
  const [pinDigits, setPinDigits] = useState(['', '', '', '', '', '']);
  const [pairResult, setPairResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { data: screensData, isLoading } = useQuery({
    queryKey: ['admin', 'screens', statusFilter],
    queryFn: () => adminApi.getAdminScreens({
      status: statusFilter !== '__all__' ? statusFilter : undefined,
      limit: 200,
    }),
    refetchInterval: connected ? false : 15_000,
  });

  const screens = (screensData as any)?.data?.data ?? [];

  // Merge live statuses from socket
  const liveMap: Record<string, any> = {};
  screenStatuses.forEach((s: any) => { liveMap[s.screenId] = s; });

  const onlineCount = screens.filter((s: any) => {
    const live = liveMap[s.id] || s.screenLiveStatus;
    return live?.isOnline;
  }).length;

  const pendingCount = screens.filter((s: any) => s.status === 'PENDING_APPROVAL').length;

  // Filter by search
  const filteredScreens = searchFilter
    ? screens.filter((s: any) =>
        s.name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        s.city?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        s.partnerOrg?.name?.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : screens;

  // Mutations
  const activateMut = useMutation({
    mutationFn: (id: string) => adminApi.updateAdminScreen(id, { status: 'ACTIVE', approvedAt: new Date().toISOString() }),
    onSuccess: () => {
      toast.success('Écran activé');
      queryClient.invalidateQueries({ queryKey: ['admin', 'screens'] });
    },
    onError: () => toast.error("Erreur lors de l'activation"),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => adminApi.updateAdminScreen(id, { status: 'INACTIVE' }),
    onSuccess: () => {
      toast.success('Écran désactivé');
      queryClient.invalidateQueries({ queryKey: ['admin', 'screens'] });
    },
    onError: () => toast.error('Erreur lors de la désactivation'),
  });

  const bulkApproveMut = useMutation({
    mutationFn: () => adminApi.bulkApproveScreens(Array.from(selectedIds)),
    onSuccess: (res: any) => {
      toast.success(`${res?.data?.approved ?? selectedIds.size} écran(s) approuvé(s)`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin', 'screens'] });
    },
    onError: (err: any) => toast.error(err.message || 'Erreur'),
  });

  const bulkRejectMut = useMutation({
    mutationFn: (reason: string) => adminApi.bulkRejectScreens(Array.from(selectedIds), reason),
    onSuccess: (res: any) => {
      toast.success(`${res?.data?.rejected ?? selectedIds.size} écran(s) rejeté(s)`);
      setSelectedIds(new Set());
      setRejectDialogOpen(false);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'screens'] });
    },
    onError: (err: any) => toast.error(err.message || 'Erreur'),
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredScreens.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredScreens.map((s: any) => s.id)));
    }
  }, [filteredScreens, selectedIds.size]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Écrans & Appareils" description="Monitoring temps réel des écrans" />
        <div className="flex items-center gap-2">
          <Button onClick={() => setPairDialogOpen(true)}>
            <Link2 className="mr-2 h-4 w-4" />
            Appairer un appareil
          </Button>
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              Polling
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-4">
        <StatCard title="En ligne" value={isLoading ? '...' : onlineCount} icon={Wifi} />
        <StatCard title="Hors ligne" value={isLoading ? '...' : screens.length - onlineCount} icon={WifiOff} />
        <StatCard title="En attente" value={isLoading ? '...' : pendingCount} icon={Clock} />
        <StatCard title="Total" value={isLoading ? '...' : screens.length} icon={Monitor} />
      </div>

      {/* Status tabs + Search */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.value}
                variant={statusFilter === tab.value ? 'default' : 'outline'}
                size="sm"
                className="h-8"
                onClick={() => { setStatusFilter(tab.value); setSelectedIds(new Set()); }}
              >
                {tab.label}
                {tab.value === 'PENDING_APPROVAL' && pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-1.5 h-5 px-1.5 text-xs">{pendingCount}</Badge>
                )}
              </Button>
            ))}
            <div className="flex-1" />
            <div className="relative min-w-50">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
              <Button size="sm" onClick={() => bulkApproveMut.mutate()} disabled={bulkApproveMut.isPending}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Approuver
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setRejectDialogOpen(true)} disabled={bulkRejectMut.isPending}>
                <XCircle className="h-4 w-4 mr-1" />
                Rejeter
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Désélectionner
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredScreens.length && filteredScreens.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead>Écran</TableHead>
                  <TableHead>Partenaire</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Connexion</TableHead>
                  <TableHead className="text-right">CPU %</TableHead>
                  <TableHead className="text-right">RAM %</TableHead>
                  <TableHead>Dernier ping</TableHead>
                  <TableHead className="w-12.5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScreens.map((screen: any) => {
                  const live = liveMap[screen.id] || screen.screenLiveStatus || {};
                  const isOnline = live.isOnline ?? false;
                  const cpu = live.cpuPercent != null ? Math.round(live.cpuPercent) : null;
                  const mem = live.memoryPercent != null ? Math.round(live.memoryPercent) : null;
                  const isPending = screen.status === 'PENDING_APPROVAL';
                  const isActive = screen.status === 'ACTIVE';
                  return (
                    <TableRow key={screen.id} className={isPending ? 'bg-yellow-50/50' : ''}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(screen.id)}
                          onChange={() => toggleSelect(screen.id)}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/admin/screens/${screen.id}`} className="hover:text-primary hover:underline">
                          {screen.name}
                        </Link>
                      </TableCell>
                      <TableCell>{screen.partnerOrg?.name ?? '—'}</TableCell>
                      <TableCell>{screen.city ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={isPending ? 'secondary' : isActive ? 'default' : 'outline'}>
                          {isPending ? 'En attente' : screen.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isOnline ? 'default' : 'destructive'}>
                          {isOnline ? 'En ligne' : 'Hors ligne'}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right ${cpu && cpu > 80 ? 'text-red-600 font-bold' : ''}`}>
                        {cpu != null ? `${cpu}%` : '—'}
                      </TableCell>
                      <TableCell className={`text-right ${mem && mem > 80 ? 'text-red-600 font-bold' : ''}`}>
                        {mem != null ? `${mem}%` : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {live.lastHeartbeatAt ? new Date(live.lastHeartbeatAt).toLocaleTimeString('fr-FR') : '—'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/screens/${screen.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                Voir détails
                              </Link>
                            </DropdownMenuItem>
                            {isPending && (
                              <>
                                <DropdownMenuItem onClick={() => activateMut.mutate(screen.id)}>
                                  <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                                  Approuver
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedIds(new Set([screen.id]));
                                    setRejectDialogOpen(true);
                                  }}
                                >
                                  <XCircle className="mr-2 h-4 w-4 text-red-600" />
                                  Rejeter
                                </DropdownMenuItem>
                              </>
                            )}
                            {isActive && (
                              <DropdownMenuItem onClick={() => deactivateMut.mutate(screen.id)}>
                                <PowerOff className="mr-2 h-4 w-4" />
                                Désactiver
                              </DropdownMenuItem>
                            )}
                            {!isActive && !isPending && (
                              <DropdownMenuItem onClick={() => activateMut.mutate(screen.id)}>
                                <Power className="mr-2 h-4 w-4" />
                                Activer
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredScreens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      Aucun écran trouvé
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reject Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={() => { setRejectDialogOpen(false); setRejectReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter {selectedIds.size} écran{selectedIds.size > 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Raison du rejet..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectDialogOpen(false); setRejectReason(''); }}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkRejectMut.mutate(rejectReason)}
              disabled={!rejectReason.trim() || bulkRejectMut.isPending}
            >
              Rejeter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pair Device Modal — pure CSS modal (bypasses Radix Dialog bug) */}
      {pairDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 animate-in fade-in-0"
            onClick={() => { setPairDialogOpen(false); setPinDigits(['', '', '', '', '', '']); setPairResult(null); }}
          />
          {/* Modal panel */}
          <div className="relative z-10 w-full max-w-md rounded-xl border bg-background p-6 shadow-lg animate-in fade-in-0 zoom-in-95">
            {/* Close button */}
            <button
              type="button"
              onClick={() => { setPairDialogOpen(false); setPinDigits(['', '', '', '', '', '']); setPairResult(null); }}
              className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
            >
              <XCircle className="h-5 w-5" />
            </button>
            {/* Header */}
            <div className="mb-1">
              <h2 className="text-lg font-semibold leading-none tracking-tight">Appairer un appareil TV</h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                Entrez le code PIN à 6 chiffres affiché sur l&apos;écran TV du partenaire.
              </p>
            </div>
            {/* PIN inputs */}
            <div className="space-y-6 py-4">
              <div className="flex justify-center gap-2">
                {pinDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { pinRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, '').slice(-1);
                      setPinDigits((prev) => { const n = [...prev]; n[i] = d; return n; });
                      if (d && i < 5) pinRefs.current[i + 1]?.focus();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !pinDigits[i] && i > 0) pinRefs.current[i - 1]?.focus();
                    }}
                    onPaste={i === 0 ? (e) => {
                      e.preventDefault();
                      const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                      const nd = ['', '', '', '', '', ''];
                      for (let j = 0; j < p.length; j++) nd[j] = p[j];
                      setPinDigits(nd);
                      pinRefs.current[Math.min(p.length, 5)]?.focus();
                    } : undefined}
                    className="h-14 w-11 rounded-lg border-2 border-input bg-background text-center text-2xl font-bold tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                ))}
              </div>
              {pairResult && (
                <div className={`rounded-lg p-3 text-center text-sm ${pairResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {pairResult.ok ? <CheckCircle className="mx-auto mb-1 h-5 w-5" /> : <XCircle className="mx-auto mb-1 h-5 w-5" />}
                  <p>{pairResult.msg}</p>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setPairDialogOpen(false); setPinDigits(['', '', '', '', '', '']); setPairResult(null); }}>
                {pairResult?.ok ? 'Fermer' : 'Annuler'}
              </Button>
              {!pairResult?.ok && (
                <Button
                  disabled={pinDigits.join('').length < 6 || isPairing}
                  onClick={async () => {
                    const code = pinDigits.join('');
                    if (code.length < 6) return;
                    setIsPairing(true);
                    setPairResult(null);
                    try {
                      const res = await apiFetch<any>('/tv/pair', { method: 'POST', body: JSON.stringify({ pin: code }) });
                      const d = res?.data ?? res;
                      setPairResult({ ok: true, msg: `Appareil ${d?.device?.serialNumber ?? ''} appairé !` });
                      toast.success('Appareil appairé avec succès');
                      queryClient.invalidateQueries({ queryKey: ['admin', 'screens'] });
                    } catch (err: any) {
                      setPairResult({ ok: false, msg: err.message || 'PIN invalide ou expiré' });
                    } finally {
                      setIsPairing(false);
                    }
                  }}
                >
                  {isPairing ? 'Appairage...' : 'Appairer'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
