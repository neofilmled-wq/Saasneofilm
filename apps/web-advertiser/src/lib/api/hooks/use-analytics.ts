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

import {
  mockAnalyticsSummary,
  mockTimeseries,
  mockTriggerBreakdown,
  mockScreenPerformance,
} from '@/lib/mock-data';

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export function useCampaignAnalyticsSummary(campaignId: string) {
  return useQuery({
    queryKey: queryKeys.analytics.summary(campaignId),
    queryFn: async () => {
      await delay();
      const base = mockAnalyticsSummary();
      return { ...base, totalImpressions: Math.floor(base.totalImpressions * 0.3) };
    },
    enabled: !!campaignId,
  });
}

export function useCampaignTimeseries(campaignId: string, params?: { days?: number }) {
  return useQuery({
    queryKey: queryKeys.analytics.timeseries(campaignId, params),
    queryFn: async () => {
      await delay();
      return mockTimeseries(params?.days ?? 30);
    },
    enabled: !!campaignId,
  });
}

export function useCampaignByTrigger(campaignId: string) {
  return useQuery({
    queryKey: queryKeys.analytics.byTrigger(campaignId),
    queryFn: async () => {
      await delay();
      return mockTriggerBreakdown();
    },
    enabled: !!campaignId,
  });
}

export function useCampaignByScreen(campaignId: string) {
  return useQuery({
    queryKey: queryKeys.analytics.byScreen(campaignId),
    queryFn: async () => {
      await delay();
      return mockScreenPerformance(10);
    },
    enabled: !!campaignId,
  });
}
