import { Module } from '@nestjs/common';
import { TvAppDownloadController } from './tv-app-download.controller';

@Module({
  controllers: [TvAppDownloadController],
})
export class TvAppDownloadModule {}
