import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { STRIPE_CLIENT } from '../billing/billing.module';
import { CheckoutHandler } from './handlers/checkout.handler';
import { InvoiceHandler } from './handlers/invoice.handler';
import { SubscriptionHandler } from './handlers/subscription.handler';
import { PaymentHandler } from './handlers/payment.handler';
import { DisputeHandler } from './handlers/dispute.handler';
import { ConnectHandler } from './handlers/connect.handler';

@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);
  private readonly webhookSecret: string;
  private readonly connectWebhookSecret: string;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly checkoutHandler: CheckoutHandler,
    private readonly invoiceHandler: InvoiceHandler,
    private readonly subscriptionHandler: SubscriptionHandler,
    private readonly paymentHandler: PaymentHandler,
    private readonly disputeHandler: DisputeHandler,
    private readonly connectHandler: ConnectHandler,
  ) {
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', 'whsec_placeholder');
    this.connectWebhookSecret = this.config.get<string>('STRIPE_CONNECT_WEBHOOK_SECRET', '');
  }

  /**
   * Verify Stripe signature and construct the event object.
   */
  verifyAndConstruct(rawBody: Buffer, signature: string, isConnect = false): Stripe.Event {
    const secret = isConnect && this.connectWebhookSecret
      ? this.connectWebhookSecret
      : this.webhookSecret;

    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Webhook signature verification failed: ${message}`);
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  /**
   * Process a verified Stripe webhook event with idempotency.
   *
   * Uses StripeWebhookEvent table to ensure each event is processed at most once.
   * Failed processing is recorded but the HTTP response is still 200 to prevent
   * Stripe from retrying indefinitely.
   */
  async processEvent(event: Stripe.Event): Promise<{ received: boolean }> {
    const { id: stripeEventId, type: eventType } = event;

    // Idempotency check: skip if already processed
    const existing = await this.prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId },
    });

    if (existing?.processed) {
      this.logger.log(`Event ${stripeEventId} already processed, skipping`);
      return { received: true };
    }

    // Record the event (upsert for retry safety)
    await this.prisma.stripeWebhookEvent.upsert({
      where: { stripeEventId },
      create: {
        stripeEventId,
        eventType,
        payload: event as any,
        processed: false,
        retryCount: 0,
      },
      update: {
        retryCount: { increment: 1 },
      },
    });

    try {
      await this.routeEvent(event);

      // Mark as processed
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      this.logger.log(`Event ${stripeEventId} (${eventType}) processed successfully`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to process event ${stripeEventId} (${eventType}): ${message}`,
      );

      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId },
        data: {
          failureReason: message,
        },
      });
    }

    return { received: true };
  }

  /**
   * Route a Stripe event to the appropriate handler.
   */
  private async routeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      // Checkout
      case 'checkout.session.completed':
        await this.checkoutHandler.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      // Invoice
      case 'invoice.created':
        await this.invoiceHandler.handleInvoiceCreated(
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'invoice.finalized':
        await this.invoiceHandler.handleInvoiceFinalized(
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'invoice.paid':
        await this.invoiceHandler.handleInvoicePaid(
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'invoice.payment_failed':
        await this.invoiceHandler.handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
        );
        break;

      // Subscription
      case 'customer.subscription.created':
        await this.subscriptionHandler.handleSubscriptionCreated(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'customer.subscription.updated':
        await this.subscriptionHandler.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'customer.subscription.deleted':
        await this.subscriptionHandler.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      // Payment intent
      case 'payment_intent.succeeded':
        await this.paymentHandler.handlePaymentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
        break;
      case 'payment_intent.payment_failed':
        await this.paymentHandler.handlePaymentFailed(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      // Disputes
      case 'charge.dispute.created':
        await this.disputeHandler.handleDisputeCreated(
          event.data.object as Stripe.Dispute,
        );
        break;
      case 'charge.dispute.closed':
        await this.disputeHandler.handleDisputeClosed(
          event.data.object as Stripe.Dispute,
        );
        break;

      // Connect
      case 'account.updated':
        await this.connectHandler.handleAccountUpdated(
          event.data.object as Stripe.Account,
        );
        break;
      case 'transfer.created':
        await this.connectHandler.handleTransferCreated(
          event.data.object as Stripe.Transfer,
        );
        break;
      case 'payout.paid':
        await this.connectHandler.handlePayoutPaid(
          event.data.object as Stripe.Payout,
        );
        break;
      case 'payout.failed':
        await this.connectHandler.handlePayoutFailed(
          event.data.object as Stripe.Payout,
        );
        break;

      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }
}
