import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardSummaryService } from './dashboard-summary.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly summaryService: DashboardSummaryService,
  ) {}

  @Get('summary')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get admin dashboard summary' })
  async getSummary() {
    return this.summaryService.getSummary();
  }

  @Get('partners')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get partners list with stats' })
  async getPartners() {
    const partners = await this.prisma.organization.findMany({
      where: { type: 'PARTNER' },
      include: {
        _count: { select: { screens: true, memberships: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: partners };
  }

  @Get('advertisers')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get advertisers list with stats' })
  async getAdvertisers() {
    const advertisers = await this.prisma.organization.findMany({
      where: { type: 'ADVERTISER' },
      include: {
        _count: { select: { campaigns: true, memberships: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: advertisers };
  }

  @Get('screens')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get all screens with live status' })
  async getScreens() {
    const screens = await this.prisma.screen.findMany({
      include: {
        partnerOrg: { select: { name: true } },
        screenLiveStatus: true,
        devices: {
          where: { status: 'ONLINE' },
          take: 1,
          select: { id: true, serialNumber: true, status: true, appVersion: true, lastPingAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: screens };
  }
}
