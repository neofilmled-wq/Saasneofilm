import { Controller, Get, Post, Patch, Delete, Param, Body, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { Roles, Public, CurrentUser } from '../../common/decorators';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
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
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
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
    @Body() body: { pin: string; screenId: string },
    @CurrentUser() user: any,
  ) {
    // partnerOrgId MUST come from the token, never from the body: the old
    // contract let a caller send both screenId and partnerOrgId, so the
    // "screen belongs to this partner" check compared two attacker-controlled
    // values and always passed — letting anyone bind a stranger's TV to their
    // own screen and siphon its retrocessions.
    if (!user?.orgId) throw new BadRequestException('Aucune organisation associée');
    return this.devicesService.claimByPin({ ...body, partnerOrgId: user.orgId });
  }

  @Post('pair/claim-batch')
  @ApiOperation({ summary: 'Partner batch-claims multiple devices by PIN list' })
  async claimBatch(
    @Body() body: { claims: Array<{ pin: string; screenId: string }> },
    @CurrentUser() user: any,
  ) {
    if (!user?.orgId) throw new BadRequestException('Aucune organisation associée');
    return this.devicesService.claimBatch(body.claims, user.orgId);
  }

  // ─── Standard CRUD ───────────────────────────────────────────────────────

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
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
  @Roles('ADMIN', 'SUPER_ADMIN')
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
