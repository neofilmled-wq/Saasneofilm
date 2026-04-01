'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

interface CampaignFilters {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useCampaigns(filters: CampaignFilters = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.campaigns.list({ ...filters, orgId: user?.orgId }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (user?.orgId) params.set('advertiserOrgId', user.orgId);
      if (filters.status) params.set('status', filters.status);
      if (filters.page) params.set('page', String(filters.page));
      params.set('limit', String(filters.limit ?? 50));
      const res = await apiFetch(`/campaigns?${params}`);
      return {
        data: Array.isArray(res?.data) ? res.data : [],
        meta: {
          total: res?.total ?? 0,
          page: res?.page ?? 1,
          limit: res?.limit ?? 50,
          totalPages: res?.totalPages ?? 1,
          hasNextPage: (res?.page ?? 1) < (res?.totalPages ?? 1),
          hasPreviousPage: (res?.page ?? 1) > 1,
        },
      };
    },
    enabled: !!user,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: queryKeys.campaigns.detail(id),
    queryFn: () => apiFetch(`/campaigns/${id}`),
    enabled: !!id,
  });
}

export function useCampaignGroup(groupId: string | null | undefined) {
  return useQuery({
    queryKey: ['campaigns', 'group', groupId],
    queryFn: async () => {
      const res = await apiFetch(`/campaigns?groupId=${groupId}&limit=10`);
      return Array.isArray(res?.data) ? res.data : [];
    },
    enabled: !!groupId,
  });
}

export function useBusyScreens() {
  const { user } = useAuth();
  return useQuery<{ AD_SPOT: string[]; CATALOG_LISTING: string[] }>({
    queryKey: ['campaigns', 'busy-screens', user?.orgId],
    queryFn: () => apiFetch(`/campaigns/busy-screens?advertiserOrgId=${user?.orgId}`),
    enabled: !!user?.orgId,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiFetch('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ ...data, advertiserOrgId: user?.orgId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiFetch(`/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
  });
}

export function useUpdateCampaignStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string; reason?: string }) =>
      apiFetch(`/campaigns/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
  });
}

export function usePublishCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/campaigns/${id}/publish`, { method: 'POST' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
  });
}

export function useDeactivateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/campaigns/${id}/deactivate`, { method: 'POST' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
  });
}
