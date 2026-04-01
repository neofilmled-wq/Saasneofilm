import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ScreensService } from './screens.service';
import { Roles, CurrentUser } from '../../common/decorators';

@ApiTags('Screens')
@ApiBearerAuth()
@Controller('screens')
export class ScreensController {
  constructor(private readonly screensService: ScreensService) {}

  // ─── LIST ────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List screens' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('partnerOrgId') partnerOrgId?: string,
    @Query('connectivity') connectivity?: string,
    @Query('search') search?: string,
  ) {
    return this.screensService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
      partnerOrgId,
      connectivity,
      search,
    });
  }

  // ─── MAP ENDPOINTS (must come before :id) ────────────────────────────────

  @Get('map')
  @ApiOperation({ summary: 'Active screens for advertiser targeting map (with occupancy)' })
  async getMap() {
    return this.screensService.findForMap();
  }

  @Get('partner-map')
  @ApiOperation({ summary: "Partner-facing map: all this partner's screens with occupancy" })
  async getPartnerMap(@Query('partnerOrgId') partnerOrgId: string) {
    return this.screensService.findForPartnerMap(partnerOrgId);
  }

  @Get('status-summary')
  @ApiOperation({ summary: 'Online / Offline / Maintenance counts for a partner' })
  async getStatusSummary(@Query('partnerOrgId') partnerOrgId: string) {
    return this.screensService.getStatusSummary(partnerOrgId);
  }

  @Get('ranking')
  @ApiOperation({ summary: 'Screens ranked by advertiser count (partner-facing)' })
  async getRanking(
    @Query('partnerOrgId') partnerOrgId: string,
    @Query('limit') limit?: string,
  ) {
    return this.screensService.getRanking(partnerOrgId, limit ? parseInt(limit, 10) : 20);
  }

  // ─── BULK CREATE ─────────────────────────────────────────────────────────

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk create screens from JSON rows (CSV import)' })
  async bulkCreate(
    @Body() body: { partnerOrgId: string; rows: Array<Record<string, any>> },
  ) {
    return this.screensService.bulkCreate(body.partnerOrgId, body.rows);
  }

  // ─── SINGLE CRUD ─────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get screen by ID' })
  async findOne(@Param('id') id: string) {
    return this.screensService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a screen' })
  async create(@Body() data: any) {
    return this.screensService.create(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a screen' })
  async update(@Param('id') id: string, @Body() data: any) {
    return this.screensService.update(id, data);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a screen' })
  async remove(@Param('id') id: string) {
    return this.screensService.remove(id);
  }

  // ─── STATUS TRANSITIONS ──────────────────────────────────────────────────

  @Post(':id/publish')
  @ApiOperation({ summary: 'Set screen status to ACTIVE (publish)' })
  async publish(@Param('id') id: string) {
    return this.screensService.publish(id);
  }

  @Post(':id/maintenance')
  @ApiOperation({ summary: 'Set screen to MAINTENANCE mode' })
  async setMaintenance(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.screensService.setMaintenance(id, body.reason);
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Set screen status to INACTIVE (disable)' })
  async disable(@Param('id') id: string) {
    return this.screensService.setDisabled(id);
  }

  @Post(':id/re-pair')
  @ApiOperation({ summary: 'Invalidate current device pairing and generate a new PIN for a screen' })
  async rePair(@Param('id') id: string, @Query('partnerOrgId') partnerOrgId: string) {
    return this.screensService.rePair(id, partnerOrgId);
  }
}
