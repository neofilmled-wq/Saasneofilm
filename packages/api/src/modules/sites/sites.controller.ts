import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SitesService } from './sites.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

/**
 * partnerId comes from the URL. Without this check, any authenticated user could
 * list/read/create/edit/delete another partner's sites just by putting their id
 * in the path. Staff may act on any partner; everyone else only on their own org.
 */
function assertOwnPartner(user: any, partnerId: string): void {
  const isAdmin = !!user?.platformRole && ADMIN_ROLES.includes(user.platformRole);
  if (isAdmin) return;
  if (!user?.orgId || user.orgId !== partnerId) {
    throw new ForbiddenException("Accès refusé à l'organisation demandée");
  }
}

@ApiTags('Sites')
@ApiBearerAuth()
@Controller('partners/:partnerId/venues')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  async list(@Param('partnerId') partnerId: string, @Req() req: any) {
    assertOwnPartner(req?.user, partnerId);
    const data = await this.sitesService.list(partnerId);
    return { data, total: data.length };
  }

  @Get(':venueId')
  async getById(
    @Param('partnerId') partnerId: string,
    @Param('venueId') venueId: string,
    @Req() req: any,
  ) {
    assertOwnPartner(req?.user, partnerId);
    return this.sitesService.getById(partnerId, venueId);
  }

  @Post()
  async create(
    @Param('partnerId') partnerId: string,
    @Body() body: { name: string; address?: string; city?: string; postCode?: string; country?: string; timezone?: string; category?: string },
    @Req() req: any,
  ) {
    assertOwnPartner(req?.user, partnerId);
    return this.sitesService.create(partnerId, body);
  }

  @Patch(':venueId')
  async update(
    @Param('partnerId') partnerId: string,
    @Param('venueId') venueId: string,
    @Body() body: { name?: string; address?: string; city?: string; postCode?: string; country?: string; timezone?: string; category?: string },
    @Req() req: any,
  ) {
    assertOwnPartner(req?.user, partnerId);
    return this.sitesService.update(partnerId, venueId, body);
  }

  @Delete(':venueId')
  async delete(
    @Param('partnerId') partnerId: string,
    @Param('venueId') venueId: string,
    @Req() req: any,
  ) {
    assertOwnPartner(req?.user, partnerId);
    await this.sitesService.delete(partnerId, venueId);
    return { success: true };
  }
}
