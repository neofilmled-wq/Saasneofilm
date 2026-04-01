import { Module } from '@nestjs/common';
import { RevenueController } from './revenue.controller';
import { RevenueService } from './revenue.service';
import { RevenueComputationService } from './revenue-computation.service';
import { RevenueRuleService } from './revenue-rule.service';

@Module({
  controllers: [RevenueController],
  providers: [RevenueService, RevenueComputationService, RevenueRuleService],
  exports: [RevenueService, RevenueComputationService, RevenueRuleService],
})
export class RevenueModule {}
