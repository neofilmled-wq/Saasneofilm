import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { CanvaCryptoService } from './canva-crypto.service';

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';
const CANVA_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';

const PKCE_STATE_TTL = 600; // 10 minutes

@Injectable()
export class CanvaService {
  private readonly logger = new Logger(CanvaService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scopes = [
    'design:content:read',
    'design:content:write',
    'design:meta:read',
    'profile:read',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly cryptoService: CanvaCryptoService,
  ) {
    this.clientId = this.config.get<string>('CANVA_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('CANVA_CLIENT_SECRET', '');
    this.redirectUri = this.config.get<string>(
      'CANVA_REDIRECT_URI',
      'http://localhost:3001/api/v1/integrations/canva/callback',
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async getUserOrgId(userId: string): Promise<string> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        organization: { type: 'ADVERTISER' },
      },
      select: { organizationId: true },
    });
    if (!membership) {
      throw new ForbiddenException('User is not a member of any advertiser organization');
    }
    return membership.organizationId;
  }

  private async getDecryptedAccessToken(userId: string, orgId: string): Promise<string> {
    const integration = await this.prisma.thirdPartyIntegration.findUnique({
      where: { userId_organizationId_provider: { userId, organizationId: orgId, provider: 'CANVA' } },
    });
    if (!integration) {
      throw new BadRequestException('Canva account not connected. Please connect Canva first.');
    }

    // Check if token expired and refresh
    if (integration.expiresAt <= new Date()) {
      return this.refreshAndGetToken(integration);
    }

    return this.cryptoService.decrypt(
      integration.accessTokenEnc,
      integration.tokenIv,
      integration.tokenTag,
    );
  }

  private async refreshAndGetToken(integration: any): Promise<string> {
    const refreshToken = this.cryptoService.decrypt(
      integration.refreshTokenEnc,
      integration.tokenIv,
      integration.tokenTag,
    );

    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const res = await fetch(`${CANVA_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Canva token refresh failed: ${err}`);
      // Delete invalid integration
      await this.prisma.thirdPartyIntegration.delete({ where: { id: integration.id } });
      throw new BadRequestException('Canva session expired. Please reconnect your Canva account.');
    }

    const data = await res.json();
    const encAccess = this.cryptoService.encrypt(data.access_token);
    const encRefresh = this.cryptoService.encrypt(data.refresh_token);

    await this.prisma.thirdPartyIntegration.update({
      where: { id: integration.id },
      data: {
        accessTokenEnc: encAccess.ciphertext,
        refreshTokenEnc: encRefresh.ciphertext,
        tokenIv: encAccess.iv,
        tokenTag: encAccess.tag,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });

    return data.access_token;
  }

