import { Module } from '@nestjs/common';
import { TvConfigService } from './tv-config.service';
import { IptvService } from './iptv.service';
import { TvAdsService } from './tv-ads.service';
import { TvMacrosService } from './tv-macros.service';
import { ActivitySponsorsService } from './activity-sponsors.service';
import { TvConfigController } from './tv-config.controller';
import { TvConfigPartnerController } from './tv-config-partner.controller';
import { DeviceGatewayModule } from '../device-gateway/device-gateway.module';
import { CatalogueModule } from '../catalogue/catalogue.module';

@Module({
  imports: [DeviceGatewayModule, CatalogueModule],
  controllers: [TvConfigController, TvConfigPartnerController],
  providers: [
    TvConfigService,
    IptvService,
    TvAdsService,
    TvMacrosService,
    ActivitySponsorsService,
  ],
  exports: [TvConfigService, IptvService, TvAdsService, TvMacrosService, ActivitySponsorsService],
})
export class TvConfigModule {}
