import {
  Controller, Get, Post, Patch, Query, Param, Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PartnerCommissionsService } from './partner-commissions.service';
import { Roles } from '../../common/decorators';

// ─── Partner-facing (/partner/commissions) ────────────────────────────────
@ApiTags('Partner Commissions')
@ApiBearerAuth()
@Controller('partner/commissions')
export class PartnerCommissionsController {
  constructor(private readonly service: PartnerCommissionsService) {}

  @Get('wallet')
  @ApiOperation({ summary: "Partner wallet summary (real-time from campaigns)" })
  async getWallet(
    @Query('orgId') orgId: string,
    @Query('month') month?: string,
  ) {
    return this.service.getWalletSummary(orgId, month);
  }

  @Get('statements')
  @ApiOperation({ summary: 'List commission statements for a partner' })
  async getStatements(
    @Query('orgId') orgId: string,
    @Query('month') month?: string,
  ) {
    return this.service.getStatements(orgId, month);
  }

  @Get('statements/:id')
  @ApiOperation({ summary: 'Get a single commission statement with line items' })
  async getStatement(
    @Param('id') id: string,
    @Query('orgId') orgId: string,
  ) {
    return this.service.getStatement(id, orgId);
  }
}

// ─── Admin-facing (/admin/commissions) ────────────────────────────────────
@ApiTags('Admin Commissions')
@ApiBearerAuth()
@Controller('admin/commissions')
export class AdminCommissionsController {
  constructor(private readonly service: PartnerCommissionsService) {}

  @Patch('rate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update retrocession rate for a partner (10–20%)' })
  async updateRate(
    @Body() body: { partnerOrgId: string; ratePercent: number },
  ) {
    return this.service.updateCommissionRate(body.partnerOrgId, body.ratePercent);
  }

  @Post(':statementId/mark-paid')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Mark a revenue share statement as PAID' })
  async markPaid(@Param('statementId') statementId: string) {
    return this.service.markPaid(statementId);
  }

  @Post('compute')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Compute commission statements for a given month (YYYY-MM)' })
  async compute(@Body() body: { month: string }) {
    return this.service.computeStatements(body.month);
  }

  @Get('retrocessions')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'List all partner retrocessions for a month' })
  async getRetrocessions(
    @Query('month') month?: string,
    @Query('partnerOrgId') partnerOrgId?: string,
  ) {
    return this.service.getRetrocessions(month, partnerOrgId);
  }

  @Get('retrocessions/export')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Export retrocessions as CSV' })
  async exportRetrocessions(@Query('month') month: string) {
    return this.service.exportRetrocessionsCsv(month);
  }
}
