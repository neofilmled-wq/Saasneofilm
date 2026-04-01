import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class CheckoutHandler {
  private readonly logger = new Logger(CheckoutHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * checkout.session.completed — Extract bookingId from session metadata,
   * activate booking, create StripeSubscription record, link booking to
   * subscription, activate linked campaign. All in a DB transaction.
   */
  async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    this.logger.log(
      `Processing checkout.session.completed: ${session.id}`,
    );

    const bookingId = session.metadata?.bookingId;

    if (!bookingId) {
      this.logger.warn(
        `Checkout session ${session.id} has no bookingId in metadata, skipping`,
      );
      return;
    }

    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;

    if (!stripeSubscriptionId) {
      this.logger.warn(
        `Checkout session ${session.id} has no subscription, skipping`,
      );
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Find the booking
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { campaign: true },
      });

      if (!booking) {
        this.logger.warn(`Booking ${bookingId} not found, skipping checkout`);
        return;
      }

      // 2. Resolve StripeCustomer
      const stripeCustomer = customerId
        ? await tx.stripeCustomer.findUnique({
            where: { stripeCustomerId: customerId },
          })
        : null;

      if (!stripeCustomer) {
        this.logger.warn(
          `StripeCustomer not found for ${customerId}, cannot create subscription record`,
        );
        return;
      }

      // 3. Create/upsert StripeSubscription record
      await tx.stripeSubscription.upsert({
        where: { stripeSubscriptionId },
        create: {
          stripeSubscriptionId,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days fallback
          ),
          cancelAtPeriodEnd: false,
          customerId: stripeCustomer.id,
          organizationId: stripeCustomer.organizationId,
          metadata: {
            bookingId,
            checkoutSessionId: session.id,
          },
        },
        update: {
          status: 'ACTIVE',
          metadata: {
            bookingId,
            checkoutSessionId: session.id,
          },
        },
      });

      this.logger.log(
        `StripeSubscription ${stripeSubscriptionId} created/updated`,
      );

      // 4. Activate the booking and link to subscription
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'ACTIVE',
          stripeSubscriptionId,
          stripeCheckoutSessionId: session.id,
        },
      });

      this.logger.log(`Booking ${bookingId} activated`);

      // 5. Activate the linked campaign
      if (booking.campaign) {
        const activatableStatuses = [
          'PENDING_REVIEW',
          'FINISHED',
        ];

        if (activatableStatuses.includes(booking.campaign.status)) {
          await tx.campaign.update({
            where: { id: booking.campaign.id },
            data: { status: 'ACTIVE' },
          });

          this.logger.log(
            `Campaign ${booking.campaign.id} activated via checkout`,
          );
        }
      }

      // 6. Audit
      await this.audit.log({
        action: 'CHECKOUT_COMPLETED',
        entity: 'Booking',
        entityId: bookingId,
        newData: {
          checkoutSessionId: session.id,
          stripeSubscriptionId,
          stripeCustomerId: customerId,
          campaignId: booking.campaignId,
        },
        severity: 'INFO',
      });
    });

    this.logger.log(
      `Checkout session ${session.id} fully processed for booking ${bookingId}`,
    );
  }
}
