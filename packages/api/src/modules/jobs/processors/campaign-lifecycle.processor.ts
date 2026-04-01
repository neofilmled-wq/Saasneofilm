import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue.constants';

export interface CampaignLifecycleJobData {
  type: 'ACTIVATE' | 'EXPIRE' | 'DAILY_CHECK';
  campaignId?: string;
}

@Processor(QUEUE_NAMES.CAMPAIGN_LIFECYCLE)
export class CampaignLifecycleProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignLifecycleProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<CampaignLifecycleJobData>): Promise<void> {
    const { type, campaignId } = job.data;

    switch (type) {
      case 'ACTIVATE':
        if (campaignId) await this.activateCampaign(campaignId);
        break;
      case 'EXPIRE':
        if (campaignId) await this.expireCampaign(campaignId);
        break;
      case 'DAILY_CHECK':
        await this.dailyLifecycleCheck();
        break;
    }
  }

  private async activateCampaign(campaignId: string): Promise<void> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true, startDate: true },
    });

    if (campaign?.status === 'PENDING_REVIEW' && campaign.startDate <= new Date()) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'ACTIVE' },
      });
      this.logger.log(`Campaign ${campaignId} activated`);
    }
  }

  private async expireCampaign(campaignId: string): Promise<void> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true, endDate: true },
    });

    if (campaign?.status === 'ACTIVE' && campaign.endDate && campaign.endDate <= new Date()) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'FINISHED' },
      });
      this.logger.log(`Campaign ${campaignId} finished (expired)`);
    }
  }

  private async dailyLifecycleCheck(): Promise<void> {
    const now = new Date();

    // Activate approved campaigns that have reached their start date
    const toActivate = await this.prisma.campaign.findMany({
      where: { status: 'PENDING_REVIEW', startDate: { lte: now } },
      select: { id: true },
    });
    for (const c of toActivate) {
      await this.activateCampaign(c.id);
    }

    // Expire active campaigns that have passed their end date
    const toExpire = await this.prisma.campaign.findMany({
      where: { status: 'ACTIVE', endDate: { lte: now } },
      select: { id: true },
    });
    for (const c of toExpire) {
      await this.expireCampaign(c.id);
    }

    this.logger.log(
      `Daily lifecycle check: ${toActivate.length} activated, ${toExpire.length} expired`,
    );
  }
}
