'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle, XCircle, Flag, Eye, Search, Film, AlertTriangle,
} from 'lucide-react';
import {
  Button, Card, CardContent, Input, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Skeleton, Textarea,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi, type Creative } from '@/lib/admin-api';
import { useAdminSocket } from '@/hooks/use-admin-socket';

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'En attente',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
  FLAGGED: 'Signalé',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  FLAGGED: 'bg-orange-100 text-orange-800',
};

export default function ModerationVideosPage() {
  const queryClient = useQueryClient();
  const { connected } = useAdminSocket();
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [searchFilter, setSearchFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewCreative, setPreviewCreative] = useState<Creative | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');

  const { data: queueData, isLoading } = useQuery({
    queryKey: ['admin', 'moderation', statusFilter, searchFilter, page],
    queryFn: () => adminApi.getModerationQueue({
      status: statusFilter !== '__all__' ? statusFilter : undefined,
      search: searchFilter || undefined,
      page,
      limit: 20,
    }),
    refetchInterval: connected ? false : 15_000,
  });

  const creatives: Creative[] = (queueData as any)?.data?.data ?? [];
  const totalPages = (queueData as any)?.data?.totalPages ?? 1;
  const total = (queueData as any)?.data?.total ?? 0;

  const approveMut = useMutation({
    mutationFn: (id: string) => adminApi.approveCreative(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      toast.success('Créatif approuvé');
    },
    onError: (err: any) => toast.error(err.message || 'Erreur'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.rejectCreative(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      setRejectTarget(null);
      setRejectReason('');
      toast.success('Créatif rejeté');
    },
    onError: (err: any) => toast.error(err.message || 'Erreur'),
  });

  const flagMut = useMutation({
    mutationFn: (id: string) => adminApi.flagCreative(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      toast.success('Créatif signalé');
    },
    onError: (err: any) => toast.error(err.message || 'Erreur'),
  });

  const unflagMut = useMutation({
    mutationFn: (id: string) => adminApi.unflagCreative(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      toast.success('Signalement retiré');
    },
    onError: (err: any) => toast.error(err.message || 'Erreur'),
  });

  const bulkMut = useMutation({
    mutationFn: ({ action, reason }: { action: 'approve' | 'reject'; reason?: string }) =>
      adminApi.bulkModerateCreatives(Array.from(selectedIds), action, reason),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      setSelectedIds(new Set());
      setBulkRejectOpen(false);
      setBulkRejectReason('');
      toast.success(vars.action === 'approve' ? 'Créatifs approuvés' : 'Créatifs rejetés');
    },
    onError: (err: any) => toast.error(err.message || 'Erreur'),
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === creatives.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(creatives.map((c) => c.id)));
    }
  }, [creatives, selectedIds.size]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Modération vidéos"
          description="File d'attente de modération des créatifs"
        />
        <div className="flex items-center gap-2">
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

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-50">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un créatif..."
                value={searchFilter}
                onChange={(e) => { setSearchFilter(e.target.value); setPage(1); }}
                className="pl-8 h-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-45 h-9">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous les statuts</SelectItem>
                <SelectItem value="PENDING_REVIEW">En attente</SelectItem>
                <SelectItem value="FLAGGED">Signalés</SelectItem>
                <SelectItem value="APPROVED">Approuvés</SelectItem>
                <SelectItem value="REJECTED">Rejetés</SelectItem>
              </SelectContent>
            </Select>

            <div className="text-sm text-muted-foreground">
              {total} créatif{total !== 1 ? 's' : ''}
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
              <Button
                size="sm"
                variant="default"
                onClick={() => bulkMut.mutate({ action: 'approve' })}
                disabled={bulkMut.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approuver
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkRejectOpen(true)}
                disabled={bulkMut.isPending}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Rejeter
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
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
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : creatives.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Film className="h-10 w-10 mb-3" />
              <p>Aucun créatif à modérer</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === creatives.length && creatives.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Aperçu</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Nom</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Campagne</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Annonceur</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Statut</th>
                  <th className="p-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {creatives.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setPreviewCreative(c)}
                        className="relative flex h-12 w-20 items-center justify-center rounded overflow-hidden bg-muted/50 hover:bg-muted transition-colors group"
                      >
                        {c.fileUrl ? (
                          c.type === 'VIDEO' ? (
                            <>
                              <video
                                src={c.fileUrl}
                                muted
                                preload="metadata"
                                className="h-full w-full object-cover"
                                onLoadedMetadata={(e) => { (e.target as HTMLVideoElement).currentTime = 1; }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Film className="h-5 w-5 text-white" />
                              </div>
                            </>
                          ) : (
                            <>
                              <img
                                src={c.fileUrl}
                                alt={c.name}
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Eye className="h-5 w-5 text-white" />
                              </div>
                            </>
                          )
                        ) : (
                          c.type === 'VIDEO' ? (
                            <Film className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <Eye className="h-5 w-5 text-muted-foreground" />
                          )
                        )}
                      </button>
                    </td>
                    <td className="p-3">
                      <p className="text-sm font-medium truncate max-w-50">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.width && c.height ? `${c.width}x${c.height}` : '—'}
                        {c.durationMs ? ` · ${(c.durationMs / 1000).toFixed(1)}s` : ''}
                      </p>
                    </td>
                    <td className="p-3 text-sm">{c.campaign?.name || '—'}</td>
                    <td className="p-3 text-sm">{c.campaign?.advertiserOrg?.name || '—'}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">{c.type}</Badge>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.moderationStatus] || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABELS[c.moderationStatus] || c.moderationStatus}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {c.moderationStatus !== 'APPROVED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                            onClick={() => approveMut.mutate(c.id)}
                            disabled={approveMut.isPending}
                            title="Approuver"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {c.moderationStatus !== 'REJECTED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setRejectTarget(c.id)}
                            title="Rejeter"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {c.moderationStatus === 'FLAGGED' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                            onClick={() => unflagMut.mutate(c.id)}
                            disabled={unflagMut.isPending}
                            title="Retirer le signalement"
                          >
                            <Flag className="h-4 w-4" />
                          </Button>
                        ) : c.moderationStatus !== 'REJECTED' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700"
                            onClick={() => flagMut.mutate(c.id)}
                            disabled={flagMut.isPending}
                            title="Signaler"
                          >
                            <AlertTriangle className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => setPreviewCreative(c)}
                          title="Aperçu"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Suivant
          </Button>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewCreative} onOpenChange={() => setPreviewCreative(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewCreative?.name || 'Aperçu'}</DialogTitle>
          </DialogHeader>
          {previewCreative && (
            <div className="space-y-4">
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                {previewCreative.type === 'VIDEO' && previewCreative.fileUrl ? (
                  <video src={previewCreative.fileUrl} controls className="w-full h-full object-contain" />
                ) : previewCreative.type === 'IMAGE' && previewCreative.fileUrl ? (
                  <img src={previewCreative.fileUrl} alt={previewCreative.name} className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Film className="h-12 w-12 mx-auto mb-2" />
                    <p>Aperçu non disponible</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{previewCreative.type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dimensions</p>
                  <p className="font-medium">
                    {previewCreative.width && previewCreative.height
                      ? `${previewCreative.width}x${previewCreative.height}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Durée</p>
                  <p className="font-medium">
                    {previewCreative.durationMs ? `${(previewCreative.durationMs / 1000).toFixed(1)}s` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Statut modération</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[previewCreative.moderationStatus] || 'bg-gray-100'}`}>
                    {STATUS_LABELS[previewCreative.moderationStatus] || previewCreative.moderationStatus}
                  </span>
                </div>
                {previewCreative.moderationReason && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Raison</p>
                    <p className="font-medium">{previewCreative.moderationReason}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Campagne</p>
                  <p className="font-medium">{previewCreative.campaign?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Annonceur</p>
                  <p className="font-medium">{previewCreative.campaign?.advertiserOrg?.name || '—'}</p>
                </div>
              </div>
              <DialogFooter>
                {previewCreative.moderationStatus !== 'APPROVED' && (
                  <Button onClick={() => { approveMut.mutate(previewCreative.id); setPreviewCreative(null); }}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approuver
                  </Button>
                )}
                {previewCreative.moderationStatus !== 'REJECTED' && (
                  <Button variant="destructive" onClick={() => { setRejectTarget(previewCreative.id); setPreviewCreative(null); }}>
                    <XCircle className="h-4 w-4 mr-2" />
                    Rejeter
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog (single) */}
      <Dialog open={!!rejectTarget} onOpenChange={() => { setRejectTarget(null); setRejectReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter le créatif</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Raison du rejet..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectTarget && rejectMut.mutate({ id: rejectTarget, reason: rejectReason })}
              disabled={!rejectReason.trim() || rejectMut.isPending}
            >
              Rejeter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Reject Dialog */}
      <Dialog open={bulkRejectOpen} onOpenChange={() => { setBulkRejectOpen(false); setBulkRejectReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter {selectedIds.size} créatif{selectedIds.size > 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Raison du rejet..."
            value={bulkRejectReason}
            onChange={(e) => setBulkRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setBulkRejectOpen(false); setBulkRejectReason(''); }}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkMut.mutate({ action: 'reject', reason: bulkRejectReason })}
              disabled={!bulkRejectReason.trim() || bulkMut.isPending}
            >
              Rejeter {selectedIds.size} créatif{selectedIds.size > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
