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
import { Download, CheckCircle, Calculator, Percent, BadgeCheck, Banknote, Loader2, Link2, CreditCard, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { apiFetch } from '@/lib/api';
import { useAdminSocket } from '@/hooks/use-admin-socket';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Format a period start ISO date into "juin 2026". The retrocession API
 *  returns periodStart/periodEnd, not a pre-formatted month string. */
function formatPeriod(periodStart?: string): string {
  if (!periodStart) return '—';
  const d = new Date(periodStart);
  if (Number.isNaN(d.getTime())) return '—';
  const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  // Mount the admin socket so `admin:retrocession:update` events refresh the
  // table live (another admin approving/paying, or a rate change).
  useAdminSocket();
  const monthOptions = generateMonthOptions();
  const [month, setMonth] = useState(monthOptions[0].value);
  const [ratePartnerOrgId, setRatePartnerOrgId] = useState('');
  const [newRate, setNewRate] = useState('');
  // Stripe Connect onboarding (admin-driven): unblocks "Payer" which
  // otherwise holds 100% of partners for lack of a ready Connect account.
  const [connectOrgId, setConnectOrgId] = useState('');
  const [connectStatus, setConnectStatus] = useState<any>(null);
  const [onboardingUrl, setOnboardingUrl] = useState('');

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

  // Approve a single statement (CALCULATED → APPROVED)
  const approveMutation = useMutation({
    mutationFn: (statementId: string) => apiFetch(`/admin/commissions/${statementId}/approve`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'retrocessions', month] });
      toast.success('Rétrocession approuvée');
    },
    onError: () => toast.error("Erreur lors de l'approbation"),
  });

  // Bulk-approve all CALCULATED statements of the month
  const approveMonthMutation = useMutation({
    mutationFn: () => apiFetch('/admin/commissions/approve-month', {
      method: 'POST',
      body: JSON.stringify({ month }),
    }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'retrocessions', month] });
      const n = res?.data?.approvedCount ?? res?.approvedCount ?? 0;
      toast.success(`${n} rétrocession(s) approuvée(s)`);
    },
    onError: () => toast.error("Erreur lors de l'approbation groupée"),
  });

  // Pay the month via the real Stripe Connect batch (APPROVED → PAID + transfers)
  const payMonthMutation = useMutation({
    mutationFn: () => apiFetch('/admin/commissions/pay-month', {
      method: 'POST',
      body: JSON.stringify({ month }),
    }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'retrocessions', month] });
      const d = res?.data ?? res ?? {};
      const processed = Array.isArray(d.processed) ? d.processed.length : 0;
      const held = Array.isArray(d.held) ? d.held.length : 0;
      const failed = Array.isArray(d.failed) ? d.failed.length : 0;
      if (processed > 0) {
        toast.success(
          `Virement lancé : ${processed} partenaire(s) — ${formatCurrency(d.totalTransferredCents ?? 0)}` +
            (held > 0 ? ` · ${held} en attente (Connect incomplet)` : '') +
            (failed > 0 ? ` · ${failed} échec(s)` : ''),
        );
      } else if (held > 0) {
        toast.error(`${held} partenaire(s) sans compte Stripe Connect prêt — aucun virement.`);
      } else {
        toast.error("Aucune rétrocession éligible (approuve d'abord, ou déjà payées).");
      }
    },
    onError: (err: any) => toast.error(`Erreur de paiement : ${err?.message ?? 'inconnue'}`),
  });

  // Manual settlement fallback (no Stripe) — kept for edge cases
  const markPaidMutation = useMutation({
    mutationFn: (statementId: string) => apiFetch(`/admin/commissions/${statementId}/mark-paid`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'retrocessions', month] });
      toast.success('Marqué comme payé (manuel)');
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

  // ── Stripe Connect onboarding mutations ──────────────────────────────────
  const connectStatusMutation = useMutation({
    mutationFn: (orgId: string) => apiFetch(`/payouts/connect/status/${orgId}`),
    onSuccess: (res: any) => {
      setConnectStatus(res?.data ?? res ?? null);
      setOnboardingUrl('');
    },
    onError: () => {
      setConnectStatus(null);
      toast.error('Impossible de récupérer le statut Connect (compte inexistant ?)');
    },
  });

  const connectCreateMutation = useMutation({
    mutationFn: (orgId: string) => apiFetch(`/payouts/connect/create/${orgId}`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Compte Stripe Connect créé — générez le lien d\'onboarding');
      if (connectOrgId) connectStatusMutation.mutate(connectOrgId);
    },
    onError: (err: any) => toast.error(`Erreur création compte : ${err?.message ?? 'inconnue'}`),
  });

  const onboardingLinkMutation = useMutation({
    mutationFn: (orgId: string) => {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return apiFetch(`/payouts/connect/onboarding-link/${orgId}`, {
        method: 'POST',
        body: JSON.stringify({
          refreshUrl: `${origin}/admin/retrocessions`,
          returnUrl: `${origin}/admin/retrocessions`,
        }),
      });
    },
    onSuccess: (res: any) => {
      const url = res?.data?.url ?? res?.url ?? '';
      setOnboardingUrl(url);
      if (url) toast.success('Lien d\'onboarding généré — à envoyer au partenaire');
    },
    onError: (err: any) => toast.error(`Erreur lien onboarding : ${err?.message ?? 'inconnue'}`),
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

  // Status counters drive which batch actions are enabled.
  const calculatedCount = retrocessions.filter((r: any) => r.status === 'CALCULATED').length;
  const approvedCount = retrocessions.filter((r: any) => r.status === 'APPROVED').length;
  const approvedTotalCents = retrocessions
    .filter((r: any) => r.status === 'APPROVED')
    .reduce((sum: number, r: any) => sum + (r.partnerShareCents ?? 0), 0);

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

        {/* Step 2 — approve all CALCULATED statements for the month */}
        <Button
          variant="outline"
          onClick={() => approveMonthMutation.mutate()}
          disabled={calculatedCount === 0 || approveMonthMutation.isPending}
        >
          {approveMonthMutation.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <BadgeCheck className="mr-2 h-4 w-4" />}
          Approuver tout{calculatedCount > 0 ? ` (${calculatedCount})` : ''}
        </Button>

        {/* Step 3 — real Stripe Connect batch for APPROVED statements */}
        <Button
          onClick={() => {
            if (
              window.confirm(
                `Lancer le virement Stripe de ${formatCurrency(approvedTotalCents)} ` +
                  `à ${approvedCount} partenaire(s) pour ${monthOptions.find((m) => m.value === month)?.label} ?`,
              )
            ) {
              payMonthMutation.mutate();
            }
          }}
          disabled={approvedCount === 0 || payMonthMutation.isPending}
        >
          {payMonthMutation.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Banknote className="mr-2 h-4 w-4" />}
          {payMonthMutation.isPending
            ? 'Virement en cours…'
            : `Payer le mois${approvedCount > 0 ? ` (${formatCurrency(approvedTotalCents)})` : ''}`}
        </Button>

        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Workflow hint */}
      <p className="text-xs text-muted-foreground -mt-3">
        Flux : <strong>Calculer</strong> le mois → <strong>Approuver</strong> les rétrocessions →
        {' '}<strong>Payer</strong> (virement Stripe Connect réel vers les partenaires).
      </p>

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

      {/* Stripe Connect onboarding — the unblock for "Payer" (a partner without
          a ready Connect account is always held → no transfer). */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Comptes de versement Stripe Connect
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">ID organisation partenaire</label>
              <Input
                value={connectOrgId}
                onChange={(e) => { setConnectOrgId(e.target.value); setConnectStatus(null); setOnboardingUrl(''); }}
                placeholder="clu..."
                className="w-64"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => connectOrgId && connectStatusMutation.mutate(connectOrgId)}
              disabled={!connectOrgId || connectStatusMutation.isPending}
            >
              {connectStatusMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <BadgeCheck className="mr-2 h-4 w-4" />}
              Vérifier le statut
            </Button>
            <Button
              variant="outline"
              onClick={() => connectOrgId && connectCreateMutation.mutate(connectOrgId)}
              disabled={!connectOrgId || connectCreateMutation.isPending}
            >
              {connectCreateMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <CreditCard className="mr-2 h-4 w-4" />}
              Créer le compte
            </Button>
            <Button
              onClick={() => connectOrgId && onboardingLinkMutation.mutate(connectOrgId)}
              disabled={!connectOrgId || onboardingLinkMutation.isPending}
            >
              {onboardingLinkMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Link2 className="mr-2 h-4 w-4" />}
              Générer le lien d'onboarding
            </Button>
          </div>

          {connectStatus && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={connectStatus.payoutsEnabled ? 'default' : 'outline'}>
                Versements {connectStatus.payoutsEnabled ? 'activés' : 'désactivés'}
              </Badge>
              <Badge variant={connectStatus.chargesEnabled ? 'default' : 'outline'}>
                Charges {connectStatus.chargesEnabled ? 'activées' : 'désactivées'}
              </Badge>
              <Badge variant={connectStatus.detailsSubmitted ? 'default' : 'outline'}>
                Détails {connectStatus.detailsSubmitted ? 'soumis' : 'manquants'}
              </Badge>
              {connectStatus.ready || (connectStatus.payoutsEnabled && connectStatus.chargesEnabled && connectStatus.detailsSubmitted) ? (
                <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Prêt à recevoir des virements</span>
              ) : (
                <span className="text-amber-600">Onboarding incomplet — le partenaire ne recevra pas de virement</span>
              )}
            </div>
          )}

          {onboardingUrl && (
            <div className="mt-4 rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-2">
                Envoyez ce lien au partenaire pour qu'il complète son onboarding Stripe :
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={onboardingUrl} className="flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigator.clipboard.writeText(onboardingUrl); toast.success('Lien copié'); }}
                >
                  Copier
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={onboardingUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-3">
            Flux : <strong>Créer le compte</strong> → <strong>Générer le lien</strong> → le partenaire complète
            son onboarding Stripe → le statut passe « Prêt » → le bouton <strong>Payer</strong> peut alors le virer.
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
                        {row.partnerName ?? row.partnerOrgId}
                      </TableCell>
                      <TableCell>{formatPeriod(row.periodStart)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalRevenueCents ?? 0)}</TableCell>
                      <TableCell className="text-right">{((row.commissionRate ?? 0) * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.partnerShareCents ?? 0)}</TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.status === 'CALCULATED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveMutation.mutate(row.id)}
                              disabled={approveMutation.isPending}
                            >
                              <BadgeCheck className="mr-1 h-3 w-3" />
                              Approuver
                            </Button>
                          )}
                          {row.status !== 'PAID' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markPaidMutation.mutate(row.id)}
                              disabled={markPaidMutation.isPending}
                              title="Régularisation manuelle sans virement Stripe"
                            >
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Marquer payé
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
    </div>
  );
}
