'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { mockAlerts, type MockAlert } from '@/lib/mock-data';

interface AlertFilters {
  severity?: string;
  status?: string;
  screenId?: string;
}

export function useAlerts(filters?: AlertFilters) {
  return useQuery({
    queryKey: queryKeys.alerts.list(filters as Record<string, unknown> | undefined),
    queryFn: async (): Promise<MockAlert[]> => {
      await new Promise((r) => setTimeout(r, 300));
      let result = [...mockAlerts];
      if (filters?.severity) result = result.filter((a) => a.severity === filters.severity);
      if (filters?.status) result = result.filter((a) => a.status === filters.status);
      if (filters?.screenId) result = result.filter((a) => a.screenId === filters.screenId);
      return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
  });
}

export function useOpenAlertsCount() {
  return useQuery({
    queryKey: queryKeys.alerts.count(),
    queryFn: async (): Promise<number> => {
      await new Promise((r) => setTimeout(r, 100));
      return mockAlerts.filter((a) => a.status === 'open').length;
    },
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string): Promise<void> => {
      await new Promise((r) => setTimeout(r, 400));
      const alert = mockAlerts.find((a) => a.id === alertId);
      if (alert) {
        alert.status = 'acknowledged';
        alert.acknowledgedAt = new Date().toISOString();
        alert.acknowledgedBy = 'Utilisateur';
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string): Promise<void> => {
      await new Promise((r) => setTimeout(r, 400));
      const alert = mockAlerts.find((a) => a.id === alertId);
      if (alert) {
        alert.status = 'resolved';
        alert.resolvedAt = new Date().toISOString();
        alert.resolvedBy = 'Utilisateur';
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
  });
}
