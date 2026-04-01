import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class DisputeHandler {
  private readonly logger = new Logger(DisputeHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * charge.dispute.created — Flag the advertiser org (isFlagged=true),
   * pause all active campaigns, create CRITICAL audit log, create notification.
   */
  async handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    this.logger.log(`Processing charge.dispute.created: ${dispute.id}`);

    // Resolve the customer from the charge
    const chargeCustomerId = await this.resolveCustomerFromDispute(dispute);

    if (!chargeCustomerId) {
      this.logger.warn(
        `Cannot resolve customer for dispute ${dispute.id}, skipping`,
      );
      return;
    }

    const stripeCustomer = await this.prisma.stripeCustomer.findUnique({
      where: { stripeCustomerId: chargeCustomerId },
      include: { organization: true },
    });

    if (!stripeCustomer) {
      this.logger.warn(
        `StripeCustomer not found for ${chargeCustomerId}, skipping dispute`,
      );
      return;
    }

    const org = stripeCustomer.organization;

    // 1. Flag the organization
    await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        isFlagged: true,
        flaggedAt: new Date(),
        flagReason: `Stripe dispute: ${dispute.reason ?? 'unknown'} (${dispute.id})`,
      },
    });

    this.logger.log(
      `Organization ${org.id} (${org.name}) flagged due to dispute`,
    );

    // 2. Pause all active campaigns for this organization
    const activeCampaigns = await this.prisma.campaign.findMany({
      where: {
        advertiserOrgId: org.id,
        status: 'ACTIVE',
      },
    });

    if (activeCampaigns.length > 0) {
      await this.prisma.campaign.updateMany({
        where: {
          advertiserOrgId: org.id,
          status: 'ACTIVE',
        },
        data: { status: 'FINISHED' },
      });

      this.logger.log(
        `Paused ${activeCampaigns.length} active campaigns for org ${org.id}`,
      );
    }

    // 3. Create CRITICAL audit log
    await this.audit.log({
      action: 'DISPUTE_CREATED',
      entity: 'Organization',
      entityId: org.id,
      newData: {
        disputeId: dispute.id,
        reason: dispute.reason,
        amount: dispute.amount,
        currency: dispute.currency,
        status: dispute.status,
        campaignsPaused: activeCampaigns.map((c) => c.id),
      },
      severity: 'CRITICAL',
    });

    // 4. Create notifications for org members
    const members = await this.prisma.membership.findMany({
      where: {
        organizationId: org.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
      select: { userId: true },
    });

    const notifications = members.map((member) => ({
      channel: 'IN_APP' as const,
      type: 'DISPUTE_CREATED',
      title: 'Payment Dispute Received',
      message:
        `A payment dispute has been filed against your organization. ` +
        `All active campaigns have been paused pending resolution. ` +
        `Reason: ${dispute.reason ?? 'unknown'}. Amount: ${(dispute.amount / 100).toFixed(2)} ${(dispute.currency ?? 'EUR').toUpperCase()}.`,
      userId: member.userId,
      data: {
        disputeId: dispute.id,
        organizationId: org.id,
        reason: dispute.reason,
        amount: dispute.amount,
        currency: dispute.currency,
      },
    }));

    if (notifications.length > 0) {
      await this.prisma.notification.createMany({ data: notifications });
      this.logger.log(
        `Created ${notifications.length} dispute notifications for org ${org.id}`,
      );
    }
  }

  /**
   * charge.dispute.closed — If won: unflag org, create audit log.
   * If lost: keep flagged, create audit log.
   */
  async handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
    this.logger.log(
      `Processing charge.dispute.closed: ${dispute.id} (status: ${dispute.status})`,
    );

    const chargeCustomerId = await this.resolveCustomerFromDispute(dispute);

    if (!chargeCustomerId) {
      this.logger.warn(
        `Cannot resolve customer for closed dispute ${dispute.id}, skipping`,
      );
      return;
    }

    const stripeCustomer = await this.prisma.stripeCustomer.findUnique({
      where: { stripeCustomerId: chargeCustomerId },
      include: { organization: true },
    });

    if (!stripeCustomer) {
      this.logger.warn(
        `StripeCustomer not found for ${chargeCustomerId}, skipping closed dispute`,
      );
      return;
    }

    const org = stripeCustomer.organization;
    const isWon = dispute.status === 'won';

    if (isWon) {
      // Dispute won: unflag organization
      await this.prisma.organization.update({
        where: { id: org.id },
        data: {
          isFlagged: false,
          flaggedAt: null,
          flagReason: null,
        },
      });

      this.logger.log(
        `Organization ${org.id} unflagged after winning dispute ${dispute.id}`,
      );

      await this.audit.log({
        action: 'DISPUTE_WON',
        entity: 'Organization',
        entityId: org.id,
        newData: {
          disputeId: dispute.id,
          reason: dispute.reason,
          amount: dispute.amount,
          currency: dispute.currency,
          status: dispute.status,
        },
        severity: 'INFO',
      });
    } else {
      // Dispute lost: keep flagged
      this.logger.log(
        `Organization ${org.id} remains flagged after losing dispute ${dispute.id}`,
      );

      await this.audit.log({
        action: 'DISPUTE_LOST',
        entity: 'Organization',
        entityId: org.id,
        newData: {
          disputeId: dispute.id,
          reason: dispute.reason,
          amount: dispute.amount,
          currency: dispute.currency,
          status: dispute.status,
        },
        severity: 'CRITICAL',
      });
    }
  }

  /**
   * Resolve the Stripe customer ID from a dispute object.
   * The customer is typically on the charge object within the dispute.
   */
  private async resolveCustomerFromDispute(
    dispute: Stripe.Dispute,
  ): Promise<string | null> {
    // dispute.charge can be a string (charge ID) or a Charge object
    const charge = dispute.charge;
    if (!charge) return null;

    if (typeof charge === 'string') {
      // We cannot expand the charge without the Stripe API,
      // but the dispute also carries payment_intent which may have customer
      const paymentIntent = dispute.payment_intent;
      if (paymentIntent && typeof paymentIntent !== 'string') {
        const customer = paymentIntent.customer;
        if (typeof customer === 'string') return customer;
        if (customer?.id) return customer.id;
      }
      // Fallback: look for customer in dispute metadata or evidence
      return null;
    }

    // charge is an expanded Charge object
    const customer = charge.customer;
    if (typeof customer === 'string') return customer;
    if (customer?.id) return customer.id;

    return null;
  }
}
