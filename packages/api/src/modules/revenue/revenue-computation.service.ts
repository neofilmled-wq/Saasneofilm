import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RevenueRuleService } from './revenue-rule.service';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingScreenGroup {
  partnerOrgId: string;
  items: Array<{
    id: string;
    bookingId: string;
    screenId: string;
    screenName: string;
    unitPriceCents: number;
    addedAt: Date;
    removedAt: Date | null;
  }>;
}

interface LineItemInput {
  bookingId: string;
  bookingScreenId: string;
  screenId: string;
  screenName: string;
  unitPriceCents: number;
  daysActive: number;
  totalDaysInPeriod: number;
  proratedAmountCents: number;
  finalAmountCents: number;
  uptimePolicyApplied: boolean;
  uptimeRatio: number | null;
  verifiedDiffusionCount: number | null;
  invoiceId: string | null;
}

interface ComputationResult {
  partnerOrgId: string;
  revenueShareId: string;
  totalRevenueCents: number;
  platformShareCents: number;
  partnerShareCents: number;
  platformRate: number;
  lineItemCount: number;
}

interface PeriodSummary {
  periodStart: Date;
  periodEnd: Date;
  invoicesProcessed: number;
  sharesComputed: ComputationResult[];
  errors: Array<{ invoiceId: string; error: string }>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class RevenueComputationService {
  private readonly logger = new Logger(RevenueComputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revenueRuleService: RevenueRuleService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  computeRevenueShares — single invoice / subscription
  // ═══════════════════════════════════════════════════════════════════════════

  async computeRevenueShares(
    invoiceId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    actorUserId?: string,
  ): Promise<ComputationResult[]> {
    this.logger.log(
      `Computing revenue shares for invoice=${invoiceId} ` +
        `subscription=${subscriptionId} ` +
        `period=${periodStart.toISOString()}..${periodEnd.toISOString()}`,
    );

    // ── 1. Find booking linked to this Stripe subscription ───────────────
    const booking = await this.prisma.booking.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: {
        bookingScreens: {
          include: {
            screen: { select: { id: true, name: true, activeDeviceId: true } },
          },
        },
      },
    });

    if (!booking) {
      this.logger.warn(
        `No booking found for subscription ${subscriptionId} — skipping`,
      );
      return [];
    }

    // ── 2. Filter active BookingScreens ──────────────────────────────────
    //   Active = removedAt is null OR removedAt > periodStart
    //   (screen was present for at least part of the period)
    const activeBookingScreens = booking.bookingScreens.filter(
      (bs) => bs.removedAt === null || bs.removedAt > periodStart,
    );

    if (activeBookingScreens.length === 0) {
      this.logger.warn(
        `Booking ${booking.id} has no active screens in period — skipping`,
      );
      return [];
    }

    // ── 3. Group by partnerOrgId ─────────────────────────────────────────
    const groups = new Map<string, BookingScreenGroup>();

    for (const bs of activeBookingScreens) {
      const existing = groups.get(bs.partnerOrgId);
      const item = {
        id: bs.id,
        bookingId: bs.bookingId,
        screenId: bs.screenId,
        screenName: bs.screen.name,
        unitPriceCents: bs.unitPriceCents,
        addedAt: bs.addedAt,
        removedAt: bs.removedAt,
      };

      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(bs.partnerOrgId, {
          partnerOrgId: bs.partnerOrgId,
          items: [item],
        });
      }
    }

    // ── 4. Compute total days in period ──────────────────────────────────
    const totalDays = this.diffDays(periodStart, periodEnd);
    if (totalDays <= 0) {
      throw new BadRequestException(
        `Invalid period: periodEnd must be after periodStart`,
      );
    }

    // ── 5. Process each partner group ────────────────────────────────────
    const results: ComputationResult[] = [];

