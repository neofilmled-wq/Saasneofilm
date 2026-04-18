import { Module } from '@nestjs/common';
import { TvStreamsController } from './tv-streams.controller';
import { TvStreamsService } from './tv-streams.service';

@Module({
  controllers: [TvStreamsController],
  providers: [TvStreamsService],
  exports: [TvStreamsService],
})
export class TvStreamsModule {}
