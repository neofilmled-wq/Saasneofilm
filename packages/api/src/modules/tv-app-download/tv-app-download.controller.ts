import {
  Controller,
  Get,
  NotFoundException,
  Res,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream, existsSync, statSync } from 'fs';
import { basename } from 'path';
import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';

// Legacy fallback: a static APK on the server's disk, used only when no OTA
// release has been published yet.
const APK_PATH = process.env.TV_APK_PATH ?? '/downloads/neofilm.apk';

@ApiTags('TV App Download')
@ApiBearerAuth()
@Controller('tv-app-download')
export class TvAppDownloadController {
  private readonly logger = new Logger(TvAppDownloadController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('apk')
  @ApiOperation({
    summary: 'Download the latest published NeoFilm TV APK (same as the admin OTA release)',
  })
  async downloadApk(@Res() res: Response) {
    // Serve the latest ACTIVE release published in admin → Mises à jour TV, so
    // the partner pairing page always hands out the exact version the fleet
    // gets over the air. Falls back to the static disk file only if nothing
    // has been published.
    const release = await this.prisma.appRelease
      .findFirst({
        where: { isActive: true, targetVariant: { in: ['legacy', 'all'] } },
        orderBy: { versionCode: 'desc' },
        select: { apkUrl: true, versionName: true },
      })
      .catch(() => null);

    if (release?.apkUrl) {
      try {
        // Proxy-stream from MinIO through the API so the browser only talks to
        // our CORS-enabled origin (a 302 to MinIO would be a cross-origin fetch
        // without CORS headers, which the browser blocks for fetch()).
        const upstream = await fetch(release.apkUrl);
        if (!upstream.ok || !upstream.body) {
          throw new Error(`upstream ${upstream.status}`);
        }
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="neofilm-${release.versionName}.apk"`,
        );
        const len = upstream.headers.get('content-length');
        if (len) res.setHeader('Content-Length', len);
        Readable.fromWeb(upstream.body as any).pipe(res);
        return;
      } catch (e) {
        this.logger.warn(
          `Failed to proxy release APK (${release.apkUrl}): ${(e as Error).message} — falling back to static file`,
        );
        // fall through to the static file fallback
      }
    }

    // ── Fallback: static file on disk ──
    if (!existsSync(APK_PATH)) {
      throw new NotFoundException('Aucune version APK disponible pour le moment');
    }
    const stat = statSync(APK_PATH);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${basename(APK_PATH)}"`);
    res.setHeader('Content-Length', stat.size);
    createReadStream(APK_PATH).pipe(res);
  }
}
