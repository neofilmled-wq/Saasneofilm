import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  RawBodyRequest,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators';
import { WebhookProcessorService } from './webhook-processor.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly webhookProcessor: WebhookProcessorService,
  ) {}

  /**
   * Main Stripe webhook endpoint.
   *
   * - Marked @Public to bypass JWT auth (Stripe calls this).
   * - Requires raw body for signature verification.
   * - Always returns 200 to prevent Stripe retries on processing errors.
   */
  @Post('stripe')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;

    if (!rawBody) {
      this.logger.error('No raw body available — ensure rawBody is enabled in NestJS');
      return { received: false, error: 'No raw body' };
    }

    const event = this.webhookProcessor.verifyAndConstruct(rawBody, signature);
    return this.webhookProcessor.processEvent(event);
  }

  /**
   * Stripe Connect webhook endpoint.
   *
   * Separate endpoint for Connect events (account.updated, payout.paid, etc.)
   * since they use a different webhook secret.
   */
  @Post('stripe-connect')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleStripeConnectWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;

    if (!rawBody) {
      this.logger.error('No raw body available for Connect webhook');
      return { received: false, error: 'No raw body' };
    }

    const event = this.webhookProcessor.verifyAndConstruct(rawBody, signature, true);
    return this.webhookProcessor.processEvent(event);
  }
}
