import { Controller, Get, Query, Req, BadRequestException, Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TvConfigService } from './tv-config.service';
import { IptvService } from './iptv.service';
import { TvAdsService } from './tv-ads.service';
import { TvMacrosService } from './tv-macros.service';
import { ActivitySponsorsService } from './activity-sponsors.service';
import { CatalogueService } from '../catalogue/catalogue.service';

/**
 * Device-facing TV configuration endpoints.
 * All require device JWT (type='device').
 *
 * GET /tv/config          — full TV config for device's screen
 * GET /tv/channels        — TNT channels from DB
 * GET /tv/iptv/channels   — live IPTV channels from M3U playlist (cached 6h)
 * GET /tv/streaming       — streaming services
 * GET /tv/activities      — activities for the device's org (with sponsor info)
 * GET /tv/catalogue       — advertiser catalogue listings targeting this screen
 * GET /tv/ads             — targeted ads for this screen
 * GET /tv/macros          — TV macros for this screen
 * GET /tv/bootstrap       — consolidated boot data
 */
@ApiTags('TV Config - Device')
@ApiBearerAuth()
@Controller('tv')
export class TvConfigController {
  private readonly logger = new Logger(TvConfigController.name);

  constructor(
    private readonly tvConfigService: TvConfigService,
    private readonly iptvService: IptvService,
    private readonly tvAdsService: TvAdsService,
    private readonly tvMacrosService: TvMacrosService,
    private readonly activitySponsorsService: ActivitySponsorsService,
    private readonly catalogueService: CatalogueService,
  ) {}

  // ── Helper ──────────────────────────────────────────────────────────────

  private requireDevice(req: any): { screenId: string | null; orgId: string | null } {
    const user = req.user;
    if (!user || user.type !== 'device') {
      throw new BadRequestException('Device JWT required');
    }
    return { screenId: user.screenId ?? null, orgId: user.orgId ?? null };
  }

  // ── Existing endpoints ──────────────────────────────────────────────────

  @Get('config')
  @ApiOperation({ summary: 'Get TV config for device screen' })
  async getConfig(@Req() req: any) {
    const { screenId } = this.requireDevice(req);
    if (!screenId) {
      return {
        screenId: null,
        enabledModules: ['TNT', 'STREAMING', 'ACTIVITIES'],
        defaultTab: 'TNT',
        partnerLogoUrl: null,
        welcomeMessage: null,
        tickerText: null,
      };
    }
    return this.tvConfigService.getConfigForScreen(screenId);
  }

  @Get('channels')
  @ApiOperation({ summary: 'Get TNT channels (aggregated from partner stream sources)' })
  async getChannels(@Req() req: any) {
    const { screenId } = this.requireDevice(req);
    return this.tvConfigService.getChannels(screenId);
  }

  @Get('iptv/channels')
  @ApiOperation({ summary: 'Get live IPTV channels from M3U playlist (cached 6h)' })
  @ApiQuery({ name: 'q', required: false, description: 'Search by name' })
  @ApiQuery({ name: 'group', required: false, description: 'Filter by group/category' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results', type: Number })
  async getIptvChannels(
    @Query('q') q?: string,
    @Query('group') group?: string,
    @Query('limit') limit?: string,
  ) {
    return this.iptvService.getChannels({
      q,
      group,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('streaming')
  @ApiOperation({ summary: 'Get streaming services' })
  async getStreaming() {
    return this.tvConfigService.getStreamingServices();
  }

  @Get('activities')
  @ApiOperation({ summary: 'Get activities for device org (with sponsor info)' })
  async getActivities(@Req() req: any) {
    const { orgId } = this.requireDevice(req);
    if (!orgId) return [];
    return this.activitySponsorsService.getActivitiesWithSponsors(orgId);
  }

  @Get('catalogue')
  @ApiOperation({ summary: 'Get active advertiser catalogue listings targeting this screen' })
  async getCatalogue(@Req() req: any) {
    const { screenId } = this.requireDevice(req);
    if (!screenId) return [];
    return this.catalogueService.getCatalogueForScreen(screenId);
  }

  // ── New endpoints ───────────────────────────────────────────────────────

  @Get('ads')
  @ApiOperation({ summary: 'Get targeted ads for device screen' })
  @ApiQuery({
    name: 'trigger',
    required: true,
    enum: ['POWER_ON', 'OPEN_APP', 'CHANGE_APP', 'CATALOG_OPEN', 'SCHEDULED'],
  })
  @ApiQuery({ name: 'maxAds', required: false, type: Number })
  async getAds(
    @Query('trigger') trigger: string,
    @Query('maxAds') maxAds?: string,
    @Req() req?: any,
  ) {
    const { screenId } = this.requireDevice(req);
    if (!screenId) {
      return { ads: [], fallbackHouseAds: [] };
    }
    return this.tvAdsService.getAdsForScreen(
      screenId,
      trigger,
      maxAds ? parseInt(maxAds, 10) : undefined,
    );
  }

  @Get('macros')
  @ApiOperation({ summary: 'Get TV macros for device screen' })
  async getMacros(@Req() req: any) {
    const { screenId } = this.requireDevice(req);
    if (!screenId) {
      return this.tvMacrosService.getMacrosForScreen('__default__');
    }
    return this.tvMacrosService.getMacrosForScreen(screenId);
  }

  @Get('bootstrap')
  @ApiOperation({ summary: 'Bootstrap: all TV data in one call' })
  async bootstrap(@Req() req: any) {
    const { screenId, orgId } = this.requireDevice(req);

    // Fetch all data in parallel
    const [config, channels, streamingServices, activities, catalogue, macros, ads] =
      await Promise.all([
        screenId
          ? this.tvConfigService.getConfigForScreen(screenId)
          : {
              screenId: null,
              enabledModules: ['TNT', 'STREAMING', 'ACTIVITIES'],
              defaultTab: 'TNT',
              partnerLogoUrl: null,
              welcomeMessage: null,
              tickerText: null,
            },
        this.tvConfigService.getChannels(screenId),
        this.tvConfigService.getStreamingServices(),
        orgId
          ? this.activitySponsorsService.getActivitiesWithSponsors(orgId)
          : [],
        screenId
          ? this.catalogueService.getCatalogueForScreen(screenId)
          : [],
        screenId
          ? this.tvMacrosService.getMacrosForScreen(screenId)
          : this.tvMacrosService.getMacrosForScreen('__default__'),
        screenId
          ? this.tvAdsService.getAdsForScreen(screenId, 'POWER_ON', 5)
          : { ads: [], fallbackHouseAds: [] },
      ]);

    this.logger.log(
      `Bootstrap for screen=${screenId}: ${ads.ads.length} ads, ${(activities as any[]).length} activities, ${(catalogue as any[]).length} catalogue`,
    );

    return {
      config,
      channels,
      streamingServices,
      activities,
      catalogue,
      macros,
      ads: ads.ads,
    };
  }
}
