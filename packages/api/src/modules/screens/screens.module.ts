import { Module } from '@nestjs/common';
import { ScreensController } from './screens.controller';
import { ScreensService } from './screens.service';
import { ScreenFillService } from './screen-fill.service';
import { AdminModule } from '../admin/admin.module';
import { PartnerGatewayModule } from '../partner-gateway/partner-gateway.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [AdminModule, PartnerGatewayModule, RealtimeModule],
  controllers: [ScreensController],
  providers: [ScreensService, ScreenFillService],
  exports: [ScreensService, ScreenFillService],
})
export class ScreensModule {}
