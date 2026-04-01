'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Eye, DollarSign, Activity, Trophy } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { adminApi, type AnalyticsData } from '@/lib/admin-api';
import { formatCurrency, formatNumber } from '@/lib/utils';

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export default function AnalyticsPage() {
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [partnerOrgId, setPartnerOrgId] = useState<string>('');
  const [advertiserOrgId, setAdvertiserOrgId] = useState<string>('');

  // Fetch analytics data
  const analyticsQuery = useQuery({
    queryKey: ['analytics', startDate, endDate, partnerOrgId, advertiserOrgId],
    queryFn: () =>
      adminApi.getAnalytics({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        partnerOrgId: partnerOrgId || undefined,
        advertiserOrgId: advertiserOrgId || undefined,
      }),
  });

  // Fetch partners and advertisers for filters
  const partnersQuery = useQuery({
    queryKey: ['filter-partners'],
    queryFn: () => adminApi.getPartners(),
  });

  const advertisersQuery = useQuery({
    queryKey: ['filter-advertisers'],
    queryFn: () => adminApi.getAdvertisers(),
  });

  const partners = partnersQuery.data?.data?.data ?? [];
  const advertisers = advertisersQuery.data?.data?.data ?? [];
  const analytics: AnalyticsData | null = analyticsQuery.data?.data ?? null;

  const isLoading = analyticsQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytiques"
        description="Statistiques globales de la plateforme"
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="start-date" className="text-xs">Date de début</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-date" className="text-xs">Date de fin</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Partenaire</Label>
              <Select
                value={partnerOrgId || 'all'}
                onValueChange={(v) => setPartnerOrgId(v === 'all' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tous les partenaires" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les partenaires</SelectItem>
                  {partners.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Annonceur</Label>
              <Select
                value={advertiserOrgId || 'all'}
                onValueChange={(v) => setAdvertiserOrgId(v === 'all' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tous les annonceurs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les annonceurs</SelectItem>
                  {advertisers.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-5 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Événements totaux"
            value={formatNumber(analytics?.totalEvents ?? 0)}
            icon={Activity}
          />
          <StatCard
            title="Impressions"
            value={formatNumber(analytics?.impressions ?? 0)}
            icon={Eye}
          />
          <StatCard
            title="Revenu total"
            value={formatCurrency(analytics?.totalRevenueCents ?? 0)}
            icon={DollarSign}
          />
          <StatCard
            title="Top campagnes"
            value={String(analytics?.topCampaigns?.length ?? 0)}
            icon={Trophy}
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Events Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Événements par jour
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : !analytics?.dailyEvents || analytics.dailyEvents.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-2" />
                  <p className="text-sm">Aucune donnée pour cette période</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.dailyEvents}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: string) => {
                      const d = new Date(value);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={((label: string) => {
                      const d = new Date(label);
                      return d.toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      });
                    }) as any}
                    formatter={((value: number) => [formatNumber(value), 'Événements']) as any}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Top campagnes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : !analytics?.topCampaigns || analytics.topCampaigns.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Trophy className="mx-auto h-12 w-12 text-muted-foreground/50 mb-2" />
                  <p className="text-sm">Aucune campagne pour cette période</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {analytics.topCampaigns.map((campaign) => {
                  const progress =
                    campaign.budgetCents > 0
                      ? Math.min(100, (campaign.spentCents / campaign.budgetCents) * 100)
                      : 0;
                  return (
                    <div key={campaign.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{campaign.name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {campaign.advertiserOrg?.name}
                          </span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {formatCurrency(campaign.spentCents)} / {formatCurrency(campaign.budgetCents)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
