import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  ForbiddenException,
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

  /**
   * The authoritative deviceId is the one in the VERIFIED device JWT (sub),
   * never what the client puts in the query/body. Requires a device-type token
   * and rejects any client-supplied deviceId that doesn't match it — so a user
   * (or another device) can't submit proofs / heartbeats for someone else's
   * device. (audit H3)
   */
  private deviceIdFromToken(req: Request | undefined, provided?: string): string {
    const user = (req as any)?.user;
    if (!user || user.type !== 'device' || !user.id) {
      throw new ForbiddenException('A device token is required for this endpoint');
    }
    if (provided && provided !== user.id) {
      throw new ForbiddenException('deviceId does not match the authenticated device');
    }
    return user.id as string;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /diffusion/schedule
  // ──────────────────────────────────────────────────────────────────────────

  @Get('schedule')
  @ApiOperation({ summary: 'Pull schedule for a device' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getSchedule(
    @Query('deviceId') deviceIdParam: string,
    @Query('since') since?: string,
    @Req() req?: Request,
  ) {
    const deviceId = this.deviceIdFromToken(req, deviceIdParam);
    const sinceVersion = since ? parseInt(since, 10) : undefined;

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
  async submitProofBatch(
    @Body(new ZodValidationPipe(diffusionLogBatchSchema)) body: any,
    @Req() req?: Request,
  ) {
    const deviceId = this.deviceIdFromToken(req, body.deviceId);
    const result = await this.deviceSyncService.processProofBatch(
      deviceId,
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
  async heartbeat(
    @Body(new ZodValidationPipe(diffusionHeartbeatSchema)) body: any,
    @Req() req?: Request,
  ) {
    // Force the deviceId to the authenticated device (ignore/validate body).
    const deviceId = this.deviceIdFromToken(req, body.deviceId);
    return this.deviceSyncService.processHeartbeat({ ...body, deviceId });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /diffusion/cache/report
  // ──────────────────────────────────────────────────────────────────────────

  @Post('cache/report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report cached creatives on device' })
  @Throttle({ default: { limit: 6, ttl: 3600000 } }) // 6 per hour
  async cacheReport(
    @Body(new ZodValidationPipe(cacheReportSchema)) body: any,
    @Req() req?: Request,
  ) {
    const deviceId = this.deviceIdFromToken(req, body.deviceId);
    return this.deviceSyncService.processCacheReport({ ...body, deviceId });
  }
}
