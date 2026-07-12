import { Controller, Get, Patch, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PartnerProfileService } from './partner-profile.service';
import { OrgGuard } from '../../common/guards';

// OrgGuard: un partenaire ne peut lire/modifier QUE le profil de sa propre
// org (?orgId=). Ferme le détournement de compte inter-tenant (IDOR H1).
@ApiTags('Partner Profile')
@ApiBearerAuth()
@UseGuards(OrgGuard)
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
