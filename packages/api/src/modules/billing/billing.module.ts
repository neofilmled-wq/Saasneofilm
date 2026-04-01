import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeProvider, STRIPE_CLIENT } from './stripe.provider';
import { PricingModule } from '../pricing/pricing.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ScreenFillService } from '../screens/screen-fill.service';

export { STRIPE_CLIENT };

@Module({
  imports: [ConfigModule, PricingModule, RealtimeModule],
  controllers: [BillingController],
  providers: [StripeProvider, BillingService, ScreenFillService],
  exports: [BillingService, StripeProvider, ScreenFillService],
})
export class BillingModule {}
