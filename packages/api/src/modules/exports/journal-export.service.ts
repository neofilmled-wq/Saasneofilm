import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CsvService } from './csv.service';

/**
 * French PCG (Plan Comptable General) account codes used for journal entries.
 *
 * 411000  Clients (trade receivables)
 * 706000  Prestations de services (service revenue)
 * 445710  TVA collectee (VAT collected / output VAT)
 * 622000  Remunerations d'intermediaires (partner retrocessions)
 * 401000  Fournisseurs (trade payables / partner payable)
 */
const ACCOUNTS = {
  CLIENTS: { code: '411000', name: 'Clients' },
  REVENUE: { code: '706000', name: 'Prestations de services' },
  VAT_COLLECTED: { code: '445710', name: 'TVA collectee' },
  PARTNER_RETROCESSION: { code: '622000', name: 'Remunerations d\'intermediaires' },
  PARTNER_PAYABLE: { code: '401000', name: 'Fournisseurs' },
} as const;

interface JournalRow {
  date: string;
  journalId: string;
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  description: string;
  reference: string;
}

/**
 * Shape of a tax item that may appear inside `lineItems` JSON.
 */
interface TaxEntry {
  tax_amount_cents?: number;
  amount?: number;
}

interface LineItemEntry {
  tax_amounts?: TaxEntry[];
}

@Injectable()
export class JournalExportService {
  private readonly logger = new Logger(JournalExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly csvService: CsvService,
  ) {}

  /**
   * Generate double-entry bookkeeping journal entries for the given period.
   *
   * For each PAID invoice:
   *   Debit  411000 Clients            (gross amount = net + TVA)
   *   Credit 706000 Prestations        (net amount)
   *   Credit 445710 TVA collectee      (TVA amount)
   *
   * For each PAID payout:
   *   Debit  622000 Retrocession       (payout amount)
   *   Credit 401000 Fournisseurs       (payout amount)
   *
   * @param periodStart Inclusive start of the period
   * @param periodEnd   Inclusive end of the period
   * @returns CSV Buffer with journal entries
   */
  async exportJournalEntries(periodStart: Date, periodEnd: Date): Promise<Buffer> {
    const [invoices, payouts] = await Promise.all([
      this.prisma.stripeInvoice.findMany({
        where: {
          status: 'PAID',
          paidAt: { gte: periodStart, lte: periodEnd },
        },
        include: {
          organization: { select: { name: true } },
        },
        orderBy: { paidAt: 'asc' },
      }),
      this.prisma.payout.findMany({
        where: {
          status: 'PAID',
          paidAt: { gte: periodStart, lte: periodEnd },
        },
        include: {
          partnerOrg: { select: { name: true } },
        },
        orderBy: { paidAt: 'asc' },
      }),
    ]);

    this.logger.log(
      `Generating journal: ${invoices.length} invoices, ${payouts.length} payouts ` +
        `for period ${periodStart.toISOString()} – ${periodEnd.toISOString()}`,
    );

    const entries: JournalRow[] = [];
    let journalSeq = 1;

    // --- Invoice entries ---
    for (const inv of invoices) {
      const grossCents = inv.amountPaidCents;
      const vatCents = this.extractVat(inv.lineItems, grossCents);
      const netCents = grossCents - vatCents;
      const date = (inv.paidAt ?? inv.createdAt).toISOString();
      const journalId = `VE-${String(journalSeq++).padStart(6, '0')}`;
      const ref = inv.invoiceNumber ?? inv.stripeInvoiceId;

      // Debit: Clients (full gross amount)
      entries.push({
        date,
        journalId,
        accountCode: ACCOUNTS.CLIENTS.code,
        accountName: ACCOUNTS.CLIENTS.name,
        debitCents: grossCents,
        creditCents: 0,
        description: `Facture ${ref} – ${inv.organization.name}`,
        reference: ref,
      });

      // Credit: Revenue (net HT)
      entries.push({
        date,
        journalId,
        accountCode: ACCOUNTS.REVENUE.code,
        accountName: ACCOUNTS.REVENUE.name,
        debitCents: 0,
        creditCents: netCents,
        description: `Facture ${ref} – CA HT`,
        reference: ref,
      });

      // Credit: TVA collected
      entries.push({
        date,
        journalId,
        accountCode: ACCOUNTS.VAT_COLLECTED.code,
        accountName: ACCOUNTS.VAT_COLLECTED.name,
        debitCents: 0,
        creditCents: vatCents,
        description: `Facture ${ref} – TVA collectee`,
        reference: ref,
      });
    }

    // --- Payout entries ---
    for (const payout of payouts) {
      const amountCents = payout.amountCents;
      const date = (payout.paidAt ?? payout.createdAt).toISOString();
      const journalId = `OD-${String(journalSeq++).padStart(6, '0')}`;
      const ref = payout.stripeTransferId ?? payout.id;

      // Debit: Partner retrocession (expense)
      entries.push({
        date,
        journalId,
        accountCode: ACCOUNTS.PARTNER_RETROCESSION.code,
        accountName: ACCOUNTS.PARTNER_RETROCESSION.name,
        debitCents: amountCents,
        creditCents: 0,
        description: `Retrocession ${payout.partnerOrg.name}`,
        reference: ref,
      });

      // Credit: Partner payable (liability)
      entries.push({
        date,
        journalId,
        accountCode: ACCOUNTS.PARTNER_PAYABLE.code,
        accountName: ACCOUNTS.PARTNER_PAYABLE.name,
        debitCents: 0,
        creditCents: amountCents,
        description: `Retrocession ${payout.partnerOrg.name}`,
        reference: ref,
      });
    }

    const headers = [
      'date',
      'journal_id',
      'account_code',
      'account_name',
      'debit_cents',
      'credit_cents',
      'description',
      'reference',
    ];

    const rows = entries.map((e) => [
      e.date,
      e.journalId,
      e.accountCode,
      e.accountName,
      String(e.debitCents),
      String(e.creditCents),
      e.description,
      e.reference,
    ]);

    return this.csvService.generateCsv(headers, rows);
  }

  /**
   * Extract VAT from Stripe-style lineItems JSON, falling back to FR 20 % estimate.
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

    // French TVA 20 % (included in gross): vat = gross * 0.20 / 1.20
    return Math.round((grossCents * 0.2) / 1.2);
  }
}
