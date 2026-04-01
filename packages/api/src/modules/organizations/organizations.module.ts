import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AdminModule } from '../admin/admin.module';
import { AdvertiserGatewayModule } from '../advertiser-gateway/advertiser-gateway.module';

@Module({
  imports: [AdminModule, AdvertiserGatewayModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
