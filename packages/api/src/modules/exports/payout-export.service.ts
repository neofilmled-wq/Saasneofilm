import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CsvService } from './csv.service';

@Injectable()
export class PayoutExportService {
  private readonly logger = new Logger(PayoutExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly csvService: CsvService,
  ) {}

  /**
   * Export all payouts within the given period as a CSV buffer.
   *
   * Joins with:
   * - partnerOrg  -> partner name
   * - revenueShares -> aggregated gross revenue and platform fees
   *
   * @param periodStart Inclusive start of the period
   * @param periodEnd   Inclusive end of the period
   * @returns CSV Buffer
   */
  async exportPayouts(periodStart: Date, periodEnd: Date): Promise<Buffer> {
    const payouts = await this.prisma.payout.findMany({
      where: {
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      include: {
        partnerOrg: {
          select: { id: true, name: true },
        },
        revenueShares: {
          select: {
            totalRevenueCents: true,
            platformShareCents: true,
            partnerShareCents: true,
            periodStart: true,
            periodEnd: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    this.logger.log(
      `Exporting ${payouts.length} payouts for period ${periodStart.toISOString()} – ${periodEnd.toISOString()}`,
    );

    const headers = [
      'payout_id',
      'date',
      'partner_org_id',
      'partner_name',
      'gross_revenue_cents',
      'platform_fee_cents',
      'net_payout_cents',
      'currency',
      'status',
      'stripe_transfer_id',
      'period_start',
      'period_end',
    ];

    const rows: string[][] = payouts.map((payout) => {
      // Aggregate revenue data from associated revenue shares
      const grossRevenueCents = payout.revenueShares.reduce(
        (sum, rs) => sum + rs.totalRevenueCents,
        0,
      );
      const platformFeeCents = payout.revenueShares.reduce(
        (sum, rs) => sum + rs.platformShareCents,
        0,
      );

      // Determine the widest period span across all revenue shares
      const sharePeriodStart =
        payout.revenueShares.length > 0
          ? payout.revenueShares.reduce(
              (earliest, rs) => (rs.periodStart < earliest ? rs.periodStart : earliest),
              payout.revenueShares[0].periodStart,
            )
          : payout.createdAt;

      const sharePeriodEnd =
        payout.revenueShares.length > 0
          ? payout.revenueShares.reduce(
              (latest, rs) => (rs.periodEnd > latest ? rs.periodEnd : latest),
              payout.revenueShares[0].periodEnd,
            )
          : payout.createdAt;

      return [
        payout.id,
        (payout.paidAt ?? payout.createdAt).toISOString(),
        payout.partnerOrg.id,
        payout.partnerOrg.name,
        String(grossRevenueCents),
        String(platformFeeCents),
        String(payout.amountCents),
        payout.currency,
        payout.status,
        payout.stripeTransferId ?? '',
        sharePeriodStart.toISOString(),
        sharePeriodEnd.toISOString(),
      ];
    });

    return this.csvService.generateCsv(headers, rows);
  }
}
