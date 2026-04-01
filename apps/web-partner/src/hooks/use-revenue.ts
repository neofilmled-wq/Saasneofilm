'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

export function useRevenueSummary(_period: string) {
  const { user } = useAuth(); const orgId = user?.orgId;
  return useQuery({
    queryKey: ['revenue', 'summary', orgId],
    queryFn: async () => {
      // Use statements endpoint (no month = ALL campaigns) — more reliable
      const raw = await apiFetch(`/partner/commissions/statements?orgId=${orgId}`);
      // apiFetch returns the raw envelope { data, statusCode, timestamp }
      // Unwrap: if raw has .data and .statusCode, the real payload is raw.data
      const payload = raw?.statusCode && raw?.data ? raw.data : raw;
      const statements: any[] = Array.isArray(payload) ? payload : [];

      // Sum totals from all statements
      let totalRevenueCents = 0;
      let retrocessionCents = 0;
      let commissionRate = 0.15;
      const screenIds = new Set<string>();

      for (const stmt of statements) {
        totalRevenueCents += stmt.totalRevenueCents ?? 0;
        retrocessionCents += stmt.partnerShareCents ?? 0;
        if (stmt.commissionRate) commissionRate = stmt.commissionRate;
        for (const line of stmt.lineItems ?? []) {
          if (line.screenId) screenIds.add(line.screenId);
        }
      }

      return {
        period: 'all',
        totalRevenueCents,
        confirmedPayoutsCents: retrocessionCents,
        retrocessionRate: commissionRate,
        activeScreens: screenIds.size,
        commissionRatePercent: Math.round(commissionRate * 100),
        campaignCount: statements.length,
      };
    },
    enabled: !!orgId,
  });
}

export function useRevenueByScreen(period: string) {
  const { user } = useAuth(); const orgId = user?.orgId;
  return useQuery({
    queryKey: queryKeys.commissions.statements(orgId ?? '', period),
    queryFn: async () => {
      const data = await apiFetch(
        `/partner/commissions/statements?orgId=${orgId}&month=${period}`,
      );
      const statements: any[] = Array.isArray(data) ? data : data.data ?? [];
      // Flatten line items into per-screen rows
      const screenMap = new Map<string, { screenId: string; screenName: string; revenueCents: number; retrocessionCents: number; bookingCount: number; siteName: string }>();
      for (const stmt of statements) {
        for (const line of stmt.lineItems ?? []) {
          const existing = screenMap.get(line.screenId);
          if (existing) {
            existing.revenueCents += line.finalAmountCents ?? 0;
            existing.retrocessionCents += Math.round((line.finalAmountCents ?? 0) * (stmt.commissionRate ?? 0.15));
            existing.bookingCount += 1;
          } else {
            screenMap.set(line.screenId, {
              screenId: line.screenId,
              screenName: line.screenName,
              siteName: '—',
              revenueCents: line.finalAmountCents ?? 0,
              retrocessionCents: Math.round((line.finalAmountCents ?? 0) * (stmt.commissionRate ?? 0.15)),
              bookingCount: 1,
            });
          }
        }
      }
      return Array.from(screenMap.values());
    },
    enabled: !!orgId,
  });
}

export function useRevenueBySite(period: string) {
  // Site grouping — derived from statements (no dedicated API endpoint yet)
  const { data: byScreen } = useRevenueByScreen(period);
  return useQuery({
    queryKey: queryKeys.revenue.bySite(period),
    queryFn: async () => {
      if (!byScreen) return [];
      // Group by siteName
      const siteMap = new Map<string, { siteId: string; siteName: string; screenCount: number; revenueCents: number; retrocessionCents: number }>();
      for (const row of byScreen) {
        const key = row.siteName ?? '—';
        const existing = siteMap.get(key);
        if (existing) {
          existing.screenCount += 1;
          existing.revenueCents += row.revenueCents;
          existing.retrocessionCents += row.retrocessionCents;
        } else {
          siteMap.set(key, {
            siteId: key,
            siteName: key,
            screenCount: 1,
            revenueCents: row.revenueCents,
            retrocessionCents: row.retrocessionCents,
          });
        }
      }
      return Array.from(siteMap.values());
    },
    enabled: !!byScreen,
  });
}

export function useRevenueHistory() {
  const { user } = useAuth(); const orgId = user?.orgId;
  return useQuery({
    queryKey: ['revenue', 'history', orgId],
    queryFn: async () => {
      const months = ['2026-03', '2026-02', '2026-01', '2025-12', '2025-11', '2025-10'];
      const results = await Promise.all(
        months.map(async (month) => {
          try {
            const data = await apiFetch(`/partner/commissions/statements?orgId=${orgId}&month=${month}`);
            const statements: any[] = Array.isArray(data) ? data : data.data ?? [];
            let revenueCents = 0;
            let retrocessionCents = 0;
            for (const stmt of statements) {
              revenueCents += stmt.totalRevenueCents ?? 0;
              retrocessionCents += stmt.partnerShareCents ?? 0;
            }
            return { month, revenueCents, retrocessionCents };
          } catch {
            return { month, revenueCents: 0, retrocessionCents: 0 };
          }
        }),
      );
      return results;
    },
    enabled: !!orgId,
  });
}

export function usePayouts(period?: string) {
  const { user } = useAuth(); const orgId = user?.orgId;
  return useQuery({
    queryKey: queryKeys.payouts.list(period),
    queryFn: async () => {
      const data = await apiFetch(`/payouts/partner/${orgId}/history`);
      return Array.isArray(data) ? data : data.data ?? [];
    },
    enabled: !!orgId,
  });
}

export function useCommissionStatements(month?: string) {
  const { user } = useAuth(); const orgId = user?.orgId;
  return useQuery({
    queryKey: queryKeys.commissions.statements(orgId ?? '', month),
    queryFn: async () => {
      const url = month
        ? `/partner/commissions/statements?orgId=${orgId}&month=${month}`
        : `/partner/commissions/statements?orgId=${orgId}`;
      const data = await apiFetch(url);
      return Array.isArray(data) ? data : data.data ?? [];
    },
    enabled: !!orgId,
  });
}

export function useCommissionWallet() {
  const { user } = useAuth(); const orgId = user?.orgId;
  return useQuery({
    queryKey: queryKeys.commissions.wallet(orgId ?? ''),
    queryFn: () => apiFetch(`/partner/commissions/wallet?orgId=${orgId}`),
    enabled: !!orgId,
  });
}
