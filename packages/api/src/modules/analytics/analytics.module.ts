import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DashboardController } from './dashboard.controller';
import { DashboardSummaryService } from './dashboard-summary.service';
import { DashboardGateway } from './dashboard.gateway';

@Module({
  controllers: [AnalyticsController, DashboardController],
  providers: [AnalyticsService, DashboardSummaryService, DashboardGateway],
  exports: [AnalyticsService, DashboardSummaryService],
})
export class AnalyticsModule {}
