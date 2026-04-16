'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, ExternalLink, Monitor, BarChart3, Clock, Tv, BookOpen, Pencil } from 'lucide-react';
import { Button, Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@neofilm/ui';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { LoadingPage } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { CampaignStatusBadge } from '@/components/common/status-badge';
import { useCampaign, useCampaignGroup, usePublishCampaign } from '@/lib/api/hooks/use-campaigns';
import { useAdvertiserAnalytics } from '@/lib/api/hooks/use-analytics';

import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

export default function CampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  const { data: campaign, isLoading, isError, refetch } = useCampaign(campaignId);

  // If this campaign has a groupId, fetch sibling campaigns
  const { data: groupCampaigns = [] } = useCampaignGroup(campaign?.groupId);
  const isGroup = !!campaign?.groupId && groupCampaigns.length > 1;

  // Real views per creative (from DiffusionLog) — same source as Analytics page
  const { data: analytics } = useAdvertiserAnalytics();

  const publishCampaign = usePublishCampaign();

  if (isLoading) return <LoadingPage />;
  if (isError || !campaign) return <ErrorState onRetry={() => refetch()} />;

  // In group mode: use the grouped campaigns, otherwise just the single campaign
  const allCampaigns: any[] = isGroup ? groupCampaigns : [campaign];
  const adSpotCampaign = allCampaigns.find((c: any) => c.type === 'AD_SPOT');
  const catalogCampaign = allCampaigns.find((c: any) => c.type === 'CATALOG_LISTING');

  const totalBudget = allCampaigns.reduce((sum: number, c: any) => sum + (c.budgetCents ?? 0), 0);
  const totalScreens = allCampaigns.reduce((sum: number, c: any) => sum + (c.screensCount ?? c.targeting?.includedScreens?.length ?? 0), 0);

  // Total views: sum the real views of all creatives belonging to campaigns in this view
  // Source = /analytics/advertiser (same as Analytics page — based on DiffusionLog)
  const campaignIdsInView = new Set(allCampaigns.map((c: any) => c.id));
  const totalImpressions = (analytics?.viewsByCreative ?? [])
    .filter((v) => v.campaignId && campaignIdsInView.has(v.campaignId))
    .reduce((sum, v) => sum + (v.totalViews ?? 0), 0);

  // Calculate number of months and total budget over the full period
  const start = new Date(campaign.startDate);
  const end = new Date(campaign.endDate);
  const durationMonths = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  const totalBudgetOverPeriod = totalBudget * durationMonths;

  // Status: show ACTIVE if any is active, else show the first campaign status
  const displayStatus = allCampaigns.some((c: any) => c.status === 'ACTIVE') ? 'ACTIVE'
    : campaign.status;

  async function handlePublishAll() {
    try {
      for (const c of allCampaigns.filter((c: any) => c.status === 'PENDING_REVIEW')) {
        await publishCampaign.mutateAsync(c.id);
      }
      toast.success(isGroup ? 'Campagnes activées !' : 'Campagne activée ! Diffusion en cours sur les écrans TV.');
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de la publication');
    }
  }

  const canPublish = allCampaigns.some((c: any) => c.status === 'PENDING_REVIEW');
  const canDiffuse = allCampaigns.some((c: any) => c.status === 'APPROVED');

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={campaign.description}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/campaigns">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Retour
              </Button>
            </Link>
            <Link href={`/campaigns/${campaignId}/edit`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Pencil className="h-4 w-4" /> Ajouter des écrans
              </Button>
            </Link>
            {canDiffuse && (
              <Link href={`/campaigns/${campaignId}/diffuse`}>
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                  <Play className="h-4 w-4" /> Diffuser la pub
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Status + type badges */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <CampaignStatusBadge status={displayStatus} />
        {adSpotCampaign && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Tv className="h-3.5 w-3.5" /> Spot TV
          </span>
        )}
        {catalogCampaign && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
            <BookOpen className="h-3.5 w-3.5" /> Catalogue
          </span>
        )}
      </div>

      {/* KPI cards — adapted to campaign composition:
           - Spot TV présent → card "Diffusions"
           - Catalogue présent → card "Clics catalogue"
           - Les deux → les deux cards
      */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {adSpotCampaign && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Diffusions</p>
              <p className="text-2xl font-bold">{formatNumber(totalImpressions)}</p>
            </CardContent>
          </Card>
        )}
        {catalogCampaign && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Clics catalogue</p>
              <p className="text-2xl font-bold">{formatNumber(
                (catalogCampaign.catalogueListings ?? []).reduce((sum: number, l: any) => sum + (l.clickCount ?? 0), 0)
              )}</p>
            </CardContent>
          </Card>
        )}
        {!isGroup && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Écrans</p>
              <p className="text-2xl font-bold">{totalScreens}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Budget mensuel</p>
            <p className="text-2xl font-bold">{formatCurrency(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Budget total ({durationMonths} mois)</p>
            <p className="text-2xl font-bold">{formatCurrency(totalBudgetOverPeriod)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Période</p>
            <p className="text-sm font-medium">{formatDate(campaign.startDate)}</p>
            <p className="text-xs text-muted-foreground">au {formatDate(campaign.endDate)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Budget breakdown — only shown when grouped */}
      {isGroup && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {adSpotCampaign && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tv className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Diffusion Publicité TV</h3>
                  <CampaignStatusBadge status={adSpotCampaign.status} />
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Budget mensuel</dt>
                    <dd className="font-bold text-primary text-base">{formatCurrency(adSpotCampaign.budgetCents)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Écrans ciblés</dt>
                    <dd>{adSpotCampaign.screensCount ?? adSpotCampaign.targeting?.includedScreens?.length ?? 0}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}
          {catalogCampaign && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold">Catalogue TV</h3>
                  <CampaignStatusBadge status={catalogCampaign.status} />
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Budget mensuel</dt>
                    <dd className="font-bold text-blue-600 text-base">{formatCurrency(catalogCampaign.budgetCents)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Écrans ciblés</dt>
                    <dd>{catalogCampaign.screensCount ?? catalogCampaign.targeting?.includedScreens?.length ?? 0}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="screens">
        <TabsList>
          <TabsTrigger value="screens">Écrans</TabsTrigger>
          <TabsTrigger value="analytics">Analytiques</TabsTrigger>
          <TabsTrigger value="activity">Activité</TabsTrigger>
        </TabsList>

        <TabsContent value="screens" className="mt-4 space-y-4">
          {adSpotCampaign && (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 font-medium flex items-center gap-2">
                  <Tv className="h-4 w-4 text-primary" />
                  Écrans Diffusion TV ({adSpotCampaign.targeting?.includedScreens?.length ?? 0})
                </h3>
                {adSpotCampaign.targeting?.includedScreens?.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {adSpotCampaign.targeting.includedScreens.map((screen: any) => (
                      <div key={screen.id} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium truncate">{screen.name}</p>
                        <p className="text-muted-foreground text-xs">{screen.city}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun écran ciblé.</p>
                )}
              </CardContent>
            </Card>
          )}
          {catalogCampaign && (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                  Écrans Catalogue TV ({catalogCampaign.targeting?.includedScreens?.length ?? 0})
                </h3>
                {catalogCampaign.targeting?.includedScreens?.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {catalogCampaign.targeting.includedScreens.map((screen: any) => (
                      <div key={screen.id} className="rounded-lg border border-blue-200 p-3 text-sm">
                        <p className="font-medium truncate">{screen.name}</p>
                        <p className="text-muted-foreground text-xs">{screen.city}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun écran ciblé.</p>
                )}
              </CardContent>
            </Card>
          )}
          {!adSpotCampaign && !catalogCampaign && (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 font-medium flex items-center gap-2">
                  <Monitor className="h-4 w-4" /> {totalScreens} écran{totalScreens !== 1 ? 's' : ''} ciblé{totalScreens !== 1 ? 's' : ''}
                </h3>
                {campaign.targeting?.includedScreens?.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {campaign.targeting.includedScreens.map((screen: any) => (
                      <div key={screen.id} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium truncate">{screen.name}</p>
                        <p className="text-muted-foreground text-xs">{screen.city}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun écran ciblé pour cette campagne.</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <Card>
            <CardContent className="flex items-center justify-center p-12 text-center">
              <div>
                <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Analytiques de campagne</p>
                <p className="text-sm text-muted-foreground">Consultez les statistiques détaillées</p>
                <Link href={`/analytics/${campaignId}`}>
                  <Button size="sm" className="mt-3 gap-1.5">
                    <ExternalLink className="h-4 w-4" /> Voir les analytiques
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 font-medium">Historique d'activité</h3>
              <div className="space-y-3">
                {[
                  { date: campaign.updatedAt, action: 'Campagne mise à jour' },
                  { date: campaign.createdAt, action: 'Campagne créée' },
                ].map((event, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{formatDate(event.date)}</span>
                    <span>{event.action}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
