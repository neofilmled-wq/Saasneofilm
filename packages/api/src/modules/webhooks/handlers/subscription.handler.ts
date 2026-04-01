import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ScreenFillService } from '../../screens/screen-fill.service';

/**
 * Maps Stripe subscription status strings to our SubscriptionStatus enum.
 */
function mapSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status,
): string {
  const statusMap: Record<string, string> = {
    trialing: 'TRIALING',
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    paused: 'PAUSED',
    canceled: 'CANCELLED',
    unpaid: 'UNPAID',
    incomplete: 'INCOMPLETE',
    incomplete_expired: 'INCOMPLETE',
  };
  return statusMap[stripeStatus] || 'ACTIVE';
}

@Injectable()
export class SubscriptionHandler {
  private readonly logger = new Logger(SubscriptionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly screenFill: ScreenFillService,
  ) {}

  /**
   * customer.subscription.created — Upsert StripeSubscription record.
   */
  async handleSubscriptionCreated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    this.logger.log(
      `Processing subscription.created: ${subscription.id}`,
    );

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;

    const stripeCustomer = await this.prisma.stripeCustomer.findUnique({
      where: { stripeCustomerId: customerId ?? '' },
    });

    if (!stripeCustomer) {
      this.logger.warn(
        `StripeCustomer not found for Stripe customer ${customerId}, skipping subscription ${subscription.id}`,
      );
      return;
    }

    await this.prisma.stripeSubscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        stripeSubscriptionId: subscription.id,
        status: mapSubscriptionStatus(subscription.status) as any,
        currentPeriodStart: new Date(
          (subscription as any).current_period_start * 1000,
        ),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        customerId: stripeCustomer.id,
        organizationId: stripeCustomer.organizationId,
        metadata: subscription.metadata
          ? (subscription.metadata as any)
          : undefined,
      },
      update: {
        status: mapSubscriptionStatus(subscription.status) as any,
        currentPeriodStart: new Date(
          (subscription as any).current_period_start * 1000,
        ),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        metadata: subscription.metadata
          ? (subscription.metadata as any)
          : undefined,
      },
    });

    this.logger.log(`Subscription ${subscription.id} upserted`);
  }

  /**
   * customer.subscription.updated — Update status, period dates, cancelAtPeriodEnd.
   * If status changes from PAST_DUE to ACTIVE, check Booking.resumePolicy and
   * auto-resume if configured.
   */
  async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    this.logger.log(
      `Processing subscription.updated: ${subscription.id}`,
    );

    const existing = await this.prisma.stripeSubscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!existing) {
      this.logger.warn(
        `Subscription ${subscription.id} not found locally, creating via upsert`,
      );
      await this.handleSubscriptionCreated(subscription);
      return;
    }

    const previousStatus = existing.status;
    const newStatus = mapSubscriptionStatus(subscription.status);

    await this.prisma.stripeSubscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: newStatus as any,
        currentPeriodStart: new Date(
          (subscription as any).current_period_start * 1000,
        ),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        metadata: subscription.metadata
          ? (subscription.metadata as any)
          : undefined,
      },
    });

    this.logger.log(
      `Subscription ${subscription.id} updated: ${previousStatus} -> ${newStatus}`,
    );

    // Auto-resume logic: PAST_DUE -> ACTIVE
    if (previousStatus === 'PAST_DUE' && newStatus === 'ACTIVE') {
      await this.handleAutoResume(subscription.id);
    }
  }

  /**
   * customer.subscription.deleted — Mark subscription CANCELLED,
   * Booking -> CANCELLED, Campaign -> COMPLETED.
   */
  async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    this.logger.log(
      `Processing subscription.deleted: ${subscription.id}`,
    );

    const existing = await this.prisma.stripeSubscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!existing) {
      this.logger.warn(
        `Subscription ${subscription.id} not found locally, cannot process deletion`,
      );
      return;
    }

    await this.prisma.stripeSubscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: { status: 'CANCELLED' },
    });

    this.logger.log(`Subscription ${subscription.id} marked as CANCELLED`);

    // Cancel related booking and complete campaign
    const booking = await this.prisma.booking.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      include: { campaign: true },
    });

    if (booking) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED' },
      });

      this.logger.log(
        `Booking ${booking.id} cancelled due to subscription deletion`,
      );

      if (
        booking.campaign &&
        booking.campaign.status !== 'FINISHED'
      ) {
        await this.prisma.campaign.update({
          where: { id: booking.campaign.id },
          data: { status: 'FINISHED' },
        });

        this.logger.log(
          `Campaign ${booking.campaign.id} marked FINISHED due to subscription deletion`,
        );
      }

      await this.audit.log({
        action: 'SUBSCRIPTION_CANCELLED',
        entity: 'Booking',
        entityId: booking.id,
        newData: {
          stripeSubscriptionId: subscription.id,
          reason: 'subscription_deleted',
        },
        severity: 'WARN',
      });

      // Recalculate screen fill after booking cancellation (capacity frees up)
      void this.screenFill.recalculateForBooking(booking.id);
    }
  }

  /**
   * When a subscription transitions from PAST_DUE to ACTIVE,
   * check the related booking's resumePolicy and auto-resume if applicable.
   */
  private async handleAutoResume(
    stripeSubscriptionId: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { stripeSubscriptionId },
      include: { campaign: true },
    });

    if (!booking) {
      this.logger.log(
        `No booking found for subscription ${stripeSubscriptionId}, skipping auto-resume`,
      );
      return;
    }

    if (
      booking.status !== 'PAUSED' ||
      booking.resumePolicy !== 'AUTO_RESUME'
    ) {
      this.logger.log(
        `Booking ${booking.id} not eligible for auto-resume (status=${booking.status}, policy=${booking.resumePolicy})`,
      );
      return;
    }

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'ACTIVE' },
    });

    this.logger.log(`Booking ${booking.id} auto-resumed`);

    if (booking.campaign && booking.campaign.status === 'FINISHED') {
      await this.prisma.campaign.update({
        where: { id: booking.campaign.id },
        data: { status: 'ACTIVE' },
      });

      this.logger.log(
        `Campaign ${booking.campaign.id} auto-resumed`,
      );
    }

    await this.audit.log({
      action: 'BOOKING_AUTO_RESUMED',
      entity: 'Booking',
      entityId: booking.id,
      newData: {
        stripeSubscriptionId,
        resumePolicy: booking.resumePolicy,
      },
      severity: 'INFO',
    });
  }
}
