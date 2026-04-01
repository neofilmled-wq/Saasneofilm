import { Module } from '@nestjs/common';
import { PartnerGateway } from './partner.gateway';

@Module({
  providers: [PartnerGateway],
  exports: [PartnerGateway],
})
export class PartnerGatewayModule {}
