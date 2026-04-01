'use client';

import { useState } from 'react';
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neofilm/ui';
import {
  TrendingUp,
  Wallet,
  Monitor,
  Download,
  Percent,
  BarChart3,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { LoadingState } from '@/components/ui/loading-state';
import { useRevenueSummary, useRevenueByScreen, useRevenueBySite, useRevenueHistory } from '@/hooks/use-revenue';
import { useOrgPermissions } from '@/hooks/use-org-permissions';
import { formatCurrency } from '@/lib/utils';

function exportCSV(data: Array<Record<string, unknown>>, filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => String(row[h] ?? '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RevenuePage() {
  const [period, setPeriod] = useState('2026-03');
  const permissions = useOrgPermissions();
  const { data: summary, isLoading: loadingSummary } = useRevenueSummary(period);
  const { data: byScreen } = useRevenueByScreen(period);
  const { data: bySite } = useRevenueBySite(period);
  const { data: history } = useRevenueHistory();

  if (loadingSummary) return <LoadingState />;

  const chartData = [...(history ?? [])].reverse().map((h) => ({
    month: h.month,
    'Revenu total': h.revenueCents / 100,
    'Votre part': h.retrocessionCents / 100,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Revenus" description="Suivez vos revenus et rétrocessions">
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026-03">Mars 2026</SelectItem>
              <SelectItem value="2026-02">Février 2026</SelectItem>
              <SelectItem value="2026-01">Janvier 2026</SelectItem>
              <SelectItem value="2025-12">Décembre 2025</SelectItem>
              <SelectItem value="2025-11">Novembre 2025</SelectItem>
            </SelectContent>
          </Select>
          {permissions.canExportRevenue && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                if (byScreen) {
                  exportCSV(
                    byScreen.map((s) => ({
                      Écran: s.screenName,
                      Site: s.siteName,
                      'Revenu (EUR)': (s.revenueCents / 100).toFixed(2),
                      'Rétrocession (EUR)': (s.retrocessionCents / 100).toFixed(2),
                      Bookings: s.bookingCount,
                    })),
                    `revenus-${period}`,
                  );
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Exporter CSV
            </Button>
          )}
        </div>
      </PageHeader>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Revenu total"
            value={formatCurrency(summary.totalRevenueCents)}
            icon={TrendingUp}
            trend={{ value: '+18%', positive: true }}
            variant="primary"
          />
          <StatCard
            label="Votre part (rétrocession)"
            value={formatCurrency(summary.confirmedPayoutsCents)}
            icon={Wallet}
          />
          <StatCard
            label="Taux de rétrocession"
            value={`${(summary.retrocessionRate * 100).toFixed(0)}%`}
            icon={Percent}
            variant="success"
          />
          <StatCard
            label="Écrans actifs"
            value={String(summary.activeScreens)}
            icon={Monitor}
          />
        </div>
      )}

      <Card className="rounded-2xl card-elevated">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Évolution des revenus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}€`} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(2)} €`]}
                  contentStyle={{ borderRadius: '12px', fontSize: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Legend />
                <Bar dataKey="Revenu total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Votre part" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="by-screen">
        <TabsList>
          <TabsTrigger value="by-screen">Par écran</TabsTrigger>
          <TabsTrigger value="by-site">Par site</TabsTrigger>
          <TabsTrigger value="transparency">Transparence calcul</TabsTrigger>
        </TabsList>

        <TabsContent value="by-screen" className="mt-4">
          <Card className="rounded-2xl card-elevated overflow-hidden">
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Écran</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-right">Revenu</TableHead>
                    <TableHead className="text-right">Votre part</TableHead>
                    <TableHead className="text-center">Bookings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byScreen?.map((row) => (
                    <TableRow key={row.screenId}>
                      <TableCell className="font-medium">{row.screenName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.siteName}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.revenueCents)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.retrocessionCents)}</TableCell>
                      <TableCell className="text-center">{row.bookingCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="by-site" className="mt-4">
          <Card className="rounded-2xl card-elevated overflow-hidden">
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-center">Écrans</TableHead>
                    <TableHead className="text-right">Revenu</TableHead>
                    <TableHead className="text-right">Votre part</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bySite?.map((row) => (
                    <TableRow key={row.siteId}>
                      <TableCell className="font-medium">{row.siteName}</TableCell>
                      <TableCell className="text-center">{row.screenCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.revenueCents)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.retrocessionCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="transparency" className="mt-4">
          <Card className="rounded-2xl card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Détail du calcul de rétrocession</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="space-y-3">
                <div className="flex justify-between py-2 border-b">
                  <dt>Revenu total (Σ campagnes)</dt>
                  <dd className="font-medium">{summary ? formatCurrency(summary.totalRevenueCents) : '—'}</dd>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <dt>Taux de rétrocession appliqué</dt>
                  <dd className="font-medium">{summary ? `${(summary.retrocessionRate * 100).toFixed(0)}%` : '—'}</dd>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <dt>Part plateforme ({summary ? `${((1 - summary.retrocessionRate) * 100).toFixed(0)}%` : '—'})</dt>
                  <dd>{summary ? formatCurrency(summary.totalRevenueCents - summary.confirmedPayoutsCents) : '—'}</dd>
                </div>
                <div className="flex justify-between py-2 text-primary font-semibold">
                  <dt>Votre part ({summary ? `${(summary.retrocessionRate * 100).toFixed(0)}%` : '—'})</dt>
                  <dd>{summary ? formatCurrency(summary.confirmedPayoutsCents) : '—'}</dd>
                </div>
              </dl>

              {/* Per-screen calculation detail */}
              {byScreen && byScreen.length > 0 && summary && (
                <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Détail par écran (revenu × taux rétrocession)</p>
                  {byScreen.map((row: any) => {
                    const retro = Math.round(row.revenueCents * summary.retrocessionRate);
                    return (
                      <div key={row.screenId} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                        <span className="font-medium">{row.screenName}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(row.revenueCents)} × {(summary.retrocessionRate * 100).toFixed(0)}%
                          {' = '}
                          <span className="text-foreground font-medium">{formatCurrency(retro)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Formule par campagne : (nb_écrans_partenaire ÷ nb_écrans_total_campagne) × budget_campagne.
                Le revenu total est la somme sur toutes les campagnes actives ciblant vos écrans.
                Votre part = revenu total × taux de rétrocession ({summary ? `${(summary.retrocessionRate * 100).toFixed(0)}%` : '—'}).
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
