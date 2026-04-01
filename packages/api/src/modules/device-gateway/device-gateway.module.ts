import { Module } from '@nestjs/common';
import { DeviceGateway } from './device.gateway';
import { ScreenStatusGateway } from './screen-status.gateway';
import { MqttService } from './mqtt.service';
import { DeviceGatewayController } from './device-gateway.controller';
import { PartnerGatewayModule } from '../partner-gateway/partner-gateway.module';

@Module({
  imports: [PartnerGatewayModule],
  controllers: [DeviceGatewayController],
  providers: [DeviceGateway, ScreenStatusGateway, MqttService],
  exports: [DeviceGateway, ScreenStatusGateway, MqttService],
})
export class DeviceGatewayModule {}
