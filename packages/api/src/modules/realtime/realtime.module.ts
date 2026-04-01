import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../jobs/queue.constants';
import { EventBusService } from '../../services/realtime/event-bus.service';
import { EventMapperService } from '../../services/realtime/event-mapper.service';
import { PrismaRealtimeMiddleware } from '../../middlewares/prisma-realtime.middleware';
import { RealtimeGateway } from './realtime.gateway';
import { AdsRealtimeIntegration } from './ads-realtime-integration.service';
import { OfflineTvQueueService } from './offline-tv-queue.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULE_GENERATION }),
  ],
  providers: [
    EventBusService,
    EventMapperService,
    PrismaRealtimeMiddleware,
    RealtimeGateway,
    AdsRealtimeIntegration,
    OfflineTvQueueService,
  ],
  exports: [EventBusService, EventMapperService, OfflineTvQueueService],
})
export class RealtimeModule {}
