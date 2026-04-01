'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye, Monitor, Activity, Clock } from 'lucide-react';
import { Button, Card, CardContent } from '@neofilm/ui';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { LoadingPage } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { OnlineStatusDot } from '@/components/common/status-badge';
import {
  useCampaignAnalyticsSummary,
  useCampaignTimeseries,
  useCampaignByTrigger,
  useCampaignByScreen,
} from '@/lib/api/hooks/use-analytics';
import { formatNumber } from '@/lib/utils';

export default function CampaignAnalyticsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  const { data: summary, isLoading: sl } = useCampaignAnalyticsSummary(campaignId);
  const { data: timeseries, isLoading: tl } = useCampaignTimeseries(campaignId);
  const { data: byTrigger } = useCampaignByTrigger(campaignId);
  const { data: byScreen } = useCampaignByScreen(campaignId);

  if (sl || tl) return <LoadingPage />;
  if (!summary) return <ErrorState />;

  return (
    <>
      <PageHeader
        title="Analytiques de campagne"
        actions={
          <Link href={`/campaigns/${campaignId}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour à la campagne
            </Button>
          </Link>
        }
      />

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Diffusions', value: formatNumber(summary.totalImpressions), icon: Eye },
          { label: 'Campagnes actives', value: String(summary.activeCampaigns), icon: Activity },
          { label: 'Écrans en ligne', value: `${summary.screensOnline}/${summary.screensTotal}`, icon: Monitor },
          { label: 'Santé', value: `${summary.deliveryHealth}%`, icon: Clock },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <p className="text-2xl font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Timeline chart */}
      {timeseries && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="mb-4 font-semibold">Diffusions par jour</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="impressions" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* By trigger */}
        {byTrigger && (
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-4 font-semibold">Par déclencheur</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byTrigger} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="trigger" tick={{ fontSize: 10 }} width={100} tickFormatter={(v) => v.replace('_', ' ')} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* By screen */}
        {byScreen && (
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-4 font-semibold">Par écran (Top 10)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Écran</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Diffusions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byScreen.map((screen) => (
                    <TableRow key={screen.screenId}>
                      <TableCell className="text-sm font-medium">{screen.screenName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{screen.city}</TableCell>
                      <TableCell><OnlineStatusDot isOnline={screen.isOnline} /></TableCell>
                      <TableCell className="text-right font-medium">{formatNumber(screen.impressions)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
