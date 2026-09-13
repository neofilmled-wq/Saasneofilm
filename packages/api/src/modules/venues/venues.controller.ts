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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VenuesService } from './venues.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

/**
 * The venue service scopes every query on partnerOrgId — but that value used to
 * come from the client (query param / request body), so a partner could read or
 * edit another partner's venues just by sending their org id. The effective org
 * is now derived from the JWT: staff may target any org (via the query param),
 * everyone else is pinned to their own.
 */
function resolveOrg(user: any, requested?: string): string {
  const isAdmin = !!user?.platformRole && ADMIN_ROLES.includes(user.platformRole);
  const orgId = isAdmin ? (requested ?? user?.orgId) : user?.orgId;
  if (!orgId) throw new BadRequestException('Aucune organisation associée');
  return orgId;
}

@ApiTags('Venues')
@ApiBearerAuth()
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  @ApiOperation({ summary: 'List venues for a partner organization' })
  async findAll(@Query('partnerOrgId') partnerOrgId: string, @Req() req: any) {
    return this.venuesService.findAll(resolveOrg(req?.user, partnerOrgId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get venue by ID' })
  async findOne(
    @Param('id') id: string,
    @Query('partnerOrgId') partnerOrgId: string,
    @Req() req: any,
  ) {
    return this.venuesService.findById(id, resolveOrg(req?.user, partnerOrgId));
  }

  @Post()
  @ApiOperation({ summary: 'Create a venue' })
  async create(@Body() data: any, @Req() req: any) {
    // Force ownership to the caller's org — never trust body.partnerOrgId.
    const partnerOrgId = resolveOrg(req?.user, data?.partnerOrgId);
    return this.venuesService.create({ ...data, partnerOrgId });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a venue' })
  async update(@Param('id') id: string, @Body() data: any, @Req() req: any) {
    const { partnerOrgId: _ignored, ...updateData } = data ?? {};
    return this.venuesService.update(id, resolveOrg(req?.user, _ignored), updateData);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a venue' })
  async remove(
    @Param('id') id: string,
    @Query('partnerOrgId') partnerOrgId: string,
    @Req() req: any,
  ) {
    return this.venuesService.remove(id, resolveOrg(req?.user, partnerOrgId));
  }
}
