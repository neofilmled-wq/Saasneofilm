'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSocket } from '@/providers/socket-provider';
import { queryKeys } from '@/lib/api/query-keys';

interface CampaignStatusEvent {
  campaignId: string;
  oldStatus: string;
  newStatus: string;
  reason?: string;
}

interface MediaTranscodeEvent {
  mediaId: string;
  status: string;
  variants: { resolution: string; url: string }[];
}

interface BillingPaymentFailedEvent {
  subscriptionId: string;
  reason: string;
  nextRetry?: string;
}

interface BookingUpdatedEvent {
  bookingId: string;
  status: string;
}

interface AnalyticsUpdatedEvent {
  campaignId: string;
  newImpressions: number;
}

interface SubscriptionUpdateEvent {
  bookingId: string;
  status: string;
  monthlyAmountEur?: number;
}

interface ScreenFillEvent {
  screenId: string;
  fill: number;
  max: number;
}

export function useRealtimeEvents() {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Campaign status changes
    socket.on('campaign.statusChanged', (data: CampaignStatusEvent) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(data.campaignId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });

      const statusLabels: Record<string, string> = {
        PENDING_REVIEW: 'en attente de révision',
        ACTIVE: 'activée',
        REJECTED: 'rejetée',
        FINISHED: 'terminée',
      };

      const label = statusLabels[data.newStatus] ?? data.newStatus;
      if (data.newStatus === 'REJECTED') {
        toast.error(`Campagne ${label}`, { description: data.reason });
      } else if (data.newStatus === 'ACTIVE') {
        toast.success(`Campagne ${label} !`);
      } else {
        toast.info(`Campagne ${label}`);
      }
    });

    // Media transcode complete
    socket.on('media.transcodeComplete', (data: MediaTranscodeEvent) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.media.status(data.mediaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all });
      toast.success('Média traité avec succès', { description: `${data.variants.length} variante(s) générée(s)` });
    });

    // Billing payment failed
    socket.on('billing.paymentFailed', (data: BillingPaymentFailedEvent) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription });
      toast.error('Échec du paiement', {
        description: data.reason,
        duration: 10000,
        action: {
          label: 'Gérer',
          onClick: () => (window.location.href = '/billing'),
        },
      });
    });

    // Booking updated
    socket.on('booking.updated', (_data: BookingUpdatedEvent) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    });

    // Analytics updated
    socket.on('analytics.updated', (data: AnalyticsUpdatedEvent) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.summary(data.campaignId) });
    });

    // Subscription update (from webhook: invoice.paid, subscription.updated)
    socket.on('advertiser:subscription:update', (_data: SubscriptionUpdateEvent) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
      toast.info('Abonnement mis à jour');
    });

    // Screen fill update (capacity changed)
    socket.on('advertiser:screens:fill', (_data: ScreenFillEvent) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.screens.available() });
    });

    return () => {
      socket.off('campaign.statusChanged');
      socket.off('media.transcodeComplete');
      socket.off('billing.paymentFailed');
      socket.off('booking.updated');
      socket.off('analytics.updated');
      socket.off('advertiser:subscription:update');
      socket.off('advertiser:screens:fill');
    };
  }, [socket, isConnected, queryClient]);
}
