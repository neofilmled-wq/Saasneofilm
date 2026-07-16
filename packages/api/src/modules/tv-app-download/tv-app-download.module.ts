import { Module } from '@nestjs/common';
import { TvAppDownloadController } from './tv-app-download.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TvAppDownloadController],
})
export class TvAppDownloadModule {}
