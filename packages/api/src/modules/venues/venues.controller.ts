import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VenuesService } from './venues.service';

@ApiTags('Venues')
@ApiBearerAuth()
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  @ApiOperation({ summary: 'List venues for a partner organization' })
  async findAll(@Query('partnerOrgId') partnerOrgId: string) {
    return this.venuesService.findAll(partnerOrgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get venue by ID' })
  async findOne(
    @Param('id') id: string,
    @Query('partnerOrgId') partnerOrgId: string,
  ) {
    return this.venuesService.findById(id, partnerOrgId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a venue' })
  async create(@Body() data: any) {
    return this.venuesService.create(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a venue' })
  async update(
    @Param('id') id: string,
    @Body() data: any,
  ) {
    const { partnerOrgId, ...updateData } = data;
    return this.venuesService.update(id, partnerOrgId, updateData);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a venue' })
  async remove(
    @Param('id') id: string,
    @Query('partnerOrgId') partnerOrgId: string,
  ) {
    return this.venuesService.remove(id, partnerOrgId);
  }
}
