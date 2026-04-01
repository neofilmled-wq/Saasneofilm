import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { RedisService } from '../../modules/redis/redis.service';
import type { DomainEvent } from '@neofilm/shared';

const REDIS_CHANNEL = 'neofilm:domain-events';
const MAX_RECENT_IDS = 1000;

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private readonly emitter = new EventEmitter();
  private subscriber: Redis | null = null;

  private readonly recentEventIds = new Set<string>();
  private readonly recentEventOrder: string[] = [];

  constructor(private readonly redisService: RedisService) {
    this.emitter.setMaxListeners(50);
  }

  async onModuleInit() {
    this.subscriber = this.redisService.createSubscriber();

    await this.subscriber.subscribe(REDIS_CHANNEL);

    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        const event: DomainEvent = JSON.parse(message);
        if (!this.isDuplicate(event.eventId)) {
          this.trackEventId(event.eventId);
          this.emitLocally(event);
        }
      } catch (err) {
        this.logger.warn(`Failed to parse domain event: ${(err as Error).message}`);
      }
    });

    this.logger.log('EventBus initialized with Redis pub/sub');
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(REDIS_CHANNEL);
      await this.subscriber.quit();
    }
  }

  /**
   * Publish a domain event. Non-blocking for callers using setImmediate.
   * Emits locally first, then publishes to Redis for cross-instance delivery.
   */
  async publish(event: DomainEvent): Promise<void> {
    if (this.isDuplicate(event.eventId)) return;
    this.trackEventId(event.eventId);

    this.emitLocally(event);

    try {
      await this.redisService.publish(REDIS_CHANNEL, JSON.stringify(event));
    } catch (err) {
      this.logger.warn(`Redis publish failed: ${(err as Error).message}`);
    }
  }

  /** Subscribe to all domain events */
  subscribe(handler: (event: DomainEvent) => void): void {
    this.emitter.on('domain-event', handler);
  }

  /** Subscribe to events for a specific entity type */
  subscribeToEntity(entity: string, handler: (event: DomainEvent) => void): void {
    this.emitter.on(`domain-event:${entity}`, handler);
  }

  /** Subscribe to a specific entity+action pattern */
  subscribeToPattern(entity: string, action: string, handler: (event: DomainEvent) => void): void {
    this.emitter.on(`domain-event:${entity}:${action}`, handler);
  }

  unsubscribe(handler: (event: DomainEvent) => void): void {
    this.emitter.removeListener('domain-event', handler);
  }

  private emitLocally(event: DomainEvent): void {
    this.emitter.emit('domain-event', event);
    this.emitter.emit(`domain-event:${event.entity}`, event);
    this.emitter.emit(`domain-event:${event.entity}:${event.action}`, event);
  }

  private isDuplicate(eventId: string): boolean {
    return this.recentEventIds.has(eventId);
  }

  private trackEventId(eventId: string): void {
    this.recentEventIds.add(eventId);
    this.recentEventOrder.push(eventId);
    while (this.recentEventOrder.length > MAX_RECENT_IDS) {
      const oldest = this.recentEventOrder.shift()!;
      this.recentEventIds.delete(oldest);
    }
  }
}
