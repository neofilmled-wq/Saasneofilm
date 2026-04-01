import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TvConfigService } from './tv-config.service';
import { TvMacrosService } from './tv-macros.service';
import { ActivitySponsorsService } from './activity-sponsors.service';
import { DeviceGateway } from '../device-gateway/device.gateway';

/**
 * Partner-facing TV configuration endpoints.
 * Requires user JWT with org membership.
 */
@ApiTags('TV Config - Partner')
@ApiBearerAuth()
@Controller('partner')
export class TvConfigPartnerController {
  private readonly logger = new Logger(TvConfigPartnerController.name);

  constructor(
    private readonly tvConfigService: TvConfigService,
    private readonly tvMacrosService: TvMacrosService,
    private readonly activitySponsorsService: ActivitySponsorsService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  private getOrgId(req: any): string {
    const orgId = req.user?.orgId || req.query?.orgId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return orgId;
  }

  // ── TV Config ─────────────────────────────────────────────────────────

  @Get('tv-config/:screenId')
  @ApiOperation({ summary: 'Get TV config for a screen' })
  async getConfig(@Param('screenId') screenId: string) {
    return this.tvConfigService.getConfigForScreen(screenId);
  }

  @Put('tv-config/:screenId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert TV config for a screen' })
  async upsertConfig(
    @Param('screenId') screenId: string,
    @Body()
    body: {
      enabledModules?: string[];
      defaultTab?: 'TNT' | 'STREAMING' | 'ACTIVITIES' | 'SETTINGS';
      partnerLogoUrl?: string | null;
      welcomeMessage?: string | null;
      tickerText?: string | null;
    },
    @Req() req: any,
  ) {
    const orgId = this.getOrgId(req);
    const config = await this.tvConfigService.upsertConfig(screenId, orgId, body);

    // Push update to connected device via WebSocket
    this.deviceGateway.pushToScreen(screenId, 'tvConfig:update', { screenId });

    return config;
  }

  // ── TV Macros ─────────────────────────────────────────────────────────

  @Get('tv-macros/:screenId')
  @ApiOperation({ summary: 'Get TV macros for a screen' })
  async getMacros(@Param('screenId') screenId: string) {
    return this.tvMacrosService.getMacrosForScreen(screenId);
  }

  @Put('tv-macros/:screenId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert TV macros for a screen' })
  async upsertMacros(
    @Param('screenId') screenId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const orgId = this.getOrgId(req);
    const macros = await this.tvMacrosService.upsertMacros(screenId, orgId, body);

    // Push macros update to connected device
    this.deviceGateway.pushToScreen(screenId, 'tv:macros:update', {
      screenId,
      macros,
    });

    return macros;
  }

  // ── Activities ────────────────────────────────────────────────────────

  @Get('activities')
  @ApiOperation({ summary: 'List all activities for org' })
  async listActivities(@Req() req: any) {
    const orgId = this.getOrgId(req);
    return this.tvConfigService.listActivities(orgId);
  }

  @Post('activities')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an activity' })
  async createActivity(
    @Body()
    body: {
      name: string;
      description?: string;
      category?: string;
      imageUrl?: string;
      address?: string;
      phone?: string;
      website?: string;
      sortOrder?: number;
    },
    @Req() req: any,
  ) {
    const orgId = this.getOrgId(req);
    const activity = await this.tvConfigService.createActivity(orgId, body);

    // Notify devices of activity update
    this.deviceGateway.pushToOrgScreens(orgId, 'tv:activities:update', {
      reason: 'activity_created',
    });

    return activity;
  }

  @Put('activities/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an activity' })
  async updateActivity(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const orgId = this.getOrgId(req);
    const activity = await this.tvConfigService.updateActivity(id, orgId, body);

    this.deviceGateway.pushToOrgScreens(orgId, 'tv:activities:update', {
      reason: 'activity_updated',
    });

    return activity;
  }

  @Delete('activities/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an activity' })
  async deleteActivity(@Param('id') id: string, @Req() req: any) {
    const orgId = this.getOrgId(req);
    const result = await this.tvConfigService.deleteActivity(id, orgId);

    this.deviceGateway.pushToOrgScreens(orgId, 'tv:activities:update', {
      reason: 'activity_deleted',
    });

    return result;
  }

  // ── Activity Sponsors ─────────────────────────────────────────────────

  @Post('activity-sponsors')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a sponsored activity link' })
  async createSponsor(
    @Body()
    body: {
      activityPlaceId: string;
      campaignId: string;
      startDate: string;
      endDate: string;
      priorityBoost?: number;
    },
    @Req() req: any,
  ) {
    const sponsor = await this.activitySponsorsService.createSponsor(body);

    const orgId = this.getOrgId(req);
    this.deviceGateway.pushToOrgScreens(orgId, 'tv:activities:update', {
      reason: 'sponsor_created',
    });

    return sponsor;
  }

  @Delete('activity-sponsors/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a sponsored activity link' })
  async removeSponsor(@Param('id') id: string, @Req() req: any) {
    const result = await this.activitySponsorsService.removeSponsor(id);

    const orgId = this.getOrgId(req);
    this.deviceGateway.pushToOrgScreens(orgId, 'tv:activities:update', {
      reason: 'sponsor_removed',
    });

    return result;
  }
}
