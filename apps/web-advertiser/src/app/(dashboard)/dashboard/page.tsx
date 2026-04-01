'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Megaphone,
  Monitor,
  ArrowUpRight,
  ArrowDownRight,
  MousePointerClick,
  DollarSign,
  Plus,
  CreditCard,
  Play,
  Clock,
  ChevronRight,
  Sparkles,
  Eye,
  Target,
  CalendarDays,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@neofilm/ui';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

/* ══════════════════════════════ HELPERS ══════════════════════════════ */

function fmt(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function fmtShort(cents: number) {
  const v = cents / 100;
  if (v >= 10_000) return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v) + ' \u20AC';
  return fmt(cents);
}

function fmtNum(v: number) {
  if (v >= 1_000) return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  return v.toLocaleString('fr-FR');
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
  if (data.length < 2) return null;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const rng = mx - mn || 1;
  const id = useMemo(() => `sp-${Math.random().toString(36).slice(2, 8)}`, []);

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

/* ── Circular progress — with inner glow on dark bg ── */
function CircularProgress({
  value,
  size = 110,
  strokeWidth = 9,
  color = 'hsl(12,60%,55%)',
  trackColor = 'hsl(220,15%,20%)',
  dark = false,
  center,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  dark?: boolean;
  center?: React.ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (value / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={off}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {center ?? (
          <>
            <span className={`text-2xl font-extrabold leading-none ${dark ? 'text-white' : 'text-foreground'}`}>
              {value}<span className="text-sm">%</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Trend badge ── */
function Trend({ value, positive }: { value: string; positive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
      {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {value}
    </span>
  );
}

/* ── Activity calendar dots (like 13 Days card) ── */
function ActivityDots({ days = 28 }: { days?: number }) {
  // Seeded random for consistency during render
  const vals = useMemo(() => Array.from({ length: days }, (_, i) => {
    const seed = Math.sin(i * 7.3 + 42) * 10000;
    return seed - Math.floor(seed);
  }), [days]);

  const cls = (v: number) =>
    v < 0.15 ? 'cal-dot cal-dot-empty' :
    v < 0.4  ? 'cal-dot cal-dot-low' :
    v < 0.7  ? 'cal-dot cal-dot-mid' : 'cal-dot cal-dot-high';

  return (
    <div className="flex flex-wrap gap-0.75">
      {vals.map((v, i) => <div key={i} className={cls(v)} />)}
    </div>
  );
}

/* ── Horizontal bar ── */
function HBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className="hbar" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

/* ── Countdown display (like "13 Days" card) ── */
function Countdown({ days, hours }: { days: number; hours: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="countdown-digit">{String(days).padStart(2, '0')}</span>
      <span className="countdown-separator">:</span>
      <span className="countdown-digit">{String(hours).padStart(2, '0')}</span>
      <span className="countdown-separator">:</span>
      <span className="countdown-digit">00</span>
    </div>
  );
}

/* ════════════════════════════════ DASHBOARD ════════════════════════════════ */

export default function AdvertiserDashboard() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['advertiser-campaigns', user?.orgId],
    queryFn: () => apiFetch(`/campaigns${user?.orgId ? `?advertiserOrgId=${user.orgId}` : ''}&limit=50`),
    enabled: !!user,
  });

  const campaigns = data?.data?.data || [];
  const active = campaigns.filter((c: any) => c.status === 'ACTIVE');
  const drafts = campaigns.filter((c: any) => c.status === 'DRAFT');
  const budget = campaigns.reduce((s: number, c: any) => s + (c.budgetCents || 0), 0);
  const spent = campaigns.reduce((s: number, c: any) => s + (c.spentCents || 0), 0);
  const remaining = budget - spent;
  const spendPct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const impressions = active.length * 12450;
  const clicks = active.length * 398;
  const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : '0.0';
  const cpm = impressions > 0 ? ((spent / 100) / (impressions / 1000)).toFixed(2) : '0.00';
  const cpc = clicks > 0 ? ((spent / 100) / clicks).toFixed(2) : '0.00';
  const roi = spent > 0 ? Math.round(((impressions * 0.02 * 100 - spent) / spent) * 100) : 0;
  const proofCount = active.length * 847;
  const screens = active.length * 3;

  // Billing countdown — days until period end
  const billingDays = 13;
  const billingHours = 8;

  // Trend data
  const impressionTrend = [42, 55, 48, 63, 59, 72, 68, 85, 78, 92, 88, 95];
  const spendTrend = [20, 28, 25, 35, 32, 40, 38, 45, 42, 50, 48, 52];
  const clickTrend = [12, 15, 11, 18, 16, 22, 19, 25, 23, 28, 26, 30];

  if (isLoading) {
    return (
      <div className="space-y-4 pt-1">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1">

      {/* ═══════════════════ ROW 1 — Hero budget + Impressions + Countdown + Campaigns ═══════════════════ */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">

        {/* ── HERO BUDGET CARD (like VISA card — dominant, rich detail) ── */}
        <Card className="card-hero-coral rounded-2xl border-0 lg:col-span-5">
          <CardContent className="relative z-10 p-6">
            {/* Top row */}
            <div className="flex items-start justify-between">
              <div>
                <p className="hero-label text-[11px] font-semibold uppercase tracking-wider">Budget total alloué</p>
                <p className="mt-2 text-[42px] font-extrabold leading-none tracking-tight">{fmt(budget)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 backdrop-blur-sm">
                <CreditCard className="h-6 w-6 opacity-90" />
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-5 flex items-center gap-2.5">
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[12px] font-bold text-foreground shadow-sm transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                Créer campagne
              </Link>
              <Link
                href="/billing"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-5 py-2.5 text-[12px] font-semibold backdrop-blur-sm transition-colors hover:bg-white/28"
              >
                Facturation
              </Link>
            </div>

            {/* Stat sub-row (like VISA bottom section) */}
            <div className="mt-5 flex items-center rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <div className="flex-1">
                <p className="hero-sub text-[10px] uppercase tracking-wider">Dépensé</p>
                <p className="text-[17px] font-extrabold">{fmt(spent)}</p>
              </div>
              <div className="mx-3 h-8 w-px bg-white/15" />
              <div className="flex-1">
                <p className="hero-sub text-[10px] uppercase tracking-wider">Restant</p>
                <p className="text-[17px] font-extrabold">{fmt(remaining)}</p>
              </div>
              <div className="mx-3 h-8 w-px bg-white/15" />
              <div className="flex-1">
                <p className="hero-sub text-[10px] uppercase tracking-wider">Moy./mois</p>
                <p className="text-[17px] font-extrabold">{fmt(Math.round(spent / 3))}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── IMPRESSIONS + SPARKLINE (like Total Income) ── */}
        <Card className="card-elevated card-lift rounded-2xl border-0 lg:col-span-3">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Eye className="h-4 w-4 text-primary" />
              </div>
              <div className="flex gap-1">
                <span className="period-pill period-pill-active">Sem.</span>
                <span className="period-pill period-pill-inactive">Mois</span>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-medium text-muted-foreground">Impressions totales</p>
              <p className="mt-0.5 text-[34px] font-extrabold leading-none tracking-tight">{fmtNum(impressions)}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <Trend value="+18.2%" positive />
                <span className="text-[10px] text-muted-foreground">vs sem. dern.</span>
              </div>
            </div>
            <div className="mt-3 -mb-1">
              <Sparkline data={impressionTrend} width={200} height={44} />
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-border/40 pt-2">
              <span className="text-[10px] text-muted-foreground">Vues uniques</span>
              <span className="text-[12px] font-bold">{fmtNum(Math.round(impressions * 0.72))}</span>
            </div>
          </CardContent>
        </Card>

        {/* ── COUNTDOWN BILLING (like "13 Days" card) ── */}
        <Card className="card-elevated card-lift rounded-2xl border-0 lg:col-span-4">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <CalendarDays className="h-4 w-4 text-amber-500" />
              </div>
              <div className="flex gap-1">
                <span className="period-pill period-pill-inactive">2024</span>
                <span className="period-pill period-pill-active">2025</span>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-medium text-muted-foreground">Prochaine échéance</p>
              <div className="mt-2">
                <Countdown days={billingDays} hours={billingHours} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {billingDays} jours, {billingHours} heures restantes
              </p>
            </div>
            {/* Activity dots — like calendar visualization */}
            <div className="mt-3">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Diffusions 28j
              </p>
              <ActivityDots />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════ ROW 2 — Dark donut + CTR + CPM/CPC + ROI ═══════════════════ */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">

        {/* ── DARK DONUT (like 36% Growth card — most dramatic card) ── */}
        <Card className="card-dark rounded-2xl border-0 lg:col-span-3">
          <CardContent className="relative z-10 flex h-full flex-col items-center justify-center p-5 text-center">
            <CircularProgress
              value={spendPct}
              size={120}
              strokeWidth={10}
              color="hsl(12,60%,55%)"
              trackColor="hsl(220,15%,18%)"
              dark
              center={
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-extrabold leading-none text-white">{spendPct}<span className="text-base">%</span></span>
                  <span className="text-[9px] font-medium text-white/40 mt-0.5">consommé</span>
                </div>
              }
            />
            <p className="mt-4 text-[14px] font-bold text-white/95">Taux de dépense</p>
            <p className="mt-0.5 text-[11px] text-white/45">Budget utilisé ce trimestre</p>
            {/* Mini stats under donut */}
            <div className="mt-4 flex w-full gap-2">
              <div className="flex-1 rounded-lg bg-white/6 px-3 py-2 text-center">
                <p className="text-[14px] font-bold text-white/90">{fmt(spent)}</p>
                <p className="text-[9px] text-white/40">Dépensé</p>
              </div>
              <div className="flex-1 rounded-lg bg-white/6 px-3 py-2 text-center">
                <p className="text-[14px] font-bold text-white/90">{fmt(remaining)}</p>
                <p className="text-[9px] text-white/40">Restant</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── CTR — oversized number + click sparkline ── */}
        <Card className="card-elevated card-lift rounded-2xl border-0 lg:col-span-3">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <MousePointerClick className="h-4 w-4 text-primary" />
              </div>
              <Trend value="+0.4%" positive />
            </div>
            <div className="mt-2">
              <p className="text-[11px] font-medium text-muted-foreground">Taux de clic (CTR)</p>
              <div className="flex items-baseline gap-1">
                <span className="text-[52px] font-extrabold leading-none tracking-tighter">{ctr}</span>
                <span className="text-lg font-bold text-muted-foreground">%</span>
              </div>
            </div>
            <div className="mt-2 -mb-1">
              <Sparkline data={clickTrend} width={180} height={36} color="hsl(12,60%,52%)" />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
              <span className="text-[10px] text-muted-foreground">Clics total</span>
              <span className="text-[13px] font-extrabold">{fmtNum(clicks)}</span>
            </div>
          </CardContent>
        </Card>

        {/* ── CPM + CPC — dual metric card (like Total Income with sub-stat) ── */}
        <Card className="card-elevated card-lift rounded-2xl border-0 lg:col-span-3">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <DollarSign className="h-4 w-4 text-amber-500" />
              </div>
              <span className="period-pill period-pill-inactive">Ce mois</span>
            </div>

            {/* CPM — primary */}
            <div className="mt-3">
              <p className="text-[11px] font-medium text-muted-foreground">Coût pour 1000 vues (CPM)</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[34px] font-extrabold leading-none tracking-tight">{cpm}</span>
                <span className="text-sm font-bold text-muted-foreground">\u20AC</span>
              </div>
              <Trend value="-5.3%" positive />
            </div>

            {/* Divider */}
            <div className="my-3 h-px bg-border/60" />

            {/* CPC — secondary */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Coût par clic (CPC)</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold leading-none">{cpc}</span>
                <span className="text-sm font-bold text-muted-foreground">\u20AC</span>
              </div>
              <Trend value="-2.8%" positive />
            </div>

            <div className="mt-2">
              <Sparkline data={spendTrend} width={180} height={28} color="hsl(38,85%,52%)" />
            </div>
          </CardContent>
        </Card>

        {/* ── ROI — the metric advertisers care about most ── */}
        <Card className="card-elevated card-lift rounded-2xl border-0 lg:col-span-3">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <Trend value="+12%" positive />
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-medium text-muted-foreground">Retour sur investissement</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-[46px] font-extrabold leading-none tracking-tighter ${roi >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {roi >= 0 ? '+' : ''}{roi}
                </span>
                <span className="text-lg font-bold text-muted-foreground">%</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">ROI estimé sur vos campagnes</p>
            </div>

            {/* Mini breakdown */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <p className="text-[14px] font-bold text-emerald-700">{fmtNum(screens)}</p>
                <p className="text-[9px] font-medium text-emerald-600">Écrans</p>
              </div>
              <div className="rounded-lg bg-blue-50 px-3 py-2">
                <p className="text-[14px] font-bold text-blue-700">{fmtNum(proofCount)}</p>
                <p className="text-[9px] font-medium text-blue-600">Diffusions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════ ROW 3 — Campaign list + Screen breakdown + Quick actions ═══════════════════ */}
      <div className="grid gap-4 lg:grid-cols-12">

        {/* ── CAMPAIGNS LIST (like Activity Manager — filters + rows) ── */}
        <Card className="card-elevated rounded-2xl border-0 lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-[15px] font-bold">Campagnes</CardTitle>
            <div className="flex items-center gap-1.5">
              <span className="period-pill period-pill-active">Toutes</span>
              <span className="period-pill period-pill-inactive">Actives</span>
              <span className="period-pill period-pill-inactive">Brouillons</span>
              <Link href="/campaigns" className="ml-1 text-muted-foreground transition-colors hover:text-primary">
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
            ) : (
              <div className="space-y-0.5">
                {campaigns.slice(0, 5).map((c: any, i: number) => {
                  const pct = budget > 0 ? Math.round(((c.budgetCents || 0) / budget) * 100) : 0;
                  const isActive = c.status === 'ACTIVE';
                  return (
                    <Link
                      key={c.id || i}
                      href={`/campaigns/${c.id}`}
                      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-all hover:bg-accent"
                    >
                      {/* Status icon */}
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-emerald-50 group-hover:bg-emerald-100' : 'bg-muted group-hover:bg-muted/80'}`}>
                        {isActive ? <Play className="h-3.5 w-3.5 text-emerald-500" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>

                      {/* Name + status */}
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-[13px] font-semibold transition-colors group-hover:text-primary">{c.name || `Campagne ${i + 1}`}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          <span className="text-[10px] text-muted-foreground">
                            {isActive ? 'En cours' : c.status === 'DRAFT' ? 'Brouillon' : c.status}
                          </span>
                        </div>
                      </div>

                      {/* Budget + progress bar */}
                      <div className="shrink-0 w-24 text-right">
                        <p className="text-[13px] font-bold">{fmtShort(c.budgetCents || 0)}</p>
                        <div className="mt-1">
                          <HBar percent={pct} color={isActive ? 'hsl(12,60%,52%)' : 'hsl(var(--muted-foreground))'} />
                        </div>
                        <p className="mt-0.5 text-[9px] text-muted-foreground">{pct}% du total</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── SCREEN REACH + PROOF (like Business plans sub-card) ── */}
        <Card className="card-elevated rounded-2xl border-0 lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-bold">Réseau & Diffusions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-4">
            {/* Screen distribution bars */}
            <div className="space-y-3">
              {[
                { label: 'Cinémas', count: active.length * 2, total: screens, color: 'hsl(12,60%,52%)', icon: Monitor },
                { label: 'Hôtels', count: active.length, total: screens, color: 'hsl(25,55%,55%)', icon: Target },
              ].map((item) => (
                <div key={item.label} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[12px] font-semibold">{item.label}</span>
                    </div>
                    <span className="text-[12px] font-bold">{item.count} <span className="font-normal text-muted-foreground">/ {item.total}</span></span>
                  </div>
                  <HBar percent={item.total > 0 ? (item.count / item.total) * 100 : 0} color={item.color} />
                </div>
              ))}
            </div>

            {/* Proof of diffusion */}
            <div className="rounded-xl border border-border/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                  <Shield className="h-5 w-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-bold">Preuves de diffusion</p>
                  <p className="text-[11px] text-muted-foreground">Certifiées HMAC, anti-fraude</p>
                </div>
                <span className="text-xl font-extrabold text-emerald-600">{fmtNum(proofCount)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-600">
                  <ArrowUpRight className="h-2.5 w-2.5" /> +24%
                </span>
                <span className="text-muted-foreground">vs mois dernier</span>
              </div>
            </div>

            {/* Coverage map placeholder */}
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <div>
                <p className="text-[13px] font-bold">{active.length > 0 ? '4' : '0'} villes</p>
                <p className="text-[10px] text-muted-foreground">Couverture réseau</p>
              </div>
              <div className="flex -space-x-1.5">
                {['Paris', 'Lyon', 'Mars.', 'Bord.'].slice(0, Math.min(4, active.length * 2 || 1)).map((city) => (
                  <span key={city} className="inline-flex h-7 items-center rounded-full border-2 border-card bg-primary/8 px-2 text-[9px] font-bold text-primary">
                    {city}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── RIGHT COLUMN — CTA + Score (like Wallet Verification + Review Rating) ── */}
        <div className="flex flex-col gap-4 lg:col-span-3">

          {/* AI Creator CTA (like Wallet Verification with "Enable") */}
          <Card className="card-elevated card-lift rounded-2xl border-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-br from-primary/[0.04] to-primary/[0.08]" />
            <CardContent className="relative p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-3 text-[15px] font-bold">Créateur IA</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Générez vos visuels publicitaires avec l&apos;intelligence artificielle en quelques secondes.
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

          {/* Score qualité (like Review Rating — "How is your business?") */}
          <Card className="card-elevated rounded-2xl border-0 flex-1">
            <CardContent className="flex h-full flex-col justify-between p-5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Score qualité</p>
                <p className="mt-1.5 text-[14px] font-bold leading-snug">Comment se portent vos campagnes ?</p>
              </div>
              <div className="mt-5 flex items-center justify-between">
                {[
                  { label: 'Faible', min: 0, max: 20 },
                  { label: 'Bas', min: 20, max: 40 },
                  { label: 'Moyen', min: 40, max: 60 },
                  { label: 'Bon', min: 60, max: 80 },
                  { label: 'Top', min: 80, max: 101 },
                ].map((level, idx) => {
                  const isActive = spendPct >= level.min && spendPct < level.max;
                  return (
                    <div key={level.label} className="flex flex-col items-center gap-1.5">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-[15px] transition-all duration-300 ${
                          isActive
                            ? 'bg-primary text-primary-foreground scale-115 shadow-lg ring-4 ring-primary/15'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {[':(', ':|', ':/', ':)', ':D'][idx]}
                      </div>
                      <span className={`text-[8px] font-bold uppercase tracking-wider ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                        {level.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Quick KPI summary */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
                  <p className="text-[13px] font-extrabold">{active.length}</p>
                  <p className="text-[8px] font-semibold text-muted-foreground uppercase">Actives</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
                  <p className="text-[13px] font-extrabold">{drafts.length}</p>
                  <p className="text-[8px] font-semibold text-muted-foreground uppercase">Brouillons</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
