import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TvStreamsService } from './tv-streams.service';

@ApiTags('Partner TV Streams')
@ApiBearerAuth()
@Controller('partner/tv-streams')
export class TvStreamsController {
  constructor(private readonly service: TvStreamsService) {}

  @Get()
  @ApiOperation({ summary: 'List TV stream sources for a partner org' })
  list(@Query('orgId') orgId: string) {
    return this.service.list(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a TV stream source (playlist or single channel)' })
  create(
    @Body()
    body: {
      orgId: string;
      url: string;
      isGlobal: boolean;
      channelName?: string | null;
    },
  ) {
    return this.service.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a TV stream source' })
  update(
    @Param('id') id: string,
    @Body()
    body: {
      url?: string;
      isGlobal?: boolean;
      channelName?: string | null;
    },
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a TV stream source' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
