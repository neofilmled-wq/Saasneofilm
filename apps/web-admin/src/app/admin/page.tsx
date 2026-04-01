'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, Film, Wifi, Euro, ArrowUpRight,
  ArrowDownRight, DollarSign, Package, Tv,
} from 'lucide-react';
import { Skeleton } from '@neofilm/ui';
import { adminApi } from '@/lib/admin-api';
import type { RevenueForecast, PackSalesBreakdown, NetProfitSummary, Screen } from '@/lib/admin-api';
import { useAdminSocket } from '@/hooks/use-admin-socket';

// Lazy-load map (needs window/document)
const DashboardMap = dynamic(() => import('@/components/map/dashboard-map'), { ssr: false });

// ─── Helpers ──────────────────────────────────────────────

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtEur(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtEurPrecise(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}


// ─── Period toggle ────────────────────────────────────────

const FORECAST_VIEWS = [
  { value: 'daily', label: 'Jour' },
  { value: 'monthly', label: 'Mois' },
  { value: 'quarterly', label: 'Trim.' },
  { value: 'semiAnnual', label: 'Sem.' },
  { value: 'annual', label: 'Annuel' },
] as const;
type ForecastView = typeof FORECAST_VIEWS[number]['value'];

// ─── Main Page ────────────────────────────────────────────

export default function DashboardPage() {
  const [forecastView, setForecastView] = useState<ForecastView>('monthly');
  const { connected, dashboardSummary: liveSummary, screenStatuses } = useAdminSocket();

  // Core data
  const { data: summaryRaw, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard', 'summary'],
    queryFn: () => adminApi.getAdminDashboardSummary(),
    refetchInterval: connected ? false : 15_000,
    retry: 2,
  });

  // Screens for map
  const { data: screensRaw } = useQuery({
    queryKey: ['admin', 'screens', 'map'],
    queryFn: () => adminApi.getScreensForMap(),
    staleTime: 60_000,
  });

  // Revenue forecast
  const { data: forecastRaw, isLoading: forecastLoading } = useQuery({
    queryKey: ['admin', 'dashboard', 'revenue-forecast'],
    queryFn: () => adminApi.getRevenueForecast(),
    staleTime: 120_000,
  });

  // Pack sales breakdown
  const { data: packsRaw, isLoading: packsLoading } = useQuery({
    queryKey: ['admin', 'dashboard', 'pack-sales'],
    queryFn: () => adminApi.getPackSalesBreakdown(),
    staleTime: 120_000,
  });

  // Net profit
  const { data: profitRaw, isLoading: profitLoading } = useQuery({
    queryKey: ['admin', 'dashboard', 'net-profit'],
    queryFn: () => adminApi.getNetProfitSummary(),
    staleTime: 120_000,
  });

  // Finance KPIs
  const { data: financeRaw } = useQuery({
    queryKey: ['admin', 'dashboard', 'finance', 'month'],
    queryFn: () => adminApi.getFinanceKPIs('month'),
    staleTime: 60_000,
  });

  // Network KPIs
  const { data: networkRaw } = useQuery({
    queryKey: ['admin', 'dashboard', 'network', 'month'],
    queryFn: () => adminApi.getNetworkKPIs('month'),
    staleTime: 30_000,
  });

  // Unwrap data
  const summary = liveSummary ?? (summaryRaw as any)?.data;
  const screens: Screen[] = (screensRaw as any)?.data?.data ?? (screensRaw as any)?.data ?? [];
  const forecast: RevenueForecast | null = (forecastRaw as any)?.data ?? null;
  const packs: PackSalesBreakdown | null = (packsRaw as any)?.data ?? null;
  const profit: NetProfitSummary | null = (profitRaw as any)?.data ?? null;
  const finance = (financeRaw as any)?.data ?? {};
  const network = (networkRaw as any)?.data ?? {};

  // Derived KPIs
  const videosToModerate = safeNum(summary?.urgent?.videosToModerate ?? summary?.videos?.pendingReview ?? 0);
  const activeCampaigns = safeNum(network.activeCampaigns ?? summary?.system?.activeCampaigns ?? 0);
  const screensConnected = safeNum(network.screensConnected ?? 0);
  const screensTotal = safeNum(network.screensTotal ?? 0);
  const grossRevenue = safeNum(finance.grossRevenueCents ?? 0);

  // Forecast selected value
  const forecastAmount = forecast ? safeNum((forecast as any)[forecastView] ?? 0) : 0;

  // Live statuses map for the map component
  const liveStatusMap = useMemo(() => {
    const map: Record<string, any> = {};
    (screenStatuses ?? []).forEach((s: any) => { map[s.screenId] = s; });
    return map;
  }, [screenStatuses]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tableau de bord</h1>
            <p className="text-muted-foreground text-sm mt-1">Vue d'ensemble de la plateforme</p>
          </div>
        </div>
        <Skeleton className="h-[350px] rounded-xl bg-card" />
        <div className="grid gap-4 grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl bg-card" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Tableau de bord</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Vue d'ensemble de la plateforme NeoFilm</p>
        </div>
        <div className="flex items-center gap-3">
          {connected ? (
            <span className="status-pill status-pill-active">Live</span>
          ) : (
            <span className="status-pill status-pill-orange">Polling</span>
          )}
        </div>
      </div>

      {/* ═══ MAP + KEY STATS (split layout) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Map */}
        <div className="chirp-card !p-0 overflow-hidden" style={{ minHeight: 350 }}>
          <DashboardMap screens={screens} liveStatuses={liveStatusMap} />
        </div>

        {/* Key stats column */}
        <div className="flex flex-col gap-3">
          {/* CA Total abonnements */}
          <div className="chirp-card flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(152_60%_40%/0.12)]">
                <Euro className="h-4.5 w-4.5 text-[hsl(152_60%_55%)]" />
              </div>
              <span className="chirp-kpi-label">CA Total abonnements</span>
            </div>
            <div className="chirp-kpi-value text-[28px]">{fmtEur(grossRevenue)}</div>
            {finance.revenueDeltaPct !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-semibold ${finance.revenueDeltaPct >= 0 ? 'text-[hsl(152_60%_50%)]' : 'text-[hsl(0_72%_60%)]'}`}>
                {finance.revenueDeltaPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(finance.revenueDeltaPct)}% vs période préc.
              </div>
            )}
          </div>

          {/* Campagnes en diffusion */}
          <Link href="/admin/campaigns">
            <div className="chirp-card flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Tv className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <span className="chirp-kpi-label">Campagnes en diffusion</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-[hsl(0_0%_42%)]" />
              </div>
              <div className="chirp-kpi-value text-[28px] mt-2">{activeCampaigns}</div>
            </div>
          </Link>

          {/* Vidéos à modérer */}
          <Link href="/admin/moderation/videos">
            <div className={`chirp-card flex-1 ${videosToModerate > 0 ? 'border border-[hsl(0_72%_51%/0.2)]' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${videosToModerate > 0 ? 'bg-[hsl(0_72%_51%/0.12)]' : 'bg-[hsl(240_4%_14%)]'}`}>
                    <Film className={`h-4.5 w-4.5 ${videosToModerate > 0 ? 'text-[hsl(0_72%_65%)]' : 'text-muted-foreground'}`} />
                  </div>
                  <span className="chirp-kpi-label">Vidéos à modérer</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-[hsl(0_0%_42%)]" />
              </div>
              <div className={`chirp-kpi-value text-[28px] mt-2 ${videosToModerate > 0 ? 'text-[hsl(0_72%_65%)]' : ''}`}>
                {videosToModerate}
              </div>
            </div>
          </Link>

          {/* Écrans connectés */}
          <Link href="/admin/devices">
            <div className="chirp-card flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(152_60%_40%/0.12)]">
                    <Wifi className="h-4.5 w-4.5 text-[hsl(152_60%_55%)]" />
                  </div>
                  <span className="chirp-kpi-label">Écrans connectés</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-[hsl(0_0%_42%)]" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="chirp-kpi-value text-[28px]">{screensConnected}</span>
                <span className="text-sm text-muted-foreground">/ {screensTotal}</span>
              </div>
              {/* Mini progress bar */}
              {screensTotal > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-[hsl(240_4%_14%)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[hsl(152_60%_45%)]"
                    style={{ width: `${Math.min(100, (screensConnected / screensTotal) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </Link>
        </div>
      </div>

      {/* ═══ PRÉVISION CA ═══ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="chirp-section-title !pb-0">
            <TrendingUp className="h-3.5 w-3.5" />
            Prévision CA
          </div>
          <div className="chirp-toggle-group">
            {FORECAST_VIEWS.map((v) => (
              <button
                key={v.value}
                onClick={() => setForecastView(v.value)}
                className={`chirp-toggle ${forecastView === v.value ? 'chirp-toggle-active' : ''}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {forecastLoading ? (
          <Skeleton className="h-[220px] rounded-xl bg-card" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            {/* Chart area */}
            <div className="chirp-card">
              <div className="flex items-baseline gap-3 mb-4">
                <span className="chirp-kpi-value text-[36px]">{fmtEurPrecise(forecastAmount)}</span>
                <span className="text-sm text-muted-foreground">
                  / {FORECAST_VIEWS.find(v => v.value === forecastView)?.label.toLowerCase()}
                </span>
              </div>
              {/* Monthly trend bars */}
              {forecast?.monthlyTrend && forecast.monthlyTrend.length > 0 ? (
                <div className="flex items-end gap-1.5 h-[120px]">
                  {forecast.monthlyTrend.map((m, i) => {
                    const max = Math.max(...forecast.monthlyTrend.map(t => t.amount), 1);
                    const height = Math.max(4, (m.amount / max) * 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t-md bg-primary/80 hover:bg-primary transition-colors cursor-default"
                          style={{ height: `${height}%` }}
                          title={`${m.month}: ${fmtEurPrecise(m.amount)}`}
                        />
                        <span className="text-[9px] text-muted-foreground truncate">{m.month.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[120px] text-sm text-muted-foreground">
                  Données de prévision en cours de calcul...
                </div>
              )}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[hsl(240_4%_14%)]">
                <div>
                  <span className="text-xs text-muted-foreground">Abonnements actifs</span>
                  <p className="text-lg font-bold text-foreground">{forecast?.activeSubscriptions ?? 0}</p>
                </div>
                <div className="w-px h-8 bg-[hsl(240_4%_16%)]" />
                <div>
                  <span className="text-xs text-muted-foreground">Nouveaux ce mois</span>
                  <p className="text-lg font-bold text-[hsl(152_60%_55%)]">+{forecast?.newSubscriptionsThisMonth ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Period breakdown */}
            <div className="space-y-3">
              {[
                { label: 'Journalier', value: forecast?.daily ?? 0, key: 'daily' },
                { label: 'Mensuel', value: forecast?.monthly ?? 0, key: 'monthly' },
                { label: 'Trimestriel', value: forecast?.quarterly ?? 0, key: 'quarterly' },
                { label: 'Semestriel', value: forecast?.semiAnnual ?? 0, key: 'semiAnnual' },
                { label: 'Annuel', value: forecast?.annual ?? 0, key: 'annual' },
              ].map((item) => (
                <div
                  key={item.key}
                  onClick={() => setForecastView(item.key as ForecastView)}
                  className={`chirp-card cursor-pointer !py-3 ${forecastView === item.key ? 'border border-primary/30' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className={`text-base font-bold ${forecastView === item.key ? 'text-primary' : 'text-foreground'}`}>
                      {fmtEur(item.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ BOTTOM ROW: PACKS + BÉNÉFICES ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top packs vendus */}
        <div>
          <div className="chirp-section-title">
            <Package className="h-3.5 w-3.5" />
            Meilleures ventes
          </div>
          {packsLoading ? (
            <Skeleton className="h-[280px] rounded-xl bg-card" />
          ) : (
            <div className="chirp-card">
              {packs && packs.packs.length > 0 ? (
                <div className="space-y-4">
                  {packs.packs.slice(0, 6).map((pack, i) => {
                    const scopeLabel = pack.productScope === 'BOTH' ? 'Diffusion + Catalogue' : pack.productScope === 'DIFFUSION' ? 'Diffusion TV' : 'Fiche Catalogue';
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-foreground">{pack.label}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(240_4%_14%)] text-muted-foreground">
                              {scopeLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{pack.count} ventes</span>
                            <span className="text-sm font-bold text-foreground">{pack.percentage}%</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-[hsl(240_4%_12%)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${pack.percentage}%`,
                              background: i === 0
                                ? 'linear-gradient(90deg, hsl(24 95% 45%), hsl(24 95% 55%))'
                                : i === 1
                                  ? 'hsl(24 95% 53% / 0.7)'
                                  : 'hsl(24 95% 53% / 0.4)',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t border-[hsl(240_4%_14%)] flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total bookings</span>
                    <span className="text-sm font-bold text-foreground">{packs.totalBookings}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  Aucune donnée de vente disponible
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bénéfices après rétrocession */}
        <div>
          <div className="chirp-section-title">
            <DollarSign className="h-3.5 w-3.5" />
            Bénéfices nets (après rétrocessions)
          </div>
          {profitLoading ? (
            <Skeleton className="h-[280px] rounded-xl bg-card" />
          ) : (
            <div className="chirp-card">
              {profit ? (
                <div className="space-y-5">
                  {[
                    { label: 'Ce mois', data: profit.monthly, color: 'hsl(24 95% 53%)' },
                    { label: 'Ce trimestre', data: profit.quarterly, color: 'hsl(152 60% 50%)' },
                    { label: 'Cette année', data: profit.annual, color: 'hsl(220 60% 60%)' },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className="text-[10px] text-muted-foreground">{item.data.period}</span>
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-xl font-bold text-foreground">{fmtEur(item.data.net)}</span>
                        <span className="text-xs text-muted-foreground">net</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-muted-foreground">
                          Brut: <span className="text-foreground font-medium">{fmtEur(item.data.gross)}</span>
                        </span>
                        <span className="text-[hsl(0_72%_60%)]">
                          − Rétro: {fmtEur(item.data.retrocessions)}
                        </span>
                      </div>
                      {/* Profit bar */}
                      <div className="mt-2 h-2 rounded-full bg-[hsl(240_4%_12%)] overflow-hidden">
                        <div className="h-full flex">
                          <div
                            className="h-full rounded-l-full"
                            style={{
                              width: item.data.gross > 0 ? `${(item.data.net / item.data.gross) * 100}%` : '0%',
                              backgroundColor: item.color,
                            }}
                          />
                          <div
                            className="h-full"
                            style={{
                              width: item.data.gross > 0 ? `${(item.data.retrocessions / item.data.gross) * 100}%` : '0%',
                              backgroundColor: 'hsl(0 0% 20%)',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="pt-3 border-t border-[hsl(240_4%_14%)] flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Taux rétrocession moyen</span>
                    <span className="text-sm font-bold text-primary">{profit.retrocessionRate}%</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  Données de bénéfices en cours de calcul...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
