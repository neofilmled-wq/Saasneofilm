import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PartnerConnectService } from './partner-connect.service';
import { STRIPE_CLIENT } from '../billing/stripe.provider';

/** Minimum payout threshold: EUR 50.00 */
const MINIMUM_PAYOUT_CENTS = 5000;

export interface BatchSummary {
  periodStart: Date;
  periodEnd: Date;
  totalPartners: number;
  processed: ProcessedPayout[];
  held: HeldPayout[];
  failed: FailedPayout[];
  totalTransferredCents: number;
  totalHeldCents: number;
}

interface ProcessedPayout {
  partnerOrgId: string;
  payoutId: string;
  amountCents: number;
  stripeTransferId: string;
}

interface HeldPayout {
  partnerOrgId: string;
  amountCents: number;
  reason: string;
}

interface FailedPayout {
  partnerOrgId: string;
  payoutId: string;
  amountCents: number;
  error: string;
}

export interface PayoutSummaryResult {
  periodStart: Date;
  periodEnd: Date;
  totalRevenueShares: number;
  totalPartnerShareCents: number;
  totalPlatformShareCents: number;
  uniquePartners: number;
  byStatus: Record<string, number>;
}

@Injectable()
export class PayoutBatchService {
  private readonly logger = new Logger(PayoutBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly audit: AuditService,
    private readonly partnerConnect: PartnerConnectService,
  ) {}

