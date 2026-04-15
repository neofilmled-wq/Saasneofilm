import {
  Controller,
  Get,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream, existsSync, statSync } from 'fs';
import { basename } from 'path';

const APK_PATH = process.env.TV_APK_PATH ?? '/downloads/neofilm.apk';

@ApiTags('TV App Download')
@ApiBearerAuth()
@Controller('tv-app-download')
export class TvAppDownloadController {
  @Get('apk')
  @ApiOperation({ summary: 'Download the NeoFilm TV Android APK (partner-authenticated)' })
  async downloadApk(@Res() res: Response) {
    if (!existsSync(APK_PATH)) {
      throw new NotFoundException('APK file not found on server');
    }

    const stat = statSync(APK_PATH);
    const filename = basename(APK_PATH);

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stat.size);

    const stream = createReadStream(APK_PATH);
    stream.pipe(res);
  }
}
