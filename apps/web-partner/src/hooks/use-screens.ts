'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/api';
import type { ScreenFilters, ScreenWithStatus, ScreenFormValues } from '@/types/screen.types';
import { computeHealthScore } from '@/lib/utils';

/**
 * Map API screen response (Prisma shape + TransformInterceptor) to the
 * ScreenWithStatus shape expected by UI components.
 */
function mapApiScreen(raw: any): ScreenWithStatus {
  const liveStatus = raw.screenLiveStatus
    ? {
        screenId: raw.id,
        isOnline: raw.screenLiveStatus.isOnline ?? false,
        lastHeartbeatAt: raw.screenLiveStatus.lastHeartbeatAt ?? '',
        appVersion: raw.screenLiveStatus.appVersion ?? '',
        cpuPercent: raw.screenLiveStatus.cpuPercent ?? 0,
        memoryPercent: raw.screenLiveStatus.memoryPercent ?? 0,
        networkType: (raw.screenLiveStatus.networkType ?? 'wifi') as 'wifi' | 'ethernet',
        errorCount24h: raw.screenLiveStatus.errorCount24h ?? 0,
        currentCampaignId: raw.screenLiveStatus.currentCampaignId,
      }
    : undefined;

  const healthScore = liveStatus
    ? computeHealthScore({
        uptimePercent24h: liveStatus.isOnline ? 98 : 40,
        errorCount24h: liveStatus.errorCount24h,
        minutesSinceHeartbeat: liveStatus.lastHeartbeatAt
          ? Math.round((Date.now() - new Date(liveStatus.lastHeartbeatAt).getTime()) / 60000)
          : 120,
      })
    : undefined;

  return {
    id: raw.id,
    name: raw.name,
    siteId: raw.siteId ?? '',
    siteName: raw.partnerOrg?.name ?? raw.siteName ?? '',
    address: raw.address ?? '',
    city: raw.city ?? '',
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    type: raw.type ?? 'smartTV',
    brand: raw.brand,
    model: raw.model,
    resolution: raw.resolution ?? '',
    orientation: raw.orientation ?? 'LANDSCAPE',
    status: raw.status ?? 'INACTIVE',
    monthlyPriceCents: raw.monthlyPriceCents ?? 0,
    currency: raw.currency ?? 'EUR',
    activeDeviceId: raw.activeDeviceId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    liveStatus,
    healthScore,
  };
}

export function useScreens(filters?: ScreenFilters) {
  return useQuery({
    queryKey: queryKeys.screens.list(filters as Record<string, unknown> | undefined),
    queryFn: async (): Promise<ScreenWithStatus[]> => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.partnerOrgId) params.set('partnerOrgId', filters.partnerOrgId);
      const qs = params.toString();
      const res: any = await apiFetch(`/screens${qs ? `?${qs}` : ''}`);
      // TransformInterceptor: { data: { data: [...], total, ... } }
      const screens = res?.data?.data ?? res?.data ?? [];
      return Array.isArray(screens) ? screens.map(mapApiScreen) : [];
    },
  });
}

export function useScreen(id: string) {
  return useQuery({
    queryKey: queryKeys.screens.detail(id),
    queryFn: async (): Promise<ScreenWithStatus> => {
      const res: any = await apiFetch(`/screens/${id}`);
      // TransformInterceptor: { data: screenObj, statusCode, timestamp }
      const raw = res?.data ?? res;
      if (!raw || !raw.id) throw new Error(`Screen ${id} not found`);
      return mapApiScreen(raw);
    },
    enabled: !!id,
  });
}

export function useScreenDevice(deviceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.devices.status(deviceId ?? ''),
    queryFn: async () => {
      const res: any = await apiFetch(`/devices/${deviceId}`);
      const device = res?.data ?? res;
      if (!device || !device.id) throw new Error(`Device ${deviceId} not found`);
      return device;
    },
    enabled: !!deviceId,
  });
}

export function useCreateScreen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ScreenFormValues & { partnerOrgId: string }) => {
      const res: any = await apiFetch('/screens', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res?.data ?? res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
    },
  });
}

export function useUpdateScreen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ScreenFormValues> }) => {
      const res: any = await apiFetch(`/screens/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res?.data ?? res;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.detail(variables.id) });
    },
  });
}

export function usePublishScreen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res: any = await apiFetch(`/screens/${id}/publish`, { method: 'POST' });
      return res?.data ?? res;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.detail(id) });
    },
  });
}

export function useDisableScreen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res: any = await apiFetch(`/screens/${id}/disable`, { method: 'POST' });
      return res?.data ?? res;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.detail(id) });
    },
  });
}
