import { Injectable, Logger, Optional } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AdminGateway } from '../../admin/admin.gateway';
import { PartnerGateway } from '../../partner-gateway/partner.gateway';
import { AdvertiserGateway } from '../../advertiser-gateway/advertiser.gateway';

@Injectable()
export class InvoiceHandler {
  private readonly logger = new Logger(InvoiceHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly adminGateway?: AdminGateway,
    @Optional() private readonly partnerGateway?: PartnerGateway,
    @Optional() private readonly advertiserGateway?: AdvertiserGateway,
  ) {}

  /**
   * invoice.created — Upsert StripeInvoice with DRAFT status.
   */
  async handleInvoiceCreated(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Processing invoice.created: ${invoice.id}`);

    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    const stripeCustomer = await this.prisma.stripeCustomer.findUnique({
      where: { stripeCustomerId: customerId ?? '' },
    });

    if (!stripeCustomer) {
      this.logger.warn(
        `StripeCustomer not found for Stripe customer ${customerId}, skipping invoice ${invoice.id}`,
      );
      return;
    }

    await this.prisma.stripeInvoice.upsert({
      where: { stripeInvoiceId: invoice.id },
      create: {
        stripeInvoiceId: invoice.id,
        invoiceNumber: invoice.number ?? null,
        status: 'DRAFT',
        amountDueCents: invoice.amount_due,
        amountPaidCents: invoice.amount_paid,
        currency: (invoice.currency ?? 'eur').toUpperCase(),
        periodStart: new Date((invoice.period_start ?? 0) * 1000),
        periodEnd: new Date((invoice.period_end ?? 0) * 1000),
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
        hostedUrl: invoice.hosted_invoice_url ?? null,
        pdfUrl: invoice.invoice_pdf ?? null,
        customerId: stripeCustomer.id,
        organizationId: stripeCustomer.organizationId,
        lineItems: invoice.lines?.data
          ? (invoice.lines.data as unknown as any)
          : undefined,
      },
      update: {
        invoiceNumber: invoice.number ?? null,
        amountDueCents: invoice.amount_due,
        amountPaidCents: invoice.amount_paid,
        hostedUrl: invoice.hosted_invoice_url ?? null,
        pdfUrl: invoice.invoice_pdf ?? null,
      },
    });

    this.logger.log(`Invoice ${invoice.id} upserted as DRAFT`);
  }

  /**
   * invoice.finalized — Update invoice status to OPEN.
   */
  async handleInvoiceFinalized(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Processing invoice.finalized: ${invoice.id}`);

    const existing = await this.prisma.stripeInvoice.findUnique({
      where: { stripeInvoiceId: invoice.id },
    });

    if (!existing) {
      this.logger.warn(
        `Invoice ${invoice.id} not found in database, creating it first`,
      );
      await this.handleInvoiceCreated(invoice);
    }

    await this.prisma.stripeInvoice.update({
      where: { stripeInvoiceId: invoice.id },
      data: {
        status: 'OPEN',
        invoiceNumber: invoice.number ?? undefined,
        hostedUrl: invoice.hosted_invoice_url ?? undefined,
        pdfUrl: invoice.invoice_pdf ?? undefined,
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : undefined,
      },
    });

