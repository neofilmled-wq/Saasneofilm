'use client';

import {
  Card,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@neofilm/ui';
import { cn } from '@neofilm/ui';
import { Wallet, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { usePayouts } from '@/hooks/use-revenue';

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

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title="Paiements" description="Historique de vos versements" />

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
