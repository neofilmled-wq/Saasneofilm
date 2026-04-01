import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventBusService } from '../../services/realtime/event-bus.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../jobs/queue.constants';
import type { DomainEvent } from '@neofilm/shared';

/**
 * Listens for realtime domain events that affect the ads engine:
 * - Campaign created/updated/deleted -> invalidate AdDecisionCache for targeted screens
 * - AdPlacement created/updated/deleted -> invalidate cache for that screen
 * - Screen updated -> invalidate that screen's cache
 *
 * Triggers schedule regeneration via the existing BullMQ SCHEDULE_GENERATION queue.
 */
@Injectable()
export class AdsRealtimeIntegration implements OnModuleInit {
  private readonly logger = new Logger(AdsRealtimeIntegration.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCHEDULE_GENERATION)
    private readonly scheduleQueue: Queue,
  ) {}

  onModuleInit() {
    this.eventBus.subscribeToEntity('Campaign', (event) => {
      this.handleCampaignChange(event).catch((err) =>
        this.logger.warn(`Campaign change handler error: ${(err as Error).message}`),
      );
    });

    this.eventBus.subscribeToEntity('AdPlacement', (event) => {
      this.handleAdPlacementChange(event).catch((err) =>
        this.logger.warn(`AdPlacement change handler error: ${(err as Error).message}`),
      );
    });

    this.eventBus.subscribeToEntity('Screen', (event) => {
      this.handleScreenChange(event).catch((err) =>
        this.logger.warn(`Screen change handler error: ${(err as Error).message}`),
      );
    });

    this.logger.log('Ads realtime integration initialized');
  }

  private async handleCampaignChange(event: DomainEvent): Promise<void> {
    const campaignId = event.entityId;

    const targeting = await this.prisma.campaignTargeting.findUnique({
      where: { campaignId },
      select: {
        includedScreens: { select: { id: true } },
      },
    });

    if (!targeting) return;

    const screenIds = targeting.includedScreens.map((s: { id: string }) => s.id);
    await this.invalidateAndRegenerate(screenIds, `Campaign ${campaignId} ${event.action}`);
  }

  private async handleAdPlacementChange(event: DomainEvent): Promise<void> {
    const screenId = event.payload.screenId as string;
    if (!screenId) return;

    await this.invalidateAndRegenerate([screenId], `AdPlacement ${event.entityId} ${event.action}`);
  }

  private async handleScreenChange(event: DomainEvent): Promise<void> {
    await this.invalidateAndRegenerate([event.entityId], `Screen ${event.entityId} ${event.action}`);
  }

  private async invalidateAndRegenerate(screenIds: string[], reason: string): Promise<void> {
    if (screenIds.length === 0) return;

    // Invalidate AdDecisionCache entries
    await this.prisma.adDecisionCache.deleteMany({
      where: { screenId: { in: screenIds } },
    });

    // Clear Redis-cached decisions
    const redisKeys = screenIds.map((id) => `ad:decision:${id}`);
    await this.redis.del(...redisKeys);

    // Enqueue schedule regeneration per screen with debounce
    for (const screenId of screenIds) {
      await this.scheduleQueue.add(
        'regen-from-realtime',
        { type: 'REGENERATE_SINGLE', screenId },
        {
          deduplication: { id: `regen:${screenId}` },
          delay: 2000,
        },
      );
    }

    this.logger.debug(
      `${reason}: invalidated ${screenIds.length} screen caches, scheduled regeneration`,
    );
  }
}
