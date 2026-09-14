import { Controller, Get, Patch, Query, Body, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PartnerProfileService } from './partner-profile.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

/**
 * orgId used to be read straight from the query param: omitting it 500'd
 * (findUnique with orgId=undefined), and passing another partner's id exposed
 * their profile (IDOR). It now comes from the JWT; staff may target any org.
 */
function resolveOrg(user: any, requested?: string): string {
  const isAdmin = !!user?.platformRole && ADMIN_ROLES.includes(user.platformRole);
  const orgId = isAdmin ? (requested ?? user?.orgId) : user?.orgId;
  if (!orgId) throw new BadRequestException('Aucune organisation associée');
  return orgId;
}

@ApiTags('Partner Profile')
@ApiBearerAuth()
@Controller('partner/profile')
export class PartnerProfileController {
  constructor(private readonly service: PartnerProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get partner profile for the current org' })
  async getProfile(@Query('orgId') orgId: string, @Req() req: any) {
    return this.service.getProfile(resolveOrg(req?.user, orgId));
  }

  @Patch()
  @ApiOperation({ summary: 'Update partner profile (upsert)' })
  async upsertProfile(
    @Query('orgId') orgId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.service.upsertProfile(resolveOrg(req?.user, orgId), body);
  }
}
