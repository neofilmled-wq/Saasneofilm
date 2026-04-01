import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { Roles, Public } from '../../common/decorators';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'List all devices' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('screenId') screenId?: string,
  ) {
    return this.devicesService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
      screenId,
    });
  }

  // ─── Pairing endpoints (before :id) ──────────────────────────────────────

  @Get('pair/requests')
  @ApiOperation({ summary: 'List pending pairing requests (unclaimed PINs)' })
  async getPairingRequests(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.devicesService.getPairingRequests({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * Called by the TV device itself (no JWT — device hasn't paired yet).
   * TV shows the returned PIN on screen.
   */
  @Public()
  @Post('pair/request')
  @ApiOperation({ summary: 'TV device requests a pairing PIN (public — no auth)' })
  async requestPairing(@Body() body: { serialNumber: string; deviceType?: string }) {
    return this.devicesService.requestPairing(body);
  }

  @Post('pair/claim')
  @ApiOperation({ summary: 'Partner claims a device by PIN (single)' })
  async claimByPin(
    @Body() body: { pin: string; screenId: string; partnerOrgId: string },
  ) {
    return this.devicesService.claimByPin(body);
  }

  @Post('pair/claim-batch')
  @ApiOperation({ summary: 'Partner batch-claims multiple devices by PIN list' })
  async claimBatch(
    @Body() body: { claims: Array<{ pin: string; screenId: string }>; partnerOrgId: string },
  ) {
    return this.devicesService.claimBatch(body.claims, body.partnerOrgId);
  }

  // ─── Standard CRUD ───────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get device by ID' })
  async findOne(@Param('id') id: string) {
    return this.devicesService.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Register a new device (admin)' })
  async create(@Body() data: any) {
    return this.devicesService.create(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update device' })
  async update(@Param('id') id: string, @Body() data: any) {
    return this.devicesService.update(id, data);
  }

  @Post(':id/heartbeat')
  @ApiOperation({ summary: 'Device heartbeat' })
  async heartbeat(@Param('id') id: string, @Body() data: any) {
    return this.devicesService.heartbeat(id, data);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a device' })
  async remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }
}
