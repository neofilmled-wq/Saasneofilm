'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Megaphone,
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi, type Organization } from '@/lib/admin-api';
import { formatDate } from '@/lib/utils';
import { useAdminSocket } from '@/hooks/use-admin-socket';

// ─── Form state ────────────────────────────────────────────

interface AdvertiserFormData {
  name: string;
  slug: string;
  contactEmail: string;
  city: string;
  address: string;
  vatNumber: string;
  ownerFirstName: string;
  ownerLastName: string;
}

const emptyForm: AdvertiserFormData = {
  name: '',
  slug: '',
  contactEmail: '',
  city: '',
  address: '',
  vatNumber: '',
  ownerFirstName: '',
  ownerLastName: '',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ─── Page ──────────────────────────────────────────────────

export default function AdvertisersPage() {
  const queryClient = useQueryClient();

  // ── Real-time sync ──
  useAdminSocket();

  // ── State ──
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<Organization | null>(null);
  const [form, setForm] = useState<AdvertiserFormData>(emptyForm);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    temporaryPassword?: string;
    orgName: string;
  } | null>(null);

  // ── Queries ──
  const { data, isLoading, isError } = useQuery({
    queryKey: ['organizations', 'ADVERTISER'],
    queryFn: () => adminApi.getOrganizations({ type: 'ADVERTISER', limit: 100 }),
  });

  const advertisers: Organization[] = data?.data?.data ?? [];

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (formData: AdvertiserFormData) =>
      adminApi.createOrganization({
        name: formData.name,
        slug: formData.slug,
        contactEmail: formData.contactEmail,
        city: formData.city || undefined,
        address: formData.address || undefined,
        vatNumber: formData.vatNumber || undefined,
        ownerFirstName: formData.ownerFirstName || undefined,
        ownerLastName: formData.ownerLastName || undefined,
        type: 'ADVERTISER',
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['organizations', 'ADVERTISER'] });
      setCreateOpen(false);
      setForm(emptyForm);

      // Show credentials dialog if a new user was created
      const result = res?.data ?? res;
      const tempPassword = result?.temporaryPassword;
      if (tempPassword) {
        setCreatedCredentials({
          email: result.contactEmail || form.contactEmail,
          temporaryPassword: tempPassword,
          orgName: result.name || form.name,
        });
        setCredentialsOpen(true);
      } else {
        toast.success('Annonceur créé avec succès');
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Erreur lors de la création de l'annonceur");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: AdvertiserFormData }) =>
      adminApi.updateOrganization(id, {
        name: formData.name,
        slug: formData.slug,
        contactEmail: formData.contactEmail || undefined,
        city: formData.city || undefined,
        address: formData.address || undefined,
        vatNumber: formData.vatNumber || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', 'ADVERTISER'] });
      toast.success('Annonceur mis à jour');
      setEditOpen(false);
      setSelectedAdvertiser(null);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erreur lors de la mise à jour');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteOrganization(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', 'ADVERTISER'] });
      toast.success('Annonceur supprimé');
      setDeleteOpen(false);
      setSelectedAdvertiser(null);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erreur lors de la suppression');
    },
  });

  // ── Helpers ──
  function handleChange(field: keyof AdvertiserFormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'name' && !editOpen) {
        next.slug = slugify(value);
      }
      return next;
    });
  }

  function openEditDialog(advertiser: Organization) {
    setSelectedAdvertiser(advertiser);
    setForm({
      name: advertiser.name,
      slug: advertiser.slug,
      contactEmail: advertiser.contactEmail ?? '',
      city: advertiser.city ?? '',
      address: advertiser.address ?? '',
      vatNumber: advertiser.vatNumber ?? '',
      ownerFirstName: '',
      ownerLastName: '',
    });
    setEditOpen(true);
  }

  function openDeleteDialog(advertiser: Organization) {
    setSelectedAdvertiser(advertiser);
    setDeleteOpen(true);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Le nom et le slug sont requis');
      return;
    }
    if (!form.contactEmail.trim()) {
      toast.error("L'email de contact est requis");
      return;
    }
    createMutation.mutate(form);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAdvertiser) return;
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Le nom et le slug sont requis');
      return;
    }
    updateMutation.mutate({ id: selectedAdvertiser.id, formData: form });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copié dans le presse-papier');
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      <PageHeader
        title="Annonceurs"
        description="Annonceurs de la plateforme"
        action={
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => {
              setForm(emptyForm);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Ajouter annonceur
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground">
              Erreur lors du chargement des annonceurs. Veuillez réessayer.
            </div>
          ) : advertisers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Megaphone className="mx-auto h-10 w-10 mb-3 opacity-40" />
              <p className="font-medium">Aucun annonceur</p>
              <p className="text-sm mt-1">Ajoutez votre premier annonceur pour commencer.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Annonceur</TableHead>
                  <TableHead className="text-right">Campagnes</TableHead>
                  <TableHead className="text-right">Membres</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Inscrit le</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {advertisers.map((advertiser) => (
                  <TableRow key={advertiser.id}>
                    <TableCell>
                      <Link
                        href={`/admin/advertisers/${advertiser.id}`}
                        className="flex items-center gap-2 font-medium hover:text-primary"
                      >
                        <Megaphone className="h-4 w-4 text-muted-foreground" />
                        {advertiser.name}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {advertiser._count?.campaigns ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {advertiser._count?.memberships ?? 0}
                    </TableCell>
                    <TableCell>{advertiser.city ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {advertiser.contactEmail ?? '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(advertiser.createdAt)}
                    </TableCell>
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
                            <Link href={`/admin/advertisers/${advertiser.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Voir
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(advertiser)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openDeleteDialog(advertiser)}
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
        <DialogContent className="bg-popover max-w-xl">
          <DialogHeader>
            <DialogTitle>Ajouter un annonceur</DialogTitle>
            <DialogDescription>
              Renseignez les informations du nouvel annonceur. Un compte utilisateur sera
              automatiquement créé avec l&apos;email de contact.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-name">Nom de l&apos;entreprise *</Label>
                <Input
                  id="create-name"
                  placeholder="Acme Corp"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-slug">Slug *</Label>
                <Input
                  id="create-slug"
                  placeholder="acme-corp"
                  value={form.slug}
                  onChange={(e) => handleChange('slug', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email de contact *</Label>
                <Input
                  id="create-email"
                  type="email"
                  placeholder="contact@acme.fr"
                  value={form.contactEmail}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-vat">N° TVA</Label>
                <Input
                  id="create-vat"
                  placeholder="FR12345678901"
                  value={form.vatNumber}
                  onChange={(e) => handleChange('vatNumber', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-firstname">Prénom du responsable</Label>
                <Input
                  id="create-firstname"
                  placeholder="Jean"
                  value={form.ownerFirstName}
                  onChange={(e) => handleChange('ownerFirstName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-lastname">Nom du responsable</Label>
                <Input
                  id="create-lastname"
                  placeholder="Dupont"
                  value={form.ownerLastName}
                  onChange={(e) => handleChange('ownerLastName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-city">Ville</Label>
                <Input
                  id="create-city"
                  placeholder="Paris"
                  value={form.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-address">Adresse</Label>
                <Input
                  id="create-address"
                  placeholder="45 avenue des Champs"
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Créer l&apos;annonceur
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Credentials Dialog (shown after creation) ── */}
      <Dialog open={credentialsOpen} onOpenChange={setCredentialsOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Annonceur créé avec succès
            </DialogTitle>
            <DialogDescription>
              Voici les identifiants de connexion pour <strong>{createdCredentials?.orgName}</strong>.
              Notez le mot de passe temporaire, il ne sera plus affiché.
            </DialogDescription>
          </DialogHeader>
          {createdCredentials && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-mono text-sm">{createdCredentials.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => copyToClipboard(createdCredentials.email)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {createdCredentials.temporaryPassword && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Mot de passe temporaire</p>
                    <p className="font-mono text-sm font-bold">
                      {createdCredentials.temporaryPassword}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      copyToClipboard(createdCredentials.temporaryPassword!)
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredentialsOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>Modifier l&apos;annonceur</DialogTitle>
            <DialogDescription>
              Mettez à jour les informations de {selectedAdvertiser?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nom *</Label>
                <Input
                  id="edit-name"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-slug">Slug *</Label>
                <Input
                  id="edit-slug"
                  value={form.slug}
                  onChange={(e) => handleChange('slug', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email de contact *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-vat">N° TVA</Label>
                <Input
                  id="edit-vat"
                  value={form.vatNumber}
                  onChange={(e) => handleChange('vatNumber', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-city">Ville</Label>
                <Input
                  id="edit-city"
                  value={form.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-address">Adresse</Label>
                <Input
                  id="edit-address"
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>Supprimer l&apos;annonceur</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{selectedAdvertiser?.name}</strong> ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedAdvertiser && deleteMutation.mutate(selectedAdvertiser.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
