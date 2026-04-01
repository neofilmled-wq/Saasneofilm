import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { AdminGateway } from '../admin/admin.gateway';
import { AdvertiserGateway } from '../advertiser-gateway/advertiser.gateway';
import { Roles } from '../../common/decorators';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly adminGateway: AdminGateway,
    private readonly advertiserGateway: AdvertiserGateway,
  ) {}

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List all organizations' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.organizationsService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      type,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  async findOne(@Param('id') id: string) {
    return this.organizationsService.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create an organization (with owner account for advertisers)' })
  async create(@Body() data: any) {
    // For ADVERTISER type, create full account with user + membership
    if (data.type === 'ADVERTISER') {
      const result = await this.organizationsService.createAdvertiserWithOwner({
        name: data.name,
        slug: data.slug,
        contactEmail: data.contactEmail,
        city: data.city,
        address: data.address,
        vatNumber: data.vatNumber,
        ownerFirstName: data.ownerFirstName,
        ownerLastName: data.ownerLastName,
      });

      // Emit real-time events
      this.adminGateway.emitAdvertisersChanged();
      this.adminGateway.emitDashboardUpdate();

      return result;
    }

    // For other types (PARTNER), use basic create
    const result = await this.organizationsService.create(data);
    this.adminGateway.emitPartnersChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update an organization' })
  async update(@Param('id') id: string, @Body() data: any) {
    const result = await this.organizationsService.update(id, data);

    // Emit real-time events based on org type
    if (result.type === 'ADVERTISER') {
      this.adminGateway.emitAdvertisersChanged();
      // Notify the advertiser's own dashboard
      this.advertiserGateway.emitCampaignsUpdate(id);
    } else {
      this.adminGateway.emitPartnersChanged();
    }
    this.adminGateway.emitDashboardUpdate();

    return result;
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete an organization' })
  async remove(@Param('id') id: string) {
    // Get org type before deletion for correct event emission
    const org = await this.organizationsService.findById(id);
    const result = await this.organizationsService.remove(id);

    if (org.type === 'ADVERTISER') {
      this.adminGateway.emitAdvertisersChanged();
    } else {
      this.adminGateway.emitPartnersChanged();
    }
    this.adminGateway.emitDashboardUpdate();

    return result;
  }
}
