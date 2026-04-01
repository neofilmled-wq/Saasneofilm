import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { AdminModule } from '../admin/admin.module';
import { PartnerGatewayModule } from '../partner-gateway/partner-gateway.module';
import { AdvertiserGatewayModule } from '../advertiser-gateway/advertiser-gateway.module';
import { StripeWebhookController } from './stripe-webhook.controller';
import { WebhookProcessorService } from './webhook-processor.service';
import { CheckoutHandler } from './handlers/checkout.handler';
import { InvoiceHandler } from './handlers/invoice.handler';
import { SubscriptionHandler } from './handlers/subscription.handler';
import { PaymentHandler } from './handlers/payment.handler';
import { DisputeHandler } from './handlers/dispute.handler';
import { ConnectHandler } from './handlers/connect.handler';

@Module({
  imports: [ConfigModule, BillingModule, AdminModule, PartnerGatewayModule, AdvertiserGatewayModule],
  controllers: [StripeWebhookController],
  providers: [
    WebhookProcessorService,
    CheckoutHandler,
    InvoiceHandler,
    SubscriptionHandler,
    PaymentHandler,
    DisputeHandler,
    ConnectHandler,
  ],
  exports: [WebhookProcessorService],
})
export class WebhooksModule {}
