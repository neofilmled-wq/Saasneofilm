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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { StorageService } from './storage.service';
import { Public } from '../../common/decorators';

class RequestUploadDto {
  filename!: string;
  contentType!: string;
  orgId!: string;
}

class ConfirmUploadDto {
  uploadKey!: string;
  creativeId!: string;
  orgId!: string;
  filename!: string;
}

@ApiTags('Storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Request a presigned URL for direct upload to S3/MinIO.
   * Client uploads the file directly using the returned URL.
   */
  @Post('presign/upload')
  @ApiOperation({ summary: 'Get a presigned upload URL' })
  async requestUpload(@Body() dto: RequestUploadDto) {
    const key = this.storage.generateUploadKey(dto.orgId, dto.filename);
    const result = await this.storage.createPresignedUpload(key, dto.contentType);
    return result;
  }

  /**
   * After a successful upload, move the file from uploads → creatives
   * and return the final storage key.
   */
  @Post('confirm-upload')
  @ApiOperation({ summary: 'Confirm upload and move to creatives bucket' })
  async confirmUpload(@Body() dto: ConfirmUploadDto) {
    // Verify the upload exists
    const exists = await this.storage.head(dto.uploadKey, undefined);
    if (!exists) {
      throw new NotFoundException(`Upload ${dto.uploadKey} not found`);
    }

    const creativeKey = this.storage.generateCreativeKey(
      dto.orgId,
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
    @Query('key') key: string,
    @Query('bucket') bucket?: string,
  ) {
    const result = await this.storage.createPresignedDownload(key, bucket);
    return result;
  }

  /**
   * Delete a file from storage.
   */
  @Delete(':key')
  @ApiOperation({ summary: 'Delete a file from storage' })
  async deleteFile(
    @Param('key') key: string,
    @Query('bucket') bucket?: string,
  ) {
    await this.storage.delete(key, bucket);
    return { deleted: true, key };
  }

  /**
   * Proxy a file from MinIO to the client.
   * Avoids exposing MinIO publicly — the API streams the file.
   * Route: GET /files/:bucket/:key(*)
   */
  @Public()
  @Get('/files/:bucket/*')
  @ApiOperation({ summary: 'Proxy a file from MinIO' })
  async proxyFile(
    @Param('bucket') bucket: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
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
