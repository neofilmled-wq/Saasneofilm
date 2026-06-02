'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Card, CardContent,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Badge, Skeleton, Button, Input, Label, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Textarea,
} from '@neofilm/ui';
import { Upload, Trash2, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { apiFetch } from '@/lib/api';

interface AppRelease {
  id: string;
  versionName: string;
  versionCode: number;
  apkUrl: string;
  sha256: string;
  fileSize: number;
  releaseNotes: string | null;
  isRequired: boolean;
  isActive: boolean;
  targetVariant: string;
  rolloutPercent: number;
  targetScreenIds: string[];
  createdAt: string;
  _count?: { installStatuses: number };
  createdBy?: { firstName: string; lastName: string } | null;
}

interface DeviceStatus {
  id: string;
  status: 'PENDING' | 'DOWNLOADING' | 'INSTALLING' | 'SUCCESS' | 'FAILED';
  errorMessage: string | null;
  attempts: number;
  startedAt: string;
  completedAt: string | null;
  device: {
    id: string;
    serialNumber: string;
    appVersion: string | null;
    screen: { id: string; name: string } | null;
  };
}

export default function TvReleasesPage() {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailRelease, setDetailRelease] = useState<AppRelease | null>(null);

  const { data: releasesEnv, isLoading } = useQuery({
    queryKey: ['admin', 'tv-releases'],
    queryFn: () => apiFetch<{ data: AppRelease[] }>('/admin/tv-releases'),
    refetchInterval: 30_000,
  });
  const releases = releasesEnv?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AppRelease> }) =>
      apiFetch(`/admin/tv-releases/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tv-releases'] });
      toast.success('Release mise à jour');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/tv-releases/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tv-releases'] });
      toast.success('Release supprimée');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mises à jour TV (OTA)"
        description="APK pour les Fire Stick / Android TV NeoFilm. Une release active est récupérée automatiquement par chaque appareil dans les ~6h, ou immédiatement via WebSocket."
        action={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Nouvelle release
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : releases.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              Aucune release publiée. Cliquez sur <em>Nouvelle release</em> pour uploader un APK.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Rollout</TableHead>
                  <TableHead>Cible</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Forcée</TableHead>
                  <TableHead>Taille</TableHead>
                  <TableHead>Crée par</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((r) => (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer ${r.isActive ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : ''}`}
                    onClick={() => setDetailRelease(r)}
                  >
                    <TableCell className="font-mono">
                      <div className="flex items-center gap-2">
                        <span>v{r.versionName}</span>
                        <span className="text-xs text-gray-500">({r.versionCode})</span>
                        {r.isActive && (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">EN COURS</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{r.targetVariant}</Badge></TableCell>
                    <TableCell>{r.rolloutPercent}%</TableCell>
                    <TableCell>
                      {r.targetScreenIds.length === 0
                        ? <span className="text-xs text-gray-500">Toutes</span>
                        : <Badge variant="secondary">{r.targetScreenIds.length} écran(s)</Badge>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => updateMutation.mutate({ id: r.id, patch: { isActive: !r.isActive } })}
                        className={`inline-flex h-7 w-12 items-center rounded-full border-2 transition-colors ${
                          r.isActive
                            ? 'border-emerald-500 bg-emerald-500 justify-end'
                            : 'border-gray-500 bg-gray-700 justify-start'
                        }`}
                        aria-pressed={r.isActive}
                        aria-label={r.isActive ? 'Désactiver' : 'Activer'}
                      >
                        <span className="mx-0.5 h-5 w-5 rounded-full bg-white shadow" />
                      </button>
                    </TableCell>
                    <TableCell>{r.isRequired ? 'Oui' : 'Non'}</TableCell>
                    <TableCell className="text-xs text-gray-500">{formatBytes(r.fileSize)}</TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '—'}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Supprimer la release v${r.versionName} ?`)) {
                            deleteMutation.mutate(r.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <DetailDialog release={detailRelease} onClose={() => setDetailRelease(null)} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Upload dialog
// ───────────────────────────────────────────────────────────

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState<number | ''>('');
  const [variant, setVariant] = useState('legacy');
  const [rollout, setRollout] = useState(100);
  const [isRequired, setIsRequired] = useState(true);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const reset = () => {
    setVersionName(''); setVersionCode(''); setVariant('legacy'); setRollout(100);
    setIsRequired(true); setReleaseNotes(''); setFile(null); setProgress('');
  };

  const handleSubmit = async () => {
    if (!file) return toast.error('Sélectionnez un APK');
    if (!versionName || typeof versionCode !== 'number') return toast.error('Version requise');
    setBusy(true);
    try {
      setProgress('Génération de l\'URL d\'upload…');
      const presignedEnv = await apiFetch<{ data: { uploadUrl: string; uploadKey: string } }>(
        '/admin/tv-releases/upload-url',
        { method: 'POST', body: JSON.stringify({ versionName, versionCode }) },
      );
      // The NestJS TransformInterceptor wraps every response in { data, statusCode, timestamp }.
      // apiFetch returns it raw — unwrap here.
      const presigned = presignedEnv.data;
      if (!presigned?.uploadUrl || !presigned?.uploadKey) {
        throw new Error('Réponse upload-url invalide (uploadUrl manquant)');
      }

      setProgress('Upload de l\'APK vers le stockage…');
      const putRes = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/vnd.android.package-archive' },
      });
      if (!putRes.ok) throw new Error(`Upload S3 a échoué: ${putRes.status}`);

      setProgress('Calcul du SHA-256…');
      const sha256 = await computeSha256(file);

      setProgress('Enregistrement de la release…');
      await apiFetch('/admin/tv-releases', {
        method: 'POST',
        body: JSON.stringify({
          versionName,
          versionCode,
          uploadKey: presigned.uploadKey,
          sha256,
          fileSize: file.size,
          releaseNotes: releaseNotes || undefined,
          isRequired,
          targetVariant: variant,
          rolloutPercent: rollout,
        }),
      });

      toast.success(`Release v${versionName} publiée — push WS envoyé aux appareils`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'tv-releases'] });
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publier une nouvelle release TV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nom de version (ex: 0.3.0)</Label>
              <Input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="0.3.0" />
            </div>
            <div>
              <Label>versionCode (ex: 3) — doit être &gt; à l'actuel</Label>
              <Input
                type="number"
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                placeholder="3"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Variant cible</Label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
              >
                <option value="legacy">legacy (Fire Stick / Android TV)</option>
                <option value="standard">standard</option>
                <option value="all">all (tous)</option>
              </select>
            </div>
            <div>
              <Label>Rollout (% des appareils)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={rollout}
                onChange={(e) => setRollout(Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))))}
              />
            </div>
          </div>

          <div>
            <Label>Notes de release</Label>
            <Textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              placeholder="Corrections de bugs, nouveau service vidéo, …"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isRequired} onCheckedChange={setIsRequired} id="required" />
            <Label htmlFor="required">Mise à jour obligatoire (forcée à chaque boot)</Label>
          </div>

          <div>
            <Label>Fichier APK</Label>
            <Input
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="mt-1 text-xs text-gray-500">
                {file.name} — {formatBytes(file.size)}
              </p>
            )}
          </div>

          {progress && (
            <div className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
              <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
              {progress}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={busy || !file}>
            {busy ? 'En cours…' : 'Publier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────
// Detail dialog — per-device install status
// ───────────────────────────────────────────────────────────

function DetailDialog({ release, onClose }: { release: AppRelease | null; onClose: () => void }) {
  const { data: env, isLoading } = useQuery({
    queryKey: ['admin', 'tv-releases', release?.id],
    queryFn: () => apiFetch<{ data: AppRelease & { installStatuses: DeviceStatus[] } }>(`/admin/tv-releases/${release!.id}`),
    enabled: !!release,
    refetchInterval: 10_000,
  });
  const detail = env?.data;

  return (
    <Dialog open={!!release} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            v{release?.versionName} — détail des installations
          </DialogTitle>
        </DialogHeader>

        {isLoading || !detail ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-sm">
              <Stat label="Total appareils" value={detail.installStatuses?.length ?? 0} />
              <Stat label="Réussies" value={detail.installStatuses?.filter(s => s.status === 'SUCCESS').length ?? 0} color="green" />
              <Stat label="En cours" value={detail.installStatuses?.filter(s => ['PENDING','DOWNLOADING','INSTALLING'].includes(s.status)).length ?? 0} color="blue" />
              <Stat label="Échecs" value={detail.installStatuses?.filter(s => s.status === 'FAILED').length ?? 0} color="red" />
            </div>

            <div>
              <Label className="text-xs text-gray-500">SHA-256</Label>
              <code className="block break-all rounded bg-gray-100 px-2 py-1 text-xs">{detail.sha256}</code>
            </div>
            <div>
              <Label className="text-xs text-gray-500">URL APK</Label>
              <code className="block break-all rounded bg-gray-100 px-2 py-1 text-xs">{detail.apkUrl}</code>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Écran</TableHead>
                      <TableHead>Serial</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Tentatives</TableHead>
                      <TableHead>Erreur</TableHead>
                      <TableHead>Fini</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.installStatuses ?? []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.device.screen?.name ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{s.device.serialNumber}</TableCell>
                        <TableCell><StatusBadge status={s.status} /></TableCell>
                        <TableCell>{s.attempts}</TableCell>
                        <TableCell className="text-xs text-red-600">{s.errorMessage ?? ''}</TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {s.completedAt ? new Date(s.completedAt).toLocaleString('fr-FR') : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(detail.installStatuses ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-500">
                          Aucun appareil n'a encore reporté de statut pour cette release.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: 'green' | 'blue' | 'red' }) {
  const colorClass = color === 'green' ? 'text-green-600'
    : color === 'red' ? 'text-red-600'
    : color === 'blue' ? 'text-blue-600'
    : 'text-gray-900';
  return (
    <div className="rounded border bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: DeviceStatus['status'] }) {
  if (status === 'SUCCESS') return <Badge variant="default" className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />OK</Badge>;
  if (status === 'FAILED') return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Échec</Badge>;
  return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />{status.toLowerCase()}</Badge>;
}

// ───────────────────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────────────────

async function computeSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatBytes(bytes: number) {
  if (!bytes || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}
