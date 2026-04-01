import { Controller, Get, Patch, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PartnerProfileService } from './partner-profile.service';

@ApiTags('Partner Profile')
@ApiBearerAuth()
@Controller('partner/profile')
export class PartnerProfileController {
  constructor(private readonly service: PartnerProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get partner profile for an org' })
  async getProfile(@Query('orgId') orgId: string) {
    return this.service.getProfile(orgId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update partner profile (upsert)' })
  async upsertProfile(
    @Query('orgId') orgId: string,
    @Body() body: any,
  ) {
    return this.service.upsertProfile(orgId, body);
  }
}
