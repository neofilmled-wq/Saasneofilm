'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

interface MediaFilters {
  type?: 'VIDEO' | 'IMAGE';
  status?: string;
  page?: number;
  limit?: number;
}

export function useMediaLibrary(filters: MediaFilters = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.media.list({ ...filters, orgId: user?.orgId }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (user?.orgId) params.set('advertiserOrgId', user.orgId);
      if (filters.type) params.set('type', filters.type);
      if (filters.status) params.set('status', filters.status);
      params.set('page', String(filters.page ?? 1));
      params.set('limit', String(filters.limit ?? 50));
      // res = { data: creatives[], total, page, limit, totalPages } after apiFetch unwrap
      const res = await apiFetch(`/creatives?${params}`);
      const creatives: any[] = Array.isArray(res?.data) ? res.data : [];
      return {
        data: creatives.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type as 'VIDEO' | 'IMAGE',
          status: c.status as string,
          fileUrl: c.fileUrl,
          thumbnailUrl: c.fileUrl, // use fileUrl as thumbnail until CDN thumbnails are generated
          fileSizeBytes: c.fileSizeBytes ?? 0,
          durationMs: c.durationMs ?? 0,
          width: c.width ?? 1920,
          height: c.height ?? 1080,
          mimeType: c.mimeType ?? '',
          campaignId: c.campaignId ?? '',
          createdAt: c.createdAt,
        })),
        meta: {
          total: res?.total ?? 0,
          page: res?.page ?? 1,
          limit: res?.limit ?? 50,
          totalPages: res?.totalPages ?? 1,
        },
      };
    },
    enabled: !!user,
  });
}

export function usePresignUpload() {
  return useMutation({
    mutationFn: (params: { fileName: string; mimeType: string; sizeBytes: number }) =>
      apiFetch('/storage/presign', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  });
}

export function useCompleteUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { mediaId: string; fileHash: string }) =>
      apiFetch(`/creatives/${params.mediaId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ fileHash: params.fileHash }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all });
    },
  });
}

export function useMediaStatus(mediaId: string) {
  return useQuery({
    queryKey: queryKeys.media.status(mediaId),
    queryFn: () => apiFetch(`/creatives/${mediaId}`),
    enabled: !!mediaId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'READY' ? false : 5000;
    },
  });
}
