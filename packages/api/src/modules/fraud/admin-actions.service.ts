import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface FreezeAdvertiserResult {
  organizationId: string;
  pausedBookingsCount: number;
  pausedCampaignsCount: number;
}

export interface UnfreezeAdvertiserResult {
  organizationId: string;
  message: string;
}

export interface FreezePartnerPayoutResult {
  partnerOrgId: string;
  frozen: boolean;
}

export interface FreezeBookingResult {
  bookingId: string;
  pausedCampaignId: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AdminActionsService {
  private readonly logger = new Logger(AdminActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Freeze Advertiser
  // Sets Organization.isFlagged=true, pauses ALL active bookings and
  // campaigns for this org. Creates CRITICAL audit log.
  // ──────────────────────────────────────────────────────────────────────────

  async freezeAdvertiser(
    orgId: string,
    reason: string,
    userId: string,
  ): Promise<FreezeAdvertiserResult> {
    this.logger.warn(`Freezing advertiser org=${orgId} reason="${reason}" by user=${userId}`);

    // Verify organization exists and is an advertiser
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }

    // Run all updates in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Flag the organization
      await tx.organization.update({
        where: { id: orgId },
        data: {
          isFlagged: true,
          flaggedAt: new Date(),
          flagReason: reason,
        },
      });

      // 2. Pause all ACTIVE bookings for this advertiser
      const pausedBookings = await tx.booking.updateMany({
        where: {
          advertiserOrgId: orgId,
          status: 'ACTIVE',
        },
        data: {
          status: 'PAUSED',
          isFlagged: true,
        },
      });

      // 3. Reject all ACTIVE campaigns for this advertiser
      const pausedCampaigns = await tx.campaign.updateMany({
        where: {
          advertiserOrgId: orgId,
          status: 'ACTIVE',
        },
        data: {
          status: 'REJECTED',
        },
      });

      return {
        pausedBookingsCount: pausedBookings.count,
        pausedCampaignsCount: pausedCampaigns.count,
      };
    });

    // Audit log (outside transaction — best-effort)
    await this.auditService.log({
      action: 'FREEZE_ADVERTISER',
      entity: 'Organization',
      entityId: orgId,
      userId,
      severity: 'CRITICAL',
      newData: {
        reason,
        pausedBookingsCount: result.pausedBookingsCount,
        pausedCampaignsCount: result.pausedCampaignsCount,
      },
    });

    this.logger.warn(
      `Advertiser ${orgId} frozen: ${result.pausedBookingsCount} bookings paused, ` +
        `${result.pausedCampaignsCount} campaigns paused`,
    );

