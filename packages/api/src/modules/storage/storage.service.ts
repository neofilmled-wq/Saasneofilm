import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUploadResult {
  url: string;
  key: string;
  expiresIn: number;
}

export interface PresignedDownloadResult {
  url: string;
  expiresIn: number;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  contentType?: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client;
  private bucketCreatives: string;
  private bucketUploads: string;
  private cdnBaseUrl?: string;

  constructor(private readonly config: ConfigService) {
    this.bucketCreatives = this.config.get<string>('S3_BUCKET_CREATIVES', 'neofilm-creatives');
    this.bucketUploads = this.config.get<string>('S3_BUCKET_UPLOADS', 'neofilm-uploads');
    this.cdnBaseUrl = this.config.get<string>('CDN_BASE_URL');

    this.client = new S3Client({
      endpoint: this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000'),
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY', 'minioadmin'),
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async onModuleInit() {
    this.logger.log(
      `S3 storage initialized (endpoint=${this.config.get('S3_ENDPOINT')}, ` +
      `creatives=${this.bucketCreatives}, uploads=${this.bucketUploads})`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Presigned URLs
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Generate a presigned PUT URL for direct client upload.
   * The client POSTs/PUTs the file directly to S3/MinIO.
   */
  async createPresignedUpload(
    key: string,
    contentType: string,
    bucket?: string,
    expiresIn = 3600,
  ): Promise<PresignedUploadResult> {
    const targetBucket = bucket ?? this.bucketUploads;

    const command = new PutObjectCommand({
      Bucket: targetBucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    this.logger.debug(`Presigned upload created: ${targetBucket}/${key} (${expiresIn}s)`);
    return { url, key, expiresIn };
  }

  /**
   * Generate a presigned GET URL for secure download.
   * Falls back to CDN URL if configured and bucket is creatives.
   */
  async createPresignedDownload(
    key: string,
    bucket?: string,
    expiresIn = 3600,
  ): Promise<PresignedDownloadResult> {
    const targetBucket = bucket ?? this.bucketCreatives;

    // If CDN is configured and this is a public creative, return CDN URL
    if (this.cdnBaseUrl && targetBucket === this.bucketCreatives) {
      return {
        url: `${this.cdnBaseUrl}/${key}`,
        expiresIn: 0, // CDN URLs don't expire
      };
    }

    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: key,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, expiresIn };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Direct operations
  // ──────────────────────────────────────────────────────────────────────────

  /** Upload a buffer directly (for server-side operations, e.g., thumbnails) */
  async upload(
    key: string,
    body: Buffer,
    contentType: string,
    bucket?: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    const targetBucket = bucket ?? this.bucketCreatives;

    await this.client.send(
      new PutObjectCommand({
        Bucket: targetBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      }),
    );

    this.logger.debug(`Uploaded ${targetBucket}/${key} (${body.length} bytes)`);
    return key;
  }

  /** Delete a single object */
  async delete(key: string, bucket?: string): Promise<void> {
    const targetBucket = bucket ?? this.bucketCreatives;

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: targetBucket,
        Key: key,
      }),
    );

    this.logger.debug(`Deleted ${targetBucket}/${key}`);
  }

  /** Check if an object exists and get its metadata */
  async head(key: string, bucket?: string): Promise<StorageObject | null> {
    const targetBucket = bucket ?? this.bucketCreatives;

    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: targetBucket,
          Key: key,
        }),
      );

      return {
        key,
        size: result.ContentLength ?? 0,
        lastModified: result.LastModified ?? new Date(),
        contentType: result.ContentType,
      };
    } catch {
      return null;
    }
  }

  /** List objects in a prefix (folder) */
  async list(prefix: string, bucket?: string, maxKeys = 1000): Promise<StorageObject[]> {
    const targetBucket = bucket ?? this.bucketCreatives;

    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: targetBucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      }),
    );

    return (result.Contents ?? []).map((obj) => ({
      key: obj.Key ?? '',
      size: obj.Size ?? 0,
      lastModified: obj.LastModified ?? new Date(),
    }));
  }

  /** Copy an object within or across buckets (e.g., move from uploads → creatives) */
  async copy(
    sourceKey: string,
    destKey: string,
    sourceBucket?: string,
    destBucket?: string,
  ): Promise<void> {
    const src = sourceBucket ?? this.bucketUploads;
    const dst = destBucket ?? this.bucketCreatives;

    await this.client.send(
      new CopyObjectCommand({
        Bucket: dst,
        Key: destKey,
        CopySource: `${src}/${sourceKey}`,
      }),
    );

    this.logger.debug(`Copied ${src}/${sourceKey} → ${dst}/${destKey}`);
  }

  /**
   * Move an object from uploads to creatives (copy + delete source).
   * Used after client upload is confirmed/validated.
   */
  async moveToCreatives(uploadKey: string, creativeKey: string): Promise<void> {
    await this.copy(uploadKey, creativeKey, this.bucketUploads, this.bucketCreatives);
    await this.delete(uploadKey, this.bucketUploads);
    this.logger.log(`Moved upload ${uploadKey} → creative ${creativeKey}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Key generation helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** Generate a storage key for a creative asset */
  generateCreativeKey(orgId: string, creativeId: string, filename: string): string {
    const ext = filename.split('.').pop() ?? 'bin';
    return `orgs/${orgId}/creatives/${creativeId}/asset.${ext}`;
  }

  /** Generate a storage key for a temporary upload */
  generateUploadKey(orgId: string, filename: string): string {
    const timestamp = Date.now();
    const ext = filename.split('.').pop() ?? 'bin';
    const random = Math.random().toString(36).substring(2, 8);
    return `orgs/${orgId}/tmp/${timestamp}-${random}.${ext}`;
  }

  /** Generate a key for creative thumbnail */
  generateThumbnailKey(orgId: string, creativeId: string): string {
    return `orgs/${orgId}/creatives/${creativeId}/thumb.jpg`;
  }

  /** Get the direct (non-presigned) public URL for a stored object */
  getDirectUrl(key: string, bucket?: string): string {
    const endpoint = this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
    const targetBucket = bucket ?? this.bucketCreatives;
    return `${endpoint}/${targetBucket}/${key}`;
  }

  /** Get the public URL for a stored object (uses CDN if configured, otherwise API proxy) */
  getProxyUrl(key: string, bucket?: string): string {
    const targetBucket = bucket ?? this.bucketCreatives;
    const cdnBase = this.config.get<string>('CDN_BASE_URL', '');
    if (cdnBase && targetBucket === this.bucketCreatives) {
      return `${cdnBase}/${key}`;
    }
    const apiPublicUrl = this.config.get<string>('API_PUBLIC_URL', 'http://localhost:3001/api/v1');
    return `${apiPublicUrl}/storage/files/${targetBucket}/${key}`;
  }

  /** Stream an object from MinIO (used by the proxy endpoint) */
  async getStream(key: string, bucket?: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string; contentLength?: number }> {
    const targetBucket = bucket ?? this.bucketUploads;
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: targetBucket, Key: key }),
    );
    return {
      stream: result.Body as NodeJS.ReadableStream,
      contentType: result.ContentType ?? 'application/octet-stream',
      contentLength: result.ContentLength,
    };
  }
}
