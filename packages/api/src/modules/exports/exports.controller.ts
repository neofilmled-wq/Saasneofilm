import {
  Controller,
  Get,
  Query,
  Header,
  BadRequestException,
  StreamableFile,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceExportService } from './invoice-export.service';
import { PayoutExportService } from './payout-export.service';
import { JournalExportService } from './journal-export.service';

@ApiTags('Exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  private readonly logger = new Logger(ExportsController.name);

  constructor(
    private readonly invoiceExportService: InvoiceExportService,
    private readonly payoutExportService: PayoutExportService,
    private readonly journalExportService: JournalExportService,
    private readonly prisma: PrismaService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────
  // Invoice CSV export
  // ────────────────────────────────────────────────────────────────────────

  @Get('invoices')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Export paid invoices as CSV' })
  @ApiQuery({ name: 'periodStart', required: true, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'periodEnd', required: true, type: String, description: 'ISO 8601 date' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="invoices-export.csv"')
  async exportInvoices(
    @Query('periodStart') periodStartRaw: string,
    @Query('periodEnd') periodEndRaw: string,
  ): Promise<StreamableFile> {
    const { periodStart, periodEnd } = this.parsePeriod(periodStartRaw, periodEndRaw);

    this.logger.log(`Invoice CSV export requested: ${periodStart.toISOString()} – ${periodEnd.toISOString()}`);

    const buffer = await this.invoiceExportService.exportInvoices(periodStart, periodEnd);
    return new StreamableFile(buffer);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Payout CSV export
  // ────────────────────────────────────────────────────────────────────────

  @Get('payouts')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Export payouts as CSV' })
  @ApiQuery({ name: 'periodStart', required: true, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'periodEnd', required: true, type: String, description: 'ISO 8601 date' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payouts-export.csv"')
  async exportPayouts(
    @Query('periodStart') periodStartRaw: string,
    @Query('periodEnd') periodEndRaw: string,
  ): Promise<StreamableFile> {
    const { periodStart, periodEnd } = this.parsePeriod(periodStartRaw, periodEndRaw);

    this.logger.log(`Payout CSV export requested: ${periodStart.toISOString()} – ${periodEnd.toISOString()}`);

    const buffer = await this.payoutExportService.exportPayouts(periodStart, periodEnd);
    return new StreamableFile(buffer);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Journal CSV export
  // ────────────────────────────────────────────────────────────────────────

  @Get('journal')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Export double-entry journal as CSV' })
  @ApiQuery({ name: 'periodStart', required: true, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'periodEnd', required: true, type: String, description: 'ISO 8601 date' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="journal-export.csv"')
  async exportJournal(
    @Query('periodStart') periodStartRaw: string,
    @Query('periodEnd') periodEndRaw: string,
  ): Promise<StreamableFile> {
    const { periodStart, periodEnd } = this.parsePeriod(periodStartRaw, periodEndRaw);

    this.logger.log(`Journal CSV export requested: ${periodStart.toISOString()} – ${periodEnd.toISOString()}`);

    const buffer = await this.journalExportService.exportJournalEntries(periodStart, periodEnd);
    return new StreamableFile(buffer);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Reconciliation (JSON)
  // ────────────────────────────────────────────────────────────────────────

  @Get('reconciliation')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reconciliation: total invoiced vs total distributed for period' })
  @ApiQuery({ name: 'periodStart', required: true, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'periodEnd', required: true, type: String, description: 'ISO 8601 date' })
  async getReconciliation(
    @Query('periodStart') periodStartRaw: string,
    @Query('periodEnd') periodEndRaw: string,
  ) {
    const { periodStart, periodEnd } = this.parsePeriod(periodStartRaw, periodEndRaw);

    this.logger.log(`Reconciliation requested: ${periodStart.toISOString()} – ${periodEnd.toISOString()}`);

    // Total invoiced (PAID invoices in period)
    const invoiceAgg = await this.prisma.stripeInvoice.aggregate({
      where: {
        status: 'PAID',
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amountPaidCents: true },
      _count: { id: true },
    });

    // Total distributed (all payouts in period)
    const payoutAgg = await this.prisma.payout.aggregate({
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amountCents: true },
      _count: { id: true },
    });

    // Total paid payouts only
    const paidPayoutAgg = await this.prisma.payout.aggregate({
      where: {
        status: 'PAID',
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amountCents: true },
      _count: { id: true },
    });

    const totalInvoicedCents = invoiceAgg._sum.amountPaidCents ?? 0;
    const totalDistributedCents = payoutAgg._sum.amountCents ?? 0;
    const totalPaidOutCents = paidPayoutAgg._sum.amountCents ?? 0;
    const platformRetainedCents = totalInvoicedCents - totalDistributedCents;

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      invoices: {
        count: invoiceAgg._count.id,
        totalAmountPaidCents: totalInvoicedCents,
      },
      payouts: {
        totalCount: payoutAgg._count.id,
        totalAmountCents: totalDistributedCents,
        paidCount: paidPayoutAgg._count.id,
        paidAmountCents: totalPaidOutCents,
      },
      platformRetainedCents,
      currency: 'EUR',
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Parse and validate the period query parameters.
   * Accepts ISO 8601 date strings (e.g. "2026-01-01" or "2026-01-01T00:00:00Z").
   */
  private parsePeriod(
    periodStartRaw: string,
    periodEndRaw: string,
  ): { periodStart: Date; periodEnd: Date } {
    if (!periodStartRaw || !periodEndRaw) {
      throw new BadRequestException('Both periodStart and periodEnd query parameters are required');
    }

    const periodStart = new Date(periodStartRaw);
    const periodEnd = new Date(periodEndRaw);

    if (isNaN(periodStart.getTime())) {
      throw new BadRequestException(`Invalid periodStart date: ${periodStartRaw}`);
    }
    if (isNaN(periodEnd.getTime())) {
      throw new BadRequestException(`Invalid periodEnd date: ${periodEndRaw}`);
    }
    if (periodStart > periodEnd) {
      throw new BadRequestException('periodStart must be before or equal to periodEnd');
    }

    return { periodStart, periodEnd };
  }
}
