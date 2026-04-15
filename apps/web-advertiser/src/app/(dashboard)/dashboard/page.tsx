'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Megaphone,
  ArrowUpRight,
  MousePointerClick,
  Plus,
  Play,
  Clock,
  ChevronRight,
  Radio,
  Film,
  ImageIcon,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neofilm/ui';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { useAdvertiserAnalytics } from '@/lib/api/hooks/use-analytics';

// Lazy-load the map (leaflet is browser-only)
const DashboardScreenMap = dynamic(
  () => import('@/components/map/dashboard-screen-map').then((m) => m.DashboardScreenMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[300px] items-center justify-center rounded-xl bg-muted/30 text-sm text-muted-foreground">
        Chargement de la carte…
      </div>
    ),
  },
);

/* ══════════════════════════════ HELPERS ══════════════════════════════ */

function fmtNum(v: number) {
  if (v >= 1_000) return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  return v.toLocaleString('fr-FR');
}

const STATUS_LABEL: Record<string, string> = {
  ALL: 'Tous les statuts',
  DRAFT: 'Brouillon',
  PENDING_REVIEW: 'En revue',
  APPROVED: 'Approuvée',
  ACTIVE: 'Active',
  PAUSED: 'En pause',
  FINISHED: 'Terminée',
  REJECTED: 'Refusée',
  CANCELLED: 'Annulée',
};

function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}

/* ══════════════════════════ VISUAL COMPONENTS ══════════════════════════ */

/* ── Sparkline with gradient fill + end dot ── */
function Sparkline({
  data,
  width = 120,
  height = 40,
  color = 'hsl(12,60%,52%)',
  showDot = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDot?: boolean;
}) {
  const id = useMemo(() => `sp-${Math.random().toString(36).slice(2, 8)}`, []);
  if (data.length < 2) return null;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const rng = mx - mn || 1;

  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - mn) / rng) * (height - 6) - 3,
  }));
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline points={area} fill={`url(#${id})`} />
      <polyline points={line} className="sparkline-path" stroke={color} />
      {showDot && (
        <>
          <circle cx={last.x} cy={last.y} r={4} fill={color} />
          <circle cx={last.x} cy={last.y} r={7} fill={color} opacity={0.2} />
        </>
      )}
    </svg>
  );
}

