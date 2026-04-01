'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

export interface PairingRequest {
  id: string;
  serialNumber: string;
  deviceType: string;
  pin: string;
  pinExpiresAt: string;
  status: 'PENDING' | 'CLAIMED' | 'EXPIRED';
  screen?: { id: string; name: string; city: string } | null;
  createdAt: string;
}

export interface ClaimResult {
  pin: string;
  success: boolean;
  error?: string;
  deviceId?: string;
}

export function usePairingRequests(page = 1, limit = 50) {
  return useQuery({
    queryKey: queryKeys.pairing.requests({ page, limit }),
    queryFn: () =>
      apiFetch(`/devices/pair/requests?page=${page}&limit=${limit}`),
    refetchInterval: 10000, // auto-refresh every 10s
  });
}

/** Claim a single PIN and associate it to a screen */
export function useClaimPin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { pin: string; screenId: string }) => {
      return apiFetch('/devices/pair/claim', {
        method: 'POST',
        body: JSON.stringify({ ...data, partnerOrgId: user?.orgId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pairing.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
    },
  });
}

/** Batch claim multiple PINs */
export function useClaimBatch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (claims: Array<{ pin: string; screenId: string }>) => {
      return apiFetch('/devices/pair/claim-batch', {
        method: 'POST',
        body: JSON.stringify({ claims, partnerOrgId: user?.orgId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pairing.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
    },
  });
}
