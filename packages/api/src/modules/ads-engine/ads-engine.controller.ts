import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdsSchedulerService, type TriggerType } from './ads-scheduler.service';
import { AdsEventService, type AdEventPayload } from './ads-event.service';

// ═══════════════════════════════════════════════════════════════
// TV-FACING AD ENDPOINTS (ADD-ON — does not replace existing)
// ═══════════════════════════════════════════════════════════════

@ApiTags('TV Ads Engine')
@Controller('tv/ads')
export class AdsEngineController {
  private readonly logger = new Logger(AdsEngineController.name);

  constructor(
    private readonly adsScheduler: AdsSchedulerService,
    private readonly adsEvent: AdsEventService,
  ) {}

  /**
   * GET /tv/ads/decision
   *
   * Returns the optimal ad selection for a screen.
   * Uses cache when available, computes on miss.
   *
   * Query params:
   * - screenId: required
   * - trigger: POWER_ON | CHANGE_APP | OPEN_APP | CATALOG_OPEN | SCHEDULED | MANUAL
   */
  @Get('decision')
  @ApiOperation({ summary: 'Get ad decision for a screen' })
  @ApiBearerAuth()
  async getDecision(
    @Query('screenId') screenId: string,
    @Query('trigger') trigger: string,
  ) {
    if (!screenId) {
      throw new BadRequestException('screenId is required');
    }

    const validTriggers = [
      'POWER_ON',
      'CHANGE_APP',
      'OPEN_APP',
      'CATALOG_OPEN',
      'SCHEDULED',
      'MANUAL',
    ];

    const triggerType = (
      validTriggers.includes(trigger) ? trigger : 'SCHEDULED'
    ) as TriggerType;

    const decision = await this.adsScheduler.getDecisionCached({
      screenId,
      triggerType,
      timestamp: new Date(),
    });

    // Log cache hit/miss event
    await this.adsEvent.recordEvent({
      screenId,
      deviceId: 'api', // Will be enriched by auth middleware
      eventType: decision.meta.computeTimeMs === 0 ? 'CACHE_HIT' : 'CACHE_MISS',
      triggerType,
    }).catch(() => {}); // Fire-and-forget

    return { data: decision };
  }

  /**
   * POST /tv/ads/event
   *
   * Records an ad event (impression, skip, complete, click, error).
   * Idempotent via idempotencyKey.
   */
  @Post('event')
  @ApiOperation({ summary: 'Record an ad event' })
  @ApiBearerAuth()
  async recordEvent(@Body() body: AdEventPayload) {
    if (!body.screenId || !body.deviceId || !body.eventType) {
      throw new BadRequestException(
        'screenId, deviceId, and eventType are required',
      );
    }

    const result = await this.adsEvent.recordEvent(body);

    return {
      data: {
        id: result.id,
        duplicate: result.duplicate,
        status: result.duplicate ? 'already_recorded' : 'accepted',
      },
    };
  }

  /**
   * POST /tv/ads/event/batch
   *
   * Batch record multiple events (for offline replay).
   */
  @Post('event/batch')
  @ApiOperation({ summary: 'Batch record ad events' })
  @ApiBearerAuth()
  async recordEventBatch(@Body() body: { events: AdEventPayload[] }) {
    if (!body.events?.length) {
      throw new BadRequestException('events array is required');
    }

    if (body.events.length > 100) {
      throw new BadRequestException('Maximum 100 events per batch');
    }

    const result = await this.adsEvent.recordEventBatch(body.events);

    return { data: result };
  }
}
