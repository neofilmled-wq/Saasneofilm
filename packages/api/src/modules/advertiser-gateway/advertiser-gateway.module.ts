import { Module } from '@nestjs/common';
import { AdvertiserGateway } from './advertiser.gateway';

@Module({
  providers: [AdvertiserGateway],
  exports: [AdvertiserGateway],
})
export class AdvertiserGatewayModule {}
