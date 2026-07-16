'use client';

import {
  Card,
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@neofilm/ui';
import { cn } from '@neofilm/ui';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wallet, CheckCircle2, Clock, AlertCircle, Loader2, Landmark, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { usePayouts } from '@/hooks/use-revenue';
import { apiFetch } from '@/lib/api';

interface Payout {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt?: string;
  stripeTransferId?: string;
}
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string; variant: string }> = {
  PAID: { icon: CheckCircle2, label: 'Payé', variant: 'bg-emerald-100 text-emerald-800' },
  PROCESSING: { icon: Loader2, label: 'En cours', variant: 'bg-blue-100 text-blue-800' },
  PENDING: { icon: Clock, label: 'En attente', variant: 'bg-amber-100 text-amber-800' },
  FAILED: { icon: AlertCircle, label: 'Échoué', variant: 'bg-red-100 text-red-800' },
};

export default function PayoutsPage() {
  const { data: payouts, isLoading } = usePayouts();
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Stripe Connect status of this partner (where their retrocessions get sent).
  const { data: connect, refetch: refetchConnect } = useQuery({
    queryKey: ['partner', 'connect', 'status'],
    queryFn: () => apiFetch<any>('/partner/payouts/connect/status'),
  });
  const connectData = (connect as any)?.data ?? connect ?? {};
  const payoutsReady = !!connectData.payoutsEnabled;
  const detailsSubmitted = !!connectData.detailsSubmitted;

  const setupMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ url?: string }>('/partner/payouts/connect/setup', {
        method: 'POST',
        body: JSON.stringify({
          refreshUrl: `${window.location.origin}/partner/payouts`,
          returnUrl: `${window.location.origin}/partner/payouts`,
        }),
      }),
    onSuccess: (res: any) => {
      const url = res?.data?.url ?? res?.url;
      if (url) {
        window.location.href = url; // Stripe-hosted IBAN / KYC onboarding
        return;
      }
      toast.error('Impossible de générer le lien de configuration.');
      setIsSettingUp(false);
    },
    onError: (e: any) => {
      toast.error(e?.message ?? 'Erreur lors de la configuration des versements.');
      setIsSettingUp(false);
    },
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title="Paiements" description="Historique de vos versements" />

      {/* Payout method setup — where the partner's retrocessions are sent. */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Landmark className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Coordonnées de versement</p>
              {payoutsReady ? (
                <p className="text-sm text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Compte configuré — vos rétrocessions vous seront versées.
                </p>
              ) : detailsSubmitted ? (
                <p className="text-sm text-amber-600 flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Vérification en cours par Stripe…
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Renseignez votre IBAN via Stripe pour recevoir vos rétrocessions. Sans cela, vos
                  versements restent en attente.
                </p>
              )}
            </div>
          </div>
          {!payoutsReady && (
            <Button
              onClick={() => { setIsSettingUp(true); setupMutation.mutate(); }}
              disabled={isSettingUp || setupMutation.isPending}
              className="gap-1.5 shrink-0"
            >
              {isSettingUp || setupMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ExternalLink className="h-4 w-4" />}
              {detailsSubmitted ? 'Reprendre la configuration' : 'Configurer mes versements'}
            </Button>
          )}
          {payoutsReady && (
            <Button variant="outline" onClick={() => refetchConnect()} className="shrink-0">
              Actualiser le statut
            </Button>
          )}
        </div>
      </Card>

      {payouts && payouts.length > 0 ? (
        <Card className="rounded-2xl card-elevated overflow-hidden">
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Période</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date de paiement</TableHead>
                  <TableHead>Référence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payouts as Payout[]).map((payout) => {
                  const cfg = STATUS_CONFIG[payout.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <TableRow key={payout.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">
                            {formatDate(payout.periodStart)} — {formatDate(payout.periodEnd)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(payout.amountCents)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', cfg.variant)}>
                          <StatusIcon className={cn('mr-1 h-3 w-3', payout.status === 'PROCESSING' && 'animate-spin')} />
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {payout.paidAt ? formatDateTime(payout.paidAt) : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {payout.stripeTransferId ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Wallet}
          title="Aucun paiement"
          description="Vos premiers paiements apparaîtront ici une fois les revenus confirmés."
        />
      )}
    </div>
  );
}
