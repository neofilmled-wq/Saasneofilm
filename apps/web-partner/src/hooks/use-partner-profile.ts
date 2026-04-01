'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

export function usePartnerProfile() {
  const { user } = useAuth();
  const orgId = user?.orgId;
  return useQuery({
    queryKey: queryKeys.partnerProfile.detail(orgId ?? ''),
    queryFn: () => apiFetch(`/partner/profile?orgId=${orgId}`),
    enabled: !!orgId,
  });
}

export function useUpsertPartnerProfile() {
  const { user } = useAuth();
  const orgId = user?.orgId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      companyName?: string;
      logoUrl?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      city?: string;
      postCode?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      timezone?: string;
    }) => {
      return apiFetch(`/partner/profile?orgId=${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.partnerProfile.detail(orgId ?? '') });
    },
  });
}
