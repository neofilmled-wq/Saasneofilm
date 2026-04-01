'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

export function useScreenStatusSummary() {
  const { user } = useAuth();
  const orgId = user?.orgId;
  return useQuery({
    queryKey: queryKeys.screens.statusSummary(orgId ?? ''),
    queryFn: () => apiFetch(`/screens/status-summary?partnerOrgId=${orgId}`),
    enabled: !!orgId,
    refetchInterval: 15000,
  });
}

export function useScreenRanking(limit = 20) {
  const { user } = useAuth();
  const orgId = user?.orgId;
  return useQuery({
    queryKey: queryKeys.screens.ranking(orgId ?? ''),
    queryFn: () => apiFetch(`/screens/ranking?partnerOrgId=${orgId}&limit=${limit}`),
    enabled: !!orgId,
  });
}

export function usePartnerScreenMap() {
  const { user } = useAuth();
  const orgId = user?.orgId;
  return useQuery({
    queryKey: queryKeys.screens.partnerMap(orgId ?? ''),
    queryFn: () => apiFetch(`/screens/partner-map?partnerOrgId=${orgId}`),
    enabled: !!orgId,
    refetchInterval: 30000,
  });
}
