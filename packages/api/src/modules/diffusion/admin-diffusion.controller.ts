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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import {
  adminOverrideSchema,
  pauseCampaignSchema,
  blockScreenSchema,
} from '@neofilm/shared';
import { Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes';
import { CurrentUser } from '../../common/decorators';
import { OverrideManagerService } from './override-manager.service';
import { CampaignIndexerService } from './campaign-indexer.service';
import { SchedulerService } from './scheduler.service';
import { FraudDetectionService } from './fraud-detection.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * AdminDiffusionController
 *
 * Admin-facing endpoints for the diffusion engine:
 *   - POST /admin/diffusion/override     — force/block/pause campaigns
 *   - POST /admin/diffusion/pause-campaign
 *   - POST /admin/diffusion/block-screen
 *   - GET  /admin/diffusion/live-status
 *   - POST /admin/diffusion/index/rebuild
 *   - GET  /admin/diffusion/fraud/alerts
 */
@ApiTags('Diffusion - Admin')
@ApiBearerAuth()
@Controller('admin/diffusion')
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminDiffusionController {
  private readonly logger = new Logger(AdminDiffusionController.name);

  constructor(
    private readonly overrideManager: OverrideManagerService,
    private readonly campaignIndexer: CampaignIndexerService,
    private readonly scheduler: SchedulerService,
    private readonly fraudDetection: FraudDetectionService,
    private readonly prisma: PrismaService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // POST /admin/diffusion/override
  // ──────────────────────────────────────────────────────────────────────────

  @Post('override')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force, block, or pause a campaign on screens' })
  async createOverride(
    @Body(new ZodValidationPipe(adminOverrideSchema)) body: any,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const result = await this.overrideManager.createOverride({
      action: body.action,
      campaignId: body.campaignId,
      creativeId: body.creativeId,
      screenIds: body.screenIds,
      scope: body.scope,
      partnerOrgId: body.partnerOrgId,
      geoHash: body.geoHash,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      reason: body.reason,
      issuedBy: user?.id ?? 'system',
      ipAddress: req.ip || req.socket?.remoteAddress,
    });

    // Invalidate schedules for affected screens
    // The override manager already resolved the screen list
    this.scheduler.invalidateAll();

    return {
      overrideId: result.overrideId,
      action: body.action,
      affectedScreens: result.affectedScreens,
      propagatedAt: new Date().toISOString(),
      expiresAt: body.expiresAt ?? null,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /admin/diffusion/pause-campaign
  // ──────────────────────────────────────────────────────────────────────────

  @Post('pause-campaign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a campaign' })
  async pauseCampaign(
    @Body(new ZodValidationPipe(pauseCampaignSchema)) body: any,
    @CurrentUser() user: any,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: body.campaignId },
      select: { id: true, status: true },
    });

    if (!campaign) {
      return { error: 'Campaign not found' };
    }

    const previousStatus = campaign.status;

    // Update campaign status in DB
    await this.prisma.campaign.update({
      where: { id: body.campaignId },
      data: { status: 'FINISHED' },
    });

    // Remove from campaign index
    this.campaignIndexer.removeCampaignFromIndex(body.campaignId);

    // Invalidate affected schedules
    this.scheduler.invalidateAll();

    // Count affected screens
    const affectedScreens = await this.prisma.scheduleSlot.count({
      where: {
        campaignId: body.campaignId,
        schedule: { isActive: true },
      },
    });

    return {
      campaignId: body.campaignId,
      previousStatus,
      newStatus: 'FINISHED',
      affectedScreens,
      schedulesInvalidated: affectedScreens,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /admin/diffusion/block-screen
  // ──────────────────────────────────────────────────────────────────────────

  @Post('block-screen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a screen from showing ads' })
  async blockScreen(
    @Body(new ZodValidationPipe(blockScreenSchema)) body: any,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const result = await this.overrideManager.blockScreen({
      screenId: body.screenId,
      reason: body.reason,
      blockedBy: user?.id ?? 'system',
      blockAds: body.blockAds,
      blockHouseAds: body.blockHouseAds,
      ipAddress: req.ip || req.socket?.remoteAddress,
    });

    this.scheduler.invalidateSchedule(body.screenId);

    return {
      screenId: body.screenId,
      blocked: result.blocked,
      affectedCampaigns: result.affectedCampaigns,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /admin/diffusion/live-status
  // ──────────────────────────────────────────────────────────────────────────

  @Get('live-status')
  @ApiOperation({ summary: 'Get live status of all screens' })
  async getLiveStatus(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;

    const [summary, screens, total] = await Promise.all([
      this.getLiveStatusSummary(),
      this.prisma.screenLiveStatus.findMany({
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          screen: {
            select: {
              id: true,
              name: true,
              city: true,
              partnerOrgId: true,
              status: true,
            },
          },
        },
        orderBy: [{ isOnline: 'desc' }, { lastHeartbeatAt: 'desc' }],
      }),
      this.prisma.screenLiveStatus.count(),
    ]);

    const overrides = this.overrideManager.listActiveOverrides();

    return {
      summary: {
        ...summary,
        activeOverrides: overrides.length,
      },
      screens: screens.map((s) => ({
        screenId: s.screenId,
        name: s.screen.name,
        city: s.screen.city,
        isOnline: s.isOnline,
        lastHeartbeat: s.lastHeartbeatAt?.toISOString() ?? null,
        appVersion: s.appVersion,
        cpuPercent: s.cpuPercent,
        memoryPercent: s.memoryPercent,
        currentCampaignId: s.currentCampaignId,
        currentCreativeId: s.currentCreativeId,
        networkType: s.networkType,
        errorCount24h: s.errorCount24h,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /admin/diffusion/index/rebuild
  // ──────────────────────────────────────────────────────────────────────────

  @Post('index/rebuild')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Rebuild the campaign index' })
  async rebuildIndex() {
    const result = await this.campaignIndexer.rebuildFullIndex();

    // Invalidate all schedules since index changed
    this.scheduler.invalidateAll();

    return {
      status: 'COMPLETED',
      ...result,
      indexStats: this.campaignIndexer.getStats(),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /admin/diffusion/fraud/alerts
  // ──────────────────────────────────────────────────────────────────────────

  @Get('fraud/alerts')
  @ApiOperation({ summary: 'Get fraud detection alerts' })
  async getFraudAlerts(
    @Query('severity') severity?: string,
    @Query('deviceId') deviceId?: string,
    @Query('limit') limit?: string,
  ) {
    const alerts = this.fraudDetection.getAlerts({
      severity,
      deviceId,
      limit: limit ? parseInt(limit, 10) : 100,
      unresolved: true,
    });

    return {
      alerts,
      summary: this.fraudDetection.getAlertSummary(),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /admin/diffusion/overrides
  // ──────────────────────────────────────────────────────────────────────────

  @Get('overrides')
  @ApiOperation({ summary: 'List all active overrides' })
  async listOverrides() {
    return {
      overrides: this.overrideManager.listActiveOverrides(),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async getLiveStatusSummary() {
    const [
      totalScreens,
      onlineCount,
      activeCampaigns,
      impressionsToday,
    ] = await Promise.all([
      this.prisma.screen.count({ where: { status: 'ACTIVE' } }),
      this.prisma.screenLiveStatus.count({ where: { isOnline: true } }),
      this.prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      this.prisma.diffusionLog.count({
        where: {
          startTime: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      totalScreens,
      online: onlineCount,
      offline: totalScreens - onlineCount,
      activeCampaigns,
      impressionsToday,
    };
  }
}
