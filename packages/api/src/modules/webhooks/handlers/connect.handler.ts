import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class ConnectHandler {
  private readonly logger = new Logger(ConnectHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * account.updated — Find PartnerPayoutProfile by stripeConnectAccountId,
   * update chargesEnabled, payoutsEnabled, detailsSubmitted.
   */
  async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    this.logger.log(`Processing account.updated: ${account.id}`);

    const profile = await this.prisma.partnerPayoutProfile.findUnique({
      where: { stripeConnectAccountId: account.id },
    });

    if (!profile) {
      this.logger.warn(
        `PartnerPayoutProfile not found for Stripe Connect account ${account.id}`,
      );
      return;
    }

    const oldData = {
      chargesEnabled: profile.chargesEnabled,
      payoutsEnabled: profile.payoutsEnabled,
      detailsSubmitted: profile.detailsSubmitted,
    };

    const updatedProfile = await this.prisma.partnerPayoutProfile.update({
      where: { stripeConnectAccountId: account.id },
      data: {
        chargesEnabled: account.charges_enabled ?? profile.chargesEnabled,
        payoutsEnabled: account.payouts_enabled ?? profile.payoutsEnabled,
        detailsSubmitted:
          account.details_submitted ?? profile.detailsSubmitted,
        onboardedAt:
          account.details_submitted && !profile.onboardedAt
            ? new Date()
            : profile.onboardedAt,
      },
    });

    this.logger.log(
      `PartnerPayoutProfile updated for account ${account.id}: ` +
        `charges=${updatedProfile.chargesEnabled}, ` +
        `payouts=${updatedProfile.payoutsEnabled}, ` +
        `details=${updatedProfile.detailsSubmitted}`,
    );

    await this.audit.log({
      action: 'CONNECT_ACCOUNT_UPDATED',
      entity: 'PartnerPayoutProfile',
      entityId: profile.id,
      orgId: profile.partnerOrgId,
      oldData,
      newData: {
        chargesEnabled: updatedProfile.chargesEnabled,
        payoutsEnabled: updatedProfile.payoutsEnabled,
        detailsSubmitted: updatedProfile.detailsSubmitted,
      },
      severity: 'INFO',
    });
  }

  /**
   * transfer.created — Find Payout by stripeTransferId, update status.
   */
  async handleTransferCreated(transfer: Stripe.Transfer): Promise<void> {
    this.logger.log(`Processing transfer.created: ${transfer.id}`);

    const payout = await this.prisma.payout.findUnique({
      where: { stripeTransferId: transfer.id },
    });

    if (!payout) {
      this.logger.warn(
        `Payout not found for Stripe transfer ${transfer.id}`,
      );
      return;
    }

    await this.prisma.payout.update({
      where: { id: payout.id },
      data: { status: 'PROCESSING' },
    });

    this.logger.log(
      `Payout ${payout.id} updated to PROCESSING for transfer ${transfer.id}`,
    );

    await this.audit.log({
      action: 'TRANSFER_CREATED',
      entity: 'Payout',
      entityId: payout.id,
      orgId: payout.partnerOrgId,
      newData: {
        stripeTransferId: transfer.id,
        amountCents: transfer.amount,
        currency: transfer.currency,
      },
      severity: 'INFO',
    });
  }

  /**
   * payout.paid — Update Payout to PAID status.
   */
  async handlePayoutPaid(stripePayout: Stripe.Payout): Promise<void> {
    this.logger.log(`Processing payout.paid: ${stripePayout.id}`);

    const payout = await this.prisma.payout.findUnique({
      where: { stripePayoutId: stripePayout.id },
    });

    if (!payout) {
      this.logger.warn(
        `Payout not found for Stripe payout ${stripePayout.id}`,
      );
      return;
    }

    await this.prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    this.logger.log(
      `Payout ${payout.id} marked as PAID`,
    );

    await this.audit.log({
      action: 'PAYOUT_PAID',
      entity: 'Payout',
      entityId: payout.id,
      orgId: payout.partnerOrgId,
      newData: {
        stripePayoutId: stripePayout.id,
        amountCents: stripePayout.amount,
      },
      severity: 'INFO',
    });
  }

  /**
   * payout.failed — Update Payout to FAILED with failure reason.
   */
  async handlePayoutFailed(stripePayout: Stripe.Payout): Promise<void> {
    this.logger.log(`Processing payout.failed: ${stripePayout.id}`);

    const payout = await this.prisma.payout.findUnique({
      where: { stripePayoutId: stripePayout.id },
    });

    if (!payout) {
      this.logger.warn(
        `Payout not found for Stripe payout ${stripePayout.id}`,
      );
      return;
    }

    const failureReason =
      (stripePayout as any).failure_message ??
      (stripePayout as any).failure_code ??
      'Unknown failure';

    await this.prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: 'FAILED',
        failureReason,
      },
    });

    this.logger.log(
      `Payout ${payout.id} marked as FAILED: ${failureReason}`,
    );

    await this.audit.log({
      action: 'PAYOUT_FAILED',
      entity: 'Payout',
      entityId: payout.id,
      orgId: payout.partnerOrgId,
      newData: {
        stripePayoutId: stripePayout.id,
        failureReason,
      },
      severity: 'WARN',
    });
  }
}
