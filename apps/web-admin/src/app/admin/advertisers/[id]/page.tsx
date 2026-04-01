'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Pencil,
  Users,
  PlayCircle,
  Sparkles,
  Loader2,
  Mail,
  FileText,
  Plus,
  Trash2,
  MoreHorizontal,
  Eye,
  Calendar,
  Euro,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { adminApi, type Organization, type Campaign } from '@/lib/admin-api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useAdminSocket } from '@/hooks/use-admin-socket';

// ─── Form state types ─────────────────────────────────────

interface AdvertiserFormData {
  name: string;
  slug: string;
  contactEmail: string;
  city: string;
  address: string;
  vatNumber: string;
}

interface CampaignFormData {
  name: string;
  description: string;
  type: string;
  startDate: string;
  endDate: string;
  budgetEuros: string;
}

const emptyCampaignForm: CampaignFormData = {
  name: '',
  description: '',
  type: 'AD_SPOT',
  startDate: '',
  endDate: '',
  budgetEuros: '',
};

// ─── Page ──────────────────────────────────────────────────

export default function AdvertiserDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();

  // Real-time sync
  useAdminSocket();

  // ── Dialog states ──
  const [editOpen, setEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [editCampaignOpen, setEditCampaignOpen] = useState(false);
  const [deleteCampaignOpen, setDeleteCampaignOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // ── Form states ──
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('MEMBER');
  const [form, setForm] = useState<AdvertiserFormData>({
    name: '',
    slug: '',
    contactEmail: '',
    city: '',
    address: '',
    vatNumber: '',
  });
  const [campaignForm, setCampaignForm] = useState<CampaignFormData>(emptyCampaignForm);

  // ── Queries ──
  const { data, isLoading, isError } = useQuery({
    queryKey: ['organization', id],
    queryFn: () => adminApi.getOrganization(id),
    enabled: !!id,
  });

  const advertiser: Organization | undefined = data?.data;

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns', { advertiserOrgId: id }],
    queryFn: () => adminApi.getCampaigns({ advertiserOrgId: id, limit: 100 }),
    enabled: !!id,
  });

  const campaigns: Campaign[] = campaignsData?.data?.data ?? [];

  // ── Invalidate helpers ──
  function invalidateCampaigns() {
    queryClient.invalidateQueries({ queryKey: ['campaigns', { advertiserOrgId: id }] });
    queryClient.invalidateQueries({ queryKey: ['organization', id] });
  }

  function invalidateOrg() {
    queryClient.invalidateQueries({ queryKey: ['organization', id] });
    queryClient.invalidateQueries({ queryKey: ['organizations', 'ADVERTISER'] });
  }

  // ── Mutations: Advertiser ──
  const updateMutation = useMutation({
    mutationFn: (formData: AdvertiserFormData) =>
      adminApi.updateOrganization(id, {
        name: formData.name,
        slug: formData.slug,
        contactEmail: formData.contactEmail || undefined,
        city: formData.city || undefined,
        address: formData.address || undefined,
        vatNumber: formData.vatNumber || undefined,
      }),
    onSuccess: () => {
      invalidateOrg();
      toast.success('Annonceur mis à jour');
      setEditOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erreur lors de la mise à jour');
    },
  });

  // ── Mutations: Campaigns ──
  const createCampaignMutation = useMutation({
    mutationFn: (formData: CampaignFormData) =>
      adminApi.createCampaignForAdvertiser({
        advertiserOrgId: id,
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        startDate: formData.startDate,
        endDate: formData.endDate,
        budgetCents: Math.round(parseFloat(formData.budgetEuros) * 100),
      }),
    onSuccess: () => {
      invalidateCampaigns();
      toast.success('Campagne créée avec succès');
      setCreateCampaignOpen(false);
      setCampaignForm(emptyCampaignForm);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erreur lors de la création de la campagne');
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: ({ campaignId, formData }: { campaignId: string; formData: CampaignFormData }) =>
      adminApi.updateCampaignFromAdmin(campaignId, {
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        startDate: formData.startDate,
        endDate: formData.endDate,
        budgetCents: Math.round(parseFloat(formData.budgetEuros) * 100),
      } as Partial<Campaign>),
    onSuccess: () => {
      invalidateCampaigns();
      toast.success('Campagne mise à jour');
      setEditCampaignOpen(false);
      setSelectedCampaign(null);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erreur lors de la mise à jour de la campagne');
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => adminApi.deleteCampaignFromAdmin(campaignId),
    onSuccess: () => {
      invalidateCampaigns();
      toast.success('Campagne supprimée');
      setDeleteCampaignOpen(false);
      setSelectedCampaign(null);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erreur lors de la suppression de la campagne');
    },
  });

  // ── Mutations: Members ──
  const addMemberMutation = useMutation({
    mutationFn: async () => {
      const usersRes = await adminApi.getUsers({ q: memberEmail, limit: 1 });
      const users = (usersRes as any)?.data?.data ?? [];
      if (users.length === 0) throw new Error('Utilisateur introuvable avec cet email');
      return adminApi.addMember(id, users[0].id, memberRole);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', id] });
      toast.success('Membre ajouté');
      setAddMemberOpen(false);
      setMemberEmail('');
      setMemberRole('MEMBER');
    },
    onError: (err: any) => {
      toast.error(err.message || "Erreur lors de l'ajout du membre");
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) => adminApi.removeMember(id, membershipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', id] });
      toast.success('Membre retiré');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erreur lors de la suppression du membre');
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: string }) =>
      adminApi.updateMemberRole(id, membershipId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', id] });
      toast.success('Rôle mis à jour');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erreur lors du changement de rôle');
    },
  });

  // ── Helpers: Advertiser edit ──
  function openEditDialog() {
    if (!advertiser) return;
    setForm({
      name: advertiser.name,
      slug: advertiser.slug,
      contactEmail: advertiser.contactEmail ?? '',
      city: advertiser.city ?? '',
      address: advertiser.address ?? '',
      vatNumber: advertiser.vatNumber ?? '',
    });
    setEditOpen(true);
  }

  function handleChange(field: keyof AdvertiserFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Le nom et le slug sont requis');
      return;
    }
    updateMutation.mutate(form);
  }

  // ── Helpers: Campaign form ──
  function handleCampaignChange(field: keyof CampaignFormData, value: string) {
    setCampaignForm((prev) => ({ ...prev, [field]: value }));
  }

  function openCreateCampaignDialog() {
    setCampaignForm(emptyCampaignForm);
    setCreateCampaignOpen(true);
  }

  function openEditCampaignDialog(campaign: Campaign) {
    setSelectedCampaign(campaign);
    setCampaignForm({
      name: campaign.name,
      description: campaign.description ?? '',
      type: campaign.type,
      startDate: campaign.startDate ? campaign.startDate.slice(0, 10) : '',
      endDate: campaign.endDate ? campaign.endDate.slice(0, 10) : '',
      budgetEuros: (campaign.budgetCents / 100).toFixed(2),
    });
    setEditCampaignOpen(true);
  }

  function openDeleteCampaignDialog(campaign: Campaign) {
    setSelectedCampaign(campaign);
    setDeleteCampaignOpen(true);
  }

  function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignForm.name.trim()) {
      toast.error('Le nom de la campagne est requis');
      return;
    }
    if (!campaignForm.startDate || !campaignForm.endDate) {
      toast.error('Les dates de début et de fin sont requises');
      return;
    }
    const budget = parseFloat(campaignForm.budgetEuros);
    if (isNaN(budget) || budget <= 0) {
      toast.error('Le budget doit être supérieur à 0');
      return;
    }
    createCampaignMutation.mutate(campaignForm);
  }

  function handleUpdateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCampaign) return;
    if (!campaignForm.name.trim()) {
      toast.error('Le nom de la campagne est requis');
      return;
    }
    if (!campaignForm.startDate || !campaignForm.endDate) {
      toast.error('Les dates de début et de fin sont requises');
      return;
    }
    const budget = parseFloat(campaignForm.budgetEuros);
    if (isNaN(budget) || budget <= 0) {
      toast.error('Le budget doit être supérieur à 0');
      return;
    }
    updateCampaignMutation.mutate({ campaignId: selectedCampaign.id, formData: campaignForm });
  }

  function handleDeleteCampaign() {
    if (!selectedCampaign) return;
    deleteCampaignMutation.mutate(selectedCampaign.id);
  }

  // ── Loading / Error ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-96" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (isError || !advertiser) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/advertisers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Annonceur introuvable</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Cet annonceur n&apos;existe pas ou a été supprimé.
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/advertisers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={advertiser.name}
          description={
            [advertiser.city, advertiser.contactEmail].filter(Boolean).join(' — ') ||
            'Annonceur'
          }
          action={
            <Button variant="outline" className="gap-1.5" onClick={openEditDialog}>
              <Pencil className="h-4 w-4" />
              Modifier
            </Button>
          }
        />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <PlayCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Campagnes</p>
              <p className="text-xl font-bold">{advertiser._count?.campaigns ?? campaigns.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Membres</p>
              <p className="text-xl font-bold">{advertiser._count?.memberships ?? advertiser.memberships?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">N° TVA</p>
              <p className="text-sm font-medium truncate max-w-40">
                {advertiser.vatNumber ?? '-'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contact</p>
              <p className="text-sm font-medium truncate max-w-40">
                {advertiser.contactEmail ?? '-'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Campagnes</TabsTrigger>
          <TabsTrigger value="members">Membres</TabsTrigger>
          <TabsTrigger value="ai-credits">Crédits IA</TabsTrigger>
        </TabsList>

        {/* ── Campaigns Tab ── */}
        <TabsContent value="campaigns">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Campagnes</CardTitle>
              <Button size="sm" onClick={openCreateCampaignDialog}>
                <Plus className="h-4 w-4 mr-1" />
                Créer une campagne
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {campaignsLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : campaigns.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <PlayCircle className="mx-auto h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">Aucune campagne</p>
                  <p className="text-sm mt-1">Cet annonceur n&apos;a pas encore de campagne.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Début</TableHead>
                      <TableHead>Fin</TableHead>
                      <TableHead className="text-right">Budget</TableHead>
                      <TableHead className="text-right">Dépensé</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/admin/campaigns/${campaign.id}`}
                            className="hover:text-primary"
                          >
                            {campaign.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={campaign.status} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{campaign.type}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(campaign.startDate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(campaign.endDate)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(campaign.budgetCents, campaign.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(campaign.spentCents, campaign.currency)}
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
                                <Link href={`/admin/campaigns/${campaign.id}`}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Voir le détail
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditCampaignDialog(campaign)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => openDeleteCampaignDialog(campaign)}
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
        </TabsContent>

        {/* ── Members Tab ── */}
        <TabsContent value="members">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Membres</CardTitle>
              <Button size="sm" onClick={() => setAddMemberOpen(true)}>
                <Users className="h-4 w-4 mr-1" />
                Ajouter
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {(advertiser.memberships ?? []).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Users className="mx-auto h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">Aucun membre</p>
                  <p className="text-sm mt-1">Cet annonceur n&apos;a aucun membre associé.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(advertiser.memberships ?? []).map((membership) => (
                      <TableRow key={membership.id}>
                        <TableCell className="font-medium">
                          {membership.user.firstName} {membership.user.lastName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {membership.user.email}
                        </TableCell>
                        <TableCell>
                          <Select
                            defaultValue={membership.role}
                            onValueChange={(role) =>
                              updateMemberRoleMutation.mutate({
                                membershipId: membership.id,
                                role,
                              })
                            }
                          >
                            <SelectTrigger className="w-36 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="VIEWER">Lecteur</SelectItem>
                              <SelectItem value="MEMBER">Membre</SelectItem>
                              <SelectItem value="MANAGER">Manager</SelectItem>
                              <SelectItem value="ADMIN">Admin</SelectItem>
                              <SelectItem value="OWNER">Propriétaire</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => removeMemberMutation.mutate(membership.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Retirer le membre
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
        </TabsContent>

        {/* ── AI Credits Tab ── */}
        <TabsContent value="ai-credits">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Crédits IA
              </CardTitle>
              <CardDescription>
                Portefeuille de crédits IA pour {advertiser.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-sm text-muted-foreground">Solde actuel</p>
                  <p className="text-2xl font-bold mt-1">-</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-sm text-muted-foreground">Crédits utilisés</p>
                  <p className="text-2xl font-bold mt-1">-</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-sm text-muted-foreground">Crédits achetés</p>
                  <p className="text-2xl font-bold mt-1">-</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-6 text-center">
                Les données de crédits IA seront disponibles une fois le module IA activé.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Create Campaign Dialog ── */}
      <Dialog open={createCampaignOpen} onOpenChange={setCreateCampaignOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>Créer une campagne</DialogTitle>
            <DialogDescription>
              Créez une nouvelle campagne pour {advertiser.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCampaign} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="campaign-name">Nom *</Label>
                <Input
                  id="campaign-name"
                  placeholder="Nom de la campagne"
                  value={campaignForm.name}
                  onChange={(e) => handleCampaignChange('name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="campaign-description">Description</Label>
                <Input
                  id="campaign-description"
                  placeholder="Description optionnelle"
                  value={campaignForm.description}
                  onChange={(e) => handleCampaignChange('description', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-type">Type *</Label>
                <Select
                  value={campaignForm.type}
                  onValueChange={(val) => handleCampaignChange('type', val)}
                >
                  <SelectTrigger id="campaign-type">
                    <SelectValue placeholder="Type de campagne" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AD_SPOT">AD_SPOT</SelectItem>
                    <SelectItem value="CATALOG_LISTING">CATALOG_LISTING</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-budget">
                  <span className="flex items-center gap-1">
                    Budget (€) *
                    <Euro className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </Label>
                <Input
                  id="campaign-budget"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="100.00"
                  value={campaignForm.budgetEuros}
                  onChange={(e) => handleCampaignChange('budgetEuros', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-start">
                  <span className="flex items-center gap-1">
                    Date de début *
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </Label>
                <Input
                  id="campaign-start"
                  type="date"
                  value={campaignForm.startDate}
                  onChange={(e) => handleCampaignChange('startDate', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-end">
                  <span className="flex items-center gap-1">
                    Date de fin *
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </Label>
                <Input
                  id="campaign-end"
                  type="date"
                  value={campaignForm.endDate}
                  onChange={(e) => handleCampaignChange('endDate', e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateCampaignOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={createCampaignMutation.isPending}>
                {createCampaignMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                )}
                Créer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Campaign Dialog ── */}
      <Dialog open={editCampaignOpen} onOpenChange={setEditCampaignOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>Modifier la campagne</DialogTitle>
            <DialogDescription>
              Modifiez les informations de la campagne « {selectedCampaign?.name} ».
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateCampaign} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-campaign-name">Nom *</Label>
                <Input
                  id="edit-campaign-name"
                  placeholder="Nom de la campagne"
                  value={campaignForm.name}
                  onChange={(e) => handleCampaignChange('name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-campaign-description">Description</Label>
                <Input
                  id="edit-campaign-description"
                  placeholder="Description optionnelle"
                  value={campaignForm.description}
                  onChange={(e) => handleCampaignChange('description', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-campaign-type">Type *</Label>
                <Select
                  value={campaignForm.type}
                  onValueChange={(val) => handleCampaignChange('type', val)}
                >
                  <SelectTrigger id="edit-campaign-type">
                    <SelectValue placeholder="Type de campagne" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AD_SPOT">AD_SPOT</SelectItem>
                    <SelectItem value="CATALOG_LISTING">CATALOG_LISTING</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-campaign-budget">
                  <span className="flex items-center gap-1">
                    Budget (€) *
                    <Euro className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </Label>
                <Input
                  id="edit-campaign-budget"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="100.00"
                  value={campaignForm.budgetEuros}
                  onChange={(e) => handleCampaignChange('budgetEuros', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-campaign-start">
                  <span className="flex items-center gap-1">
                    Date de début *
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </Label>
                <Input
                  id="edit-campaign-start"
                  type="date"
                  value={campaignForm.startDate}
                  onChange={(e) => handleCampaignChange('startDate', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-campaign-end">
                  <span className="flex items-center gap-1">
                    Date de fin *
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </Label>
                <Input
                  id="edit-campaign-end"
                  type="date"
                  value={campaignForm.endDate}
                  onChange={(e) => handleCampaignChange('endDate', e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditCampaignOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={updateCampaignMutation.isPending}>
                {updateCampaignMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                )}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Campaign Confirmation Dialog ── */}
      <Dialog open={deleteCampaignOpen} onOpenChange={setDeleteCampaignOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>Supprimer la campagne</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer la campagne « {selectedCampaign?.name} » ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteCampaignOpen(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCampaign}
              disabled={deleteCampaignMutation.isPending}
            >
              {deleteCampaignMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              )}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Member Dialog ── */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>Ajouter un membre</DialogTitle>
            <DialogDescription>
              Ajoutez un utilisateur existant à {advertiser.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-email">Email de l&apos;utilisateur</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="email@exemple.com"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">Rôle</Label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEWER">Lecteur</SelectItem>
                  <SelectItem value="MEMBER">Membre</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="OWNER">Propriétaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => addMemberMutation.mutate()}
              disabled={!memberEmail.trim() || addMemberMutation.isPending}
            >
              {addMemberMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Advertiser Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>Modifier l&apos;annonceur</DialogTitle>
            <DialogDescription>
              Mettez à jour les informations de {advertiser.name}.
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
                <Label htmlFor="edit-email">Email de contact</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
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
    </div>
  );
}
