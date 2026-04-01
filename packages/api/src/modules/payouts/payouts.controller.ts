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
import { PayoutBatchService } from './payout-batch.service';
import { PartnerConnectService, OnboardingLinkDto } from './partner-connect.service';

@ApiTags('Payouts')
@ApiBearerAuth()
@Controller('payouts')
export class PayoutsController {
  private readonly logger = new Logger(PayoutsController.name);

  constructor(
    private readonly payoutBatchService: PayoutBatchService,
    private readonly partnerConnectService: PartnerConnectService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Payout listing / detail
  // ──────────────────────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all payouts with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'partnerOrgId', required: false, type: String })
  async listPayouts(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('partnerOrgId') partnerOrgId?: string,
  ) {
    return this.payoutBatchService.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status,
      partnerOrgId,
    });
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get a single payout with line items and revenue shares' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  async getPayoutById(@Param('id') id: string) {
    return this.payoutBatchService.findById(id);
  }

  @Get('partner/:orgId/history')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get payout history for a specific partner' })
  @ApiParam({ name: 'orgId', description: 'Partner organization ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPartnerHistory(
    @Param('orgId') orgId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.payoutBatchService.getPartnerPayoutHistory(
      orgId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Payout summary / batch
  // ──────────────────────────────────────────────────────────────────────────

  @Get('summary/period')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get payout summary for a period' })
  @ApiQuery({ name: 'periodStart', required: true, type: String })
  @ApiQuery({ name: 'periodEnd', required: true, type: String })
  async getPayoutSummary(
    @Query('periodStart') periodStartRaw: string,
    @Query('periodEnd') periodEndRaw: string,
  ) {
    const { periodStart, periodEnd } = this.parsePeriod(periodStartRaw, periodEndRaw);
    return this.payoutBatchService.getPayoutSummary(periodStart, periodEnd);
  }

  @Post('batch')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Process monthly payout batch',
    description:
      'Processes all APPROVED revenue shares for the given period. ' +
      'Creates Stripe transfers via Connect for eligible partners.',
  })
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
  @ApiResponse({ status: 200, description: 'Batch processing result' })
  async processBatch(
    @Body('periodStart') periodStartRaw: string,
    @Body('periodEnd') periodEndRaw: string,
    @CurrentUser('id') userId: string,
  ) {
    const { periodStart, periodEnd } = this.parsePeriod(periodStartRaw, periodEndRaw);
    this.logger.warn(`Super admin ${userId} triggering payout batch`);
    return this.payoutBatchService.processMonthlyPayouts(periodStart, periodEnd, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Payout actions (hold / release)
  // ──────────────────────────────────────────────────────────────────────────

  @Post(':id/hold')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hold a payout (prevent transfer)' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  async holdPayout(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.payoutBatchService.holdPayout(id, userId);
    return { message: `Payout ${id} held` };
  }

  @Post(':id/release')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release a held payout for processing' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  async releasePayout(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.payoutBatchService.releasePayout(id, userId);
    return { message: `Payout ${id} released` };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Connect onboarding
  // ──────────────────────────────────────────────────────────────────────────

  @Post('connect/create/:orgId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a Stripe Connect Express account for a partner' })
  @ApiParam({ name: 'orgId', description: 'Partner organization ID' })
  async createConnectAccount(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.partnerConnectService.createConnectAccount(orgId, userId);
  }

  @Post('connect/onboarding-link/:orgId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a Stripe Connect onboarding link' })
  @ApiParam({ name: 'orgId', description: 'Partner organization ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshUrl', 'returnUrl'],
      properties: {
        refreshUrl: { type: 'string', example: 'https://admin.neofilm.fr/connect/refresh' },
        returnUrl: { type: 'string', example: 'https://admin.neofilm.fr/connect/return' },
      },
    },
  })
  async createOnboardingLink(
    @Param('orgId') orgId: string,
    @Body() body: OnboardingLinkDto,
  ) {
    return this.partnerConnectService.createOnboardingLink(orgId, body);
  }

  @Get('connect/status/:orgId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get Stripe Connect account status for a partner' })
  @ApiParam({ name: 'orgId', description: 'Partner organization ID' })
  async getConnectStatus(@Param('orgId') orgId: string) {
    return this.partnerConnectService.getConnectStatus(orgId);
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