/* ── Trend badge ── */
function Trend({ value, positive }: { value: string; positive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
      {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3 rotate-180" />}
      {value}
    </span>
  );
}

/* ── Campaign thumbnail ──
 * Priority: video creative thumbnail → catalogue listing image → fallback icon
 */
function CampaignThumbnail({ campaign }: { campaign: any }) {
  const creative = campaign.creatives?.[0];
  const catalogueImage: string | undefined = campaign.catalogueListings?.[0]?.imageUrl;
  const fileUrl: string | undefined = creative?.fileUrl;
  const isVideo = creative?.type === 'VIDEO' && fileUrl;
  const isImage = creative?.type === 'IMAGE' && fileUrl;

  if (isVideo) {
    return (
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
        <video src={fileUrl} muted className="h-full w-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Film className="h-4 w-4 text-white" />
        </div>
      </div>
    );
  }
  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fileUrl}
        alt={campaign.name}
        className="h-12 w-12 shrink-0 rounded-xl object-cover"
      />
    );
  }
  if (catalogueImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={catalogueImage}
        alt={campaign.name}
        className="h-12 w-12 shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
      <ImageIcon className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

/* ════════════════════════════════ DASHBOARD ════════════════════════════════ */

type Period = 'week' | 'month' | 'year';

export default function AdvertiserDashboard() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['advertiser-campaigns', user?.orgId],
    queryFn: () => apiFetch(`/campaigns?${user?.orgId ? `advertiserOrgId=${user.orgId}&` : ''}limit=100`),
    enabled: !!user,
  });

  // Real analytics from backend (total views, timeline, etc.)
  const { data: analytics } = useAdvertiserAnalytics();

  const campaigns: any[] = Array.isArray(data?.data) ? data.data : [];
  const active = campaigns.filter((c: any) => c.status === 'ACTIVE');

  // ── Filtre par statut (liste unique de statuts présents dans les campagnes de l'user) ──
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const availableStatuses = useMemo(() => {
    const s = new Set<string>();
    campaigns.forEach((c: any) => c.status && s.add(c.status));
    return Array.from(s).sort();
  }, [campaigns]);
  const filteredCampaigns = useMemo(
    () =>
      statusFilter === 'ALL'
        ? campaigns
        : campaigns.filter((c: any) => c.status === statusFilter),
    [campaigns, statusFilter],
  );

  // Nombre de clics sur le catalogue — pas encore de tracking côté API, on affiche 0
  const clicks = 0;
  const clickTrend: number[] = [];

  // ── Diffusions / Vues avec toggle période ──
  // Source: /analytics/advertiser (même endpoint que la page Analytiques)
  // - Timeline = 30 derniers jours, chaque point = { date, views }
  // - totalViews = cumul depuis le début
  const [period, setPeriod] = useState<Period>('month');
  const timeline = analytics?.viewsTimeline ?? [];
  const sumLastN = (n: number) =>
    timeline.slice(-n).reduce((acc, pt) => acc + (pt.views || 0), 0);
  const totalViews = analytics?.totalViews ?? 0;
  const periodViews: Record<Period, { value: number; label: string }> = {
    week: { value: sumLastN(7), label: 'cette semaine' },
    month: { value: sumLastN(30), label: 'ce mois' },
    year: { value: totalViews, label: 'cette année' },
  };
  const currentPeriodViews = periodViews[period];

  // Map screens: ONLY screens targeted by ACTIVE campaigns of this advertiser
  // (PENDING_REVIEW, APPROVED, PAUSED, etc. sont volontairement exclus)
  const mapScreens = useMemo(() => {
    const seen = new Map<string, any>();
    active.forEach((c: any) => {
      (c.targeting?.includedScreens ?? []).forEach((s: any) => {
        if (s?.id && !seen.has(s.id)) seen.set(s.id, s);
      });
    });
    return Array.from(seen.values());
  }, [active]);
  const targetedCount = mapScreens.length;

  if (isLoading) {
    return (
      <div className="space-y-4 pt-1">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1">

      {/* ═══════════════════ ROW 1 — KPIs ═══════════════════ */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* ── NOMBRE DE CLICS SUR LE CATALOGUE ── */}
        <Card className="card-elevated card-lift rounded-2xl border-0">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <MousePointerClick className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-[11px] font-medium text-muted-foreground">Nombre de clics sur le catalogue</p>
              <p className="mt-0.5 text-[30px] font-extrabold leading-none tracking-tight">{fmtNum(clicks)}</p>
            </div>
          </CardContent>
        </Card>

        {/* ── DIFFUSIONS / VUES avec toggle période ── */}
        <Card className="card-elevated card-lift rounded-2xl border-0">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                <Radio className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPeriod('week')}
                  className={period === 'week' ? 'period-pill period-pill-active' : 'period-pill period-pill-inactive'}
                >
                  Sem.
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('month')}
                  className={period === 'month' ? 'period-pill period-pill-active' : 'period-pill period-pill-inactive'}
                >
                  Mois
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('year')}
                  className={period === 'year' ? 'period-pill period-pill-active' : 'period-pill period-pill-inactive'}
                >
                  Année
                </button>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-medium text-muted-foreground">Diffusions {currentPeriodViews.label}</p>
              <p className="text-[28px] font-extrabold leading-none tracking-tight">{fmtNum(currentPeriodViews.value)}</p>
            </div>
            <div className="mt-3 border-t border-border/40 pt-2">
              <p className="text-[11px] font-medium text-muted-foreground">Vues totales (cumul)</p>
              <p className="text-[20px] font-extrabold leading-none tracking-tight">{fmtNum(totalViews)}</p>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ═══════════════════ ROW 2 — Campagnes + Réseau map ═══════════════════ */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* ── CAMPAIGNS LIST avec miniatures + filtre statut ── */}
        <Card className="card-elevated rounded-2xl border-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-1">
            <CardTitle className="text-[15px] font-bold">
              Campagnes <span className="text-muted-foreground font-medium">({filteredCampaigns.length})</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="Filtrer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{STATUS_LABEL.ALL}</SelectItem>
                  {availableStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Link href="/campaigns" className="text-muted-foreground transition-colors hover:text-primary">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            {campaigns.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8">
                  <Megaphone className="h-7 w-7 text-primary" />
                </div>
                <p className="text-[13px] font-medium text-muted-foreground">Aucune campagne</p>
                <Link href="/campaigns/new" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[12px] font-bold text-primary-foreground transition-all hover:scale-[1.02]">
                  <Plus className="h-3.5 w-3.5" />
                  Créer votre première
                </Link>
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <p className="text-[12px] text-muted-foreground">Aucune campagne avec ce statut</p>
              </div>
            ) : (
              <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                {filteredCampaigns.map((c: any, i: number) => {
                  const isActive = c.status === 'ACTIVE';
                  return (
                    <Link
                      key={c.id || i}
                      href={`/campaigns/${c.id}`}
                      className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-all hover:bg-accent"
                    >
                      {/* Thumbnail */}
                      <CampaignThumbnail campaign={c} />

                      {/* Title + status */}
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-[13px] font-semibold transition-colors group-hover:text-primary">
                          {c.name || `Campagne ${i + 1}`}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          <span className="text-[10px] text-muted-foreground">{statusLabel(c.status)}</span>
                        </div>
                      </div>

                      {/* Status badge */}
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isActive ? 'bg-emerald-50' : 'bg-muted'}`}>
                        {isActive ? <Play className="h-3.5 w-3.5 text-emerald-500" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── RÉSEAU & DIFFUSIONS — écrans des campagnes ACTIVE uniquement ── */}
        <Card className="card-elevated rounded-2xl border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-bold">Réseau de diffusion</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              {targetedCount > 0
                ? `${targetedCount} écran${targetedCount > 1 ? 's' : ''} diffusant actuellement vos pubs`
                : 'Aucun écran en diffusion active'}
            </p>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-[300px] overflow-hidden rounded-xl">
              <DashboardScreenMap
                screens={mapScreens}
                highlightedIds={new Set(mapScreens.map((s: any) => s.id))}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════ Créateur IA — COMMENTÉ ═══════════════════ */}
      {/*
      <Card className="card-elevated card-lift rounded-2xl border-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-primary/[0.04] to-primary/[0.08]" />
        <CardContent className="relative p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <h3 className="mt-3 text-[15px] font-bold">Créateur IA</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Générez vos visuels publicitaires avec l'intelligence artificielle en quelques secondes.
          </p>
          <Link
            href="/ad-creation"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
          >
            Essayer maintenant
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>
      */}
    </div>
  );
}
