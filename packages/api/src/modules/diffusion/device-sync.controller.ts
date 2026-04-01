import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UsePipes,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  scheduleQuerySchema,
  diffusionLogBatchSchema,
  diffusionHeartbeatSchema,
  cacheReportSchema,
} from '@neofilm/shared';
import { ZodValidationPipe } from '../../common/pipes';
import { DeviceSyncService } from './device-sync.service';

/**
 * DeviceSyncController
 *
 * Device-facing endpoints for the diffusion engine:
 *   - GET  /diffusion/schedule     — pull current schedule
 *   - POST /diffusion/log          — submit proof batch
 *   - POST /diffusion/heartbeat    — device heartbeat
 *   - POST /diffusion/cache/report — cache status report
 */
@ApiTags('Diffusion - Device')
@ApiBearerAuth()
@Controller('diffusion')
export class DeviceSyncController {
  private readonly logger = new Logger(DeviceSyncController.name);

  constructor(private readonly deviceSyncService: DeviceSyncService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // GET /diffusion/schedule
  // ──────────────────────────────────────────────────────────────────────────

  @Get('schedule')
  @ApiOperation({ summary: 'Pull schedule for a device' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getSchedule(
    @Query('deviceId') deviceId: string,
    @Query('since') since?: string,
    @Req() req?: Request,
  ) {
    const sinceVersion = since ? parseInt(since, 10) : undefined;
    const etag = req?.headers['if-none-match'] as string | undefined;

    const result = await this.deviceSyncService.getScheduleForDevice(
      deviceId,
      sinceVersion,
    );

    if (result === null) {
      // 304 Not Modified — schedule hasn't changed
      return { notModified: true, version: sinceVersion };
    }

    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /diffusion/log
  // ──────────────────────────────────────────────────────────────────────────

  @Post('log')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submit diffusion proof batch' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(diffusionLogBatchSchema))
  async submitProofBatch(@Body() body: any) {
    const result = await this.deviceSyncService.processProofBatch(
      body.deviceId,
      body.batchId,
      body.proofs,
    );

    return {
      batchId: body.batchId,
      accepted: result.accepted,
      rejected: result.rejected,
      rejections: result.results
        .filter((r: any) => !r.accepted)
        .map((r: any) => ({
          proofId: r.proofId,
          reason: r.reason,
        })),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /diffusion/heartbeat
  // ──────────────────────────────────────────────────────────────────────────

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Device heartbeat with playback status' })
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(diffusionHeartbeatSchema))
  async heartbeat(@Body() body: any) {
    return this.deviceSyncService.processHeartbeat(body);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /diffusion/cache/report
  // ──────────────────────────────────────────────────────────────────────────

  @Post('cache/report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report cached creatives on device' })
  @Throttle({ default: { limit: 6, ttl: 3600000 } }) // 6 per hour
  @UsePipes(new ZodValidationPipe(cacheReportSchema))
  async cacheReport(@Body() body: any) {
    return this.deviceSyncService.processCacheReport(body);
  }
}
