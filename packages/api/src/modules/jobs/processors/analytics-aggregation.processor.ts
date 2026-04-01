import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue.constants';

export interface AnalyticsAggregationJobData {
  type: 'HOURLY' | 'DAILY';
  date?: string; // ISO date string
}

@Processor(QUEUE_NAMES.ANALYTICS_AGGREGATION)
export class AnalyticsAggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsAggregationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<AnalyticsAggregationJobData>): Promise<void> {
    const { type, date } = job.data;
    const targetDate = date ? new Date(date) : new Date();

    switch (type) {
      case 'HOURLY':
        await this.aggregateHourly(targetDate);
        break;
      case 'DAILY':
        await this.aggregateDaily(targetDate);
        break;
    }
  }

  private async aggregateHourly(targetDate: Date): Promise<void> {
    const hourStart = new Date(targetDate);
    hourStart.setMinutes(0, 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 3600000);

    const impressions = await this.prisma.diffusionLog.count({
      where: {
        startTime: { gte: hourStart, lt: hourEnd },
      },
    });

    const completions = await this.prisma.diffusionLog.count({
      where: {
        startTime: { gte: hourStart, lt: hourEnd },
        verified: true,
      },
    });

    this.logger.log(
      `Hourly aggregation for ${hourStart.toISOString()}: ${impressions} impressions, ${completions} completions`,
    );
  }

  private async aggregateDaily(targetDate: Date): Promise<void> {
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const stats = await this.prisma.diffusionLog.groupBy({
      by: ['campaignId'],
      where: {
        startTime: { gte: dayStart, lt: dayEnd },
      },
      _count: { id: true },
    });

    this.logger.log(
      `Daily aggregation for ${dayStart.toISOString().split('T')[0]}: ${stats.length} campaigns with activity`,
    );
  }
}
