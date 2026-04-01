'use client';

import { Download, FileText } from 'lucide-react';
import { Button, Badge } from '@neofilm/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { LoadingTable } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { EmptyState } from '@/components/common/empty-state';
import { useInvoices } from '@/lib/api/hooks/use-billing';
import { formatCurrency, formatDate } from '@/lib/utils';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PAID: { label: 'Payée', variant: 'default' },
  OPEN: { label: 'En attente', variant: 'outline' },
  DRAFT: { label: 'Brouillon', variant: 'secondary' },
  VOID: { label: 'Annulée', variant: 'destructive' },
};

export default function InvoicesPage() {
  const { data, isLoading, isError, refetch } = useInvoices();

  return (
    <>
      <PageHeader
        title="Factures"
        description="Historique de vos factures et paiements"
      />

      {isLoading && <LoadingTable rows={6} cols={5} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Aucune facture"
          description="Vos factures apparaîtront ici une fois votre premier paiement effectué."
        />
      )}

      {data && data.data.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° Facture</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((invoice) => {
                const cfg = statusConfig[invoice.status] ?? statusConfig.DRAFT;
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(invoice.periodStart)} — {formatDate(invoice.periodEnd)}
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(invoice.amountDueCents)}</TableCell>
                    <TableCell>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {invoice.pdfUrl && (
                        <Button variant="ghost" size="sm" className="gap-1" asChild>
                          <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-3.5 w-3.5" /> PDF
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
