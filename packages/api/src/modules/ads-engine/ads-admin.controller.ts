import {
  Controller,
  Post,
  Body,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdsSchedulerService } from './ads-scheduler.service';

// ═══════════════════════════════════════════════════════════════
// ADMIN-FACING AD ENGINE ENDPOINTS
// ═══════════════════════════════════════════════════════════════

@ApiTags('Admin Ads Engine')
@Controller('admin/ads')
export class AdsAdminController {
  private readonly logger = new Logger(AdsAdminController.name);

  constructor(private readonly adsScheduler: AdsSchedulerService) {}

  /**
   * POST /admin/ads/recompute
   *
   * Force recompute ad decisions for specific screens or all screens.
   * Idempotent — safe to call multiple times.
   *
   * Body:
   * - screenIds?: string[]  (if omitted, recomputes all)
   */
  @Post('recompute')
  @ApiOperation({ summary: 'Force recompute ad decisions' })
  @ApiBearerAuth()
  async forceRecompute(
    @Body() body: { screenIds?: string[] },
  ) {
    this.logger.log(
      `Admin force recompute: ${body.screenIds?.length ?? 'ALL'} screens`,
    );

    const result = await this.adsScheduler.forceRecompute(body.screenIds);

    return {
      data: {
        invalidated: result.invalidated,
        recomputed: result.recomputed,
        status: 'ok',
      },
    };
  }

  /**
   * POST /admin/ads/reset-counters
   *
   * Reset hourly/daily counters manually (normally done by cron).
   */
  @Post('reset-counters')
  @ApiOperation({ summary: 'Reset placement counters' })
  @ApiBearerAuth()
  async resetCounters(
    @Body() body: { scope: 'hourly' | 'daily' | 'both' },
  ) {
    let hourlyReset = 0;
    let dailyReset = 0;

    if (body.scope === 'hourly' || body.scope === 'both') {
      hourlyReset = await this.adsScheduler.resetHourlyCounters();
    }

    if (body.scope === 'daily' || body.scope === 'both') {
      dailyReset = await this.adsScheduler.resetDailyCounters();
    }

    return {
      data: {
        hourlyReset,
        dailyReset,
        status: 'ok',
      },
    };
  }

  /**
   * POST /admin/ads/invalidate
   *
   * Invalidate decision cache for specific screens or all.
   */
  @Post('invalidate')
  @ApiOperation({ summary: 'Invalidate ad decision cache' })
  @ApiBearerAuth()
  async invalidateCache(
    @Body() body: { screenIds?: string[]; reason?: string },
  ) {
    const reason = body.reason ?? 'admin_manual';

    let invalidated: number;
    if (body.screenIds?.length) {
      invalidated = await this.adsScheduler.invalidateCacheBatch(
        body.screenIds,
        reason,
      );
    } else {
      invalidated = await this.adsScheduler.invalidateAll(reason);
    }

    return {
      data: { invalidated, status: 'ok' },
    };
  }
}
