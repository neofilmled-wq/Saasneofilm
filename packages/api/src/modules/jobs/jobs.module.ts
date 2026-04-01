import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants';
import { EmailProcessor } from './processors/email.processor';
import { CampaignLifecycleProcessor } from './processors/campaign-lifecycle.processor';
import { DeviceStatusProcessor } from './processors/device-status.processor';
import { AnalyticsAggregationProcessor } from './processors/analytics-aggregation.processor';
import { InvoiceGenerationProcessor } from './processors/invoice-generation.processor';
import { ScheduleGenerationProcessor } from './processors/schedule-generation.processor';

const QUEUES = Object.values(QUEUE_NAMES).map((name) => BullModule.registerQueue({ name }));

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: null,
          enableOfflineQueue: true,
          connectTimeout: 5000,
          retryStrategy: (times: number) => Math.min(times * 500, 10000),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      }),
    }),
    ...QUEUES,
  ],
  providers: [
    EmailProcessor,
    CampaignLifecycleProcessor,
    DeviceStatusProcessor,
    AnalyticsAggregationProcessor,
    InvoiceGenerationProcessor,
    ScheduleGenerationProcessor,
  ],
  exports: [BullModule],
})
export class JobsModule {}