  /**
   * Process monthly payouts for all eligible partners.
   *
   * Finds all APPROVED RevenueShares in the given period that haven't been
   * assigned to a payout yet, groups them by partner, checks thresholds
   * and readiness, then creates Stripe transfers.
   */
  async processMonthlyPayouts(
    periodStart: Date,
    periodEnd: Date,
    triggeredByUserId?: string,
  ): Promise<BatchSummary> {
    this.logger.log(
      `Starting monthly payout batch for period ${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
    );

    // Find all eligible revenue shares: APPROVED, not yet assigned to a payout
    const eligibleShares = await this.prisma.revenueShare.findMany({
      where: {
        status: 'APPROVED',
        payoutId: null,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
      include: {
        partnerOrg: {
          select: { id: true, name: true, stripeConnectAccountId: true },
        },
      },
      orderBy: { partnerOrgId: 'asc' },
    });

    if (eligibleShares.length === 0) {
      this.logger.log('No eligible revenue shares found for payout processing');
      return {
        periodStart,
        periodEnd,
        totalPartners: 0,
        processed: [],
        held: [],
        failed: [],
        totalTransferredCents: 0,
        totalHeldCents: 0,
      };
    }

    // Group by partnerOrgId
    const grouped = new Map<string, typeof eligibleShares>();
    for (const share of eligibleShares) {
      const existing = grouped.get(share.partnerOrgId) || [];
      existing.push(share);
      grouped.set(share.partnerOrgId, existing);
    }

    const processed: ProcessedPayout[] = [];
    const held: HeldPayout[] = [];
    const failed: FailedPayout[] = [];

    for (const [partnerOrgId, shares] of grouped) {
      const partnerName = shares[0]?.partnerOrg.name ?? partnerOrgId;
      const totalPartnerShareCents = shares.reduce(
        (sum, s) => sum + s.partnerShareCents,
        0,
      );

      // Check minimum threshold
      if (totalPartnerShareCents < MINIMUM_PAYOUT_CENTS) {
        this.logger.log(
          `Partner ${partnerName} (${partnerOrgId}): ${totalPartnerShareCents} cents below minimum threshold of ${MINIMUM_PAYOUT_CENTS} cents. Skipping.`,
        );

        await this.audit.log({
          action: 'PAYOUT_BELOW_THRESHOLD',
          entity: 'Payout',
          entityId: partnerOrgId,
          userId: triggeredByUserId,
          newData: {
            partnerOrgId,
            amountCents: totalPartnerShareCents,
            minimumCents: MINIMUM_PAYOUT_CENTS,
            revenueShareCount: shares.length,
          },
          severity: 'INFO',
        });

        held.push({
          partnerOrgId,
          amountCents: totalPartnerShareCents,
          reason: `Below minimum threshold (${totalPartnerShareCents} < ${MINIMUM_PAYOUT_CENTS} cents)`,
        });
        continue;
      }

      // Check partner payout readiness
      const readiness = await this.partnerConnect.isPayoutReady(partnerOrgId);
      if (!readiness.ready) {
        this.logger.log(
          `Partner ${partnerName} (${partnerOrgId}): not payout-ready. Reason: ${readiness.reason}`,
        );

        await this.audit.log({
          action: 'PAYOUT_HELD_NOT_ONBOARDED',
          entity: 'Payout',
          entityId: partnerOrgId,
          userId: triggeredByUserId,
          newData: {
            partnerOrgId,
            amountCents: totalPartnerShareCents,
            reason: readiness.reason,
          },
          severity: 'WARN',
        });

        held.push({
          partnerOrgId,
          amountCents: totalPartnerShareCents,
          reason: readiness.reason || 'Partner not onboarded for payouts',
        });
        continue;
      }

      // Get the Connect account ID
      const profile = await this.prisma.partnerPayoutProfile.findUnique({
        where: { partnerOrgId },
      });

      if (!profile) {
        held.push({
          partnerOrgId,
          amountCents: totalPartnerShareCents,
          reason: 'No payout profile found',
        });
        continue;
      }

      // Create Payout record in PENDING status
      const transferGroup = `payout_${partnerOrgId}_${periodStart.toISOString().slice(0, 7)}`;

      let payout;
      try {
        payout = await this.prisma.$transaction(async (tx) => {
          // Create Payout
          const created = await tx.payout.create({
            data: {
              status: 'PENDING',
              amountCents: totalPartnerShareCents,
              currency: shares[0]?.currency ?? 'EUR',
              partnerOrgId,
            },
          });

          // Create PayoutLineItems
          await tx.payoutLineItem.createMany({
            data: shares.map((share) => ({
              payoutId: created.id,
              revenueShareId: share.id,
              amountCents: share.partnerShareCents,
              currency: share.currency,
            })),
          });

          // Connect RevenueShares to the Payout
          await tx.revenueShare.updateMany({
            where: { id: { in: shares.map((s) => s.id) } },
            data: { payoutId: created.id },
          });

          return created;
        });
      } catch (error) {
        this.logger.error(
          `Failed to create payout record for partner ${partnerOrgId}: ${error}`,
        );
        failed.push({
          partnerOrgId,
          payoutId: '',
          amountCents: totalPartnerShareCents,
          error: `Database error: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      // Initiate Stripe transfer
      try {
        const transfer = await this.stripe.transfers.create({
          amount: totalPartnerShareCents,
          currency: (shares[0]?.currency ?? 'EUR').toLowerCase(),
          destination: profile.stripeConnectAccountId,
          transfer_group: transferGroup,
          metadata: {
            payoutId: payout.id,
            partnerOrgId,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            revenueShareIds: shares.map((s) => s.id).join(','),
          },
        });

        // Update Payout to PROCESSING with the Stripe transfer ID
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: 'PROCESSING',
            stripeTransferId: transfer.id,
          },
        });

        this.logger.log(
          `Transfer ${transfer.id} created for partner ${partnerName}: ${totalPartnerShareCents} cents`,
        );

        await this.audit.log({
          action: 'PAYOUT_TRANSFER_CREATED',
          entity: 'Payout',
          entityId: payout.id,
          userId: triggeredByUserId,
          newData: {
            stripeTransferId: transfer.id,
            amountCents: totalPartnerShareCents,
            partnerOrgId,
            transferGroup,
          },
        });

