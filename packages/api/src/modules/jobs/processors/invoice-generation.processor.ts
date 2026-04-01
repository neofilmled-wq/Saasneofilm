import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue.constants';

export interface InvoiceGenerationJobData {
  type: 'GENERATE_MONTHLY' | 'GENERATE_SINGLE';
  organizationId?: string;
  campaignId?: string;
  periodStart?: string;
  periodEnd?: string;
}

@Processor(QUEUE_NAMES.INVOICE_GENERATION)
export class InvoiceGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceGenerationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<InvoiceGenerationJobData>): Promise<void> {
    const { type } = job.data;

    switch (type) {
      case 'GENERATE_MONTHLY':
        await this.generateMonthlyInvoices(job.data);
        break;
      case 'GENERATE_SINGLE':
        await this.generateSingleInvoice(job.data);
        break;
    }
  }

  private async generateMonthlyInvoices(data: InvoiceGenerationJobData): Promise<void> {
    const periodStart = data.periodStart ? new Date(data.periodStart) : this.getLastMonthStart();
    const periodEnd = data.periodEnd ? new Date(data.periodEnd) : this.getLastMonthEnd();

    // Find all advertiser organizations with active campaigns in the period
    const orgs = await this.prisma.organization.findMany({
      where: {
        type: 'ADVERTISER',
        campaigns: {
          some: {
            startDate: { lte: periodEnd },
            endDate: { gte: periodStart },
          },
        },
      },
      select: { id: true, name: true },
    });

    this.logger.log(
      `Generating monthly invoices for ${orgs.length} organizations (${periodStart.toISOString()} - ${periodEnd.toISOString()})`,
    );

    for (const org of orgs) {
      await this.generateSingleInvoice({
        type: 'GENERATE_SINGLE',
        organizationId: org.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
    }
  }

  private async generateSingleInvoice(data: InvoiceGenerationJobData): Promise<void> {
    if (!data.organizationId || !data.periodStart || !data.periodEnd) return;

    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);

    // Count impressions for the organization's campaigns in the period
    const impressions = await this.prisma.diffusionLog.count({
      where: {
        campaign: { is: { advertiserOrgId: data.organizationId } },
        startTime: { gte: periodStart, lt: periodEnd },
      },
    });

    this.logger.log(
      `Invoice for org ${data.organizationId}: ${impressions} impressions in period`,
    );

    // TODO: Create Stripe invoice via StripeService, store in DB
  }

  private getLastMonthStart(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getLastMonthEnd(): Date {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
