'use client';

import { CreditCard, ExternalLink, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button, Card, CardContent } from '@neofilm/ui';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { LoadingPage } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useSubscription, useCreatePortalSession } from '@/lib/api/hooks/use-billing';
import { formatCurrency, formatDate } from '@/lib/utils';

const statusLabels: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Actif', color: 'bg-green-50 text-green-700 border-green-200' },
  PAST_DUE: { label: 'Impayé', color: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED: { label: 'Annulé', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  PAUSED: { label: 'En pause', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  TRIALING: { label: 'Essai', color: 'bg-blue-50 text-blue-700 border-blue-200' },
};

export default function BillingPage() {
  const { data: subscription, isLoading, isError, refetch } = useSubscription();
  const portalSession = useCreatePortalSession();

  if (isLoading) return <LoadingPage />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  async function openPortal() {
    try {
      const result = await portalSession.mutateAsync();
      window.open(result.portalUrl, '_blank');
    } catch {
      toast.error('Impossible d\'ouvrir le portail de facturation');
    }
  }

  const status = statusLabels[subscription?.status ?? 'ACTIVE'] ?? statusLabels.ACTIVE;

  return (
    <>
      <PageHeader
        title="Abonnement"
        description="Gérez votre abonnement et vos moyens de paiement"
        actions={
          <Button variant="outline" className="gap-1.5" onClick={openPortal}>
            <ExternalLink className="h-4 w-4" /> Portail de facturation
          </Button>
        }
      />

      {/* Subscription card */}
      {subscription && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <CreditCard className="h-6 w-6 text-primary" />
                  <h3 className="text-xl font-bold">{subscription.planName}</h3>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.color}`}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {subscription.screensCount} écrans TV inclus dans votre abonnement
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">{formatCurrency(subscription.monthlyPriceCents)}</p>
                <p className="text-sm text-muted-foreground">par mois</p>
              </div>
            </div>

            {/* Pack pricing breakdown (Diffusion + Catalogue) */}
            {subscription.breakdown && (
              <div className="mt-4 grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
                {subscription.breakdown.diffusionAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Diffusion TV</p>
                      <p className="text-xs text-muted-foreground">
                        {subscription.diffusionTvCount} écrans
                      </p>
                    </div>
                    <p className="font-semibold">
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(subscription.breakdown.diffusionAmount)}
                      <span className="text-xs text-muted-foreground font-normal"> /mois</span>
                    </p>
                  </div>
                )}
                {subscription.breakdown.catalogueAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Catalogue TV</p>
                      <p className="text-xs text-muted-foreground">
                        {subscription.catalogueTvCount} écrans
                      </p>
                    </div>
                    <p className="font-semibold">
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(subscription.breakdown.catalogueAmount)}
                      <span className="text-xs text-muted-foreground font-normal"> /mois</span>
                    </p>
                  </div>
                )}
                {subscription.durationMonths && (
                  <div className="sm:col-span-2 flex items-center justify-between border-t pt-3">
                    <p className="text-sm text-muted-foreground">Engagement</p>
                    <p className="text-sm font-medium">{subscription.durationMonths} mois</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 grid gap-4 border-t pt-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Période actuelle</p>
                <p className="font-medium">{formatDate(subscription.currentPeriodStart)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prochain renouvellement</p>
                <p className="font-medium">{formatDate(subscription.currentPeriodEnd)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Renouvellement auto</p>
                <p className="font-medium">{subscription.cancelAtPeriodEnd ? 'Non (annulation prévue)' : 'Oui'}</p>
              </div>
            </div>

            {subscription.cancelAtPeriodEnd && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                Votre abonnement sera annulé à la fin de la période en cours.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment method */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h3 className="mb-4 font-semibold">Moyen de paiement</h3>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-16 items-center justify-center rounded bg-muted text-xs font-medium">VISA</div>
              <div>
                <p className="font-medium">**** **** **** 4242</p>
                <p className="text-sm text-muted-foreground">Expire 12/2027</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600">Actif</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={openPortal}>
            Modifier le moyen de paiement
          </Button>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={openPortal}>
          <CardContent className="flex items-center gap-3 p-4">
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Changer de pack</p>
              <p className="text-sm text-muted-foreground">Augmentez ou réduisez le nombre d'écrans</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition-shadow hover:shadow-md">
          <CardContent className="flex items-center gap-3 p-4">
            <ExternalLink className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Voir les factures</p>
              <p className="text-sm text-muted-foreground">Consultez votre historique de facturation</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
