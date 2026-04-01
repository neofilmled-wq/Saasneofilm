'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/api';

export function useStartPairing() {
  return useMutation({
    mutationFn: async (input: { screenId: string; deviceType: string }) => {
      // This is still used for generating a PIN for a screen (server-side provisioning)
      // The pairing request comes from the TV; we return instructions to the partner.
      // For now we return a "ready-to-receive" state — the TV device posts its own PIN.
      return { info: 'Post POST /devices/pair/request from the TV to get the PIN.', screenId: input.screenId };
    },
  });
}

export function useConfirmPairing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { pin: string; screenId: string; partnerOrgId: string }) => {
      // POST /tv/pair reads the in-memory pinStore created by the TV's POST /tv/register
      return apiFetch('/tv/pair', {
        method: 'POST',
        body: JSON.stringify({ pin: data.pin, screenId: data.screenId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pairing.all });
    },
  });
}

export function useRevokeDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { screenId: string; deviceId: string }): Promise<void> => {
      await apiFetch(`/devices/${data.deviceId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
    },
  });
}

export function useDeviceStatus(deviceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.devices.status(deviceId ?? ''),
    queryFn: () => apiFetch(`/devices/${deviceId}`),
    enabled: !!deviceId,
    refetchInterval: 5000,
  });
}
