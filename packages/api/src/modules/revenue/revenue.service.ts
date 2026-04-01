import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * List all revenue shares with pagination and optional filters.
   */
  async findAll(params: {
    page: number;
    limit: number;
    status?: string;
    partnerOrgId?: string;
    periodStart?: Date;
    periodEnd?: Date;
  }) {
    const { page, limit, status, partnerOrgId, periodStart, periodEnd } = params;
    const where: any = {};
    if (status) where.status = status;
    if (partnerOrgId) where.partnerOrgId = partnerOrgId;
    if (periodStart || periodEnd) {
      where.periodStart = {};
      if (periodStart) where.periodStart.gte = periodStart;
      if (periodEnd) where.periodEnd = { lte: periodEnd };
    }

    const [shares, total] = await Promise.all([
      this.prisma.revenueShare.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          partnerOrg: { select: { id: true, name: true } },
          _count: { select: { lineItems: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.revenueShare.count({ where }),
    ]);

    return {
      data: shares,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single revenue share by ID, including line items.
   */
  async findById(id: string) {
    const share = await this.prisma.revenueShare.findUnique({
      where: { id },
      include: {
        partnerOrg: { select: { id: true, name: true } },
        lineItems: {
          orderBy: { createdAt: 'asc' },
        },
        payout: {
          select: {
            id: true,
            status: true,
            amountCents: true,
            stripeTransferId: true,
          },
        },
      },
    });

    if (!share) {
      throw new NotFoundException(`Revenue share ${id} not found`);
    }

    return share;
  }

  /**
   * Approve a COMPUTED revenue share, making it eligible for payout.
   */
  async approve(shareId: string, userId: string) {
    const share = await this.prisma.revenueShare.findUnique({
      where: { id: shareId },
    });

    if (!share) {
      throw new NotFoundException(`Revenue share ${shareId} not found`);
    }

    if (share.status !== 'CALCULATED') {
      throw new NotFoundException(
        `Revenue share ${shareId} is in ${share.status} status, expected COMPUTED`,
      );
    }

    const updated = await this.prisma.revenueShare.update({
      where: { id: shareId },
      data: { status: 'APPROVED' },
    });

    await this.audit.log({
      action: 'REVENUE_SHARE_APPROVED',
      entity: 'RevenueShare',
      entityId: shareId,
      userId,
      newData: {
        partnerOrgId: share.partnerOrgId,
        partnerShareCents: share.partnerShareCents,
        platformShareCents: share.platformShareCents,
      },
      severity: 'INFO',
    });

    this.logger.log(`Revenue share ${shareId} approved by user ${userId}`);
    return updated;
  }

  /**
   * Bulk-approve all COMPUTED revenue shares for a given period.
   */
  async bulkApprove(periodStart: Date, periodEnd: Date, userId: string) {
    const result = await this.prisma.revenueShare.updateMany({
      where: {
        status: 'CALCULATED',
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
      data: { status: 'APPROVED' },
    });

    await this.audit.log({
      action: 'REVENUE_SHARES_BULK_APPROVED',
      entity: 'RevenueShare',
      entityId: 'bulk',
      userId,
      newData: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        count: result.count,
      },
      severity: 'INFO',
    });

    this.logger.log(
      `Bulk approved ${result.count} revenue shares for period ` +
        `${periodStart.toISOString()} – ${periodEnd.toISOString()} by user ${userId}`,
    );

    return { approvedCount: result.count };
  }

  /**
   * Get a summary of revenue shares grouped by status for a period.
   */
  async getPeriodSummary(periodStart: Date, periodEnd: Date) {
    const shares = await this.prisma.revenueShare.findMany({
      where: {
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
      select: {
        status: true,
        totalRevenueCents: true,
        partnerShareCents: true,
        platformShareCents: true,
        partnerOrgId: true,
      },
    });

    const byStatus: Record<string, { count: number; totalRevenueCents: number; partnerShareCents: number; platformShareCents: number }> = {};
    const uniquePartners = new Set<string>();

    for (const share of shares) {
      if (!byStatus[share.status]) {
        byStatus[share.status] = {
          count: 0,
          totalRevenueCents: 0,
          partnerShareCents: 0,
          platformShareCents: 0,
        };
      }
      byStatus[share.status].count++;
      byStatus[share.status].totalRevenueCents += share.totalRevenueCents;
      byStatus[share.status].partnerShareCents += share.partnerShareCents;
      byStatus[share.status].platformShareCents += share.platformShareCents;
      uniquePartners.add(share.partnerOrgId);
    }

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalShares: shares.length,
      uniquePartners: uniquePartners.size,
      byStatus,
    };
  }
}
