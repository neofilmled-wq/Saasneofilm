import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CsvService } from './csv.service';

/**
 * Shape of a tax item that may appear inside `lineItems` JSON.
 * Stripe-style tax breakdown.
 */
interface TaxEntry {
  tax_amount_cents?: number;
  amount?: number;
}

interface LineItemEntry {
  tax_amounts?: TaxEntry[];
}

@Injectable()
export class InvoiceExportService {
  private readonly logger = new Logger(InvoiceExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly csvService: CsvService,
  ) {}

  /**
   * Export all PAID invoices within the given period as a CSV buffer.
   *
   * VAT extraction strategy:
   * 1. If `lineItems` JSON contains tax info, aggregate it.
   * 2. Otherwise, estimate French TVA 20 %:
   *    vat = round(amountPaidCents * 0.20 / 1.20)
   *
   * @param periodStart Inclusive start of the period (ISO 8601 string or Date)
   * @param periodEnd   Inclusive end of the period (ISO 8601 string or Date)
   * @returns CSV Buffer
   */
  async exportInvoices(periodStart: Date, periodEnd: Date): Promise<Buffer> {
    const invoices = await this.prisma.stripeInvoice.findMany({
      where: {
        status: 'PAID',
        paidAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
      orderBy: { paidAt: 'asc' },
    });

    this.logger.log(
      `Exporting ${invoices.length} PAID invoices for period ${periodStart.toISOString()} – ${periodEnd.toISOString()}`,
    );

    const headers = [
      'invoice_id',
      'invoice_number',
      'date',
      'customer_org_id',
      'customer_name',
      'net_cents',
      'vat_cents',
      'gross_cents',
      'currency',
      'status',
      'stripe_invoice_id',
    ];

    const rows: string[][] = invoices.map((inv) => {
      const vatCents = this.extractVat(inv.lineItems, inv.amountPaidCents);
      const netCents = inv.amountPaidCents - vatCents;

      return [
        inv.id,
        inv.invoiceNumber ?? '',
        inv.paidAt ? inv.paidAt.toISOString() : inv.createdAt.toISOString(),
        inv.organization.id,
        inv.organization.name,
        String(netCents),
        String(vatCents),
        String(inv.amountPaidCents),
        inv.currency,
        inv.status,
        inv.stripeInvoiceId,
      ];
    });

    return this.csvService.generateCsv(headers, rows);
  }

  /**
   * Attempt to extract VAT from Stripe-style lineItems JSON.
   * Falls back to the standard French TVA 20 % reverse-computation.
   */
  private extractVat(lineItems: unknown, grossCents: number): number {
    if (lineItems && Array.isArray(lineItems)) {
      try {
        let totalTax = 0;
        let hasTax = false;

        for (const item of lineItems as LineItemEntry[]) {
          if (item.tax_amounts && Array.isArray(item.tax_amounts)) {
            for (const tax of item.tax_amounts) {
              const amount = tax.tax_amount_cents ?? tax.amount ?? 0;
              totalTax += amount;
              hasTax = true;
            }
          }
        }

        if (hasTax) {
          return totalTax;
        }
      } catch {
        this.logger.warn('Failed to parse lineItems tax data, falling back to estimate');
      }
    }

    // Fallback: French TVA 20 % included in gross amount
    // gross = net + net * 0.20 = net * 1.20
    // vat = gross * 0.20 / 1.20
    return Math.round((grossCents * 0.2) / 1.2);
  }
}
