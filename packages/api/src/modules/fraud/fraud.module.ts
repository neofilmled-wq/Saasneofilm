import { Module } from '@nestjs/common';
import { FraudController } from './fraud.controller';
import { FraudDetectionService } from './fraud-detection.service';
import { AdminActionsService } from './admin-actions.service';

@Module({
  controllers: [FraudController],
  providers: [FraudDetectionService, AdminActionsService],
  exports: [FraudDetectionService, AdminActionsService],
})
export class FraudModule {}
