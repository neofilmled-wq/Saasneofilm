'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

export interface CatalogueScreen {
  id: string;
  name: string;
  city: string | null;
}

export interface CatalogueListing {
  id: string;
  title: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  ctaUrl: string | null;
  promoCode: string | null;
  phone: string | null;
  address: string | null;
  keywords: string[];
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED';
  startDate: string | null;
  endDate: string | null;
  screens: Array<{ id: string; screen: CatalogueScreen }>;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogueListingInput {
  title: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  ctaUrl?: string;
  promoCode?: string;
  phone: string;
  address: string;
  keywords?: string[];
  startDate?: string;
  endDate?: string;
  screenIds?: string[];
}

export function useCatalogueListings(status?: string) {
  const { user } = useAuth();
  return useQuery<CatalogueListing[]>({
    queryKey: queryKeys.catalog.list({ status, orgId: user?.orgId }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (user?.orgId) params.set('advertiserOrgId', user.orgId);
      return apiFetch(`/advertiser/catalogue?${params.toString()}`);
    },
    enabled: !!user,
  });
}

export function useCatalogueListing(id: string) {
  return useQuery<CatalogueListing>({
    queryKey: queryKeys.catalog.detail(id),
    queryFn: () => apiFetch(`/advertiser/catalogue/${id}`),
    enabled: !!id,
  });
}

export function useCreateCatalogueItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CatalogueListingInput) =>
      apiFetch('/advertiser/catalogue', {
        method: 'POST',
        body: JSON.stringify({ ...data, advertiserOrgId: user?.orgId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
    },
  });
}

export function useUpdateCatalogueItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CatalogueListingInput> }) =>
      apiFetch(`/advertiser/catalogue/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
    },
  });
}

export function usePublishCatalogueItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/advertiser/catalogue/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
    },
  });
}

export function useUnpublishCatalogueItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/advertiser/catalogue/${id}/unpublish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
    },
  });
}

export function useDeleteCatalogueItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/advertiser/catalogue/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
    },
  });
}