  private async canvaApiFetch(
    path: string,
    accessToken: string,
    options: RequestInit = {},
  ): Promise<any> {
    const res = await fetch(`${CANVA_API_BASE}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      this.logger.error(`Canva API error ${res.status} on ${path}: ${errorBody}`);
      throw new InternalServerErrorException(`Canva API error: ${res.statusText}`);
    }

    return res.json();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // OAuth
  // ──────────────────────────────────────────────────────────────────────────

  async getConnectUrl(userId: string): Promise<string> {
    const orgId = await this.getUserOrgId(userId);

    // Generate PKCE
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Generate state (anti-CSRF) with HMAC signature
    const statePayload = JSON.stringify({ userId, orgId, ts: Date.now() });
    const stateHmac = crypto
      .createHmac('sha256', this.clientSecret)
      .update(statePayload)
      .digest('hex');
    const state = Buffer.from(`${statePayload}|${stateHmac}`).toString('base64url');

    // Store code_verifier in Redis (keyed by state)
    await this.redis.set(`canva:pkce:${state}`, codeVerifier, PKCE_STATE_TTL);

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: this.scopes.join(' '),
      redirect_uri: this.redirectUri,
      state,
    });

    return `${CANVA_AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<{ orgId: string }> {
    // Verify state HMAC
    const decoded = Buffer.from(state, 'base64url').toString();
    const [payloadStr, hmac] = decoded.split('|');
    const expectedHmac = crypto
      .createHmac('sha256', this.clientSecret)
      .update(payloadStr)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hmac || ''), Buffer.from(expectedHmac))) {
      throw new BadRequestException('Invalid OAuth state');
    }

    const { userId, orgId } = JSON.parse(payloadStr);

    // Retrieve code_verifier from Redis
    const codeVerifier = await this.redis.get(`canva:pkce:${state}`);
    if (!codeVerifier) {
      throw new BadRequestException('OAuth session expired. Please try again.');
    }
    await this.redis.del(`canva:pkce:${state}`);

    // Exchange code for tokens
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const tokenRes = await fetch(`${CANVA_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      this.logger.error(`Canva token exchange failed: ${err}`);
      throw new BadRequestException('Failed to connect Canva account');
    }

    const tokenData = await tokenRes.json();

    // Encrypt tokens
    const encAccess = this.cryptoService.encrypt(tokenData.access_token);
    const encRefresh = this.cryptoService.encrypt(tokenData.refresh_token);

    // Get Canva user info
    let providerUserId: string | null = null;
    try {
      const userInfo = await this.canvaApiFetch('/users/me', tokenData.access_token);
      providerUserId = userInfo.id || userInfo.user?.id || null;
    } catch {
      this.logger.warn('Could not fetch Canva user info');
    }

    // Upsert integration
    await this.prisma.thirdPartyIntegration.upsert({
      where: { userId_organizationId_provider: { userId, organizationId: orgId, provider: 'CANVA' } },
      create: {
        userId,
        organizationId: orgId,
        provider: 'CANVA',
        accessTokenEnc: encAccess.ciphertext,
        refreshTokenEnc: encRefresh.ciphertext,
        tokenIv: encAccess.iv,
        tokenTag: encAccess.tag,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scopes: this.scopes,
        providerUserId,
      },
      update: {
        accessTokenEnc: encAccess.ciphertext,
        refreshTokenEnc: encRefresh.ciphertext,
        tokenIv: encAccess.iv,
        tokenTag: encAccess.tag,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scopes: this.scopes,
        providerUserId,
      },
    });

    this.logger.log(`Canva connected for user ${userId} / org ${orgId}`);
    return { orgId };
  }

  async getConnectionStatus(userId: string): Promise<{ connected: boolean; providerUserId?: string }> {
    const orgId = await this.getUserOrgId(userId);
    const integration = await this.prisma.thirdPartyIntegration.findUnique({
      where: { userId_organizationId_provider: { userId, organizationId: orgId, provider: 'CANVA' } },
      select: { providerUserId: true },
    });
    return {
      connected: !!integration,
      providerUserId: integration?.providerUserId ?? undefined,
    };
  }

  async disconnect(userId: string): Promise<void> {
    const orgId = await this.getUserOrgId(userId);
    const integration = await this.prisma.thirdPartyIntegration.findUnique({
      where: { userId_organizationId_provider: { userId, organizationId: orgId, provider: 'CANVA' } },
    });
    if (!integration) return;

    // Revoke token at Canva
    try {
      const accessToken = this.cryptoService.decrypt(
        integration.accessTokenEnc,
        integration.tokenIv,
        integration.tokenTag,
      );
      const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      await fetch(`${CANVA_API_BASE}/oauth/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token: accessToken }),
      });
    } catch (err) {
      this.logger.warn(`Failed to revoke Canva token: ${(err as Error).message}`);
    }

    await this.prisma.thirdPartyIntegration.delete({ where: { id: integration.id } });
    this.logger.log(`Canva disconnected for user ${userId}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Design management
  // ──────────────────────────────────────────────────────────────────────────

  async createDesign(userId: string, title: string, width: number, height: number) {
    const orgId = await this.getUserOrgId(userId);
    const accessToken = await this.getDecryptedAccessToken(userId, orgId);

    const result = await this.canvaApiFetch('/designs', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        design_type: { type: 'custom', width, height },
        title,
      }),
    });

    const design = result.design || result;

    // Store in DB
    const canvaDesign = await this.prisma.canvaDesign.upsert({
      where: { canvaDesignId: design.id },
      create: {
        organizationId: orgId,
        canvaDesignId: design.id,
        title: design.title || title,
        editUrl: design.urls?.edit_url || null,
        thumbnailUrl: design.thumbnail?.url || null,
      },
      update: {
        title: design.title || title,
        editUrl: design.urls?.edit_url || null,
        thumbnailUrl: design.thumbnail?.url || null,
      },
    });

    return canvaDesign;
  }

  async listDesigns(userId: string) {
    const orgId = await this.getUserOrgId(userId);
    const designs = await this.prisma.canvaDesign.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return designs;
  }

  async syncDesignsFromCanva(userId: string) {
    const orgId = await this.getUserOrgId(userId);
    const accessToken = await this.getDecryptedAccessToken(userId, orgId);

    const result = await this.canvaApiFetch('/designs', accessToken);
    const items = result.items || [];

    for (const item of items) {
      await this.prisma.canvaDesign.upsert({
        where: { canvaDesignId: item.id },
        create: {
          organizationId: orgId,
          canvaDesignId: item.id,
          title: item.title || null,
          editUrl: item.urls?.edit_url || null,
          thumbnailUrl: item.thumbnail?.url || null,
        },
        update: {
          title: item.title || null,
          editUrl: item.urls?.edit_url || null,
          thumbnailUrl: item.thumbnail?.url || null,
        },
      });
    }

    return this.listDesigns(userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Export flow
  // ──────────────────────────────────────────────────────────────────────────

  async startExport(
    userId: string,
    canvaDesignId: string,
    format: string,
    options: { quality?: string; width?: number; height?: number } = {},
  ) {
    const orgId = await this.getUserOrgId(userId);

    // Verify design belongs to org
    const design = await this.prisma.canvaDesign.findFirst({
      where: { canvaDesignId, organizationId: orgId },
    });
    if (!design) {
      throw new NotFoundException('Design not found');
    }

    const accessToken = await this.getDecryptedAccessToken(userId, orgId);

    // Build export format config
    const formatConfig: any = { type: format };
    if (format === 'mp4' && options.quality) {
      formatConfig.quality = options.quality;
    }
    if (format === 'png' || format === 'jpg') {
      if (options.width) formatConfig.width = options.width;
      if (options.height) formatConfig.height = options.height;
    }
    if (format === 'jpg') {
      formatConfig.quality = 90;
    }

    const result = await this.canvaApiFetch('/exports', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        design_id: canvaDesignId,
        format: formatConfig,
      }),
    });

    const job = result.job || result;
    return { exportId: job.id, status: job.status };
  }

  async getExportStatus(userId: string, canvaDesignId: string, exportId: string) {
    const orgId = await this.getUserOrgId(userId);

    // Verify design belongs to org
    const design = await this.prisma.canvaDesign.findFirst({
      where: { canvaDesignId, organizationId: orgId },
    });
    if (!design) {
      throw new NotFoundException('Design not found');
    }

    const accessToken = await this.getDecryptedAccessToken(userId, orgId);
    const result = await this.canvaApiFetch(`/exports/${exportId}`, accessToken);
    const job = result.job || result;

    return {
      status: job.status,
      urls: job.urls || null,
      error: job.error || null,
    };
  }

  async downloadAndStoreExport(
    userId: string,
    canvaDesignId: string,
    exportId: string,
    format: string,
    campaignId?: string,
  ) {
    const orgId = await this.getUserOrgId(userId);

    // Verify design belongs to org
    const design = await this.prisma.canvaDesign.findFirst({
      where: { canvaDesignId, organizationId: orgId },
    });
    if (!design) {
      throw new NotFoundException('Design not found');
    }

    const accessToken = await this.getDecryptedAccessToken(userId, orgId);

    // Poll for completion (max 60 seconds)
    let exportData: any = null;
    for (let i = 0; i < 30; i++) {
      const result = await this.canvaApiFetch(`/exports/${exportId}`, accessToken);
      const job = result.job || result;

      if (job.status === 'success') {
        exportData = job;
        break;
      }
      if (job.status === 'failed') {
        throw new BadRequestException(`Canva export failed: ${job.error?.code || 'unknown'}`);
      }
      // Wait 2 seconds between polls
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!exportData) {
      throw new InternalServerErrorException('Canva export timed out');
    }

    const downloadUrl = exportData.urls?.[0];
    if (!downloadUrl) {
      throw new InternalServerErrorException('No download URL in export result');
    }

    // Download file from Canva
    const downloadRes = await fetch(downloadUrl);
    if (!downloadRes.ok) {
      throw new InternalServerErrorException('Failed to download exported file from Canva');
    }

    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    const mimeType = this.getMimeType(format);
    const ext = format === 'jpg' ? 'jpg' : format;
    const creativeId = crypto.randomBytes(12).toString('hex');

    // Upload to S3
    const storageKey = this.storage.generateCreativeKey(orgId, creativeId, `canva-export.${ext}`);
    await this.storage.upload(storageKey, buffer, mimeType);

    // Generate download URL for the stored file
    const { url: fileUrl } = await this.storage.createPresignedDownload(storageKey);

    // Create Creative record
    const creativeType = format === 'mp4' ? 'VIDEO' : 'IMAGE';

    // If campaignId is not provided, we need one — look for a DRAFT campaign or fail gracefully
    let targetCampaignId = campaignId;
    if (!targetCampaignId) {
      // Find the most recent DRAFT campaign for this org
      const draftCampaign = await this.prisma.campaign.findFirst({
        where: { advertiserOrgId: orgId, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (draftCampaign) {
        targetCampaignId = draftCampaign.id;
      }
    }

    // Update CanvaDesign
    await this.prisma.canvaDesign.update({
      where: { id: design.id },
      data: { lastExportedAt: new Date() },
    });

    // Create Creative if we have a campaign
    let creative = null;
    if (targetCampaignId) {
      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
      creative = await this.prisma.creative.create({
        data: {
          id: creativeId,
          name: design.title || `Canva Export - ${new Date().toLocaleDateString('fr-FR')}`,
          type: creativeType as any,
          status: 'READY',
          source: 'CANVA',
          fileUrl,
          fileHash,
          fileSizeBytes: buffer.length,
          mimeType,
          canvaDesignId: design.id,
          campaignId: targetCampaignId,
        },
      });
    }

    this.logger.log(
      `Canva export stored: design=${canvaDesignId}, ` +
      `creative=${creative?.id || 'none'}, size=${buffer.length}, format=${format}`,
    );

    return {
      creativeId: creative?.id || creativeId,
      fileUrl,
      mimeType,
      fileSizeBytes: buffer.length,
      storageKey,
      canvaDesignId: design.id,
      campaignId: targetCampaignId || null,
    };
  }

  private getMimeType(format: string): string {
    switch (format) {
      case 'png': return 'image/png';
      case 'jpg': return 'image/jpeg';
      case 'mp4': return 'video/mp4';
      default: return 'application/octet-stream';
    }
  }
}
