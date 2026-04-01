'use client';

import { useMutation } from '@tanstack/react-query';

export function useRebootDevice() {
  return useMutation({
    mutationFn: async (_deviceId: string): Promise<void> => {
      // POST /devices/{id}/command/reboot
      await new Promise((r) => setTimeout(r, 1500));
    },
  });
}

export function useClearCache() {
  return useMutation({
    mutationFn: async (_deviceId: string): Promise<void> => {
      // POST /devices/{id}/command/clear-cache
      await new Promise((r) => setTimeout(r, 1000));
    },
  });
}

export function usePushConfigCommand() {
  return useMutation({
    mutationFn: async (_deviceId: string): Promise<void> => {
      // POST /devices/{id}/command/push-config
      await new Promise((r) => setTimeout(r, 1000));
    },
  });
}

export function useRequestLogs() {
  return useMutation({
    mutationFn: async (_deviceId: string): Promise<void> => {
      // POST /devices/{id}/command/request-logs
      await new Promise((r) => setTimeout(r, 800));
    },
  });
}
