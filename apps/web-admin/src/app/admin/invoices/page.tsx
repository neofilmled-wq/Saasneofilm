'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Separator,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi, type Invoice } from '@/lib/admin-api';
import { formatCurrency, formatDate } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const STATUS_TABS = [
  { value: 'ALL', label: 'Toutes' },
  { value: 'OPEN', label: 'En attente' },
  { value: 'PAID', label: 'Payées' },
  { value: 'VOID', label: 'Annulées' },
] as const;

const INVOICE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'En attente',
  PAID: 'Payée',
  VOID: 'Annulée',
  DRAFT: 'Brouillon',
  UNCOLLECTIBLE: 'Irrécouvrable',
};

const INVOICE_STATUS_VARIANTS: Record<string, string> = {
  OPEN: 'bg-yellow-100 text-yellow-700',
  PAID: 'bg-green-100 text-green-700',
  VOID: 'bg-gray-100 text-gray-500',
  DRAFT: 'bg-gray-100 text-gray-700',
  UNCOLLECTIBLE: 'bg-red-100 text-red-700',
};

const ORG_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  PARTNER: { label: 'Partenaire', className: 'bg-blue-100 text-blue-700' },
  ADVERTISER: { label: 'Annonceur', className: 'bg-purple-100 text-purple-700' },
};

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const apiStatus = statusFilter === 'ALL' ? undefined : statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, apiStatus],
    queryFn: () => adminApi.getInvoices({ page, limit: 20, status: apiStatus }),
  });

  const invoices = data?.data?.data ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? 1;

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApi.updateInvoiceStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Statut de la facture mis à jour');
    },
    onError: (error: Error) => {
      toast.error(`Erreur : ${error.message}`);
    },
  });

  const handleExportCsv = () => {
    const exportPath = adminApi.exportInvoicesCsv(apiStatus);
    window.open(`${API_URL}${exportPath}`, '_blank');
  };

  const handleTabChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Factures"
        description={`${total} facture${total > 1 ? 's' : ''}`}
        action={
          <Button variant="outline" className="gap-1.5" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            Exporter CSV
          </Button>
        }
      />

      <Tabs value={statusFilter} onValueChange={handleTabChange}>
        <TabsList>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    Aucune facture trouvée
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID Facture</TableHead>
                        <TableHead>Organisation</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Échéance</TableHead>
                        <TableHead>Payée le</TableHead>
                        <TableHead>Créée le</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => {
                        const orgType = invoice.organization?.type ?? '';
                        const orgBadge = ORG_TYPE_BADGE[orgType];
                        return (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-mono text-sm">
                              {invoice.stripeInvoiceId ?? invoice.id.slice(0, 8)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {invoice.organization?.name ?? '—'}
                            </TableCell>
                            <TableCell>
                              {orgBadge ? (
                                <span
                                  className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${orgBadge.className}`}
                                >
                                  {orgBadge.label}
                                </span>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(invoice.amountCents)}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_VARIANTS[invoice.status] ?? 'bg-gray-100 text-gray-700'}`}
                              >
                                {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {invoice.paidAt ? formatDate(invoice.paidAt) : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(invoice.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedInvoice(invoice)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Voir détails
                                </Button>
                                {invoice.status === 'OPEN' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-green-700 hover:text-green-800"
                                    disabled={updateStatusMutation.isPending}
                                    onClick={() =>
                                      updateStatusMutation.mutate({
                                        id: invoice.id,
                                        status: 'PAID',
                                      })
                                    }
                                  >
                                    Marquer payée
                                  </Button>
                                )}
                                {invoice.status === 'PAID' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-yellow-700 hover:text-yellow-800"
                                    disabled={updateStatusMutation.isPending}
                                    onClick={() =>
                                      updateStatusMutation.mutate({
                                        id: invoice.id,
                                        status: 'OPEN',
                                      })
                                    }
                                  >
                                    Marquer impayée
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} sur {totalPages} ({total} facture{total > 1 ? 's' : ''})
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails de la facture</DialogTitle>
            <DialogDescription>
              {selectedInvoice?.stripeInvoiceId ?? selectedInvoice?.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Organisation</p>
                  <p className="font-medium">{selectedInvoice.organization?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">
                    {ORG_TYPE_BADGE[selectedInvoice.organization?.type ?? '']?.label ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Montant</p>
                  <p className="font-medium">{formatCurrency(selectedInvoice.amountCents)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Montant payé</p>
                  <p className="font-medium">
                    {selectedInvoice.amountPaidCents != null
                      ? formatCurrency(selectedInvoice.amountPaidCents)
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Statut</p>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_VARIANTS[selectedInvoice.status] ?? 'bg-gray-100 text-gray-700'}`}
                  >
                    {INVOICE_STATUS_LABELS[selectedInvoice.status] ?? selectedInvoice.status}
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground">Devise</p>
                  <p className="font-medium">{selectedInvoice.currency?.toUpperCase() ?? 'EUR'}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Date de création</p>
                  <p className="font-medium">{formatDate(selectedInvoice.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Échéance</p>
                  <p className="font-medium">
                    {selectedInvoice.dueDate ? formatDate(selectedInvoice.dueDate) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payée le</p>
                  <p className="font-medium">
                    {selectedInvoice.paidAt ? formatDate(selectedInvoice.paidAt) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">ID Stripe</p>
                  <p className="font-medium font-mono text-xs">
                    {selectedInvoice.stripeInvoiceId ?? '—'}
                  </p>
                </div>
              </div>

              {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-2">Paiements ({selectedInvoice.payments.length})</p>
                    <div className="space-y-2">
                      {selectedInvoice.payments.map((payment: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-sm rounded-md border p-2"
                        >
                          <span className="font-mono text-xs">{payment.stripePaymentId ?? `Paiement ${idx + 1}`}</span>
                          <span className="font-medium">
                            {formatCurrency(payment.amountCents ?? 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
