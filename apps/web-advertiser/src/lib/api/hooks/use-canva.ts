'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { apiFetch } from '../../api';

// ──────────────────────────────────────────────────────────────────────────
// Connection status
// ──────────────────────────────────────────────────────────────────────────

export function useCanvaStatus() {
  return useQuery({
    queryKey: queryKeys.canva.status(),
    queryFn: () =>
      apiFetch<{ connected: boolean; providerUserId?: string }>(
        '/integrations/canva/status',
      ),
    retry: false,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Connect / Disconnect
// ──────────────────────────────────────────────────────────────────────────

export function useCanvaConnect() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    isLoading,
    error,
    connect: async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { url } = await apiFetch<{ url: string }>('/integrations/canva/connect');
        window.location.href = url;
      } catch (err: any) {
        setIsLoading(false);
        const message = err?.message?.includes('API error')
          ? 'Le serveur API n\'est pas accessible. Vérifiez que le backend est lancé.'
          : err?.message || 'Impossible de se connecter à Canva';
        setError(message);
      }
    },
  };
}

export function useCanvaDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch('/integrations/canva/disconnect', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.canva.all });
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Designs
// ──────────────────────────────────────────────────────────────────────────

export interface CanvaDesign {
  id: string;
  canvaDesignId: string;
  title: string | null;
  editUrl: string | null;
  thumbnailUrl: string | null;
  lastExportedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useCanvaDesigns() {
  return useQuery({
    queryKey: queryKeys.canva.designs(),
    queryFn: () => apiFetch<CanvaDesign[]>('/canva/designs'),
  });
}

export function useCreateCanvaDesign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { title: string; width: number; height: number }) =>
      apiFetch<CanvaDesign>('/canva/designs', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.canva.designs() });
    },
  });
}

export function useSyncCanvaDesigns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<CanvaDesign[]>('/canva/designs/sync', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.canva.designs() });
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────────────────────

interface ExportStartResult {
  exportId: string;
  status: string;
}

interface ExportStatusResult {
  status: string;
  urls: string[] | null;
  error: { code: string } | null;
}

interface ImportResult {
  creativeId: string;
  fileUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  canvaDesignId: string;
  campaignId: string | null;
}

export function useExportCanvaDesign() {
  return useMutation({
    mutationFn: (params: {
      canvaDesignId: string;
      format: 'png' | 'jpg' | 'mp4';
      quality?: string;
      width?: number;
      height?: number;
    }) => {
      const { canvaDesignId, ...body } = params;
      return apiFetch<ExportStartResult>(
        `/canva/designs/${canvaDesignId}/export`,
        { method: 'POST', body: JSON.stringify(body) },
      );
    },
  });
}

export function useCanvaExportStatus(
  canvaDesignId: string,
  exportId: string,
  enabled = false,
) {
  return useQuery({
    queryKey: queryKeys.canva.exportStatus(canvaDesignId, exportId),
    queryFn: () =>
      apiFetch<ExportStatusResult>(
        `/canva/designs/${canvaDesignId}/export-status/${exportId}`,
      ),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      return data.status === 'success' || data.status === 'failed' ? false : 2000;
    },
  });
}

export function useImportCanvaExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      canvaDesignId: string;
      exportId: string;
      format: string;
      campaignId?: string;
    }) =>
      apiFetch<ImportResult>(
        `/canva/designs/${params.canvaDesignId}/import/${params.exportId}?format=${params.format}${params.campaignId ? `&campaignId=${params.campaignId}` : ''}`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.canva.designs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all });
    },
  });
}
