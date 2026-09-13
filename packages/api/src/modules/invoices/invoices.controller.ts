import { Controller, Get, Patch, Param, Body, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicesService, type InvoiceScopeCtx } from './invoices.service';
import { Roles } from '../../common/decorators';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];
function orgScope(user: any): InvoiceScopeCtx {
  return {
    orgId: user?.orgId ?? null,
    isAdmin: !!user?.platformRole && ADMIN_ROLES.includes(user.platformRole),
  };
}

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('organizationId') organizationId?: string,
    @Req() req?: any,
  ) {
    return this.invoicesService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
      organizationId,
      ctx: orgScope(req?.user),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  async findOne(@Param('id') id: string, @Req() req?: any) {
    return this.invoicesService.findById(id, orgScope(req?.user));
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update invoice status' })
  async updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.invoicesService.updateStatus(id, body.status);
  }
}
