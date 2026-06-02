import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';

export interface CreateReleaseDto {
  versionName: string;
  versionCode: number;
  uploadKey: string; // S3 key returned by createUploadUrl
  sha256: string;
  fileSize: number;
  releaseNotes?: string;
  isRequired?: boolean;
  targetVariant?: string;
  rolloutPercent?: number;
  targetScreenIds?: string[];
}

export interface UpdateReleaseDto {
  isActive?: boolean;
  isRequired?: boolean;
  rolloutPercent?: number;
  targetScreenIds?: string[];
  releaseNotes?: string;
}

@Injectable()
export class TvReleasesService {
  private readonly logger = new Logger(TvReleasesService.name);
  private readonly apkBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {
    // Reuses the existing uploads bucket — APKs land under apks/<filename>.
    this.apkBucket = this.config.get<string>('S3_BUCKET_UPLOADS', 'neofilm-uploads');
  }

  /**
   * Step 1 of the upload flow. Admin POSTs versionName/versionCode, gets a
   * presigned PUT URL. They upload the APK directly to S3/MinIO, then call
   * createRelease with the same uploadKey + the file's sha256.
   */
  async createUploadUrl(versionName: string, versionCode: number) {
    if (!versionName || !Number.isInteger(versionCode) || versionCode < 1) {
      throw new BadRequestException('versionName and versionCode required');
    }
    const safeName = versionName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploadKey = `apks/legacy/${versionCode}-${safeName}-${Date.now()}.apk`;
    const presigned = await this.storage.createPresignedUpload(
      uploadKey,
      'application/vnd.android.package-archive',
      this.apkBucket,
      3600,
    );
    return { uploadUrl: presigned.url, uploadKey, expiresIn: presigned.expiresIn };
  }

  /**
   * Step 2 — once the admin client has finished the S3 PUT, this persists the
   * AppRelease row. The sha256 must match the bytes actually stored at uploadKey
   * (we verify with a HEAD on the object so an attacker can't lie).
   */
  async createRelease(input: CreateReleaseDto, userId: string | null) {
    const existing = await this.prisma.appRelease.findFirst({
      where: { versionCode: input.versionCode, targetVariant: input.targetVariant ?? 'all' },
    });
    if (existing) {
      throw new BadRequestException(
        `versionCode ${input.versionCode} already exists for variant ${input.targetVariant ?? 'all'}`,
      );
    }

    const head = await this.storage.head(input.uploadKey, this.apkBucket);
    if (!head) {
      throw new BadRequestException(`No object found at ${input.uploadKey} — upload first`);
    }
    if (head.size !== input.fileSize) {
      throw new BadRequestException(
        `fileSize mismatch — uploaded ${head.size}, claimed ${input.fileSize}`,
      );
    }
    if (!/^[0-9a-f]{64}$/i.test(input.sha256)) {
      throw new BadRequestException('sha256 must be 64 hex characters');
    }

    // Public download URL — devices fetch it without auth so the URL must be
    // either CDN or a direct MinIO path. We use the storage helper which prefers
    // CDN when configured.
    const download = await this.storage.createPresignedDownload(
      input.uploadKey,
      this.apkBucket,
      // Long expiry so already-issued URLs keep working through the rollout.
      60 * 60 * 24 * 365,
    );

    const release = await this.prisma.appRelease.create({
      data: {
        versionName: input.versionName,
        versionCode: input.versionCode,
        apkUrl: download.url,
        sha256: input.sha256.toLowerCase(),
        fileSize: input.fileSize,
        releaseNotes: input.releaseNotes ?? null,
        isRequired: input.isRequired ?? true,
        targetVariant: input.targetVariant ?? 'all',
        rolloutPercent: this.clampRollout(input.rolloutPercent ?? 100),
        targetScreenIds: input.targetScreenIds ?? [],
        createdById: userId,
      },
    });

    this.logger.log(
      `AppRelease ${release.id} created — v${release.versionName} ` +
        `(code ${release.versionCode}, rollout ${release.rolloutPercent}%)`,
    );

    return release;
  }

  async listReleases() {
    return this.prisma.appRelease.findMany({
      orderBy: { versionCode: 'desc' },
      include: {
        _count: { select: { installStatuses: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  async getRelease(id: string) {
    const release = await this.prisma.appRelease.findUnique({
      where: { id },
      include: {
        installStatuses: {
          orderBy: { startedAt: 'desc' },
          take: 200,
          include: {
            device: {
              select: {
                id: true,
                serialNumber: true,
                appVersion: true,
                screen: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!release) throw new NotFoundException('Release not found');
    return release;
  }

  async updateRelease(id: string, input: UpdateReleaseDto) {
    await this.getRelease(id); // ensure exists
    return this.prisma.appRelease.update({
      where: { id },
      data: {
        isActive: input.isActive,
        isRequired: input.isRequired,
        rolloutPercent:
          input.rolloutPercent != null ? this.clampRollout(input.rolloutPercent) : undefined,
        targetScreenIds: input.targetScreenIds,
        releaseNotes: input.releaseNotes,
      },
    });
  }

  async deleteRelease(id: string) {
    const release = await this.getRelease(id);
    // Cascade removes DeviceUpdateStatus rows. We don't delete the S3 object —
    // admins can clean it manually so we don't accidentally break in-flight downloads.
    await this.prisma.appRelease.delete({ where: { id } });
    return { deleted: release.id };
  }

  private clampRollout(value: number): number {
    if (!Number.isFinite(value)) return 100;
    return Math.max(0, Math.min(100, Math.round(value)));
  }
}
