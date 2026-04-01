import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { Roles } from '../../common/decorators';
import { SanitizePipe } from '../../common/pipes';

@ApiTags('Campaigns')
@ApiBearerAuth()
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'List campaigns' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('advertiserOrgId') advertiserOrgId?: string,
    @Query('groupId') groupId?: string,
    @Req() req?: any,
  ) {
    // Prefer JWT orgId over query param
    const orgId = req?.user?.orgId ?? advertiserOrgId;
    return this.campaignsService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
      advertiserOrgId: orgId,
      groupId,
    });
  }

  @Get('busy-screens')
  @ApiOperation({ summary: 'Get screen IDs already used by active campaigns for this advertiser, grouped by type' })
  async busyScreens(
    @Query('advertiserOrgId') advertiserOrgId?: string,
    @Req() req?: any,
  ) {
    const orgId = req?.user?.orgId ?? advertiserOrgId;
    return this.campaignsService.getBusyScreens(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  async findOne(@Param('id') id: string) {
    return this.campaignsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a campaign (with optional screen targeting)' })
  async create(@Body(SanitizePipe) data: any, @Req() req: any) {
    const advertiserOrgId = req?.user?.orgId ?? data.advertiserOrgId;
    return this.campaignsService.create({ ...data, advertiserOrgId });
  }

  @Post('create-full')
  @ApiOperation({ summary: 'Atomic creation: campaigns + creatives + catalogue in one transaction' })
  async createFull(@Body(SanitizePipe) data: any, @Req() req: any) {
    const advertiserOrgId = req?.user?.orgId ?? data.advertiserOrgId;
    try {
      return await this.campaignsService.createFull({ ...data, advertiserOrgId });
    } catch (error: any) {
      console.error('createFull error:', error);
      throw new (require('@nestjs/common').BadRequestException)(
        `createFull failed: ${error?.message ?? 'unknown'} | code: ${error?.code ?? 'none'} | meta: ${JSON.stringify(error?.meta ?? {})}`,
      );
    }
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish/activate a campaign → emits tv:ads:update to screens' })
  async publish(@Param('id') id: string) {
    return this.campaignsService.publish(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate an active campaign → emits tv:ads:update to screens' })
  async deactivate(@Param('id') id: string) {
    return this.campaignsService.deactivate(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a campaign' })
  async update(@Param('id') id: string, @Body(SanitizePipe) data: any) {
    return this.campaignsService.update(id, data);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Admin: force-update campaign status' })
  async updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.campaignsService.updateStatus(id, body.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a campaign' })
  async remove(@Param('id') id: string) {
    return this.campaignsService.remove(id);
  }
}
