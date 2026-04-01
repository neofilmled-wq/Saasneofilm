'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from '@neofilm/ui';
import { Download, CheckCircle, Calculator, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { apiFetch } from '@/lib/api';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function generateMonthOptions(): { value: string; label: string }[] {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    months.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return months;
}

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  PENDING: { label: 'En attente', variant: 'outline' },
  CALCULATED: { label: 'Calculé', variant: 'secondary' },
  APPROVED: { label: 'Approuvé', variant: 'default' },
  PAID: { label: 'Payé', variant: 'default' },
};

export default function RetrocessionsPage() {
  const queryClient = useQueryClient();
  const monthOptions = generateMonthOptions();
  const [month, setMonth] = useState(monthOptions[0].value);
  const [ratePartnerOrgId, setRatePartnerOrgId] = useState('');
  const [newRate, setNewRate] = useState('');

  // Fetch retrocessions
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'retrocessions', month],
    queryFn: () => apiFetch(`/admin/commissions/retrocessions?month=${month}`),
  });

  // Compute statements
  const computeMutation = useMutation({
    mutationFn: () => apiFetch('/admin/commissions/compute', {
      method: 'POST',
      body: JSON.stringify({ month }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'retrocessions', month] });
      toast.success('Calcul des rétrocessions terminé');
    },
    onError: () => toast.error('Erreur lors du calcul'),
  });

  // Mark paid
  const markPaidMutation = useMutation({
    mutationFn: (statementId: string) => apiFetch(`/admin/commissions/${statementId}/mark-paid`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'retrocessions', month] });
      toast.success('Statement marqué comme payé');
    },
    onError: () => toast.error('Erreur'),
  });

  // Update rate
  const updateRateMutation = useMutation({
    mutationFn: () => apiFetch('/admin/commissions/rate', {
      method: 'PATCH',
      body: JSON.stringify({ partnerOrgId: ratePartnerOrgId, ratePercent: parseFloat(newRate) }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'retrocessions'] });
      toast.success('Taux mis à jour');
      setRatePartnerOrgId('');
      setNewRate('');
    },
    onError: () => toast.error('Erreur lors de la mise à jour du taux'),
  });

  // Export CSV
  async function handleExport() {
    try {
      const csv = await apiFetch(`/admin/commissions/retrocessions/export?month=${month}`);
      const blob = new Blob([typeof csv === 'string' ? csv : JSON.stringify(csv)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retrocessions-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erreur lors de l'export");
    }
  }

  const retrocessions = (data as any)?.data ?? data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Rétrocessions partenaires" description="Gestion des commissions et versements partenaires" />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => computeMutation.mutate()}
          disabled={computeMutation.isPending}
        >
          <Calculator className="mr-2 h-4 w-4" />
          {computeMutation.isPending ? 'Calcul en cours…' : 'Calculer le mois'}
        </Button>

        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Rate update */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="h-4 w-4" />
            Modifier le taux de rétrocession
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">ID organisation partenaire</label>
              <Input
                value={ratePartnerOrgId}
                onChange={(e) => setRatePartnerOrgId(e.target.value)}
                placeholder="clu..."
                className="w-64"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nouveau taux (%)</label>
              <Input
                type="number"
                min={10}
                max={20}
                step={0.5}
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="10-20"
                className="w-28"
              />
            </div>
            <Button
              onClick={() => updateRateMutation.mutate()}
              disabled={!ratePartnerOrgId || !newRate || updateRateMutation.isPending}
            >
              Appliquer
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Le changement impacte instantanément les périodes non clôturées (PENDING, CALCULATED, APPROVED).
          </p>
        </CardContent>
      </Card>

      {/* Retrocessions table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : retrocessions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <p>Aucune rétrocession pour cette période</p>
              <p className="text-xs mt-1">Lancez le calcul pour générer les statements du mois.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partenaire</TableHead>
                  <TableHead>Mois</TableHead>
                  <TableHead className="text-right">Revenu total</TableHead>
                  <TableHead className="text-right">Taux</TableHead>
                  <TableHead className="text-right">Montant rétrocession</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retrocessions.map((row: any) => {
                  const statusInfo = STATUS_BADGES[row.status] ?? STATUS_BADGES.PENDING;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.partnerOrg?.name ?? row.partnerOrgId}
                      </TableCell>
                      <TableCell>{row.month}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalRevenueCents ?? 0)}</TableCell>
                      <TableCell className="text-right">{((row.commissionRate ?? 0) * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.amountCents ?? 0)}</TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {row.status !== 'PAID' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markPaidMutation.mutate(row.id)}
                            disabled={markPaidMutation.isPending}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Marquer payé
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
