import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../../common/decorators';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('events')
  @ApiOperation({ summary: 'Ingest analytics event' })
  async ingestEvent(@Body() data: any) {
    return this.analyticsService.ingestEvent(data);
  }

  @Get('dashboard')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get dashboard stats' })
  async getDashboardStats() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('advertiser')
  @ApiOperation({ summary: 'Get advertiser analytics: views per video, top screens' })
  async getAdvertiserAnalytics(
    @Req() req: any,
    @Query('advertiserOrgId') advertiserOrgId?: string,
  ) {
    const orgId = req?.user?.orgId ?? advertiserOrgId;
    return this.analyticsService.getAdvertiserAnalytics(orgId);
  }

  @Get('campaigns/:campaignId')
  @ApiOperation({ summary: 'Get campaign analytics' })
  async getCampaignAnalytics(@Param('campaignId') campaignId: string) {
    return this.analyticsService.getCampaignAnalytics(campaignId);
  }
}
