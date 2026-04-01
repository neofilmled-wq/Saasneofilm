import { Module } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CatalogueController } from './catalogue.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { DeviceGatewayModule } from '../device-gateway/device-gateway.module';

@Module({
  imports: [PrismaModule, DeviceGatewayModule],
  controllers: [CatalogueController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
