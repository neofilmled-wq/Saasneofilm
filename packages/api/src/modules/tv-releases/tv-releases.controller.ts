import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TvReleasesService, type CreateReleaseDto, type UpdateReleaseDto } from './tv-releases.service';
import { TvReleasesGateway } from './tv-releases.gateway';
import { Roles, CurrentUser } from '../../common/decorators';

@ApiTags('TV Releases')
@ApiBearerAuth()
@Controller('admin/tv-releases')
export class TvReleasesController {
  constructor(
    private readonly service: TvReleasesService,
    private readonly gateway: TvReleasesGateway,
  ) {}

  @Post('upload-url')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get presigned S3 PUT URL for the APK file' })
  async createUploadUrl(@Body() body: { versionName: string; versionCode: number }) {
    return this.service.createUploadUrl(body.versionName, body.versionCode);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create an AppRelease — call after uploading the APK to S3' })
  async createRelease(
    @Body() body: CreateReleaseDto,
    @CurrentUser() user: { sub?: string; id?: string } | null,
  ) {
    const release = await this.service.createRelease(body, user?.sub ?? user?.id ?? null);
    // Notify every matching device so they pull the update within seconds
    // instead of waiting for the next ~6h periodic check. Awaited pour que
    // l'erreur soit tracée, mais .catch pour ne jamais faire échouer la
    // création si le push WS casse (la release EST déjà persistée).
    if (release.isActive) {
      await this.gateway
        .broadcastUpdateAvailable(release)
        .catch(() => undefined);
    }
    return release;
  }

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List all AppReleases' })
  async listReleases() {
    return this.service.listReleases();
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get one AppRelease with per-device install status' })
  async getRelease(@Param('id') id: string) {
    return this.service.getRelease(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update rollout %, activate/deactivate, retarget' })
  async updateRelease(@Param('id') id: string, @Body() body: UpdateReleaseDto) {
    const release = await this.service.updateRelease(id, body);
    if (release.isActive) {
      await this.gateway
        .broadcastUpdateAvailable(release)
        .catch(() => undefined);
    }
    return release;
  }

  @Post(':id/rebroadcast')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Re-pousser la notification OTA d\'une release active à tous les TV éligibles',
  })
  async rebroadcastRelease(@Param('id') id: string) {
    const release = await this.service.getRelease(id);
    if (!release.isActive) {
      return { rebroadcast: false, reason: 'Release inactive' };
    }
    await this.gateway
      .broadcastUpdateAvailable(release)
      .catch(() => undefined);
    return { rebroadcast: true, releaseId: release.id };
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete an AppRelease (does NOT delete the APK in S3)' })
  async deleteRelease(@Param('id') id: string) {
    return this.service.deleteRelease(id);
  }
}
