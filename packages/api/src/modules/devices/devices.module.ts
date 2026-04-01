import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { PartnerGatewayModule } from '../partner-gateway/partner-gateway.module';

@Module({
  imports: [PartnerGatewayModule],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
