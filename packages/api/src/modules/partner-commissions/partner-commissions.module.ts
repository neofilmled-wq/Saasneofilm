import { Module } from '@nestjs/common';
import {
  PartnerCommissionsController,
  AdminCommissionsController,
} from './partner-commissions.controller';
import { PartnerCommissionsService } from './partner-commissions.service';
import { PartnerGatewayModule } from '../partner-gateway/partner-gateway.module';

@Module({
  imports: [PartnerGatewayModule],
  controllers: [PartnerCommissionsController, AdminCommissionsController],
  providers: [PartnerCommissionsService],
  exports: [PartnerCommissionsService],
})
export class PartnerCommissionsModule {}
