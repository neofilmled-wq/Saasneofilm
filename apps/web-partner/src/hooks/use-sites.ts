'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/api';

// ─── Types ──────────────────────────────────────────────────

export interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postCode: string | null;
  country: string;
  timezone: string;
  category: string;
  partnerOrgId: string;
  screenCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CreateSiteInput {
  name: string;
  address: string;
  city: string;
  postCode: string;
  country: string;
  timezone: string;
  category: string;
}

interface UpdateSiteInput {
  id: string;
  data: Partial<CreateSiteInput>;
}

// ─── Hooks ──────────────────────────────────────────────────

export function useSites(orgId: string) {
  return useQuery({
    queryKey: queryKeys.sites.list(orgId),
    queryFn: async (): Promise<Site[]> => {
      const res: any = await apiFetch(`/partners/${orgId}/venues`);
      const payload = res?.data ?? res;
      return payload?.data ?? payload ?? [];
    },
    enabled: !!orgId,
  });
}

export function useSite(id: string, orgId: string) {
  return useQuery({
    queryKey: queryKeys.sites.detail(id),
    queryFn: async (): Promise<Site> => {
      const res: any = await apiFetch(`/partners/${orgId}/venues/${id}`);
      return res?.data ?? res;
    },
    enabled: !!id && !!orgId,
  });
}

export function useCreateSite(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSiteInput): Promise<Site> => {
      const res: any = await apiFetch(`/partners/${orgId}/venues`, {
        method: 'POST',
        body: JSON.stringify({ ...data, partnerOrgId: orgId }),
      });
      return res?.data ?? res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.list(orgId) });
    },
  });
}

export function useUpdateSite(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateSiteInput): Promise<Site> => {
      const res: any = await apiFetch(`/partners/${orgId}/venues/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res?.data ?? res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.list(orgId) });
    },
  });
}

export function useDeleteSite(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiFetch(`/partners/${orgId}/venues/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites.list(orgId) });
    },
  });
}
