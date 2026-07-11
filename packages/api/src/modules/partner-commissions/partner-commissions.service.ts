import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerGateway } from '../partner-gateway/partner.gateway';
import { AdminGateway } from '../admin/admin.gateway';

@Injectable()
export class PartnerCommissionsService {
  private readonly logger = new Logger(PartnerCommissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly partnerGateway: PartnerGateway,
    private readonly adminGateway: AdminGateway,
  ) {}

  /**
   * Notify BOTH sides after any change to a partner's statement:
   * - the partner room (so the concerned partner sees his own figure move)
   * - the admin room (so the retrocessions cockpit refreshes live)
   */
  private notifyStatementChange(partnerOrgId: string, statementId: string) {
    this.partnerGateway.emitStatementUpdated(partnerOrgId, statementId);
    this.adminGateway.emitRetrocessionUpdate();
  }

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

  /**
   * List revenue share statements for this partner.
   *
   * Projects the REAL RevenueShare rows (the same source the admin approves
   * and pays via Stripe) instead of the previous synthetic `live-${month}`
   * object recomputed from campaign budgets. This makes the partner-facing
   * list coherent with getStatement(:id) and with what actually gets paid.
   */
  async getStatements(partnerOrgId: string, month?: string) {
    const where: any = { partnerOrgId };
    if (month) {
      const [year, m] = month.split('-').map(Number);
      where.periodStart = { gte: new Date(year, m - 1, 1), lt: new Date(year, m, 1) };
    }

    const shares = await this.prisma.revenueShare.findMany({
      where,
      include: { lineItems: true, payout: { select: { id: true, status: true, paidAt: true } } },
      orderBy: { periodStart: 'desc' },
    });

    return shares.map((s) => ({
      id: s.id,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      commissionRate: 1 - s.platformRate,
      totalRevenueCents: s.totalRevenueCents,
      partnerShareCents: s.partnerShareCents,
      platformShareCents: s.platformShareCents,
      status: s.status,
      payout: s.payout,
      lineItems: s.lineItems,
    }));
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

  /**
   * Partner wallet summary — projected from the REAL RevenueShare ledger.
   *
   * Previously this recomputed from campaign budgets, so the figure the
   * partner saw never matched what the admin actually approved and paid. Now
   * the wallet is a faithful projection of RevenueShare buckets:
   *   - pending    = PENDING + CALCULATED (earned, not yet approved)
   *   - available  = APPROVED (owed, ready to be transferred)
   *   - paid       = PAID (already transferred via Stripe Connect)
   * balance (solde disponible) = available. total gagné = sum of all shares.
   */
  async getWalletSummary(partnerOrgId: string, month?: string) {
    const where: any = { partnerOrgId };
    if (month) {
      const [year, m] = month.split('-').map(Number);
      where.periodStart = { gte: new Date(year, m - 1, 1), lt: new Date(year, m, 1) };
    }

    const [shares, org, activeScreens] = await Promise.all([
      this.prisma.revenueShare.findMany({
        where,
        select: { totalRevenueCents: true, partnerShareCents: true, status: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: partnerOrgId },
        select: { commissionRate: true },
      }),
      this.prisma.screen.count({ where: { partnerOrgId } }),
    ]);

    let totalRevenueCents = 0;
    let totalEarnedCents = 0;
    let pendingCents = 0;
    let calculatedCents = 0;
    let availableCents = 0;
    let paidCents = 0;

    for (const s of shares) {
      totalRevenueCents += s.totalRevenueCents;
      totalEarnedCents += s.partnerShareCents;
      switch (s.status) {
        case 'PENDING':
          pendingCents += s.partnerShareCents;
          break;
        case 'CALCULATED':
          calculatedCents += s.partnerShareCents;
          pendingCents += s.partnerShareCents;
          break;
        case 'APPROVED':
          availableCents += s.partnerShareCents;
          break;
        case 'PAID':
          paidCents += s.partnerShareCents;
          break;
      }
    }

    const commissionRate = org?.commissionRate ?? 0.15;

    return {
      commissionRate,
      commissionRatePercent: Math.round(commissionRate * 100),
      totalRevenueCents,
      // retrocessionCents kept for backwards compat = total earned by partner
      retrocessionCents: totalEarnedCents,
      totalEarnedCents,
      // Wallet buckets (real, from RevenueShare — coherent with admin payouts)
      pendingCents,
      calculatedCents,
      availableCents,
      paidCents,
      // "solde disponible" = approved & not yet paid
      balanceCents: availableCents,
      activeScreens,
      statementCount: shares.length,
      // legacy key some callers may still read
      campaignCount: shares.length,
    };
  }

  // ─── Admin-facing ────────────────────────────────────────────────────────

  /**
   * Admin updates the retrocession rate for a partner org (clamped 1–30%).
   * Rates are negotiated per-partner (spec: 1% to 30%). Recalculates all
   * non-settled statements immediately; PAID history is frozen.
   */
  async updateCommissionRate(partnerOrgId: string, ratePercent: number) {
    if (ratePercent < 1 || ratePercent > 30) {
      throw new BadRequestException('Commission rate must be between 1% and 30%');
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
      this.notifyStatementChange(partnerOrgId, share.id);
    }

    this.partnerGateway.emitCommissionRateChanged(partnerOrgId, rate);

    return { partnerOrgId, commissionRate: rate, commissionRatePercent: ratePercent, updatedStatements: pendingShares.length };
  }

  /**
   * Admin approves a CALCULATED statement, moving it to APPROVED.
   * Only APPROVED statements are picked up by the Stripe payout batch
   * (`payout-batch.service.ts`), so this is the mandatory gate before any
   * real transfer. Idempotent: re-approving an already-APPROVED share is a
   * no-op; PAID shares are refused to avoid rewriting settled history.
   */
  async approveStatement(statementId: string, approvedByUserId?: string) {
    const share = await this.prisma.revenueShare.findUnique({ where: { id: statementId } });
    if (!share) throw new NotFoundException('Statement not found');

    if (share.status === 'PAID') {
      throw new BadRequestException('Statement already paid — cannot re-approve');
    }
    if (share.status === 'APPROVED') {
      return share; // idempotent
    }

    const updated = await this.prisma.revenueShare.update({
      where: { id: statementId },
      data: { status: 'APPROVED', approvedBy: approvedByUserId ?? null },
    });

    this.logger.log(
      `RevenueShare ${statementId} approved (partner=${share.partnerOrgId}, ` +
        `share=${share.partnerShareCents}c) by ${approvedByUserId ?? 'unknown'}`,
    );
    this.notifyStatementChange(share.partnerOrgId, statementId);

    return updated;
  }

  /**
   * Bulk-approve every CALCULATED statement of a given month. Returns the
   * count approved so the admin UI can report "N partenaires approuvés".
   */
  async approveMonth(month: string, approvedByUserId?: string) {
    const [year, m] = month.split('-').map(Number);
    const periodStart = new Date(year, m - 1, 1);
    const periodEnd = new Date(year, m, 1);

    const calculated = await this.prisma.revenueShare.findMany({
      where: { status: 'CALCULATED', periodStart: { gte: periodStart, lt: periodEnd } },
      select: { id: true, partnerOrgId: true },
    });

    for (const share of calculated) {
      await this.prisma.revenueShare.update({
        where: { id: share.id },
        data: { status: 'APPROVED', approvedBy: approvedByUserId ?? null },
      });
      this.notifyStatementChange(share.partnerOrgId, share.id);
    }

    this.logger.log(`approveMonth ${month}: ${calculated.length} statements approved`);
    return { month, approvedCount: calculated.length };
  }

  /** Admin marks a statement as PAID (manual settlement, no Stripe transfer). */
  async markPaid(statementId: string) {
    const share = await this.prisma.revenueShare.findUnique({ where: { id: statementId } });
    if (!share) throw new NotFoundException('Statement not found');

    const updated = await this.prisma.revenueShare.update({
      where: { id: statementId },
      data: { status: 'PAID' },
    });

    this.notifyStatementChange(share.partnerOrgId, statementId);

    return updated;
  }

  /**
   * Add `months` to a date, clamping the day to the last day of the target
   * month (standard subscription-billing behaviour: a Jan-31 anchor renews
   * Feb-28, not Mar-3 as naive Date arithmetic would give).
   */
  private addMonthsClamped(date: Date, months: number): Date {
    const targetDay = date.getDate();
    const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, lastDay));
    d.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), 0);
    return d;
  }

  /**
   * Billing renewal dates (anchors) of a booking that fall within the calendar
   * month [periodStart, periodEnd). Anchors are startDate + k months. A
   * fixed-term booking has exactly `durationMonths` anchors; an ongoing one
   * (no endDate/duration) renews forever, but we only ever collect anchors
   * inside this month so the loop stops as soon as it passes periodEnd.
   */
  private getBillingAnchorsInMonth(
    startDate: Date,
    endDate: Date | null,
    durationMonths: number | null,
    periodStart: Date,
    periodEnd: Date,
  ): Date[] {
    const maxK = durationMonths && durationMonths > 0 ? durationMonths : 1200; // ongoing → 100y cap
    const anchors: Date[] = [];
    for (let k = 0; k < maxK; k++) {
      const anchor = this.addMonthsClamped(startDate, k);
      // Anchors are monotonically increasing — once past this month, stop.
      if (anchor.getTime() >= periodEnd.getTime()) break;
      // Respect an explicit end (cancelled/finished subscription).
      if (endDate && anchor.getTime() >= endDate.getTime()) break;
      if (anchor.getTime() >= periodStart.getTime()) anchors.push(anchor);
    }
    return anchors;
  }

  /**
   * Compute commission statements from booking data for a given month.
   * Implements the pro-rata multi-partner rule:
   *   prix_par_tv = montant_mensuel / nb_total_tv
   *   revenu_partner = prix_par_tv * nb_tv_du_partner
   *   commission = revenu_partner * ratePercent
   *
   * EXACT BILLING-PERIOD ATTRIBUTION (fixes the mid-month over-payment):
   * A statement runs per calendar month. Without care, a 6-month subscription
   * starting on the 25th of August straddles 7 calendar months (Aug…Feb) and
   * would be paid a FULL month 7 times — the partner is over-paid by a whole
   * month while the advertiser is only billed 6 times.
   *
   * A monthly subscription renews on the SAME day each month (its "anchor":
   * the 25th here). Each renewal that lands inside a calendar month is worth
   * exactly one monthly charge. So we pay the partner `monthlyPriceCents ×
   * (nombre de renouvellements tombant dans ce mois)`. Summed over all
   * months this equals durationMonths × monthly to the cent — no day-based
   * rounding drift, February (no renewal) = 0.
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

    // ── Payment gate ──────────────────────────────────────────────────────
    // Only credit a renewal to the partner if the advertiser's invoice for
    // that billing period was actually PAID. Without this, a declined card
    // (booking still ACTIVE / PAST_DUE) would still credit the partner — we'd
    // be paying out money we never collected. We pre-load the PAID invoices of
    // every advertiser involved whose billing period overlaps this month, then
    // match each renewal anchor against them.
    const advertiserOrgIds = [...new Set(bookings.map((b) => b.advertiserOrgId))];
    const paidInvoices = advertiserOrgIds.length
      ? await this.prisma.stripeInvoice.findMany({
          where: {
            organizationId: { in: advertiserOrgIds },
            status: 'PAID',
            periodStart: { lt: periodEnd },
            periodEnd: { gt: periodStart },
          },
          select: { organizationId: true, periodStart: true, periodEnd: true },
        })
      : [];
    const paidByOrg = new Map<string, { start: number; end: number }[]>();
    for (const inv of paidInvoices) {
      const arr = paidByOrg.get(inv.organizationId) ?? [];
      arr.push({ start: inv.periodStart.getTime(), end: inv.periodEnd.getTime() });
      paidByOrg.set(inv.organizationId, arr);
    }
    const renewalIsPaid = (advertiserOrgId: string, anchor: Date): boolean => {
      const periods = paidByOrg.get(advertiserOrgId);
      if (!periods) return false;
      const t = anchor.getTime();
      // The renewal date is the start of a billing period → it falls inside
      // the paid invoice's [periodStart, periodEnd).
      return periods.some((p) => p.start <= t && t < p.end);
    };

    // Group by partner org
    const partnerData = new Map<string, { totalRevenueCents: number; screenCount: number }>();

    for (const booking of bookings) {
      const totalScreens = booking.bookingScreens.length;
      if (totalScreens === 0) continue;

      // Renewal dates in this calendar month, then keep only those whose
      // advertiser invoice was actually paid.
      const anchors = this.getBillingAnchorsInMonth(
        booking.startDate,
        booking.endDate ?? null,
        booking.durationMonths ?? null,
        periodStart,
        periodEnd,
      );
      const paidRenewals = anchors.filter((a) =>
        renewalIsPaid(booking.advertiserOrgId, a),
      ).length;
      if (paidRenewals <= 0) continue; // no *paid* renewal this month → nothing to pay

      const monthlyForPeriod = booking.monthlyPriceCents * paidRenewals;
      const pricePerTv = monthlyForPeriod / totalScreens;

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

      this.notifyStatementChange(partnerOrgId, statement.id);
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
