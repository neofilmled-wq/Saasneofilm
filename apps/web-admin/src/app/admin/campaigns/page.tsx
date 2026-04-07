'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Eye, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
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
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Textarea,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi, type Campaign } from '@/lib/admin-api';

// ─── Helpers ──────────────────────────────────────────────

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR').format(new Date(date));
}

// ─── Status config ────────────────────────────────────────

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  PENDING_REVIEW: 'outline',
  APPROVED: 'default',
  ACTIVE: 'default',
  REJECTED: 'destructive',
  FINISHED: 'secondary',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'En attente',
  APPROVED: 'Validée',
  ACTIVE: 'Actif',
  REJECTED: 'Rejeté',
  FINISHED: 'Terminé',
};

const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'PENDING_REVIEW', label: 'En attente' },
  { value: 'APPROVED', label: 'Validée' },
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'REJECTED', label: 'Rejeté' },
  { value: 'FINISHED', label: 'Terminé' },
];

// ─── Component ────────────────────────────────────────────

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Campaign | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaigns', 'list', { page, status: statusFilter }],
    queryFn: () =>
      adminApi.getCampaigns({
        page,
        limit: 50,
        status: statusFilter || undefined,
      }),
  });

  const campaigns: Campaign[] = data?.data?.data || [];
  const totalPages = data?.data?.totalPages || 1;

  // ─── Mutations ────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approveCampaign(id),
    onSuccess: () => {
      toast.success('Campagne approuvée');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: () => toast.error("Erreur lors de l'approbation"),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.rejectCampaign(id, reason),
    onSuccess: () => {
      toast.success('Campagne rejetée');
      setRejectDialogOpen(false);
      setRejectTarget(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: () => toast.error('Erreur lors du rejet'),
  });


  // ─── Reject dialog handler ───────────────────────────────

  function openRejectDialog(campaign: Campaign) {
    setRejectTarget(campaign);
    setRejectReason('');
    setRejectDialogOpen(true);
  }

  function handleRejectConfirm() {
    if (!rejectTarget || !rejectReason.trim()) return;
    rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() });
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title="Campagnes" description="Toutes les campagnes publicitaires" />

      {/* Status filter bar */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter(filter.value);
              setPage(1);
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-destructive">
              Erreur lors du chargement des campagnes.
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              Aucune campagne trouvée.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campagne</TableHead>
                  <TableHead>Annonceur</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Dépensé</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead className="w-12.5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const groups = new Map<string, typeof campaigns>();
                  for (const c of campaigns) {
                    const key = c.groupId || c.id;
                    const existing = groups.get(key) ?? [];
                    existing.push(c);
                    groups.set(key, existing);
                  }
                  return Array.from(groups.values()).map((group) => {
                    const primary = group[0];
                    const totalBudget = group.reduce((sum, c) => sum + (c.budgetCents ?? 0), 0);
                    const totalSpent = group.reduce((sum, c) => sum + (c.spentCents ?? 0), 0);
                    return (
                      <TableRow key={primary.groupId || primary.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/admin/campaigns/${primary.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {primary.name}
                          </Link>
                        </TableCell>
                        <TableCell>{primary.advertiserOrg?.name ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_COLORS[primary.status] || 'secondary'}>
                            {STATUS_LABELS[primary.status] || primary.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(totalBudget)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(totalSpent)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {primary.startDate ? formatDate(primary.startDate) : '-'} →{' '}
                          {primary.endDate ? formatDate(primary.endDate) : '-'}
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
                                <Link href={`/admin/campaigns/${primary.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Voir détails
                                </Link>
                              </DropdownMenuItem>
                              {primary.status === 'PENDING_REVIEW' && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      for (const c of group) approveMutation.mutate(c.id);
                                    }}
                                  >
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Approuver
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openRejectDialog(primary)}>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Rejeter
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la campagne</DialogTitle>
            <DialogDescription>
              Veuillez indiquer la raison du rejet pour la campagne{' '}
              <strong>{rejectTarget?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Raison du rejet..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={handleRejectConfirm}
            >
              {rejectMutation.isPending ? 'Rejet...' : 'Confirmer le rejet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
