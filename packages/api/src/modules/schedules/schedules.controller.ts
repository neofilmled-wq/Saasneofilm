import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SchedulesService } from './schedules.service';

@ApiTags('Schedules')
@ApiBearerAuth()
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'List schedules' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('screenId') screenId?: string,
  ) {
    return this.schedulesService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      screenId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get schedule by ID' })
  async findOne(@Param('id') id: string) {
    return this.schedulesService.findById(id);
  }

  @Get(':id/playlist')
  @ApiOperation({ summary: 'Resolve playlist for schedule' })
  async getPlaylist(@Param('id') id: string) {
    return this.schedulesService.resolvePlaylist(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a schedule' })
  async create(@Body() data: any) {
    return this.schedulesService.create(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a schedule' })
  async update(@Param('id') id: string, @Body() data: any) {
    return this.schedulesService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a schedule' })
  async remove(@Param('id') id: string) {
    return this.schedulesService.remove(id);
  }
}