    this.logger.log(`Invoice ${invoice.id} updated to OPEN`);
  }

  /**
   * invoice.paid — Update to PAID, set paidAt, update amountPaidCents.
   * Find related subscription -> booking, log audit entry.
   */
  async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Processing invoice.paid: ${invoice.id}`);

    const existing = await this.prisma.stripeInvoice.findUnique({
      where: { stripeInvoiceId: invoice.id },
    });

    if (!existing) {
      this.logger.warn(
        `Invoice ${invoice.id} not found in database, creating it first`,
      );
      await this.handleInvoiceCreated(invoice);
    }

    const updatedInvoice = await this.prisma.stripeInvoice.update({
      where: { stripeInvoiceId: invoice.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        amountPaidCents: invoice.amount_paid,
        hostedUrl: invoice.hosted_invoice_url ?? undefined,
        pdfUrl: invoice.invoice_pdf ?? undefined,
      },
    });

    // Find related subscription and booking
    const stripeSubscriptionId =
      typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;

    if (stripeSubscriptionId) {
      const subscription = await this.prisma.stripeSubscription.findUnique({
        where: { stripeSubscriptionId },
      });

      if (subscription) {
        const booking = await this.prisma.booking.findUnique({
          where: { stripeSubscriptionId },
        });

        if (booking) {
          await this.audit.log({
            action: 'INVOICE_PAID',
            entity: 'Booking',
            entityId: booking.id,
            newData: {
              invoiceId: updatedInvoice.id,
              stripeInvoiceId: invoice.id,
              amountPaidCents: invoice.amount_paid,
              currency: invoice.currency,
            },
            severity: 'INFO',
          });

          // Recalculate screen fills for this booking's screens
          const bookingScreens = await this.prisma.bookingScreen.findMany({
            where: { bookingId: booking.id, removedAt: null },
            select: { screenId: true },
          });

          for (const bs of bookingScreens) {
            // Count distinct advertisers on this screen
            const result = await this.prisma.bookingScreen.findMany({
              where: {
                screenId: bs.screenId,
                removedAt: null,
                booking: { status: 'ACTIVE' },
              },
              select: { booking: { select: { advertiserOrgId: true } } },
            });
            const count = new Set(result.map((r) => r.booking.advertiserOrgId)).size;
            await this.prisma.screenFill.upsert({
              where: { screenId: bs.screenId },
              create: { screenId: bs.screenId, activeAdvertiserCount: count },
              update: { activeAdvertiserCount: count },
            });
          }

          // Emit realtime events
          this.advertiserGateway?.emitSubscriptionUpdate(booking.advertiserOrgId, {
            bookingId: booking.id,
            status: booking.status,
            monthlyAmountEur: (booking as any).monthlyAmountEur,
          });
          this.adminGateway?.emitFinanceUpdate();

          // Emit screen fill updates to all interfaces
          for (const bs of bookingScreens) {
            const fill = await this.prisma.screenFill.findUnique({ where: { screenId: bs.screenId } });
            const fillCount = fill?.activeAdvertiserCount ?? 0;
            this.adminGateway?.emitScreenFillUpdate(bs.screenId, fillCount, 40);
            this.advertiserGateway?.emitScreenFillUpdate(bs.screenId, fillCount, 40);
          }

          // Find partner org for this screen and emit partner events
          const partnerScreens = await this.prisma.bookingScreen.findMany({
            where: { bookingId: booking.id, removedAt: null },
            select: { screen: { select: { id: true, partnerOrgId: true } } },
          });
          const partnerOrgs = new Set(partnerScreens.map((ps) => ps.screen.partnerOrgId));
          for (const partnerOrgId of partnerOrgs) {
            this.partnerGateway?.emitWalletUpdate(partnerOrgId);
            for (const ps of partnerScreens.filter((s) => s.screen.partnerOrgId === partnerOrgId)) {
              const fill = await this.prisma.screenFill.findUnique({ where: { screenId: ps.screen.id } });
              this.partnerGateway?.emitScreenFillUpdate(partnerOrgId, ps.screen.id, fill?.activeAdvertiserCount ?? 0, 40);
            }
          }

          this.logger.log(
            `Audit logged + screen fills recalculated + events emitted for paid invoice ${invoice.id} linked to booking ${booking.id}`,
          );
        }
      }
    }

    this.logger.log(`Invoice ${invoice.id} updated to PAID`);
  }

  /**
   * invoice.payment_failed — Find related subscription, update subscription
   * status to PAST_DUE, set Booking to PAUSED, set Campaign to PAUSED,
   * create notification for advertiser.
   */
  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Processing invoice.payment_failed: ${invoice.id}`);

    const stripeSubscriptionId =
      typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;

    if (!stripeSubscriptionId) {
      this.logger.warn(
        `No subscription linked to failed invoice ${invoice.id}`,
      );
      return;
    }

    const subscription = await this.prisma.stripeSubscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      this.logger.warn(
        `StripeSubscription not found for ${stripeSubscriptionId}`,
      );
      return;
    }

    // Update subscription to PAST_DUE
    await this.prisma.stripeSubscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE' },
    });

    this.logger.log(
      `Subscription ${stripeSubscriptionId} marked as PAST_DUE`,
    );

    // Find and pause the booking
    const booking = await this.prisma.booking.findUnique({
      where: { stripeSubscriptionId },
      include: { campaign: true },
    });

    if (booking) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'PAUSED' },
      });

      this.logger.log(`Booking ${booking.id} paused due to payment failure`);

      // Finish the linked campaign due to payment failure
      if (booking.campaign && booking.campaign.status === 'ACTIVE') {
        await this.prisma.campaign.update({
          where: { id: booking.campaign.id },
          data: { status: 'FINISHED' },
        });

        this.logger.log(
          `Campaign ${booking.campaign.id} finished due to payment failure`,
        );
      }

      // Create notification for advertiser org members
      const members = await this.prisma.membership.findMany({
        where: {
          organizationId: booking.advertiserOrgId,
          role: { in: ['OWNER', 'ADMIN'] },
        },
        select: { userId: true },
      });

      const notifications = members.map((member) => ({
        channel: 'IN_APP' as const,
        type: 'PAYMENT_FAILED',
        title: 'Payment Failed',
        message: `Invoice payment failed for booking ${booking.id}. Your campaign has been paused. Please update your payment method.`,
        userId: member.userId,
        data: {
          bookingId: booking.id,
          invoiceId: invoice.id,
          campaignId: booking.campaignId,
        },
      }));

      if (notifications.length > 0) {
        await this.prisma.notification.createMany({ data: notifications });
        this.logger.log(
          `Created ${notifications.length} payment failure notifications`,
        );
      }

      // Recalculate screen fills (advertiser removed from active)
      const bookingScreens = await this.prisma.bookingScreen.findMany({
        where: { bookingId: booking.id, removedAt: null },
        select: { screenId: true, screen: { select: { partnerOrgId: true } } },
      });
      for (const bs of bookingScreens) {
        const result = await this.prisma.bookingScreen.findMany({
          where: { screenId: bs.screenId, removedAt: null, booking: { status: 'ACTIVE' } },
          select: { booking: { select: { advertiserOrgId: true } } },
        });
        const count = new Set(result.map((r) => r.booking.advertiserOrgId)).size;
        await this.prisma.screenFill.upsert({
          where: { screenId: bs.screenId },
          create: { screenId: bs.screenId, activeAdvertiserCount: count },
          update: { activeAdvertiserCount: count },
        });
        this.adminGateway?.emitScreenFillUpdate(bs.screenId, count, 40);
        this.advertiserGateway?.emitScreenFillUpdate(bs.screenId, count, 40);
        this.partnerGateway?.emitScreenFillUpdate(bs.screen.partnerOrgId, bs.screenId, count, 40);
      }

      // Emit subscription update to advertiser
      this.advertiserGateway?.emitSubscriptionUpdate(booking.advertiserOrgId, {
        bookingId: booking.id,
        status: 'PAUSED',
      });
      this.adminGateway?.emitFinanceUpdate();
    }

    await this.audit.log({
      action: 'INVOICE_PAYMENT_FAILED',
      entity: 'StripeInvoice',
      entityId: invoice.id,
      newData: {
        stripeSubscriptionId,
        bookingId: booking?.id,
        amountDueCents: invoice.amount_due,
      },
      severity: 'WARN',
    });
  }
}
