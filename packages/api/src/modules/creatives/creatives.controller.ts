import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, BadRequestException, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreativesService, type CreativeScopeCtx } from './creatives.service';
import { StorageService } from '../storage/storage.service';
import { OrgGuard } from '../../common/guards';

const ALLOWED_CONTENT_TYPES = ['video/mp4', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILENAME_LENGTH = 200;
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

/** Dérive le contexte org-scoped depuis le JWT (staff plateforme = bypass). */
function orgScope(user: any): CreativeScopeCtx {
  return {
    orgId: user?.orgId ?? null,
    isAdmin: !!user?.platformRole && ADMIN_ROLES.includes(user.platformRole),
  };
}

// OrgGuard: un annonceur ne peut lister/filtrer que ses propres créatifs
// (?advertiserOrgId=). Admin bypass. Réduit la fuite inter-annonceur (IDOR H3).
@ApiTags('Creatives')
@ApiBearerAuth()
@UseGuards(OrgGuard)
@Controller('creatives')
export class CreativesController {
  constructor(
    private readonly creativesService: CreativesService,
    private readonly storageService: StorageService,
  ) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'Get a presigned PUT URL for direct client upload to MinIO/S3' })
  async getUploadUrl(
    @Body() body: { filename: string; contentType: string },
    @Req() req: any,
  ) {
    if (!ALLOWED_CONTENT_TYPES.includes(body.contentType)) {
      throw new BadRequestException(`Type de fichier non autorisé. Types acceptés: ${ALLOWED_CONTENT_TYPES.join(', ')}`);
    }
    if (!body.filename || body.filename.length > MAX_FILENAME_LENGTH) {
      throw new BadRequestException('Nom de fichier invalide');
    }

    const orgId = req.user?.orgId ?? 'anon';
    const key = this.storageService.generateUploadKey(orgId, body.filename);
    const { url, expiresIn } = await this.storageService.createPresignedUpload(key, body.contentType);
    const fileUrl = this.storageService.getDirectUrl(key);
    return { url, key, fileUrl, expiresIn };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file directly through the API to MinIO/S3' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier reçu');
    if (!ALLOWED_CONTENT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Type de fichier non autorisé. Types acceptés: ${ALLOWED_CONTENT_TYPES.join(', ')}`);
    }
    const orgId = req.user?.orgId ?? 'anon';
    const key = this.storageService.generateUploadKey(orgId, file.originalname);
    await this.storageService.upload(key, file.buffer, file.mimetype);
    const fileUrl = this.storageService.getProxyUrl(key);
    return { key, fileUrl };
  }

  @Get()
  @ApiOperation({ summary: 'List creatives' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('campaignId') campaignId?: string,
    @Query('advertiserOrgId') advertiserOrgId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Req() req?: any,
  ) {
    return this.creativesService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      campaignId,
      advertiserOrgId,
      type,
      status,
      ctx: orgScope(req?.user),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get creative by ID' })
  async findOne(@Param('id') id: string, @Req() req?: any) {
    return this.creativesService.findById(id, orgScope(req?.user));
  }

  @Post()
  @ApiOperation({ summary: 'Create a creative (metadata after upload)' })
  async create(@Body() data: any) {
    return this.creativesService.create(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a creative' })
  async update(@Param('id') id: string, @Body() data: any, @Req() req?: any) {
    return this.creativesService.update(id, data, orgScope(req?.user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a creative' })
  async remove(@Param('id') id: string, @Req() req?: any) {
    return this.creativesService.remove(id, orgScope(req?.user));
  }
}
