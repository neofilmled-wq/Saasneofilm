import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CatalogueService } from './catalogue.service';
import { StorageService } from '../storage/storage.service';
import { SanitizePipe } from '../../common/pipes';

@ApiTags('Catalogue')
@ApiBearerAuth()
@Controller('advertiser/catalogue')
export class CatalogueController {
  constructor(
    private readonly catalogueService: CatalogueService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List catalogue listings for the authenticated advertiser' })
  async findAll(@Req() req: any, @Query('status') status?: string, @Query('advertiserOrgId') advertiserOrgId?: string) {
    const orgId = req.user?.orgId ?? advertiserOrgId;
    return this.catalogueService.findAll(orgId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single catalogue listing' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.catalogueService.findById(id, req.user?.orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new catalogue listing' })
  async create(@Body(SanitizePipe) data: any, @Req() req: any) {
    const orgId = req.user?.orgId ?? data.advertiserOrgId;
    return this.catalogueService.create(orgId, data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a catalogue listing' })
  async update(@Param('id') id: string, @Body(SanitizePipe) data: any, @Req() req: any) {
    return this.catalogueService.update(id, req.user?.orgId, data);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish listing → status ACTIVE, notify targeted screens' })
  async publish(@Param('id') id: string, @Req() req: any) {
    return this.catalogueService.publish(id, req.user?.orgId);
  }

  @Post(':id/unpublish')
  @ApiOperation({ summary: 'Unpublish listing → status PAUSED, notify targeted screens' })
  async unpublish(@Param('id') id: string, @Req() req: any) {
    return this.catalogueService.unpublish(id, req.user?.orgId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a catalogue listing' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.catalogueService.remove(id, req.user?.orgId);
  }

  /**
   * Request presigned URLs for a catalogue image upload.
   * Client PUT the file to uploadUrl, then uses downloadUrl as imageUrl.
   */
  @Post('presign-image')
  @ApiOperation({ summary: 'Get presigned URLs for catalogue image upload' })
  async presignImage(
    @Body() data: { filename: string; contentType: string },
    @Req() req: any,
  ) {
    const orgId = req.user?.orgId ?? 'unknown';
    const ext = data.filename.split('.').pop() ?? 'jpg';
    const key = `orgs/${orgId}/catalogue/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const bucket = 'neofilm-creatives';

    const [upload, download] = await Promise.all([
      this.storageService.createPresignedUpload(key, data.contentType, bucket),
      this.storageService.createPresignedDownload(key, bucket),
    ]);

    return {
      uploadUrl: upload.url,
      downloadUrl: download.url,
      key,
    };
  }
}
