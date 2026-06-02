import { Module, forwardRef } from '@nestjs/common';
import { TvReleasesController } from './tv-releases.controller';
import { TvReleasesService } from './tv-releases.service';
import { TvReleasesGateway } from './tv-releases.gateway';
import { StorageModule } from '../storage/storage.module';
import { DeviceGatewayModule } from '../device-gateway/device-gateway.module';

@Module({
  imports: [StorageModule, forwardRef(() => DeviceGatewayModule)],
  controllers: [TvReleasesController],
  providers: [TvReleasesService, TvReleasesGateway],
  exports: [TvReleasesService, TvReleasesGateway],
})
export class TvReleasesModule {}
