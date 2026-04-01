'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export function useAICredits() {
  return useQuery({
    queryKey: queryKeys.ai.credits,
    queryFn: async () => {
      await delay();
      return {
        balance: 47,
        walletId: 'wal_mock_001',
      };
    },
  });
}

export function useGenerateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (_params: {
      prompt: string;
      businessType: string;
      duration: number;
      creditCost: number;
    }) => {
      await delay(1000);
      return {
        jobId: `job_${Date.now()}`,
        estimatedDurationMs: 30000,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.credits });
    },
  });
}

export function useAIJob(jobId: string) {
  return useQuery({
    queryKey: queryKeys.ai.job(jobId),
    queryFn: async () => {
      await delay(300);
      // Simulate progression
      return {
        jobId,
        status: 'COMPLETED' as const,
        progress: 100,
        resultUrl: `https://storage.neofilm.io/ai/generated_${jobId}.mp4`,
        thumbnailUrl: `https://picsum.photos/seed/${jobId}/640/360`,
        durationMs: 20_000,
      };
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      return query.state.data?.status === 'COMPLETED' ? false : 3000;
    },
  });
}

export function usePurchaseCredits() {
  return useMutation({
    mutationFn: async (_params: { packId: string; credits: number }) => {
      await delay(800);
      return {
        checkoutUrl: `https://checkout.stripe.com/c/pay/ai_credits_${Date.now()}`,
      };
    },
  });
}
