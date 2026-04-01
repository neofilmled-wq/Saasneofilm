'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getCachedInvoices } from '@/lib/mock-data';

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export function useSubscription() {
  return useQuery({
    queryKey: queryKeys.billing.subscription,
    queryFn: async () => {
      await delay();
      return {
        id: 'sub_mock_001',
        stripeSubscriptionId: 'sub_1234567890',
        status: 'ACTIVE' as const,
        currentPeriodStart: new Date(Date.now() - 15 * 86400000).toISOString(),
        currentPeriodEnd: new Date(Date.now() + 15 * 86400000).toISOString(),
        cancelAtPeriodEnd: false,
        planName: 'Pack 100 TV',
        monthlyPriceCents: 15000,
        currency: 'EUR',
        screensCount: 100,
      };
    },
  });
}

export function useInvoices(filters?: { status?: string; page?: number }) {
  return useQuery({
    queryKey: queryKeys.billing.invoices(filters),
    queryFn: async () => {
      await delay();
      let invoices = getCachedInvoices();
      if (filters?.status) {
        invoices = invoices.filter((i) => i.status === filters.status);
      }
      return {
        data: invoices,
        meta: { total: invoices.length, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      };
    },
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: async (_params: { campaignId: string; packId: string }) => {
      await delay(800);
      return {
        checkoutUrl: `https://checkout.stripe.com/c/pay/mock_session_${Date.now()}`,
        sessionId: `cs_mock_${Date.now()}`,
      };
    },
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: async () => {
      await delay(500);
      return {
        portalUrl: `https://billing.stripe.com/p/session/mock_portal_${Date.now()}`,
      };
    },
  });
}
