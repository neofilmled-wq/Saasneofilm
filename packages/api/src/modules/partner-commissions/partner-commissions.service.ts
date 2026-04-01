import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerGateway } from '../partner-gateway/partner.gateway';

@Injectable()
export class PartnerCommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partnerGateway: PartnerGateway,
  ) {}

  // ─── Partner-facing ─────────────────────────────────────────────────────

  /**
   * Core revenue calculation from active campaigns.
   * Formula per campaign: (nb_partner_screens / nb_total_screens) × budgetCents
   * Returns per-screen breakdown + totals.
   */
  private async computeRevenueFromCampaigns(partnerOrgId: string, month?: string) {
    // Build date filter only if month is provided
    const dateFilter: any = {};
    if (month) {
      const [year, m] = month.split('-').map(Number);
      const periodStart = new Date(year, m - 1, 1);
      const periodEnd = new Date(year, m, 1);
      dateFilter.startDate = { lt: periodEnd };
      dateFilter.endDate = { gte: periodStart };
    }

    // Find all campaigns (ACTIVE or FINISHED) targeting this partner's screens
    // If no month → all campaigns regardless of date
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: { in: ['ACTIVE', 'FINISHED'] },
        ...dateFilter,
        targeting: {
          includedScreens: {
            some: { partnerOrgId },
          },
        },
      },
      include: {
        targeting: {
          include: {
            includedScreens: {
              select: { id: true, name: true, partnerOrgId: true, siteId: true, site: { select: { name: true } } },
            },
          },
        },
      },
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: partnerOrgId },
      select: { commissionRate: true },
    });
    const commissionRate = org?.commissionRate ?? 0.15;

    // Per-screen revenue accumulator
    const screenMap = new Map<string, {
      screenId: string;
      screenName: string;
      siteName: string;
      siteId: string | null;
      revenueCents: number;
      retrocessionCents: number;
      bookingCount: number;
      tvCount: number;
    }>();

    let totalRevenueCents = 0;

    for (const campaign of campaigns) {
      const allScreens = campaign.targeting?.includedScreens ?? [];
      const totalScreensInCampaign = allScreens.length;
      if (totalScreensInCampaign === 0) continue;

      const partnerScreens = allScreens.filter((s) => s.partnerOrgId === partnerOrgId);
      if (partnerScreens.length === 0) continue;

      // Revenue for partner from this campaign: (partner_screens / total_screens) × budgetCents
      const campaignRevenueForPartner = Math.round(
        (partnerScreens.length / totalScreensInCampaign) * campaign.budgetCents,
      );
      totalRevenueCents += campaignRevenueForPartner;

      // Distribute evenly across partner's screens in this campaign
      const perScreenRevenue = Math.round(campaignRevenueForPartner / partnerScreens.length);

      for (const screen of partnerScreens) {
        const existing = screenMap.get(screen.id);
        if (existing) {
          existing.revenueCents += perScreenRevenue;
          existing.retrocessionCents += Math.round(perScreenRevenue * commissionRate);
          existing.bookingCount += 1;
        } else {
          screenMap.set(screen.id, {
            screenId: screen.id,
            screenName: screen.name,
            siteName: screen.site?.name ?? '—',
            siteId: screen.siteId,
            revenueCents: perScreenRevenue,
            retrocessionCents: Math.round(perScreenRevenue * commissionRate),
            bookingCount: 1,
            tvCount: 1,
          });
        }
      }
    }

    const retrocessionCents = Math.round(totalRevenueCents * commissionRate);

    return {
      totalRevenueCents,
      retrocessionCents,
      commissionRate,
      screens: Array.from(screenMap.values()),
      campaignCount: campaigns.length,
    };
  }

  /** List revenue share statements for this partner (computed from campaigns). */
  async getStatements(partnerOrgId: string, month?: string) {
    const result = await this.computeRevenueFromCampaigns(partnerOrgId, month);

    // Return as a single "statement" with lineItems matching the frontend shape
    return [{
      id: `live-${month ?? 'current'}`,
      commissionRate: result.commissionRate,
      totalRevenueCents: result.totalRevenueCents,
      partnerShareCents: result.retrocessionCents,
      lineItems: result.screens.map((s) => ({
        screenId: s.screenId,
        screenName: s.screenName,
        finalAmountCents: s.revenueCents,
        daysActive: 0,
        bookingId: null,
      })),
    }];
  }

  async getStatement(id: string, partnerOrgId: string) {
    const statement = await this.prisma.revenueShare.findUnique({
      where: { id },
      include: {
        lineItems: true,
        payout: true,
      },
    });
    if (!statement) throw new NotFoundException('Statement not found');
    if (statement.partnerOrgId !== partnerOrgId) {
      throw new BadRequestException('Access denied');
    }
    return statement;
  }

  /** Wallet summary computed in real-time from active campaigns. */
  async getWalletSummary(partnerOrgId: string, month?: string) {
    const result = await this.computeRevenueFromCampaigns(partnerOrgId, month);

    // Count all screens owned by partner
    const activeScreens = await this.prisma.screen.count({
      where: { partnerOrgId },
    });

    return {
      commissionRate: result.commissionRate,
      commissionRatePercent: Math.round(result.commissionRate * 100),
      // totalRevenueCents = sum of (partner_screens/total_screens × budgetCents) for all campaigns
      totalRevenueCents: result.totalRevenueCents,
      // retrocessionCents = totalRevenueCents × commissionRate (partner's actual share)
      retrocessionCents: result.retrocessionCents,
      activeScreens,
      campaignCount: result.campaignCount,
      // Keep legacy fields for backwards compat with frontend
      pendingCents: result.totalRevenueCents,
      calculatedCents: 0,
      paidCents: result.retrocessionCents,
    };
  }

  // ─── Admin-facing ────────────────────────────────────────────────────────

  /**
   * Admin updates the retrocession rate for a partner org (clamped 10–20%).
   * Recalculates all PENDING statements immediately.
   */
  async updateCommissionRate(partnerOrgId: string, ratePercent: number) {
    if (ratePercent < 10 || ratePercent > 20) {
      throw new BadRequestException('Commission rate must be between 10% and 20%');
    }
    const rate = ratePercent / 100;

    // Update org
    await this.prisma.organization.update({
      where: { id: partnerOrgId },
      data: { commissionRate: rate },
    });

    // Recalculate PENDING and CALCULATED (non-paid) revenue shares for this partner
    // Spec: "impact INSTANTANÉ sur les périodes non clôturées; ne pas réécrire le passé payé (freeze)"
    const pendingShares = await this.prisma.revenueShare.findMany({
      where: { partnerOrgId, status: { in: ['PENDING', 'CALCULATED', 'APPROVED'] } },
    });

    for (const share of pendingShares) {
      const newPartnerShare = Math.round(share.totalRevenueCents * rate);
      const newPlatformShare = share.totalRevenueCents - newPartnerShare;
      await this.prisma.revenueShare.update({
        where: { id: share.id },
        data: {
          partnerShareCents: newPartnerShare,
          platformShareCents: newPlatformShare,
          platformRate: 1 - rate,
        },
      });
      this.partnerGateway.emitStatementUpdated(partnerOrgId, share.id);
    }

    this.partnerGateway.emitCommissionRateChanged(partnerOrgId, rate);

    return { partnerOrgId, commissionRate: rate, commissionRatePercent: ratePercent, updatedStatements: pendingShares.length };
  }

  /** Admin marks a statement as PAID */
  async markPaid(statementId: string) {
    const share = await this.prisma.revenueShare.findUnique({ where: { id: statementId } });
    if (!share) throw new NotFoundException('Statement not found');

    const updated = await this.prisma.revenueShare.update({
      where: { id: statementId },
      data: { status: 'PAID' },
    });

    this.partnerGateway.emitStatementUpdated(share.partnerOrgId, statementId);

    return updated;
  }

  /**
   * Compute commission statements from booking data for a given month.
   * Implements the pro-rata multi-partner rule:
   *   prix_par_tv = montant_mensuel / nb_total_tv
   *   revenu_partner = prix_par_tv * nb_tv_du_partner
   *   commission = revenu_partner * ratePercent
   */
  async computeStatements(month: string) {
    const [year, m] = month.split('-').map(Number);
    const periodStart = new Date(year, m - 1, 1);
    const periodEnd = new Date(year, m, 1);

    // Find all active bookings in this month (endDate null = ongoing subscription)
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: periodEnd },
        OR: [
          { endDate: { gte: periodStart } },
          { endDate: null },
        ],
      },
      include: {
        bookingScreens: {
          where: { removedAt: null },
          include: {
            screen: { select: { id: true, partnerOrgId: true } },
          },
        },
      },
    });

    // Group by partner org
    const partnerData = new Map<string, { totalRevenueCents: number; screenCount: number }>();

    for (const booking of bookings) {
      const totalScreens = booking.bookingScreens.length;
      if (totalScreens === 0) continue;

      const pricePerTv = booking.monthlyPriceCents / totalScreens;

      // Group screens by partner
      const byPartner = new Map<string, number>();
      for (const bs of booking.bookingScreens) {
        const pid = bs.screen.partnerOrgId;
        byPartner.set(pid, (byPartner.get(pid) ?? 0) + 1);
      }

      for (const [pid, count] of byPartner) {
        const revenue = Math.round(pricePerTv * count);
        const existing = partnerData.get(pid) ?? { totalRevenueCents: 0, screenCount: 0 };
        partnerData.set(pid, {
          totalRevenueCents: existing.totalRevenueCents + revenue,
          screenCount: existing.screenCount + count,
        });
      }
    }

    const results: any[] = [];

    for (const [partnerOrgId, { totalRevenueCents }] of partnerData) {
      const org = await this.prisma.organization.findUnique({
        where: { id: partnerOrgId },
        select: { commissionRate: true },
      });
      const rate = org?.commissionRate ?? 0.15;

      const partnerShareCents = Math.round(totalRevenueCents * rate);
      const platformShareCents = totalRevenueCents - partnerShareCents;

      // Upsert (idempotent)
      const statement = await this.prisma.revenueShare.upsert({
        where: { partnerOrgId_periodStart_periodEnd: { partnerOrgId, periodStart, periodEnd } },
        create: {
          partnerOrgId,
          periodStart,
          periodEnd,
          totalRevenueCents,
          partnerShareCents,
          platformShareCents,
          platformRate: 1 - rate,
          status: 'CALCULATED',
          calculatedAt: new Date(),
        },
        update: {
          totalRevenueCents,
          partnerShareCents,
          platformShareCents,
          platformRate: 1 - rate,
          status: 'CALCULATED',
          calculatedAt: new Date(),
        },
      });

      this.partnerGateway.emitStatementUpdated(partnerOrgId, statement.id);
      results.push(statement);
    }

    return results;
  }

  // ─── Admin retrocession listing ─────────────────────────────────────────

  /** List all retrocessions (all partners) for admin dashboard. */
  async getRetrocessions(month?: string, partnerOrgId?: string) {
    const where: any = {};
    if (partnerOrgId) where.partnerOrgId = partnerOrgId;
    if (month) {
      const [year, m] = month.split('-').map(Number);
      where.periodStart = {
        gte: new Date(year, m - 1, 1),
        lt: new Date(year, m, 1),
      };
    }

    const shares = await this.prisma.revenueShare.findMany({
      where,
      include: {
        partnerOrg: { select: { id: true, name: true, commissionRate: true } },
        payout: { select: { id: true, status: true, paidAt: true } },
      },
      orderBy: [{ periodStart: 'desc' }, { partnerOrgId: 'asc' }],
    });

    return shares.map((s) => ({
      id: s.id,
      partnerOrgId: s.partnerOrgId,
      partnerName: s.partnerOrg.name,
      commissionRate: s.partnerOrg.commissionRate ?? 0.15,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      totalRevenueCents: s.totalRevenueCents,
      platformShareCents: s.platformShareCents,
      partnerShareCents: s.partnerShareCents,
      status: s.status,
      payout: s.payout,
    }));
  }

  /** Export retrocessions as CSV for a given month. */
  async exportRetrocessionsCsv(month: string) {
    const retrocessions = await this.getRetrocessions(month);

    const header = 'Partner,Commission Rate %,Total Revenue EUR,Platform Share EUR,Partner Share EUR,Status,Paid At\n';
    const rows = retrocessions.map((r) =>
      [
        `"${r.partnerName}"`,
        Math.round((r.commissionRate ?? 0.15) * 100),
        (r.totalRevenueCents / 100).toFixed(2),
        (r.platformShareCents / 100).toFixed(2),
        (r.partnerShareCents / 100).toFixed(2),
        r.status,
        r.payout?.paidAt ?? '',
      ].join(','),
    );

    return { csv: header + rows.join('\n'), month, count: retrocessions.length };
  }
}
