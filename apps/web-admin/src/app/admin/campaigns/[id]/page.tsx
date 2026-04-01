'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Image,
  Video,
  FileText,
  MapPin,
  Calendar,
  Clock,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Separator,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Textarea,
} from '@neofilm/ui';
import { adminApi, type Campaign, type Creative } from '@/lib/admin-api';

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

const CREATIVE_TYPE_ICONS: Record<string, typeof Image> = {
  IMAGE: Image,
  VIDEO: Video,
  HTML: FileText,
};

const ENV_LABELS: Record<string, string> = {
  CINEMA_HALL: 'Salle de cinéma',
  CINEMA_LOBBY: 'Hall de cinéma',
  SHOPPING_MALL: 'Centre commercial',
  TRANSIT: 'Transport',
  OUTDOOR: 'Extérieur',
  INDOOR: 'Intérieur',
};

// ─── Component ────────────────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => adminApi.getCampaign(id),
    enabled: !!id,
  });

  const campaign: Campaign | undefined = data?.data;

  // ─── Mutations ────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: () => adminApi.approveCampaign(id),
    onSuccess: () => {
      toast.success('Campagne approuvée avec succès');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: () => toast.error("Erreur lors de l'approbation"),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => adminApi.rejectCampaign(id, reason),
    onSuccess: () => {
      toast.success('Campagne rejetée');
      setRejectDialogOpen(false);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: () => toast.error('Erreur lors du rejet'),
  });


  // ─── Loading / Error states ───────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
        <div className="text-center py-12 text-destructive">
          Campagne introuvable ou erreur de chargement.
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/campaigns">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux campagnes
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
            <Badge variant={STATUS_COLORS[campaign.status] || 'secondary'}>
              {STATUS_LABELS[campaign.status] || campaign.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {campaign.advertiserOrg?.name ?? 'Annonceur inconnu'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'PENDING_REVIEW' && (
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
                onClick={() => {
                  setRejectReason('');
                  setRejectDialogOpen(true);
                }}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Rejeter
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Informations</TabsTrigger>
          <TabsTrigger value="creatives">Créatifs</TabsTrigger>
          <TabsTrigger value="targeting">Ciblage</TabsTrigger>
          <TabsTrigger value="screens">Écrans</TabsTrigger>
        </TabsList>

        {/* ─── Info tab ────────────────────────────────────── */}
        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Détails de la campagne</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {campaign.description && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Description</p>
                    <p className="text-sm mt-1">{campaign.description}</p>
                  </div>
                )}
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Date de début</p>
                    <p className="text-sm mt-1 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {campaign.startDate ? formatDate(campaign.startDate) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Date de fin</p>
                    <p className="text-sm mt-1 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {campaign.endDate ? formatDate(campaign.endDate) : '-'}
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Type</p>
                    <p className="text-sm mt-1">{campaign.type ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Créé le</p>
                    <p className="text-sm mt-1">{formatDate(campaign.createdAt)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Budget & Dépenses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Budget total</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatCurrency(campaign.budgetCents ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Dépensé</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatCurrency(campaign.spentCents ?? 0)}
                    </p>
                  </div>
                </div>
                {campaign.budgetCents > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Consommation</p>
                      <div className="mt-2 h-2 w-full rounded-full bg-secondary">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.min(100, Math.round(((campaign.spentCents ?? 0) / campaign.budgetCents) * 100))}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {Math.round(((campaign.spentCents ?? 0) / campaign.budgetCents) * 100)}% du
                        budget utilisé
                      </p>
                    </div>
                  </>
                )}
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Annonceur</p>
                  <p className="text-sm mt-1">{campaign.advertiserOrg?.name ?? '-'}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Review notes (if rejected) */}
          {campaign.status === 'REJECTED' && campaign.reviewNotes && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Notes de rejet</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{campaign.reviewNotes}</p>
                {campaign.reviewedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Rejeté le {formatDate(campaign.reviewedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Creatives tab ───────────────────────────────── */}
        <TabsContent value="creatives" className="space-y-4">
          {!campaign.creatives || campaign.creatives.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aucun créatif associé à cette campagne.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {campaign.creatives.map((creative: Creative) => {
                const TypeIcon = CREATIVE_TYPE_ICONS[creative.type] || FileText;
                return (
                  <Card key={creative.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <TypeIcon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{creative.name}</p>
                            <p className="text-xs text-muted-foreground">{creative.type}</p>
                          </div>
                        </div>
                        <Badge variant={creative.isApproved ? 'default' : 'outline'}>
                          {creative.isApproved ? 'Approuvé' : 'En attente'}
                        </Badge>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        {creative.width && creative.height && (
                          <div>
                            <span className="font-medium">Dimensions : </span>
                            {creative.width}x{creative.height}
                          </div>
                        )}
                        {creative.durationMs != null && (
                          <div>
                            <span className="font-medium">Durée : </span>
                            {(creative.durationMs / 1000).toFixed(1)}s
                          </div>
                        )}
                        {creative.fileSizeBytes != null && (
                          <div>
                            <span className="font-medium">Taille : </span>
                            {(creative.fileSizeBytes / (1024 * 1024)).toFixed(1)} Mo
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Targeting tab ───────────────────────────────── */}
        <TabsContent value="targeting" className="space-y-4">
          {!campaign.targeting ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aucun ciblage configuré pour cette campagne.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Cities */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Villes ciblées
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {campaign.targeting.cities && campaign.targeting.cities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {campaign.targeting.cities.map((city: string) => (
                        <Badge key={city} variant="secondary">
                          {city}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Toutes les villes</p>
                  )}
                </CardContent>
              </Card>

              {/* Environments */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Environnements</CardTitle>
                </CardHeader>
                <CardContent>
                  {campaign.targeting.environments &&
                  campaign.targeting.environments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {campaign.targeting.environments.map((env: string) => (
                        <Badge key={env} variant="secondary">
                          {ENV_LABELS[env] || env}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Tous les environnements</p>
                  )}
                </CardContent>
              </Card>

              {/* Schedule windows */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Créneaux horaires
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {campaign.targeting.scheduleWindows ? (
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">
                      {JSON.stringify(campaign.targeting.scheduleWindows, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">Diffusion continue</p>
                  )}
                </CardContent>
              </Card>

              {/* Geo */}
              {campaign.targeting.geoRadiusKm != null && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Zone géographique
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium">Rayon : </span>
                      {campaign.targeting.geoRadiusKm} km
                    </div>
                    {campaign.targeting.geoLatitude != null &&
                      campaign.targeting.geoLongitude != null && (
                        <div className="text-sm text-muted-foreground">
                          Centre : {campaign.targeting.geoLatitude.toFixed(4)},{' '}
                          {campaign.targeting.geoLongitude.toFixed(4)}
                        </div>
                      )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── Screens tab ─────────────────────────────────── */}
        <TabsContent value="screens">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Écrans ciblés via les réservations (bookings). Cette section sera alimentée par les
              données de réservation associées à la campagne.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la campagne</DialogTitle>
            <DialogDescription>
              Veuillez indiquer la raison du rejet pour la campagne{' '}
              <strong>{campaign.name}</strong>.
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
              onClick={() => rejectMutation.mutate(rejectReason.trim())}
            >
              {rejectMutation.isPending ? 'Rejet...' : 'Confirmer le rejet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
