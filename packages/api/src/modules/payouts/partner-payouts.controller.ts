import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { PartnerConnectService } from './partner-connect.service';
import { PayoutBatchService } from './payout-batch.service';

/**
 * Partner-facing payout endpoints. Everything is scoped to the caller's OWN
 * organisation via `user.orgId` from the JWT — a partner can never touch
 * another org's payout config (no orgId is read from the request body/params).
 */
@ApiTags('Partner Payouts')
@ApiBearerAuth()
@Controller('partner/payouts')
export class PartnerPayoutsController {
  constructor(
    private readonly connect: PartnerConnectService,
    private readonly payoutBatch: PayoutBatchService,
  ) {}

  @Get('connect/status')
  @ApiOperation({ summary: 'Stripe Connect status of the current partner' })
  async getStatus(@CurrentUser() user: any) {
    if (!user?.orgId) throw new BadRequestException('Aucune organisation associée');
    try {
      return await this.connect.getConnectStatus(user.orgId);
    } catch {
      // No Connect account yet → return a "not configured" shape instead of 404
      // so the UI can show the "Configurer" call to action.
      return {
        configured: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      };
    }
  }

  @Post('connect/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create/continue Stripe Connect onboarding for the current partner',
    description:
      'Returns a Stripe-hosted onboarding URL where the partner enters their ' +
      'bank details (IBAN). Creates the Connect account on first call.',
  })
  async setup(
    @CurrentUser() user: any,
    @Body() body: { refreshUrl: string; returnUrl: string },
  ) {
    if (!user?.orgId) throw new BadRequestException('Aucune organisation associée');
    if (!body?.refreshUrl || !body?.returnUrl) {
      throw new BadRequestException('refreshUrl et returnUrl requis');
    }
    return this.connect.setupPartnerConnect(user.orgId, user.id ?? user.sub, {
      refreshUrl: body.refreshUrl,
      returnUrl: body.returnUrl,
    });
  }

  @Get('history')
  @ApiOperation({ summary: 'Payout history of the current partner' })
  async history(@CurrentUser() user: any) {
    if (!user?.orgId) throw new BadRequestException('Aucune organisation associée');
    return this.payoutBatch.getPartnerPayoutHistory(user.orgId, 1, 50);
  }
}
