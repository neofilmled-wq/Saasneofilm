import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CurrentUser, Permissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes';
import {
  createBookingDraftSchema,
  createCheckoutSchema,
  updateBookingScreensSchema,
  purchaseAiCreditsSchema,
  createSubscriptionDraftSchema,
} from '@neofilm/shared';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('booking-draft')
  @Permissions('billing:write')
  @ApiOperation({ summary: 'Create a booking draft with selected screens' })
  async createBookingDraft(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createBookingDraftSchema)) body: any,
  ) {
    return this.billingService.createBookingDraft(user.orgId, body);
  }

  @Get('booking-draft/:id')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Get a booking draft by ID' })
  async getBookingDraft(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.billingService.getBookingDraft(id, user.orgId);
  }

  @Post('checkout')
  @Permissions('billing:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a Stripe checkout session for a booking' })
  async createCheckout(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createCheckoutSchema)) body: any,
  ) {
    return this.billingService.createCheckoutSession(
      body.bookingId,
      user.orgId,
      body,
    );
  }

  @Post('cancel/:bookingId')
  @Permissions('billing:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a subscription at end of billing period' })
  async cancelSubscription(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string,
  ) {
    return this.billingService.cancelSubscription(
      bookingId,
      user.orgId,
      user.id,
    );
  }

  @Patch('booking/:bookingId/screens')
  @Permissions('billing:write')
  @ApiOperation({ summary: 'Add or remove screens from an active booking' })
  async updateBookingScreens(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string,
    @Body(new ZodValidationPipe(updateBookingScreensSchema)) body: any,
  ) {
    return this.billingService.updateBookingScreens(
      bookingId,
      user.orgId,
      body,
      user.id,
    );
  }

  @Post('subscription-draft')
  @Permissions('billing:write')
  @ApiOperation({ summary: 'Create a subscription draft with pack pricing (diffusion/catalogue)' })
  async createSubscriptionDraft(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createSubscriptionDraftSchema)) body: any,
  ) {
    return this.billingService.createSubscriptionDraft(user.orgId, body);
  }

  @Post('ai-credits')
  @Permissions('billing:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purchase AI credits via Stripe checkout' })
  async purchaseAiCredits(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(purchaseAiCreditsSchema)) body: any,
  ) {
    return this.billingService.purchaseAiCredits(
      user.orgId,
      body,
      user.id,
    );
  }
}
