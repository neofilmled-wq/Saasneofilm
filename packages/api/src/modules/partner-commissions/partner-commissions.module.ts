import { Module } from '@nestjs/common';
import {
  PartnerCommissionsController,
  AdminCommissionsController,
} from './partner-commissions.controller';
import { PartnerCommissionsService } from './partner-commissions.service';
import { PartnerGatewayModule } from '../partner-gateway/partner-gateway.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [PartnerGatewayModule, PayoutsModule, AdminModule],
  controllers: [PartnerCommissionsController, AdminCommissionsController],
  providers: [PartnerCommissionsService],
  exports: [PartnerCommissionsService],
})
export class PartnerCommissionsModule {}
