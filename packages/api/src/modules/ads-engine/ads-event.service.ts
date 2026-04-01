import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AdEventPayload {
  screenId: string;
  deviceId: string;
  campaignId?: string;
  creativeId?: string;
  advertiserId?: string;
  eventType: 'IMPRESSION' | 'SKIP' | 'COMPLETE' | 'CLICK' | 'ERROR' | 'DECISION_SERVED' | 'CACHE_HIT' | 'CACHE_MISS';
  triggerType?: string;
  durationMs?: number;
  completionPercent?: number;
  skipped?: boolean;
  signature?: string;
  idempotencyKey?: string;
}

@Injectable()
export class AdsEventService {
  private readonly logger = new Logger(AdsEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an ad event with idempotency.
   * If idempotencyKey already exists, returns the existing record (no double-write).
   */
  async recordEvent(payload: AdEventPayload): Promise<{ id: string; duplicate: boolean }> {
    // Idempotency check
    if (payload.idempotencyKey) {
      const existing = await this.prisma.adEvent.findUnique({
        where: { idempotencyKey: payload.idempotencyKey },
        select: { id: true },
      });

      if (existing) {
        return { id: existing.id, duplicate: true };
      }
    }

    const event = await this.prisma.adEvent.create({
      data: {
        screenId: payload.screenId,
        deviceId: payload.deviceId,
        campaignId: payload.campaignId,
        creativeId: payload.creativeId,
        advertiserId: payload.advertiserId,
        eventType: payload.eventType,
        triggerType: payload.triggerType,
        durationMs: payload.durationMs,
        completionPercent: payload.completionPercent,
        skipped: payload.skipped,
        signature: payload.signature,
        idempotencyKey: payload.idempotencyKey,
      },
    });

    return { id: event.id, duplicate: false };
  }

  /**
   * Batch record events (for bulk reporting from TV devices).
   */
  async recordEventBatch(
    events: AdEventPayload[],
  ): Promise<{ accepted: number; rejected: number; duplicates: number }> {
    let accepted = 0;
    let rejected = 0;
    let duplicates = 0;

    for (const event of events) {
      try {
        const result = await this.recordEvent(event);
        if (result.duplicate) {
          duplicates++;
        } else {
          accepted++;
        }
      } catch (err) {
        this.logger.warn(`Failed to record event: ${(err as Error).message}`);
        rejected++;
      }
    }

    return { accepted, rejected, duplicates };
  }

  /**
   * Get event counts for a screen (analytics).
   */
  async getScreenEventCounts(
    screenId: string,
    since: Date,
  ): Promise<Record<string, number>> {
    const events = await this.prisma.adEvent.groupBy({
      by: ['eventType'],
      where: {
        screenId,
        timestamp: { gte: since },
      },
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.eventType] = e._count.id;
    }
    return counts;
  }
}
