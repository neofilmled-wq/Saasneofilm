import {
  Controller, Get, Post, Patch, Query, Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PartnerCommissionsService } from './partner-commissions.service';
import { PayoutBatchService } from '../payouts/payout-batch.service';
import { Roles, CurrentUser } from '../../common/decorators';
import { OrgGuard } from '../../common/guards';

// ─── Partner-facing (/partner/commissions) ────────────────────────────────
// OrgGuard: a partner may only read its OWN orgId (?orgId=). Admins bypass.
// Closes the cross-tenant revenue leak flagged in the Phase 1 audit.
@ApiTags('Partner Commissions')
@ApiBearerAuth()
@UseGuards(OrgGuard)
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
  constructor(
    private readonly service: PartnerCommissionsService,
    private readonly payoutBatch: PayoutBatchService,
  ) {}

  @Patch('rate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update retrocession rate for a partner (10–20%)' })
  async updateRate(
    @Body() body: { partnerOrgId: string; ratePercent: number },
  ) {
    return this.service.updateCommissionRate(body.partnerOrgId, body.ratePercent);
  }

  @Post(':statementId/approve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Approve a CALCULATED statement (gate before Stripe payout)' })
  async approve(
    @Param('statementId') statementId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.approveStatement(statementId, userId);
  }

  @Post('approve-month')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Bulk-approve all CALCULATED statements for a month (YYYY-MM)' })
  async approveMonth(
    @Body() body: { month: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.service.approveMonth(body.month, userId);
  }

  @Post('pay-month')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: 'Run the Stripe payout batch for a month (YYYY-MM)',
    description:
      'Transfers every APPROVED revenue share of the month to its partner ' +
      'via Stripe Connect. Only SUPER_ADMIN — this moves real money.',
  })
  async payMonth(
    @Body() body: { month: string },
    @CurrentUser('id') userId: string,
  ) {
    const [year, m] = body.month.split('-').map(Number);
    const periodStart = new Date(year, m - 1, 1);
    const periodEnd = new Date(year, m, 1);
    return this.payoutBatch.processMonthlyPayouts(periodStart, periodEnd, userId);
  }

  @Post(':statementId/mark-paid')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Mark a revenue share statement as PAID (manual, no Stripe)' })
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
