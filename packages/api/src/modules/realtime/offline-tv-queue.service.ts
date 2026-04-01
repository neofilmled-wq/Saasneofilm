import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { EventBusService } from '../../services/realtime/event-bus.service';
import type { DomainEvent } from '@neofilm/shared';

const OFFLINE_QUEUE_PREFIX = 'realtime:offline:';
const MAX_QUEUED_EVENTS = 100;
const QUEUE_TTL_SECONDS = 86400; // 24 hours

@Injectable()
export class OfflineTvQueueService {
  private readonly logger = new Logger(OfflineTvQueueService.name);
  private readonly connectedDevices = new Set<string>();

  constructor(
    private readonly redis: RedisService,
    private readonly eventBus: EventBusService,
  ) {
    this.eventBus.subscribe((event: DomainEvent) => {
      if (!event.actorRoleTargets.includes('device')) return;

      const deviceRooms = event.rooms.filter(
        (r) => r.startsWith('device:') || r.startsWith('screen:'),
      );

      for (const room of deviceRooms) {
        this.queueIfOffline(room, event).catch((err) =>
          this.logger.warn(`Offline queue error: ${(err as Error).message}`),
        );
      }
    });
  }

  markOnline(deviceId: string): void {
    this.connectedDevices.add(deviceId);
  }

  markOffline(deviceId: string): void {
    this.connectedDevices.delete(deviceId);
  }

  async getQueuedEvents(
    deviceId: string,
    sinceTimestamp?: string,
  ): Promise<DomainEvent[]> {
    const key = `${OFFLINE_QUEUE_PREFIX}device:${deviceId}`;
    const minScore = sinceTimestamp ? new Date(sinceTimestamp).getTime() : 0;

    const entries = await this.redis.zrangebyscore(key, minScore, '+inf');

    const events: DomainEvent[] = [];
    for (const entry of entries) {
      try {
        events.push(JSON.parse(entry));
      } catch {
        /* skip malformed */
      }
    }

    await this.redis.del(key);

    this.logger.debug(
      `Replayed ${events.length} queued events for device ${deviceId}`,
    );

    return events;
  }

  private async queueIfOffline(room: string, event: DomainEvent): Promise<void> {
    let targetId: string | null = null;

    if (room.startsWith('device:')) {
      targetId = room.replace('device:', '');
    } else {
      return;
    }

    if (!targetId || this.connectedDevices.has(targetId)) return;

    const key = `${OFFLINE_QUEUE_PREFIX}device:${targetId}`;
    const score = new Date(event.timestamp).getTime();

    await this.redis.zadd(key, score, JSON.stringify(event));

    const client = this.redis.getClient();
    const count = await client.zcard(key);
    if (count > MAX_QUEUED_EVENTS) {
      await client.zremrangebyrank(key, 0, count - MAX_QUEUED_EVENTS - 1);
    }

    await this.redis.expire(key, QUEUE_TTL_SECONDS);
  }
}
