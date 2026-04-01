import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SitesService } from './sites.service';

@ApiTags('Sites')
@ApiBearerAuth()
@Controller('partners/:partnerId/venues')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  async list(@Param('partnerId') partnerId: string) {
    const data = await this.sitesService.list(partnerId);
    return { data, total: data.length };
  }

  @Get(':venueId')
  async getById(
    @Param('partnerId') partnerId: string,
    @Param('venueId') venueId: string,
  ) {
    return this.sitesService.getById(partnerId, venueId);
  }

  @Post()
  async create(
    @Param('partnerId') partnerId: string,
    @Body() body: { name: string; address?: string; city?: string; postCode?: string; country?: string; timezone?: string; category?: string },
  ) {
    return this.sitesService.create(partnerId, body);
  }

  @Patch(':venueId')
  async update(
    @Param('partnerId') partnerId: string,
    @Param('venueId') venueId: string,
    @Body() body: { name?: string; address?: string; city?: string; postCode?: string; country?: string; timezone?: string; category?: string },
  ) {
    return this.sitesService.update(partnerId, venueId, body);
  }

  @Delete(':venueId')
  async delete(
    @Param('partnerId') partnerId: string,
    @Param('venueId') venueId: string,
  ) {
    await this.sitesService.delete(partnerId, venueId);
    return { success: true };
  }
}
