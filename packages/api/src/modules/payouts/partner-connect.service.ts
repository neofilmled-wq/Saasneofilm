import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STRIPE_CLIENT } from '../billing/stripe.provider';

export interface PayoutReadiness {
  ready: boolean;
  reason?: string;
}

export interface OnboardingLinkDto {
  refreshUrl: string;
  returnUrl: string;
}

@Injectable()
export class PartnerConnectService {
  private readonly logger = new Logger(PartnerConnectService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a Stripe Express Connect account for a partner organization
   * and persist a PartnerPayoutProfile record.
   */
  async createConnectAccount(
    partnerOrgId: string,
    userId?: string,
  ): Promise<{ connectAccountId: string; profileId: string }> {
    // Verify the organization exists and is a PARTNER
    const org = await this.prisma.organization.findUnique({
      where: { id: partnerOrgId },
      include: { partnerPayoutProfile: true },
    });

    if (!org) {
      throw new NotFoundException(`Organization ${partnerOrgId} not found`);
    }

    if (org.type !== 'PARTNER') {
      throw new BadRequestException(
        'Only PARTNER organizations can create Connect accounts',
      );
    }

    if (org.partnerPayoutProfile) {
      throw new ConflictException(
        'This partner organization already has a Connect account',
      );
    }

    // Create Stripe Express account
    let account: Stripe.Account;
    try {
      account = await this.stripe.accounts.create({
        type: 'express',
        country: org.country || 'FR',
        email: org.contactEmail,
        business_type: 'company',
        metadata: {
          partnerOrgId,
          organizationName: org.name,
        },
        capabilities: {
          transfers: { requested: true },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create Stripe Connect account for org ${partnerOrgId}: ${error}`,
      );
      throw new BadRequestException(
        'Failed to create Stripe Connect account. Please try again later.',
      );
    }

    // Create PartnerPayoutProfile and update Organization
    const profile = await this.prisma.$transaction(async (tx) => {
      const created = await tx.partnerPayoutProfile.create({
        data: {
          stripeConnectAccountId: account.id,
          partnerOrgId,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          frozen: false,
        },
      });

      await tx.organization.update({
        where: { id: partnerOrgId },
        data: { stripeConnectAccountId: account.id },
      });

      return created;
    });

    await this.audit.log({
      action: 'CONNECT_ACCOUNT_CREATED',
      entity: 'PartnerPayoutProfile',
      entityId: profile.id,
      userId,
      newData: {
        stripeConnectAccountId: account.id,
        partnerOrgId,
      },
    });

    this.logger.log(
      `Created Stripe Connect account ${account.id} for partner ${partnerOrgId}`,
    );

    return {
      connectAccountId: account.id,
      profileId: profile.id,
    };
  }

  /**
   * Generate a Stripe Account Link for the partner to complete onboarding.
   * Returns the URL the partner should be redirected to.
   */
  async createOnboardingLink(
    partnerOrgId: string,
    dto: OnboardingLinkDto,
  ): Promise<{ url: string }> {
    const profile = await this.prisma.partnerPayoutProfile.findUnique({
      where: { partnerOrgId },
    });

    if (!profile) {
      throw new NotFoundException(
        `No Connect account found for organization ${partnerOrgId}. Create one first.`,
      );
    }

    try {
      const accountLink = await this.stripe.accountLinks.create({
        account: profile.stripeConnectAccountId,
        refresh_url: dto.refreshUrl,
        return_url: dto.returnUrl,
        type: 'account_onboarding',
      });

      this.logger.log(
        `Generated onboarding link for Connect account ${profile.stripeConnectAccountId}`,
      );

      return { url: accountLink.url };
    } catch (error) {
      this.logger.error(
        `Failed to create onboarding link for org ${partnerOrgId}: ${error}`,
      );
      throw new BadRequestException(
        'Failed to generate onboarding link. Please try again later.',
      );
    }
  }

  /**
   * Get the Connect account status for a partner organization,
   * including the readiness check.
   */
  async getConnectStatus(partnerOrgId: string) {
    const profile = await this.prisma.partnerPayoutProfile.findUnique({
      where: { partnerOrgId },
      include: {
        partnerOrg: {
          select: { name: true, contactEmail: true, stripeConnectAccountId: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException(
        `No Connect profile found for organization ${partnerOrgId}`,
      );
    }

    const readiness = this.evaluateReadiness(profile);

    return {
      profile,
      readiness,
    };
  }

  /**
   * Check if a partner is ready to receive payouts.
   * Returns { ready, reason? }.
   */
  async isPayoutReady(partnerOrgId: string): Promise<PayoutReadiness> {
    const profile = await this.prisma.partnerPayoutProfile.findUnique({
      where: { partnerOrgId },
    });

    if (!profile) {
      return {
        ready: false,
        reason: 'No Connect account exists for this partner',
      };
    }

    return this.evaluateReadiness(profile);
  }

  /**
   * Update the PartnerPayoutProfile from a Stripe webhook event
   * (e.g. account.updated).
   */
  async updateFromWebhook(
    stripeConnectAccountId: string,
    data: {
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
      details_submitted?: boolean;
    },
  ): Promise<void> {
    const profile = await this.prisma.partnerPayoutProfile.findUnique({
      where: { stripeConnectAccountId },
    });

    if (!profile) {
      this.logger.warn(
        `Received webhook for unknown Connect account: ${stripeConnectAccountId}`,
      );
      return;
    }

    const updateData: Record<string, any> = {};

    if (data.charges_enabled !== undefined) {
      updateData.chargesEnabled = data.charges_enabled;
    }
    if (data.payouts_enabled !== undefined) {
      updateData.payoutsEnabled = data.payouts_enabled;
    }
    if (data.details_submitted !== undefined) {
      updateData.detailsSubmitted = data.details_submitted;
    }

    // Mark onboarded if all conditions met
    if (
      (data.charges_enabled ?? profile.chargesEnabled) &&
      (data.payouts_enabled ?? profile.payoutsEnabled) &&
      (data.details_submitted ?? profile.detailsSubmitted) &&
      !profile.onboardedAt
    ) {
      updateData.onboardedAt = new Date();
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.partnerPayoutProfile.update({
        where: { stripeConnectAccountId },
        data: updateData,
      });

      this.logger.log(
        `Updated Connect profile for ${stripeConnectAccountId}: ${JSON.stringify(updateData)}`,
      );

      await this.audit.log({
        action: 'CONNECT_PROFILE_WEBHOOK_UPDATE',
        entity: 'PartnerPayoutProfile',
        entityId: profile.id,
        newData: updateData,
        severity: 'INFO',
      });
    }
  }

  /**
   * Evaluate payout readiness from a profile record.
   */
  private evaluateReadiness(profile: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    frozen: boolean;
  }): PayoutReadiness {
    if (profile.frozen) {
      return { ready: false, reason: 'Account is frozen by an administrator' };
    }

    if (!profile.detailsSubmitted) {
      return { ready: false, reason: 'Onboarding details have not been submitted' };
    }

    if (!profile.chargesEnabled) {
      return { ready: false, reason: 'Charges are not enabled on this Connect account' };
    }

    if (!profile.payoutsEnabled) {
      return { ready: false, reason: 'Payouts are not enabled on this Connect account' };
    }

    return { ready: true };
  }
}
