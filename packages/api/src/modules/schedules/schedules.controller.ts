import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SchedulesService, type ScheduleScopeCtx } from './schedules.service';
import { CurrentUser } from '../../common/decorators';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

/** Dérive le contexte org-scoped depuis le JWT (staff plateforme = bypass). */
function orgScope(user: any): ScheduleScopeCtx {
  return {
    orgId: user?.orgId ?? null,
    isAdmin: !!user?.platformRole && ADMIN_ROLES.includes(user.platformRole),
  };
}

@ApiTags('Schedules')
@ApiBearerAuth()
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'List schedules' })
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('screenId') screenId?: string,
  ) {
    return this.schedulesService.findAll(
      {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        screenId,
      },
      orgScope(user),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get schedule by ID' })
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.schedulesService.findById(id, orgScope(user));
  }

  @Get(':id/playlist')
  @ApiOperation({ summary: 'Resolve playlist for schedule' })
  async getPlaylist(@CurrentUser() user: any, @Param('id') id: string) {
    return this.schedulesService.resolvePlaylist(id, orgScope(user));
  }

  @Post()
  @ApiOperation({ summary: 'Create a schedule' })
  async create(@CurrentUser() user: any, @Body() data: any) {
    return this.schedulesService.create(data, orgScope(user));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a schedule' })
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() data: any) {
    return this.schedulesService.update(id, data, orgScope(user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a schedule' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.schedulesService.remove(id, orgScope(user));
  }
}