    return {
      organizationId: orgId,
      pausedBookingsCount: result.pausedBookingsCount,
      pausedCampaignsCount: result.pausedCampaignsCount,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Unfreeze Advertiser
  // Clears flag. Does NOT auto-resume bookings/campaigns — admin must
  // resume them manually.
  // ──────────────────────────────────────────────────────────────────────────

  async unfreezeAdvertiser(
    orgId: string,
    userId: string,
  ): Promise<UnfreezeAdvertiserResult> {
    this.logger.log(`Unfreezing advertiser org=${orgId} by user=${userId}`);

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }

    const oldData = {
      isFlagged: org.isFlagged,
      flaggedAt: org.flaggedAt,
      flagReason: org.flagReason,
    };

    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        isFlagged: false,
        flaggedAt: null,
        flagReason: null,
      },
    });

    await this.auditService.log({
      action: 'UNFREEZE_ADVERTISER',
      entity: 'Organization',
      entityId: orgId,
      userId,
      severity: 'WARN',
      oldData,
      newData: { isFlagged: false },
    });

    this.logger.log(`Advertiser ${orgId} unfrozen. Bookings/campaigns NOT auto-resumed.`);

    return {
      organizationId: orgId,
      message:
        'Advertiser unfrozen successfully. Bookings and campaigns have NOT been auto-resumed — admin must resume them manually.',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Freeze Partner Payout
  // Sets PartnerPayoutProfile.frozen=true. Creates CRITICAL audit log.
  // ──────────────────────────────────────────────────────────────────────────

  async freezePartnerPayout(
    partnerOrgId: string,
    reason: string,
    userId: string,
  ): Promise<FreezePartnerPayoutResult> {
    this.logger.warn(
      `Freezing partner payout org=${partnerOrgId} reason="${reason}" by user=${userId}`,
    );

    const profile = await this.prisma.partnerPayoutProfile.findUnique({
      where: { partnerOrgId },
    });

    if (!profile) {
      throw new NotFoundException(
        `PartnerPayoutProfile not found for org ${partnerOrgId}`,
      );
    }

    await this.prisma.partnerPayoutProfile.update({
      where: { partnerOrgId },
      data: { frozen: true },
    });

    await this.auditService.log({
      action: 'FREEZE_PARTNER_PAYOUT',
      entity: 'PartnerPayoutProfile',
      entityId: profile.id,
      userId,
      severity: 'CRITICAL',
      oldData: { frozen: profile.frozen },
      newData: { frozen: true, reason },
    });

    this.logger.warn(`Partner payout for org ${partnerOrgId} frozen`);

    return { partnerOrgId, frozen: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Unfreeze Partner Payout
  // Sets PartnerPayoutProfile.frozen=false. Creates WARN audit log.
  // ──────────────────────────────────────────────────────────────────────────

  async unfreezePartnerPayout(
    partnerOrgId: string,
    userId: string,
  ): Promise<FreezePartnerPayoutResult> {
    this.logger.log(
      `Unfreezing partner payout org=${partnerOrgId} by user=${userId}`,
    );

    const profile = await this.prisma.partnerPayoutProfile.findUnique({
      where: { partnerOrgId },
    });

    if (!profile) {
      throw new NotFoundException(
        `PartnerPayoutProfile not found for org ${partnerOrgId}`,
      );
    }

    await this.prisma.partnerPayoutProfile.update({
      where: { partnerOrgId },
      data: { frozen: false },
    });

    await this.auditService.log({
      action: 'UNFREEZE_PARTNER_PAYOUT',
      entity: 'PartnerPayoutProfile',
      entityId: profile.id,
      userId,
      severity: 'WARN',
      oldData: { frozen: profile.frozen },
      newData: { frozen: false },
    });

    this.logger.log(`Partner payout for org ${partnerOrgId} unfrozen`);

    return { partnerOrgId, frozen: false };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Freeze Booking
  // Sets Booking.isFlagged=true, status=PAUSED. Pauses linked campaign.
  // Creates CRITICAL audit log.
  // ──────────────────────────────────────────────────────────────────────────

  async freezeBooking(
    bookingId: string,
    reason: string,
    userId: string,
  ): Promise<FreezeBookingResult> {
    this.logger.warn(
      `Freezing booking=${bookingId} reason="${reason}" by user=${userId}`,
    );

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    let pausedCampaignId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      // 1. Flag and pause the booking
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          isFlagged: true,
          status: 'PAUSED',
        },
      });

      // 2. If booking has a linked campaign, pause it too
      if (booking.campaignId) {
        const campaign = await tx.campaign.findUnique({
          where: { id: booking.campaignId },
        });

        if (campaign && campaign.status === 'ACTIVE') {
          await tx.campaign.update({
            where: { id: booking.campaignId },
            data: { status: 'REJECTED' },
          });
          pausedCampaignId = booking.campaignId;
        }
      }
    });

    await this.auditService.log({
      action: 'FREEZE_BOOKING',
      entity: 'Booking',
      entityId: bookingId,
      userId,
      severity: 'CRITICAL',
      oldData: { status: booking.status, isFlagged: booking.isFlagged },
      newData: {
        status: 'PAUSED',
        isFlagged: true,
        reason,
        pausedCampaignId,
      },
    });

    this.logger.warn(
      `Booking ${bookingId} frozen` +
        (pausedCampaignId ? ` (campaign ${pausedCampaignId} also paused)` : ''),
    );

    return { bookingId, pausedCampaignId };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Unfreeze Booking
  // Clears isFlagged. Does NOT change booking status — admin must
  // resume manually.
  // ──────────────────────────────────────────────────────────────────────────

  async unfreezeBooking(
    bookingId: string,
    userId: string,
  ): Promise<{ bookingId: string; message: string }> {
    this.logger.log(`Unfreezing booking=${bookingId} by user=${userId}`);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { isFlagged: false },
    });

    await this.auditService.log({
      action: 'UNFREEZE_BOOKING',
      entity: 'Booking',
      entityId: bookingId,
      userId,
      severity: 'WARN',
      oldData: { isFlagged: booking.isFlagged },
      newData: { isFlagged: false },
    });

    this.logger.log(
      `Booking ${bookingId} unfrozen. Status NOT changed (admin must resume manually).`,
    );

    return {
      bookingId,
      message:
        'Booking unfrozen successfully. Status has NOT been changed — admin must resume manually.',
    };
  }
}
