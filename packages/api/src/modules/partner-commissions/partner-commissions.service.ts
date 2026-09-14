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
    // Only credit a renewal to the partner if the advertiser actually paid for
    // it. The renewal count comes straight from Stripe: one PAID invoice of
    // THIS booking's subscription whose service period opens inside the month
    // = one monthly charge collected = one month owed to the partner.
    //
    // The previous version matched paid invoices on (advertiser org, date
    // window) and compared them to anchors derived from booking.startDate.
    // Both halves were wrong, in opposite directions:
    //   - booking.startDate is set when the DRAFT is created, minutes BEFORE
    //     Stripe opens the billing period, so a booking's own invoice never
    //     covered its own anchor — with a single booking the partner was paid
    //     nothing, forever.
    //   - matching only on the org let ANY paid invoice of that advertiser
    //     unlock ANY of its bookings, crediting partners from money collected
    //     for something else.
    // Counting the subscription's own paid invoices removes the clock skew and
    // the cross-booking leak at once.
    const subscriptionIds = bookings
      .map((b) => b.stripeSubscriptionId)
      .filter((id): id is string => !!id);

    const paidInvoices = subscriptionIds.length
      ? await this.prisma.stripeInvoice.findMany({
          where: {
            stripeSubscriptionId: { in: subscriptionIds },
            status: 'PAID',
            periodStart: { gte: periodStart, lt: periodEnd },
          },
          select: { stripeSubscriptionId: true, amountPaidCents: true },
        })
      : [];

    // Sum what was ACTUALLY COLLECTED per subscription, not
    // `monthlyPriceCents × number of renewals`. The booking's theoretical price
    // and the invoiced amount diverge as soon as there is a proration (screens
    // added/removed mid-cycle via updateBookingScreens), a discount, or a
    // partial refund — and the partner would then be paid on money we never
    // received. Distributing the collected cents makes
    // "sum of partner statements == sum of paid invoices" true by construction.
    const collectedCentsBySubscription = new Map<string, number>();
    for (const inv of paidInvoices) {
      if (!inv.stripeSubscriptionId) continue;
      collectedCentsBySubscription.set(
        inv.stripeSubscriptionId,
        (collectedCentsBySubscription.get(inv.stripeSubscriptionId) ?? 0) +
          inv.amountPaidCents,
      );
    }

        // Group by partner org
    const partnerData = new Map<string, { totalRevenueCents: number; screenCount: number }>();

    for (const booking of bookings) {
      const totalScreens = booking.bookingScreens.length;
      if (totalScreens === 0) continue;

      // Cents actually collected for this booking during the month.
      const collectedCents = booking.stripeSubscriptionId
        ? (collectedCentsBySubscription.get(booking.stripeSubscriptionId) ?? 0)
        : 0;
      if (collectedCents <= 0) continue; // nothing collected → nothing to pay

      const pricePerTv = collectedCents / totalScreens;

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

      // A settled month is history — never rewrite it. Recomputing used to reset
      // a PAID statement back to CALCULATED and overwrite its amounts, so the
      // admin console would show a partner as unpaid after money had actually
      // left the account. There is no double-payment risk (the payout batch
      // skips statements already attached to a payout), but the displayed
      // status and the audited amounts must keep matching what was transferred.
      const settled = await this.prisma.revenueShare.findUnique({
        where: { partnerOrgId_periodStart_periodEnd: { partnerOrgId, periodStart, periodEnd } },
      });

      if (settled && (settled.status === 'PAID' || settled.payoutId)) {
        this.logger.log(
          `Statement ${settled.id} for partner ${partnerOrgId} is already settled — left untouched`,
        );
        results.push(settled);
        continue;
      }

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
