import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  Query,
  Res,
  Req,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { StorageService } from './storage.service';
import { Public } from '../../common/decorators';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

class RequestUploadDto {
  filename!: string;
  contentType!: string;
}

class ConfirmUploadDto {
  uploadKey!: string;
  creativeId!: string;
  filename!: string;
}

@ApiTags('Storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Org id of the authenticated caller (from the verified JWT, never the body). */
  private callerOrg(req: Request): string {
    const orgId = (req as any).user?.orgId as string | undefined;
    if (!orgId) throw new ForbiddenException('No organization context on this token');
    return orgId;
  }

  private isAdmin(req: Request): boolean {
    const role = (req as any).user?.platformRole as string | undefined;
    return !!role && ADMIN_ROLES.includes(role);
  }

  /**
   * Enforce that `key` belongs to the caller's org namespace (orgs/<orgId>/...).
   * Admins bypass. Prevents cross-tenant read/delete/presign (IDOR).
   */
  private assertOwnedKey(req: Request, key: string): void {
    if (!key) throw new BadRequestException('key is required');
    if (this.isAdmin(req)) return;
    const orgId = this.callerOrg(req);
    if (!key.startsWith(`orgs/${orgId}/`)) {
      throw new ForbiddenException('You are not allowed to access this object');
    }
  }

  /** Reject any bucket that is not one we manage. */
  private assertBucket(bucket?: string): void {
    if (!this.storage.isKnownBucket(bucket)) {
      throw new ForbiddenException('Unknown bucket');
    }
  }

  /**
   * Request a presigned URL for direct upload to S3/MinIO.
   * Client uploads the file directly using the returned URL.
   */
  @Post('presign/upload')
  @ApiOperation({ summary: 'Get a presigned upload URL' })
  async requestUpload(@Req() req: Request, @Body() dto: RequestUploadDto) {
    // Org comes from the token so a client can only upload into its own namespace.
    const orgId = this.callerOrg(req);
    const key = this.storage.generateUploadKey(orgId, dto.filename);
    const result = await this.storage.createPresignedUpload(key, dto.contentType);
    return result;
  }

  /**
   * After a successful upload, move the file from uploads → creatives
   * and return the final storage key.
   */
  @Post('confirm-upload')
  @ApiOperation({ summary: 'Confirm upload and move to creatives bucket' })
  async confirmUpload(@Req() req: Request, @Body() dto: ConfirmUploadDto) {
    const orgId = this.callerOrg(req);
    // The temp upload must belong to the caller's namespace.
    this.assertOwnedKey(req, dto.uploadKey);

    // Verify the upload exists
    const exists = await this.storage.head(dto.uploadKey, this.storage.uploadsBucket);
    if (!exists) {
      throw new NotFoundException(`Upload ${dto.uploadKey} not found`);
    }

    const creativeKey = this.storage.generateCreativeKey(
      orgId,
      dto.creativeId,
      dto.filename,
    );

    await this.storage.moveToCreatives(dto.uploadKey, creativeKey);

    // Return a presigned download URL
    const download = await this.storage.createPresignedDownload(creativeKey);

    return {
      key: creativeKey,
      downloadUrl: download.url,
      size: exists.size,
    };
  }

  /**
   * Get a presigned download URL for a creative asset.
   */
  @Get('presign/download')
  @ApiOperation({ summary: 'Get a presigned download URL' })
  async requestDownload(
    @Req() req: Request,
    @Query('key') key: string,
    @Query('bucket') bucket?: string,
  ) {
    this.assertBucket(bucket);
    this.assertOwnedKey(req, key);
    const result = await this.storage.createPresignedDownload(key, bucket);
    return result;
  }

  /**
   * Delete a file from storage. Scoped to the caller's org namespace.
   */
  @Delete(':key')
  @ApiOperation({ summary: 'Delete a file from storage' })
  async deleteFile(
    @Req() req: Request,
    @Param('key') key: string,
    @Query('bucket') bucket?: string,
  ) {
    this.assertBucket(bucket);
    this.assertOwnedKey(req, key);
    await this.storage.delete(key, bucket);
    return { deleted: true, key };
  }

  /**
   * Proxy a file from MinIO to the client.
   * Avoids exposing MinIO publicly — the API streams the file.
   * Route: GET /files/:bucket/:key(*)
   *
   * PUBLIC but restricted to the CREATIVES bucket only. Creatives are ads that
   * must be fetchable by TV devices without auth (and are world-readable via the
   * CDN anyway). The private `uploads` bucket — and any other bucket — are NEVER
   * served here (that was the unauthenticated cross-tenant leak, audit C2).
   */
  @Public()
  @Get('/files/:bucket/*')
  @ApiOperation({ summary: 'Proxy a public creative file from MinIO' })
  async proxyFile(
    @Param('bucket') bucket: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (bucket !== this.storage.creativesBucket) {
      throw new NotFoundException('File not found');
    }
    // Extract key from URL path: /storage/files/{bucket}/{...key}
    const prefix = `/storage/files/${bucket}/`;
    const fullPath = req.originalUrl.replace(/^\/api\/v1/, '');
    const key = fullPath.split(prefix)[1] ?? '';
    if (!key) throw new NotFoundException('File not found');
    try {
      const { stream, contentType, contentLength } = await this.storage.getStream(key, bucket);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      (stream as any).pipe(res);
    } catch {
      throw new NotFoundException('File not found');
    }
  }
}
