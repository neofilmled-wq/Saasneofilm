import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGateway } from './admin.gateway';
import { AdvertiserGatewayModule } from '../advertiser-gateway/advertiser-gateway.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DeviceGatewayModule } from '../device-gateway/device-gateway.module';

@Module({
  imports: [AdvertiserGatewayModule, RealtimeModule, DeviceGatewayModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGateway],
  exports: [AdminService, AdminGateway],
})
export class AdminModule {}
