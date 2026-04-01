import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { DeviceGatewayModule } from '../device-gateway/device-gateway.module';
import { ScreensModule } from '../screens/screens.module';

@Module({
  imports: [DeviceGatewayModule, ScreensModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