    for (const [partnerOrgId, group] of groups) {
      const result = await this.computeForPartner(
        partnerOrgId,
        group,
        invoiceId,
        periodStart,
        periodEnd,
        totalDays,
        actorUserId,
      );
      results.push(result);
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  computeAllSharesForPeriod — batch across all paid invoices
  // ═══════════════════════════════════════════════════════════════════════════

  async computeAllSharesForPeriod(
    periodStart: Date,
    periodEnd: Date,
    actorUserId?: string,
  ): Promise<PeriodSummary> {
    this.logger.log(
      `Computing all revenue shares for period ` +
        `${periodStart.toISOString()}..${periodEnd.toISOString()}`,
    );

    // Find all PAID invoices overlapping the period
    const paidInvoices = await this.prisma.stripeInvoice.findMany({
      where: {
        status: 'PAID',
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
      include: {
        customer: {
          include: {
            subscriptions: true,
          },
        },
      },
    });

    const summary: PeriodSummary = {
      periodStart,
      periodEnd,
      invoicesProcessed: 0,
      sharesComputed: [],
      errors: [],
    };

    for (const invoice of paidInvoices) {
      // Find subscription linked to this invoice via the customer
      const subscriptions = invoice.customer.subscriptions;

      if (subscriptions.length === 0) {
        summary.errors.push({
          invoiceId: invoice.id,
          error: 'No subscriptions found for invoice customer',
        });
        continue;
      }

      // Process each subscription linked to this customer
      for (const subscription of subscriptions) {
        try {
          const results = await this.computeRevenueShares(
            invoice.id,
            subscription.stripeSubscriptionId,
            periodStart,
            periodEnd,
            actorUserId,
          );

          summary.sharesComputed.push(...results);
          summary.invoicesProcessed++;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to compute shares for invoice ${invoice.id}: ${message}`,
          );
          summary.errors.push({ invoiceId: invoice.id, error: message });
        }
      }
    }

    // Audit the batch computation
    await this.audit.log({
      action: 'REVENUE_BATCH_COMPUTE',
      entity: 'RevenueShare',
      entityId: `period:${periodStart.toISOString()}:${periodEnd.toISOString()}`,
      userId: actorUserId,
      newData: {
        periodStart,
        periodEnd,
        invoicesProcessed: summary.invoicesProcessed,
        sharesComputed: summary.sharesComputed.length,
        errors: summary.errors.length,
      },
      severity: summary.errors.length > 0 ? 'WARN' : 'INFO',
    });

    return summary;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PRIVATE — compute for a single partner within a booking
  // ═══════════════════════════════════════════════════════════════════════════

  private async computeForPartner(
    partnerOrgId: string,
    group: BookingScreenGroup,
    invoiceId: string,
    periodStart: Date,
    periodEnd: Date,
    totalDays: number,
    actorUserId?: string,
  ): Promise<ComputationResult> {
    // ── A. Load partner payout profile for uptime policy ─────────────────
    const payoutProfile = await this.prisma.partnerPayoutProfile.findUnique({
      where: { partnerOrgId },
    });
    const uptimePolicy = payoutProfile?.uptimePolicy ?? 'PAY_REGARDLESS';

    // ── B. Calculate prorated amounts + apply uptime policy ──────────────
    const lineItems: LineItemInput[] = [];
    let grossRevenueCents = 0;

    for (const item of group.items) {
      // Calculate days active within the period
      const effectiveStart = item.addedAt > periodStart ? item.addedAt : periodStart;
      const effectiveEnd =
        item.removedAt && item.removedAt < periodEnd
          ? item.removedAt
          : periodEnd;
      const daysActive = this.diffDays(effectiveStart, effectiveEnd);

      // Prorate: amount proportional to days active
      const proratedAmountCents =
        daysActive >= totalDays
          ? item.unitPriceCents
          : Math.round((item.unitPriceCents * daysActive) / totalDays);

      // Apply uptime policy
      const { finalAmount, uptimeRatio, verifiedCount, policyApplied } =
        await this.applyUptimePolicy(
          uptimePolicy,
          item.screenId,
          proratedAmountCents,
          periodStart,
          periodEnd,
        );

      lineItems.push({
        bookingId: item.bookingId,
        bookingScreenId: item.id,
        screenId: item.screenId,
        screenName: item.screenName,
        unitPriceCents: item.unitPriceCents,
        daysActive: Math.max(daysActive, 0),
        totalDaysInPeriod: totalDays,
        proratedAmountCents,
        finalAmountCents: finalAmount,
        uptimePolicyApplied: policyApplied,
        uptimeRatio,
        verifiedDiffusionCount: verifiedCount,
        invoiceId,
      });

      grossRevenueCents += finalAmount;
    }

    // ── C. Find applicable revenue rule ──────────────────────────────────
    const rule = await this.revenueRuleService.findApplicableRule(
      partnerOrgId,
      periodStart,
    );

    if (!rule) {
      throw new NotFoundException(
        `No applicable revenue rule found for partner ${partnerOrgId} ` +
          `effective at ${periodStart.toISOString()}. ` +
          `Create a global or partner-specific rule before computing.`,
      );
    }

    // ── D. Calculate splits ──────────────────────────────────────────────
    const platformShareCents = Math.round(grossRevenueCents * rule.platformRate);
    const partnerShareCents = grossRevenueCents - platformShareCents;

    // ── E. Upsert RevenueShare ───────────────────────────────────────────
    //   If a share already exists for this partner + period, we update it
    //   (handles multiple bookings paying into the same partner in same period)
    const existingShare = await this.prisma.revenueShare.findUnique({
      where: {
        partnerOrgId_periodStart_periodEnd: {
          partnerOrgId,
          periodStart,
          periodEnd,
        },
      },
    });

    let revenueShareId: string;

    if (existingShare) {
      // Aggregate: add new revenue to existing share
      const updatedGross = existingShare.totalRevenueCents + grossRevenueCents;
      const updatedPlatform = Math.round(updatedGross * rule.platformRate);
      const updatedPartner = updatedGross - updatedPlatform;

      const updated = await this.prisma.revenueShare.update({
        where: { id: existingShare.id },
        data: {
          totalRevenueCents: updatedGross,
          platformShareCents: updatedPlatform,
          partnerShareCents: updatedPartner,
          platformRate: rule.platformRate,
          status: 'CALCULATED',
          calculatedAt: new Date(),
          invoiceId,
        },
      });
      revenueShareId = updated.id;
    } else {
      const created = await this.prisma.revenueShare.create({
        data: {
          partnerOrgId,
          periodStart,
          periodEnd,
          totalRevenueCents: grossRevenueCents,
          platformShareCents,
          partnerShareCents,
          platformRate: rule.platformRate,
          status: 'CALCULATED',
          calculatedAt: new Date(),
          invoiceId,
          currency: 'EUR',
        },
      });
      revenueShareId = created.id;
    }

    // ── F. Create line items ─────────────────────────────────────────────
    for (const li of lineItems) {
      await this.prisma.revenueShareLineItem.create({
        data: {
          revenueShareId,
          bookingId: li.bookingId,
          bookingScreenId: li.bookingScreenId,
          screenId: li.screenId,
          screenName: li.screenName,
          unitPriceCents: li.unitPriceCents,
          daysActive: li.daysActive,
          totalDaysInPeriod: li.totalDaysInPeriod,
          proratedAmountCents: li.proratedAmountCents,
          finalAmountCents: li.finalAmountCents,
          uptimePolicyApplied: li.uptimePolicyApplied,
          uptimeRatio: li.uptimeRatio,
          verifiedDiffusionCount: li.verifiedDiffusionCount,
          invoiceId: li.invoiceId,
        },
      });
    }

    // ── G. Audit log ─────────────────────────────────────────────────────
    await this.audit.log({
      action: 'REVENUE_SHARE_COMPUTED',
      entity: 'RevenueShare',
      entityId: revenueShareId,
      userId: actorUserId,
      newData: {
        partnerOrgId,
        periodStart,
        periodEnd,
        grossRevenueCents,
        platformShareCents: existingShare
          ? Math.round(
              (existingShare.totalRevenueCents + grossRevenueCents) *
                rule.platformRate,
            )
          : platformShareCents,
        partnerShareCents: existingShare
          ? existingShare.totalRevenueCents +
            grossRevenueCents -
            Math.round(
              (existingShare.totalRevenueCents + grossRevenueCents) *
                rule.platformRate,
            )
          : partnerShareCents,
        ruleId: rule.id,
        lineItemCount: lineItems.length,
        aggregated: !!existingShare,
      },
    });

    return {
      partnerOrgId,
      revenueShareId,
      totalRevenueCents: existingShare
        ? existingShare.totalRevenueCents + grossRevenueCents
        : grossRevenueCents,
      platformShareCents: existingShare
        ? Math.round(
            (existingShare.totalRevenueCents + grossRevenueCents) *
              rule.platformRate,
          )
        : platformShareCents,
      partnerShareCents: existingShare
        ? existingShare.totalRevenueCents +
          grossRevenueCents -
          Math.round(
            (existingShare.totalRevenueCents + grossRevenueCents) *
              rule.platformRate,
          )
        : partnerShareCents,
      platformRate: rule.platformRate,
      lineItemCount: lineItems.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PRIVATE — apply uptime policy
  // ═══════════════════════════════════════════════════════════════════════════

  private async applyUptimePolicy(
    policy: string,
    screenId: string,
    proratedAmountCents: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    finalAmount: number;
    uptimeRatio: number | null;
    verifiedCount: number | null;
    policyApplied: boolean;
  }> {
    switch (policy) {
      case 'PAY_REGARDLESS':
        return {
          finalAmount: proratedAmountCents,
          uptimeRatio: null,
          verifiedCount: null,
          policyApplied: false,
        };

      case 'PAY_PRO_RATA_UPTIME': {
        // Query device heartbeats for the screen's active device
        const screen = await this.prisma.screen.findUnique({
          where: { id: screenId },
          select: { activeDeviceId: true },
        });

        if (!screen?.activeDeviceId) {
          // No device paired — treat as 0% uptime
          return {
            finalAmount: 0,
            uptimeRatio: 0,
            verifiedCount: null,
            policyApplied: true,
          };
        }

        const heartbeats = await this.prisma.deviceHeartbeat.findMany({
          where: {
            deviceId: screen.activeDeviceId,
            timestamp: { gte: periodStart, lte: periodEnd },
          },
          select: { isOnline: true },
        });

        if (heartbeats.length === 0) {
          // No heartbeats at all — treat as 0% uptime
          return {
            finalAmount: 0,
            uptimeRatio: 0,
            verifiedCount: null,
            policyApplied: true,
          };
        }

        const onlineCount = heartbeats.filter((h) => h.isOnline).length;
        const uptimeRatio = onlineCount / heartbeats.length;
        const finalAmount = Math.round(proratedAmountCents * uptimeRatio);

        return {
          finalAmount,
          uptimeRatio,
          verifiedCount: null,
          policyApplied: true,
        };
      }

      case 'PAY_ONLY_IF_DELIVERED': {
        // Check for verified diffusion logs in this period for this screen
        const verifiedCount = await this.prisma.diffusionLog.count({
          where: {
            screenId,
            verified: true,
            startTime: { gte: periodStart },
            endTime: { lte: periodEnd },
          },
        });

        if (verifiedCount === 0) {
          return {
            finalAmount: 0,
            uptimeRatio: null,
            verifiedCount: 0,
            policyApplied: true,
          };
        }

        // Delivered at least once — pay full prorated amount
        return {
          finalAmount: proratedAmountCents,
          uptimeRatio: null,
          verifiedCount,
          policyApplied: true,
        };
      }

      default:
        this.logger.warn(`Unknown uptime policy "${policy}" — defaulting to PAY_REGARDLESS`);
        return {
          finalAmount: proratedAmountCents,
          uptimeRatio: null,
          verifiedCount: null,
          policyApplied: false,
        };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PRIVATE — utility: diff in whole days between two dates
  // ═══════════════════════════════════════════════════════════════════════════

  private diffDays(start: Date, end: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.max(
      Math.round((end.getTime() - start.getTime()) / msPerDay),
      0,
    );
  }
}
