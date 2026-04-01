import { Module } from '@nestjs/common';
import { PricingEngineService } from './pricing-engine.service';
import { PricingController } from './pricing.controller';

@Module({
  controllers: [PricingController],
  providers: [PricingEngineService],
  exports: [PricingEngineService],
})
export class PricingModule {}
