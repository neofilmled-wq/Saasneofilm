'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/api';

export interface TvStreamSource {
  id: string;
  partnerOrgId: string;
  partnerName: string;
  url: string;
  isGlobal: boolean;
  channelName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateTvStreamInput {
  url: string;
  isGlobal: boolean;
  channelName?: string | null;
}

interface UpdateTvStreamInput {
  id: string;
  data: Partial<CreateTvStreamInput>;
}

export function useTvStreams(orgId: string) {
  return useQuery({
    queryKey: queryKeys.tvStreams.list(orgId),
    queryFn: async (): Promise<TvStreamSource[]> => {
      const res: any = await apiFetch(`/partner/tv-streams?orgId=${orgId}`);
      return res?.data ?? res ?? [];
    },
    enabled: !!orgId,
  });
}

export function useCreateTvStream(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTvStreamInput): Promise<TvStreamSource> => {
      const res: any = await apiFetch('/partner/tv-streams', {
        method: 'POST',
        body: JSON.stringify({ orgId, ...input }),
      });
      return res?.data ?? res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tvStreams.list(orgId) }),
  });
}

export function useUpdateTvStream(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: UpdateTvStreamInput): Promise<TvStreamSource> => {
      const res: any = await apiFetch(`/partner/tv-streams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res?.data ?? res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tvStreams.list(orgId) }),
  });
}

export function useDeleteTvStream(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiFetch(`/partner/tv-streams/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tvStreams.list(orgId) }),
  });
}
