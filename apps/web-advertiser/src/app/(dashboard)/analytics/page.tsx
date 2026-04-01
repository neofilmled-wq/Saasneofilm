'use client';

import { Eye, Activity, Film, PlayCircle } from 'lucide-react';
import { Card, CardContent, Badge } from '@neofilm/ui';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PageHeader } from '@/components/common/page-header';
import { LoadingPage } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useAdvertiserAnalytics } from '@/lib/api/hooks/use-analytics';
import { formatNumber } from '@/lib/utils';

export default function AnalyticsPage() {
  const { data, isLoading, isError, refetch } = useAdvertiserAnalytics();

  if (isLoading) return <LoadingPage />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <>
      <PageHeader title="Analytiques" description="Nombre de vues de vos vidéos sur les écrans TV" />

      {/* KPI cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard label="Total vues" value={formatNumber(data.totalViews)} icon={Eye} />
        <KPICard label="Campagnes actives" value={String(data.activeCampaigns)} icon={Activity} />
        <KPICard label="Total campagnes" value={String(data.totalCampaigns)} icon={Film} />
        <KPICard
          label="Vidéos diffusées"
          value={String(data.viewsByCreative.length)}
          icon={PlayCircle}
        />
      </div>

      {/* Always show charts and sections */}
      <>
          {/* Timeline chart */}
          {data.viewsTimeline.length > 0 && (
            <Card className="mb-6">
              <CardContent className="p-4">
                <h3 className="mb-4 font-semibold">Vues sur les 30 derniers jours</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.viewsTimeline}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        labelFormatter={(label) => {
                          const d = new Date(label);
                          return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d);
                        }}
                        formatter={(value: number) => [formatNumber(value), 'Vues']}
                      />
                      <Line type="monotone" dataKey="views" stroke="#7c3aed" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            {/* Views by creative (video) */}
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-4 font-semibold">Vues par vidéo</h3>
                {data.viewsByCreative.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Aucune vidéo diffusée pour le moment</p>
                ) : (
                  <div className="space-y-4">
                    {data.viewsByCreative.map((creative) => (
                      <div key={creative.creativeId} className="flex items-center gap-3">
                        <div className="h-12 w-16 shrink-0 overflow-hidden rounded bg-muted">
                          {creative.fileUrl ? (
                            <video src={creative.fileUrl} muted preload="metadata" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Film className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{creative.creativeName}</p>
                          <p className="text-xs text-muted-foreground">{creative.campaignName}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">{formatNumber(creative.totalViews)} <span className="font-normal text-muted-foreground">vues</span></p>
                          <p className="text-xs text-muted-foreground">
                            {creative.screensCount} écran{creative.screensCount > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top 5 screens */}
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-4 font-semibold">Top 5 écrans par vues</h3>

                {data.topScreens.length > 0 ? (
                  <div className="space-y-3">
                    {data.topScreens.map((screen, i) => (
                      <div key={screen.screenId} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{screen.screenName}</p>
                          <p className="text-xs text-muted-foreground">{screen.city}</p>
                        </div>
                        <Badge variant="secondary" className="text-xs font-bold">
                          {formatNumber(screen.totalViews)} vues
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Aucun écran disponible</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>

    </>
  );
}

function KPICard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
