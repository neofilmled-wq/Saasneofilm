'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Building2, Plus, MoreHorizontal, Eye, Pencil, Trash2,
  ExternalLink, Loader2, Search, Wifi, WifiOff, Wrench,
  CheckCircle,
} from 'lucide-react';
import {
  Button, Card, CardContent,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Skeleton, Badge,
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
  Input, Label,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi, type Organization, type AdminPartner } from '@/lib/admin-api';
import { formatDate } from '@/lib/utils';
import { useAdminSocket } from '@/hooks/use-admin-socket';

// ─── Helpers ──────────────────────────────────────────────

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

interface PartnerFormData {
  name: string;
  slug: string;
  contactEmail: string;
  city: string;
  address: string;
  commissionRate: string;
}

const emptyForm: PartnerFormData = { name: '', slug: '', contactEmail: '', city: '', address: '', commissionRate: '' };

// ─── Page ──────────────────────────────────────────────────

export default function PartnersPage() {
  const queryClient = useQueryClient();
  const { connected } = useAdminSocket();

  // Filters
  const [search, setSearch] = useState('');

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Organization | null>(null);
  const [form, setForm] = useState<PartnerFormData>(emptyForm);

  // ── Queries ──
  // Use enhanced admin endpoint for rich metrics
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'partners', search],
    queryFn: () => adminApi.getAdminPartners({ q: search || undefined, limit: 100 }),
    refetchInterval: connected ? false : 30_000,
  });

  const partners: AdminPartner[] = (data as any)?.data?.data ?? [];

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (formData: PartnerFormData) =>
      adminApi.createOrganization({
        name: formData.name,
        slug: formData.slug,
        contactEmail: formData.contactEmail || null,
        city: formData.city || null,
        address: formData.address || null,
        commissionRate: formData.commissionRate ? Number(formData.commissionRate) / 100 : null,
        type: 'PARTNER',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', 'PARTNER'] });
      toast.success('Partenaire créé avec succès');
      setCreateOpen(false);
      setForm(emptyForm);
    },
    onError: () => toast.error('Erreur lors de la création du partenaire'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: PartnerFormData }) =>
      adminApi.updateAdminPartner(id, {
        name: formData.name,
        contactEmail: formData.contactEmail || undefined,
        city: formData.city || undefined,
        address: formData.address || undefined,
        commissionRate: formData.commissionRate ? Number(formData.commissionRate) / 100 : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      toast.success('Partenaire mis à jour');
      setEditOpen(false);
      setSelectedPartner(null);
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteOrganization(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      toast.success('Partenaire supprimé');
      setDeleteOpen(false);
      setSelectedPartner(null);
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  // ── Helpers ──
  function handleChange(field: keyof PartnerFormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'name' && !editOpen) next.slug = slugify(value);
      return next;
    });
  }

  function openEditDialog(partner: AdminPartner) {
    setSelectedPartner({ id: partner.id } as Organization);
    setForm({
      name: partner.name,
      slug: '',
      contactEmail: partner.contactEmail ?? '',
      city: partner.city ?? '',
      address: '',
      commissionRate: partner.commissionRate != null ? String(Math.round(partner.commissionRate * 100)) : '',
    });
    setEditOpen(true);
  }

  function openDeleteDialog(partner: AdminPartner) {
    setSelectedPartner({ id: partner.id, name: partner.name } as Organization);
    setDeleteOpen(true);
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      <PageHeader
        title="Partenaires"
        description="Cinémas et réseaux d'écrans partenaires"
        action={
          <div className="flex items-center gap-2">
            {connected && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            )}
            <Button
              className="gap-1.5"
              onClick={() => { setForm(emptyForm); setCreateOpen(true); }}
            >
              <Plus className="h-4 w-4" />
              Ajouter partenaire
            </Button>
          </div>
        }
      />

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un partenaire..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground">
              Erreur lors du chargement. Veuillez réessayer.
            </div>
          ) : partners.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Building2 className="mx-auto h-10 w-10 mb-3 opacity-40" />
              <p className="font-medium">Aucun partenaire{search ? ' pour cette recherche' : ''}</p>
              {!search && <p className="text-sm mt-1">Ajoutez votre premier partenaire pour commencer.</p>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partenaire</TableHead>
                  <TableHead className="text-center">Statut</TableHead>
                  <TableHead className="text-center">Écrans</TableHead>
                  <TableHead className="text-center">Connectés</TableHead>
                  <TableHead className="text-center">Maintenance</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Rétro à venir</TableHead>
                  <TableHead className="text-right">Rétro versée</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Inscrit</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.id} className={partner.isSuspended ? 'opacity-60' : ''}>
                    <TableCell>
                      <Link
                        href={`/admin/partners/${partner.id}`}
                        className="flex items-center gap-2 font-medium hover:text-primary"
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>{partner.name}</span>
                        {partner.isVerified && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      {partner.isSuspended ? (
                        <Badge variant="destructive" className="text-xs">Suspendu</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">Actif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-medium">{partner.screensTotal}</TableCell>
                    <TableCell className="text-center">
                      <span className="flex items-center justify-center gap-1">
                        {partner.screensConnected > 0
                          ? <Wifi className="h-3.5 w-3.5 text-green-500" />
                          : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                        {partner.screensConnected}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {partner.screensMaintenance > 0 ? (
                        <span className="flex items-center justify-center gap-1 text-yellow-600">
                          <Wrench className="h-3.5 w-3.5" />
                          {partner.screensMaintenance}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {partner.commissionRate != null
                        ? `${Math.round(partner.commissionRate * 100)}%`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right text-orange-600 font-medium">
                      {partner.upcomingCommissionCents > 0
                        ? formatCurrency(partner.upcomingCommissionCents)
                        : <span className="text-muted-foreground">-</span>
                      }
                    </TableCell>
                    <TableCell className="text-right text-green-700 font-medium">
                      {partner.paidCommissionCents > 0
                        ? formatCurrency(partner.paidCommissionCents)
                        : <span className="text-muted-foreground">-</span>
                      }
                    </TableCell>
                    <TableCell className="text-muted-foreground">{partner.city ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDate(partner.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/partners/${partner.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Voir la fiche
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(partner)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openDeleteDialog(partner)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un partenaire</DialogTitle>
            <DialogDescription>Renseignez les informations du nouveau partenaire cinéma.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) return; createMutation.mutate(form); }} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input placeholder="Cinéma Lumière" value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input placeholder="cinema-lumiere" value={form.slug} onChange={(e) => handleChange('slug', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email de contact</Label>
                <Input type="email" placeholder="contact@cinema.fr" value={form.contactEmail} onChange={(e) => handleChange('contactEmail', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Commission (%)</Label>
                <Input type="number" min={5} max={20} step={1} placeholder="15" value={form.commissionRate} onChange={(e) => handleChange('commissionRate', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input placeholder="Paris" value={form.city} onChange={(e) => handleChange('city', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input placeholder="12 rue du Cinéma" value={form.address} onChange={(e) => handleChange('address', e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Créer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le partenaire</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!selectedPartner) return; updateMutation.mutate({ id: selectedPartner.id, formData: form }); }} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Commission (%)</Label>
                <Input type="number" min={5} max={20} step={1} value={form.commissionRate} onChange={(e) => handleChange('commissionRate', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email de contact</Label>
                <Input type="email" value={form.contactEmail} onChange={(e) => handleChange('contactEmail', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input value={form.city} onChange={(e) => handleChange('city', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Adresse</Label>
                <Input value={form.address} onChange={(e) => handleChange('address', e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le partenaire</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{selectedPartner?.name}</strong> ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => selectedPartner && deleteMutation.mutate(selectedPartner.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
