'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, Tv, BookOpen, Calendar, CreditCard } from 'lucide-react';
import { Button, Card, CardContent } from '@neofilm/ui';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { usePublishCampaign, useCampaign, useCampaignGroup } from '@/lib/api/hooks/use-campaigns';
import Link from 'next/link';
import { useState } from 'react';

function formatDate(d: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
}

function formatPrice(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' \u20ac';
}

export default function DiffusePage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const publishCampaign = usePublishCampaign();
  const [isPublishing, setIsPublishing] = useState(false);

  const { data: campaign, isLoading } = useCampaign(campaignId);
  const { data: groupCampaigns = [] } = useCampaignGroup(campaign?.groupId);
  const isGroup = !!campaign?.groupId && groupCampaigns.length > 1;

  // Find sibling IDs from group
  const siblingIds = isGroup ? groupCampaigns.map((c: any) => c.id).filter((id: string) => id !== campaignId) : [];
  const { data: siblingCampaign } = useCampaign(siblingIds[0] ?? '');

  // Build full campaign list with detailed data (includes creatives)
  const allCampaigns: any[] = isGroup
    ? [campaign, siblingCampaign].filter(Boolean)
    : [campaign].filter(Boolean);
  const adSpotCampaign = allCampaigns.find((c: any) => c.type === 'AD_SPOT');
  const catalogCampaign = allCampaigns.find((c: any) => c.type === 'CATALOG_LISTING');

  const durationMonths = campaign?.durationMonths ?? 6;

  const adSpotBudget = adSpotCampaign?.budgetCents ?? 0;
  const catalogBudget = catalogCampaign?.budgetCents ?? 0;
  const totalMonthly = adSpotBudget + catalogBudget;
  const totalEngagement = totalMonthly * durationMonths;

  const adSpotScreens = adSpotCampaign?.targeting?.includedScreens?.length ?? 0;
  const catalogScreens = catalogCampaign?.targeting?.includedScreens?.length ?? 0;

  // Get video thumbnail
  const videoCreative = adSpotCampaign?.creatives?.find((c: any) => c.type === 'VIDEO');
  const imageCreative = catalogCampaign?.creatives?.find((c: any) => c.type === 'IMAGE');

  async function handleDiffuse() {
    setIsPublishing(true);
    try {
      for (const c of allCampaigns.filter((c: any) => c.status === 'APPROVED')) {
        await publishCampaign.mutateAsync(c.id);
      }
      toast.success('Campagne diffusee ! Vos publicites sont maintenant en cours de diffusion.');
      router.push(`/campaigns/${campaignId}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de la diffusion');
    } finally {
      setIsPublishing(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Chargement...</div>;
  }

  if (!campaign) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Campagne introuvable</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/campaigns/${campaignId}`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Diffuser votre campagne</h1>
          <p className="text-sm text-muted-foreground">Votre campagne a ete validee. Confirmez la diffusion pour commencer.</p>
        </div>
      </div>

      {/* Campaign info */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-lg font-semibold">{campaign.name}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{campaign.description}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Ad Spot */}
            {adSpotCampaign && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Tv className="h-5 w-5 text-primary" />
                  <h3 className="font-medium">Spot publicitaire</h3>
                </div>
                {videoCreative?.fileUrl && (
                  <div className="mb-3 overflow-hidden rounded-lg bg-black">
                    <video
                      src={videoCreative.fileUrl}
                      className="h-40 w-full object-contain"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  </div>
                )}
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Ecrans cibles</dt>
                    <dd className="font-medium">{adSpotScreens} ecrans</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Budget mensuel</dt>
                    <dd className="font-medium text-primary">{formatPrice(adSpotBudget)}</dd>
                  </div>
                </dl>
              </div>
            )}

            {/* Catalogue */}
            {catalogCampaign && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <h3 className="font-medium">Fiche catalogue</h3>
                </div>
                {imageCreative?.fileUrl && (
                  <div className="mb-3 overflow-hidden rounded-lg">
                    <img
                      src={imageCreative.fileUrl}
                      alt="Catalogue"
                      className="h-40 w-full object-cover"
                    />
                  </div>
                )}
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Ecrans cibles</dt>
                    <dd className="font-medium">{catalogScreens} ecrans</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Budget mensuel</dt>
                    <dd className="font-medium text-primary">{formatPrice(catalogBudget)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pricing summary */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Recapitulatif</h3>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> Duree de l'abonnement
              </dt>
              <dd className="font-medium">{durationMonths} mois</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Budget mensuel total</dt>
              <dd className="font-medium">{formatPrice(totalMonthly)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2">
              <dt className="text-base font-semibold">Total engagement ({durationMonths} mois)</dt>
              <dd className="text-lg font-bold text-primary">{formatPrice(totalEngagement)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Action button */}
      <div className="flex justify-end gap-3">
        <Link href={`/campaigns/${campaignId}`}>
          <Button variant="outline">Annuler</Button>
        </Link>
        <Button
          size="lg"
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          onClick={handleDiffuse}
          disabled={isPublishing}
        >
          <Play className="h-5 w-5" />
          {isPublishing ? 'Diffusion en cours...' : 'Confirmer et diffuser'}
        </Button>
      </div>
    </div>
  );
}
