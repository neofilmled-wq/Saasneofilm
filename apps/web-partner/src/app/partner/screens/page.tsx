'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Monitor, Upload, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

interface BulkRow {
  name: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  screenType?: string;
}

interface BulkResult {
  created: any[];
  errors: Array<{ row: number; message: string }>;
  total: number;
}

function parseCsvRows(text: string): BulkRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"(.*)"$/, '$1'));
    const obj: any = {};
    header.forEach((key, i) => { obj[key] = values[i] ?? ''; });
    if (obj.latitude) obj.latitude = parseFloat(obj.latitude);
    if (obj.longitude) obj.longitude = parseFloat(obj.longitude);
    return obj as BulkRow;
  });
}

export default function ScreensPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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

  // Bulk import
  const [showBulk, setShowBulk] = useState(false);
  const [csvRows, setCsvRows] = useState<BulkRow[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvRows(parseCsvRows(text));
    };
    reader.readAsText(file);
  }

  async function handleBulkSubmit() {
    if (!user?.orgId || csvRows.length === 0) return;
    setBulkLoading(true);
    try {
      const result: BulkResult = await apiFetch('/screens/bulk', {
        method: 'POST',
        body: JSON.stringify({ partnerOrgId: user.orgId, rows: csvRows }),
      });
      setBulkResult(result);
      queryClient.invalidateQueries({ queryKey: ['screens', user?.orgId] });
    } catch (err: any) {
      setBulkResult({ created: [], errors: [{ row: 0, message: err.message }], total: csvRows.length });
    } finally {
      setBulkLoading(false);
    }
  }

  const screens = data?.data?.data ?? data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Mes écrans" description="Gérez les écrans de votre réseau">
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => setShowBulk(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importer CSV
          </Button>
          <Link href="/partner/screens/new">
            <Button className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> Nouvel écran
            </Button>
          </Link>
        </div>
      </PageHeader>

      {/* Status summary — gradient cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'En ligne', value: summary.online ?? 0, variant: 'stat-card-success' as const },
            { label: 'Hors ligne', value: summary.offline ?? 0, variant: 'stat-card-danger' as const },
            { label: 'Maintenance', value: summary.maintenance ?? 0, variant: 'stat-card-warning' as const },
            { label: 'Total écrans', value: (summary.online ?? 0) + (summary.offline ?? 0) + (summary.maintenance ?? 0) + (summary.needsReconnect ?? 0), variant: 'stat-card-primary' as const },
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

      {/* Bulk import modal */}
      {showBulk && (
        <Card className="border-primary rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Import CSV</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowBulk(false); setBulkResult(null); setCsvRows([]); }}>
                Fermer
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Format CSV : <code className="bg-muted px-1 rounded">name,address,city,latitude,longitude,screenType</code>
              {' '}(première ligne = en-têtes)
            </p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Choisir un fichier CSV
            </Button>

            {csvRows.length > 0 && !bulkResult && (
              <>
                <p className="text-sm font-medium">{csvRows.length} écran(s) prêts à importer :</p>
                <div className="rounded-md border max-h-48 overflow-y-auto divide-y text-sm">
                  {csvRows.slice(0, 10).map((row, i) => (
                    <div key={i} className="px-3 py-2 flex gap-2">
                      <span className="font-medium">{row.name}</span>
                      <span className="text-muted-foreground">{row.city}</span>
                    </div>
                  ))}
                  {csvRows.length > 10 && (
                    <div className="px-3 py-2 text-muted-foreground text-xs">
                      + {csvRows.length - 10} autres…
                    </div>
                  )}
                </div>
                <Button onClick={handleBulkSubmit} disabled={bulkLoading}>
                  {bulkLoading ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Import en cours…</> : `Importer ${csvRows.length} écran(s)`}
                </Button>
              </>
            )}

            {bulkResult && (
              <div className="space-y-2">
                <div className="flex gap-4 text-sm font-medium">
                  <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-4 w-4" /> {bulkResult.created.length} créés</span>
                  <span className="text-red-600 flex items-center gap-1"><XCircle className="h-4 w-4" /> {bulkResult.errors.length} erreurs</span>
                </div>
                {bulkResult.errors.length > 0 && (
                  <div className="rounded-md border divide-y max-h-32 overflow-y-auto text-sm">
                    {bulkResult.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 text-red-600">Ligne {e.row} : {e.message}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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
