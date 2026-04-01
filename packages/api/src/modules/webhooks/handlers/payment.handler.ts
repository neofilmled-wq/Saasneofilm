import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class PaymentHandler {
  private readonly logger = new Logger(PaymentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * payment_intent.succeeded — Upsert StripePayment with SUCCEEDED status.
   * If the related subscription was PAST_DUE, trigger auto-resume of booking/campaign.
   */
  async handlePaymentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(
      `Processing payment_intent.succeeded: ${paymentIntent.id}`,
    );

    const customerId =
      typeof paymentIntent.customer === 'string'
        ? paymentIntent.customer
        : paymentIntent.customer?.id;

    const stripeCustomer = customerId
      ? await this.prisma.stripeCustomer.findUnique({
          where: { stripeCustomerId: customerId },
        })
      : null;

    if (!stripeCustomer) {
      this.logger.warn(
        `StripeCustomer not found for ${customerId}, skipping payment ${paymentIntent.id}`,
      );
      return;
    }

    // Resolve invoice reference
    const stripeInvoiceId =
      typeof (paymentIntent as any).invoice === 'string'
        ? (paymentIntent as any).invoice
        : (paymentIntent as any).invoice?.id;

    let invoiceRecord: { id: string } | null = null;
    if (stripeInvoiceId) {
      invoiceRecord = await this.prisma.stripeInvoice.findUnique({
        where: { stripeInvoiceId },
        select: { id: true },
      });
    }

    // Resolve payment method
    const paymentMethodId =
      typeof paymentIntent.payment_method === 'string'
        ? paymentIntent.payment_method
        : paymentIntent.payment_method?.id ?? null;

    await this.prisma.stripePayment.upsert({
      where: { stripePaymentIntentId: paymentIntent.id },
      create: {
        stripePaymentIntentId: paymentIntent.id,
        status: 'SUCCEEDED',
        amountCents: paymentIntent.amount,
        currency: (paymentIntent.currency ?? 'eur').toUpperCase(),
        paymentMethod: paymentMethodId,
        customerId: stripeCustomer.id,
        invoiceId: invoiceRecord?.id ?? null,
      },
      update: {
        status: 'SUCCEEDED',
        amountCents: paymentIntent.amount,
        paymentMethod: paymentMethodId,
        failureCode: null,
        failureMessage: null,
      },
    });

    this.logger.log(
      `Payment ${paymentIntent.id} recorded as SUCCEEDED`,
    );

    // Auto-resume logic: if linked subscription was PAST_DUE
    if (stripeInvoiceId) {
      await this.checkAndAutoResume(stripeInvoiceId);
    }
  }

  /**
   * payment_intent.payment_failed — Upsert StripePayment with FAILED status,
   * store failureCode and failureMessage.
   */
  async handlePaymentFailed(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(
      `Processing payment_intent.payment_failed: ${paymentIntent.id}`,
    );

    const customerId =
      typeof paymentIntent.customer === 'string'
        ? paymentIntent.customer
        : paymentIntent.customer?.id;

    const stripeCustomer = customerId
      ? await this.prisma.stripeCustomer.findUnique({
          where: { stripeCustomerId: customerId },
        })
      : null;

    if (!stripeCustomer) {
      this.logger.warn(
        `StripeCustomer not found for ${customerId}, skipping failed payment ${paymentIntent.id}`,
      );
      return;
    }

    // Resolve invoice reference
    const stripeInvoiceId =
      typeof (paymentIntent as any).invoice === 'string'
        ? (paymentIntent as any).invoice
        : (paymentIntent as any).invoice?.id;

    let invoiceRecord: { id: string } | null = null;
    if (stripeInvoiceId) {
      invoiceRecord = await this.prisma.stripeInvoice.findUnique({
        where: { stripeInvoiceId },
        select: { id: true },
      });
    }

    const lastError = paymentIntent.last_payment_error;
    const failureCode = lastError?.code ?? null;
    const failureMessage = lastError?.message ?? null;

    const paymentMethodId =
      typeof paymentIntent.payment_method === 'string'
        ? paymentIntent.payment_method
        : paymentIntent.payment_method?.id ?? null;

    await this.prisma.stripePayment.upsert({
      where: { stripePaymentIntentId: paymentIntent.id },
      create: {
        stripePaymentIntentId: paymentIntent.id,
        status: 'FAILED',
        amountCents: paymentIntent.amount,
        currency: (paymentIntent.currency ?? 'eur').toUpperCase(),
        paymentMethod: paymentMethodId,
        customerId: stripeCustomer.id,
        invoiceId: invoiceRecord?.id ?? null,
        failureCode,
        failureMessage,
      },
      update: {
        status: 'FAILED',
        failureCode,
        failureMessage,
      },
    });

    this.logger.log(
      `Payment ${paymentIntent.id} recorded as FAILED (code: ${failureCode})`,
    );

    await this.audit.log({
      action: 'PAYMENT_FAILED',
      entity: 'StripePayment',
      entityId: paymentIntent.id,
      newData: {
        amountCents: paymentIntent.amount,
        failureCode,
        failureMessage,
      },
      severity: 'WARN',
    });
  }

  /**
   * If the invoice is linked to a subscription that was PAST_DUE,
   * auto-resume the related booking and campaign.
   */
  private async checkAndAutoResume(
    stripeInvoiceId: string,
  ): Promise<void> {
    // We need to find the subscription via the Stripe invoice
    // The subscription link is typically on the invoice object in our DB
    // We look for a booking linked to this invoice's subscription
    const invoice = await this.prisma.stripeInvoice.findUnique({
      where: { stripeInvoiceId },
      select: { id: true },
    });

    if (!invoice) return;

    // Find subscriptions that are PAST_DUE for this customer's org
    // The link from invoice -> subscription is via Stripe metadata
    // We check all PAST_DUE bookings for the same org
    const pastDueBookings = await this.prisma.booking.findMany({
      where: {
        status: 'PAUSED',
        resumePolicy: 'AUTO_RESUME',
        stripeSubscriptionId: { not: null },
      },
      include: {
        campaign: true,
      },
    });

    for (const booking of pastDueBookings) {
      if (!booking.stripeSubscriptionId) continue;

      const subscription = await this.prisma.stripeSubscription.findUnique({
        where: { stripeSubscriptionId: booking.stripeSubscriptionId },
      });

      // Only resume if the subscription is now ACTIVE
      if (subscription && subscription.status === 'ACTIVE') {
        await this.prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'ACTIVE' },
        });

        this.logger.log(
          `Booking ${booking.id} auto-resumed after successful payment`,
        );

        if (booking.campaign && booking.campaign.status === 'FINISHED') {
          await this.prisma.campaign.update({
            where: { id: booking.campaign.id },
            data: { status: 'ACTIVE' },
          });

          this.logger.log(
            `Campaign ${booking.campaign.id} auto-resumed after successful payment`,
          );
        }

        await this.audit.log({
          action: 'BOOKING_AUTO_RESUMED',
          entity: 'Booking',
          entityId: booking.id,
          newData: {
            reason: 'payment_succeeded',
            stripeSubscriptionId: booking.stripeSubscriptionId,
          },
          severity: 'INFO',
        });
      }
    }
  }
}
