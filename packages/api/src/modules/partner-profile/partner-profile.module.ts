import { Module } from '@nestjs/common';
import { PartnerProfileController } from './partner-profile.controller';
import { PartnerProfileService } from './partner-profile.service';

@Module({
  controllers: [PartnerProfileController],
  providers: [PartnerProfileService],
  exports: [PartnerProfileService],
})
export class PartnerProfileModule {}
