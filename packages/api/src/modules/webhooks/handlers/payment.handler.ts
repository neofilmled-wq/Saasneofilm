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
    // Auto-resume of a PAUSED booking is handled by invoice.paid, which is the
    // event that actually carries the subscription/booking link.
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
}
