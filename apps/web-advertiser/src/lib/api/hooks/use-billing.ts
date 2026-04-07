'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { apiFetch } from '@/lib/api';

export function useSubscription() {
  return useQuery({
    queryKey: queryKeys.billing.subscription,
    queryFn: () => apiFetch('/billing/subscription'),
  });
}

export function useInvoices(filters?: { status?: string; page?: number }) {
  return useQuery({
    queryKey: queryKeys.billing.invoices(filters),
    queryFn: () => apiFetch(`/invoices?${new URLSearchParams(filters as any).toString()}`),
  });
}

export function useCreateSubscriptionDraft() {
  return useMutation({
    mutationFn: (params: {
      diffusionTvCount?: number;
      catalogueTvCount?: number;
      durationMonths: number;
      screenIds: string[];
      campaignId?: string;
    }) =>
      apiFetch('/billing/subscription-draft', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: (params: {
      bookingId: string;
      successUrl: string;
      cancelUrl: string;
    }) =>
      apiFetch<{ sessionId: string; url: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ portalUrl: string }>('/billing/portal-session', {
        method: 'POST',
      }),
  });
}
