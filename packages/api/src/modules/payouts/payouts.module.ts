import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PayoutsController } from './payouts.controller';
import { PayoutBatchService } from './payout-batch.service';
import { PartnerConnectService } from './partner-connect.service';

@Module({
  imports: [BillingModule],
  controllers: [PayoutsController],
  providers: [PayoutBatchService, PartnerConnectService],
  exports: [PayoutBatchService, PartnerConnectService],
})
export class PayoutsModule {}
