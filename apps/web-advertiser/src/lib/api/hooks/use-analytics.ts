'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

export interface CreativeViews {
  creativeId: string;
  creativeName: string;
  creativeType: string;
  fileUrl: string | null;
  campaignId: string | null;
  campaignName: string;
  totalViews: number;
  screensCount: number;
}

export interface ScreenViews {
  screenId: string;
  screenName: string;
  city: string;
  totalViews: number;
}

export interface TimelinePoint {
  date: string;
  views: number;
}

export interface AdvertiserAnalytics {
  totalViews: number;
  totalCampaigns: number;
  activeCampaigns: number;
  viewsByCreative: CreativeViews[];
  topScreens: ScreenViews[];
  viewsTimeline: TimelinePoint[];
}

export function useAdvertiserAnalytics() {
  const { user } = useAuth();
  return useQuery<AdvertiserAnalytics>({
    queryKey: queryKeys.analytics.global,
    queryFn: () => {
      const params = new URLSearchParams();
      if (user?.orgId) params.set('advertiserOrgId', user.orgId);
      return apiFetch(`/analytics/advertiser?${params.toString()}`);
    },
    enabled: !!user,
  });
}

// ── Per-campaign hooks (used by /analytics/[campaignId]) ──
//
// All four hooks now read the SAME real endpoint GET /analytics/campaigns/:id
// (DiffusionLog-backed) and select their slice. React Query dedupes the
// request via the shared query key, so this is one network call. The previous
// mock-data path (mockAnalyticsSummary / mockTimeseries / …) is gone.

function useCampaignAnalytics(campaignId: string) {
  return useQuery({
    queryKey: ['analytics', 'campaign', campaignId],
    queryFn: () => apiFetch(`/analytics/campaigns/${campaignId}`),
    enabled: !!campaignId,
  });
}

export function useCampaignAnalyticsSummary(campaignId: string) {
  const q = useCampaignAnalytics(campaignId);
  return { ...q, data: (q.data as any)?.summary } as typeof q;
}

export function useCampaignTimeseries(campaignId: string, _params?: { days?: number }) {
  const q = useCampaignAnalytics(campaignId);
  return { ...q, data: (q.data as any)?.timeseries } as typeof q;
}

export function useCampaignByTrigger(campaignId: string) {
  const q = useCampaignAnalytics(campaignId);
  return { ...q, data: (q.data as any)?.byTrigger } as typeof q;
}

export function useCampaignByScreen(campaignId: string) {
  const q = useCampaignAnalytics(campaignId);
  return { ...q, data: (q.data as any)?.byScreen } as typeof q;
}
