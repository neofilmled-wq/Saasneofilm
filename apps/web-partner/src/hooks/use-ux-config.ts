'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import type { MockUxConfig, MockSplitScreenConfig } from '@/lib/mock-data';

const mockUxConfigs: Record<string, MockUxConfig> = {
  'screen-1': { screenId: 'screen-1', catalogEnabled: true, defaultHomeSection: 'iptv', language: 'fr', adFrequencyMinutes: 5, currentVersionOnDevice: 'v1.3', pendingVersion: 'v1.4', lastPushedAt: '2026-02-20T10:00:00Z' },
  'screen-2': { screenId: 'screen-2', catalogEnabled: true, defaultHomeSection: 'streaming', language: 'fr', adFrequencyMinutes: 10, currentVersionOnDevice: 'v1.3', lastPushedAt: '2026-02-18T10:00:00Z' },
  'screen-5': { screenId: 'screen-5', catalogEnabled: false, defaultHomeSection: 'catalog', language: 'en', adFrequencyMinutes: 3, currentVersionOnDevice: 'v1.4', lastPushedAt: '2026-02-25T07:00:00Z' },
};

const mockSplitConfigs: Record<string, MockSplitScreenConfig> = {
  'screen-1': { screenId: 'screen-1', enabled: true, rightZoneWidthPercent: 30, adPosition: 'right', displayRules: { power_on: true, open_app: true, change_app: false, catalog_open: true }, adDurationSeconds: 20 },
  'screen-2': { screenId: 'screen-2', enabled: true, rightZoneWidthPercent: 25, adPosition: 'right', displayRules: { power_on: true, open_app: false, change_app: false, catalog_open: true }, adDurationSeconds: 15 },
  'screen-5': { screenId: 'screen-5', enabled: false, rightZoneWidthPercent: 30, adPosition: 'right', displayRules: { power_on: false, open_app: false, change_app: false, catalog_open: false }, adDurationSeconds: 20 },
};

export function useUxConfig(screenId: string) {
  return useQuery({
    queryKey: queryKeys.screens.uxConfig(screenId),
    queryFn: async (): Promise<MockUxConfig> => {
      await new Promise((r) => setTimeout(r, 300));
      return mockUxConfigs[screenId] ?? {
        screenId,
        catalogEnabled: true,
        defaultHomeSection: 'iptv' as const,
        language: 'fr' as const,
        adFrequencyMinutes: 5,
        currentVersionOnDevice: 'v1.0',
      };
    },
    enabled: !!screenId,
  });
}

export function useUpdateUxConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<MockUxConfig> & { screenId: string }): Promise<MockUxConfig> => {
      await new Promise((r) => setTimeout(r, 500));
      const existing = mockUxConfigs[data.screenId] ?? { screenId: data.screenId, catalogEnabled: true, defaultHomeSection: 'iptv' as const, language: 'fr' as const, adFrequencyMinutes: 5, currentVersionOnDevice: 'v1.0' };
      const updated = { ...existing, ...data, pendingVersion: `v${Date.now().toString().slice(-3)}` };
      mockUxConfigs[data.screenId] = updated;
      return updated;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.uxConfig(variables.screenId) });
    },
  });
}

export function useSplitScreenConfig(screenId: string) {
  return useQuery({
    queryKey: ['splitScreen', screenId],
    queryFn: async (): Promise<MockSplitScreenConfig> => {
      await new Promise((r) => setTimeout(r, 300));
      return mockSplitConfigs[screenId] ?? {
        screenId,
        enabled: false,
        rightZoneWidthPercent: 30 as const,
        adPosition: 'right' as const,
        displayRules: { power_on: false, open_app: false, change_app: false, catalog_open: false },
        adDurationSeconds: 20,
      };
    },
    enabled: !!screenId,
  });
}

export function useUpdateSplitScreenConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<MockSplitScreenConfig> & { screenId: string }): Promise<MockSplitScreenConfig> => {
      await new Promise((r) => setTimeout(r, 500));
      const existing = mockSplitConfigs[data.screenId] ?? { screenId: data.screenId, enabled: false, rightZoneWidthPercent: 30 as const, adPosition: 'right' as const, displayRules: { power_on: false, open_app: false, change_app: false, catalog_open: false }, adDurationSeconds: 20 };
      const updated = { ...existing, ...data } as MockSplitScreenConfig;
      mockSplitConfigs[data.screenId] = updated;
      return updated;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['splitScreen', variables.screenId] });
    },
  });
}

export function usePushConfig() {
  return useMutation({
    mutationFn: async (_data: { screenId: string; deviceId: string }): Promise<void> => {
      await new Promise((r) => setTimeout(r, 1000));
    },
  });
}
