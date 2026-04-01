import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Roles, CurrentUser } from '../../common/decorators';
import { RevenueService } from './revenue.service';
import { RevenueComputationService } from './revenue-computation.service';
import { RevenueRuleService, CreateRevenueRuleDto } from './revenue-rule.service';

@ApiTags('Revenue')
@ApiBearerAuth()
@Controller('revenue')
export class RevenueController {
  private readonly logger = new Logger(RevenueController.name);

  constructor(
    private readonly revenueService: RevenueService,
    private readonly computationService: RevenueComputationService,
    private readonly ruleService: RevenueRuleService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Revenue Shares — CRUD / listing
  // ──────────────────────────────────────────────────────────────────────────

  @Get('shares')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List revenue shares with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'partnerOrgId', required: false, type: String })
  @ApiQuery({ name: 'periodStart', required: false, type: String })
  @ApiQuery({ name: 'periodEnd', required: false, type: String })
  async listShares(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('partnerOrgId') partnerOrgId?: string,
    @Query('periodStart') periodStartRaw?: string,
    @Query('periodEnd') periodEndRaw?: string,
  ) {
    const periodStart = periodStartRaw ? new Date(periodStartRaw) : undefined;
    const periodEnd = periodEndRaw ? new Date(periodEndRaw) : undefined;

    return this.revenueService.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status,
      partnerOrgId,
      periodStart,
      periodEnd,
    });
  }

  @Get('shares/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get a single revenue share with line items' })
  @ApiParam({ name: 'id', description: 'Revenue share ID' })
  async getShare(@Param('id') id: string) {
    return this.revenueService.findById(id);
  }

  @Get('summary')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get revenue share summary for a period' })
  @ApiQuery({ name: 'periodStart', required: true, type: String })
  @ApiQuery({ name: 'periodEnd', required: true, type: String })
  async getPeriodSummary(
    @Query('periodStart') periodStartRaw: string,
    @Query('periodEnd') periodEndRaw: string,
  ) {
    const { periodStart, periodEnd } = this.parsePeriod(periodStartRaw, periodEndRaw);
    return this.revenueService.getPeriodSummary(periodStart, periodEnd);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Revenue Shares — Computation
  // ──────────────────────────────────────────────────────────────────────────

  @Post('compute')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compute revenue shares for all paid invoices in a period' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['periodStart', 'periodEnd'],
      properties: {
        periodStart: { type: 'string', description: 'ISO 8601 date' },
        periodEnd: { type: 'string', description: 'ISO 8601 date' },
      },
    },
  })
  async computeForPeriod(
    @Body('periodStart') periodStartRaw: string,
    @Body('periodEnd') periodEndRaw: string,
    @CurrentUser('id') userId: string,
  ) {
    const { periodStart, periodEnd } = this.parsePeriod(periodStartRaw, periodEndRaw);
    this.logger.log(`Admin ${userId} triggered revenue computation for period`);
    return this.computationService.computeAllSharesForPeriod(periodStart, periodEnd, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Revenue Shares — Approval
  // ──────────────────────────────────────────────────────────────────────────

  @Post('shares/:id/approve')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a single COMPUTED revenue share' })
  @ApiParam({ name: 'id', description: 'Revenue share ID' })
  async approveShare(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.revenueService.approve(id, userId);
  }

  @Post('shares/bulk-approve')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk-approve all COMPUTED shares for a period' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['periodStart', 'periodEnd'],
      properties: {
        periodStart: { type: 'string', description: 'ISO 8601 date' },
        periodEnd: { type: 'string', description: 'ISO 8601 date' },
      },
    },
  })
  async bulkApprove(
    @Body('periodStart') periodStartRaw: string,
    @Body('periodEnd') periodEndRaw: string,
    @CurrentUser('id') userId: string,
  ) {
    const { periodStart, periodEnd } = this.parsePeriod(periodStartRaw, periodEndRaw);
    return this.revenueService.bulkApprove(periodStart, periodEnd, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Revenue Rules
  // ──────────────────────────────────────────────────────────────────────────

  @Get('rules')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List revenue rules, optionally filtered by partner' })
  @ApiQuery({ name: 'partnerOrgId', required: false, type: String })
  async listRules(@Query('partnerOrgId') partnerOrgId?: string) {
    return this.ruleService.findRules(partnerOrgId);
  }

  @Post('rules')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a new revenue sharing rule' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['platformRate', 'partnerRate', 'effectiveFrom'],
      properties: {
        platformRate: { type: 'number', description: 'Platform commission rate (0..1)', example: 0.30 },
        partnerRate: { type: 'number', description: 'Partner share rate (0..1)', example: 0.70 },
        effectiveFrom: { type: 'string', description: 'ISO 8601 date', example: '2026-03-01' },
        effectiveTo: { type: 'string', nullable: true },
        partnerOrgId: { type: 'string', nullable: true, description: 'Leave empty for global rule' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Rule created' })
  async createRule(
    @Body() body: CreateRevenueRuleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ruleService.createRule(body, userId);
  }

  @Post('rules/:id/deactivate')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a revenue rule' })
  @ApiParam({ name: 'id', description: 'Revenue rule ID' })
  async deactivateRule(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ruleService.deactivateRule(id, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private parsePeriod(
    periodStartRaw: string,
    periodEndRaw: string,
  ): { periodStart: Date; periodEnd: Date } {
    if (!periodStartRaw || !periodEndRaw) {
      throw new BadRequestException('Both periodStart and periodEnd are required');
    }

    const periodStart = new Date(periodStartRaw);
    const periodEnd = new Date(periodEndRaw);

    if (isNaN(periodStart.getTime())) {
      throw new BadRequestException(`Invalid periodStart: ${periodStartRaw}`);
    }
    if (isNaN(periodEnd.getTime())) {
      throw new BadRequestException(`Invalid periodEnd: ${periodEndRaw}`);
    }
    if (periodStart > periodEnd) {
      throw new BadRequestException('periodStart must be before periodEnd');
    }

    return { periodStart, periodEnd };
  }
}