        processed.push({
          partnerOrgId,
          payoutId: payout.id,
          amountCents: totalPartnerShareCents,
          stripeTransferId: transfer.id,
        });
      } catch (error) {
        // On Stripe error: update Payout to FAILED with reason
        const failureReason =
          error instanceof Error ? error.message : String(error);

        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: 'FAILED',
            failureReason,
          },
        });

        this.logger.error(
          `Stripe transfer failed for partner ${partnerOrgId}, payout ${payout.id}: ${failureReason}`,
        );

        await this.audit.log({
          action: 'PAYOUT_TRANSFER_FAILED',
          entity: 'Payout',
          entityId: payout.id,
          userId: triggeredByUserId,
          newData: { failureReason, partnerOrgId },
          severity: 'CRITICAL',
        });

        failed.push({
          partnerOrgId,
          payoutId: payout.id,
          amountCents: totalPartnerShareCents,
          error: failureReason,
        });
      }
    }

    const summary: BatchSummary = {
      periodStart,
      periodEnd,
      totalPartners: grouped.size,
      processed,
      held,
      failed,
      totalTransferredCents: processed.reduce((sum, p) => sum + p.amountCents, 0),
      totalHeldCents: held.reduce((sum, h) => sum + h.amountCents, 0),
    };

    this.logger.log(
      `Payout batch complete: ${processed.length} processed, ${held.length} held, ${failed.length} failed. ` +
        `Total transferred: ${summary.totalTransferredCents} cents`,
    );

    await this.audit.log({
      action: 'PAYOUT_BATCH_COMPLETED',
      entity: 'Payout',
      entityId: `batch_${periodStart.toISOString().slice(0, 7)}`,
      userId: triggeredByUserId,
      newData: {
        processedCount: processed.length,
        heldCount: held.length,
        failedCount: failed.length,
        totalTransferredCents: summary.totalTransferredCents,
        totalHeldCents: summary.totalHeldCents,
      },
    });

    return summary;
  }

  /**
   * Get an aggregate summary of revenue shares and payouts for a given period.
   */
  async getPayoutSummary(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PayoutSummaryResult> {
    const shares = await this.prisma.revenueShare.findMany({
      where: {
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
      select: {
        status: true,
        partnerShareCents: true,
        platformShareCents: true,
        partnerOrgId: true,
      },
    });

    const byStatus: Record<string, number> = {};
    const uniquePartners = new Set<string>();
    let totalPartnerShareCents = 0;
    let totalPlatformShareCents = 0;

    for (const share of shares) {
      byStatus[share.status] = (byStatus[share.status] || 0) + 1;
      uniquePartners.add(share.partnerOrgId);
      totalPartnerShareCents += share.partnerShareCents;
      totalPlatformShareCents += share.platformShareCents;
    }

    return {
      periodStart,
      periodEnd,
      totalRevenueShares: shares.length,
      totalPartnerShareCents,
      totalPlatformShareCents,
      uniquePartners: uniquePartners.size,
      byStatus,
    };
  }

  /**
   * Get paginated payout history for a specific partner organization.
   */
  async getPartnerPayoutHistory(
    partnerOrgId: string,
    page: number,
    limit: number,
  ) {
    const where = { partnerOrgId };

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          lineItems: {
            select: {
              id: true,
              amountCents: true,
              currency: true,
              revenueShareId: true,
            },
          },
          _count: { select: { revenueShares: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      data: payouts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all payouts (admin view), with optional filters.
   */
  async findAll(params: {
    page: number;
    limit: number;
    status?: string;
    partnerOrgId?: string;
  }) {
    const { page, limit, status, partnerOrgId } = params;
    const where: any = {};
    if (status) where.status = status;
    if (partnerOrgId) where.partnerOrgId = partnerOrgId;

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          partnerOrg: { select: { name: true, contactEmail: true } },
          _count: { select: { revenueShares: true, lineItems: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      data: payouts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single payout by ID, including line items and revenue shares.
   */
  async findById(id: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
      include: {
        partnerOrg: { select: { id: true, name: true, contactEmail: true } },
        lineItems: {
          include: {
            revenueShare: {
              select: {
                id: true,
                periodStart: true,
                periodEnd: true,
                totalRevenueCents: true,
                partnerShareCents: true,
                platformShareCents: true,
                platformRate: true,
                status: true,
              },
            },
          },
        },
        revenueShares: {
          select: {
            id: true,
            status: true,
            periodStart: true,
            periodEnd: true,
            partnerShareCents: true,
          },
        },
      },
    });

    if (!payout) {
      throw new NotFoundException(`Payout ${id} not found`);
    }

    return payout;
  }

  /**
   * Admin action: hold a specific payout (set status to PENDING and nullify transfer).
   * Only payouts in PENDING or PROCESSING status can be held.
   */
  async holdPayout(payoutId: string, userId?: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException(`Payout ${payoutId} not found`);
    }

    if (payout.status === 'PAID') {
      throw new BadRequestException('Cannot hold a payout that is already paid');
    }

    if (payout.status === 'FAILED') {
      throw new BadRequestException('Cannot hold a failed payout');
    }

    const oldStatus = payout.status;

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'PENDING',
        failureReason: 'Held by administrator',
      },
    });

    await this.audit.log({
      action: 'PAYOUT_HELD',
      entity: 'Payout',
      entityId: payoutId,
      userId,
      oldData: { status: oldStatus },
      newData: { status: 'PENDING', reason: 'Held by administrator' },
      severity: 'WARN',
    });

    this.logger.log(`Payout ${payoutId} held by user ${userId}`);
  }

  /**
   * Admin action: release a held payout by retrying the Stripe transfer.
   * Only payouts in PENDING status (held or initial) can be released.
   */
  async releasePayout(payoutId: string, userId?: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        partnerOrg: { select: { id: true, name: true } },
      },
    });

    if (!payout) {
      throw new NotFoundException(`Payout ${payoutId} not found`);
    }

    if (payout.status !== 'PENDING') {
      throw new BadRequestException(
        `Only PENDING payouts can be released. Current status: ${payout.status}`,
      );
    }

    // Check partner readiness before releasing
    const readiness = await this.partnerConnect.isPayoutReady(payout.partnerOrgId);
    if (!readiness.ready) {
      throw new BadRequestException(
        `Partner is not payout-ready: ${readiness.reason}`,
      );
    }

    const profile = await this.prisma.partnerPayoutProfile.findUnique({
      where: { partnerOrgId: payout.partnerOrgId },
    });

    if (!profile) {
      throw new BadRequestException(
        'No payout profile found for partner organization',
      );
    }

    const transferGroup = `payout_release_${payoutId}`;

    try {
      const transfer = await this.stripe.transfers.create({
        amount: payout.amountCents,
        currency: payout.currency.toLowerCase(),
        destination: profile.stripeConnectAccountId,
        transfer_group: transferGroup,
        metadata: {
          payoutId: payout.id,
          partnerOrgId: payout.partnerOrgId,
          releasedBy: userId || 'system',
        },
      });

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'PROCESSING',
          stripeTransferId: transfer.id,
          failureReason: null,
        },
      });

      await this.audit.log({
        action: 'PAYOUT_RELEASED',
        entity: 'Payout',
        entityId: payoutId,
        userId,
        newData: {
          stripeTransferId: transfer.id,
          amountCents: payout.amountCents,
          partnerOrgId: payout.partnerOrgId,
        },
      });

      this.logger.log(
        `Payout ${payoutId} released with transfer ${transfer.id} by user ${userId}`,
      );
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : String(error);

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'FAILED',
          failureReason,
        },
      });

      await this.audit.log({
        action: 'PAYOUT_RELEASE_FAILED',
        entity: 'Payout',
        entityId: payoutId,
        userId,
        newData: { failureReason },
        severity: 'CRITICAL',
      });

      this.logger.error(
        `Failed to release payout ${payoutId}: ${failureReason}`,
      );

      throw new BadRequestException(
        `Stripe transfer failed: ${failureReason}`,
      );
    }
  }
}
