import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminGateway } from '../admin/admin.gateway';

interface OAuthProfile {
  email: string;
  firstName: string;
  lastName: string;
  providerAccountId: string;
  accessToken?: string;
  refreshToken?: string;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly adminGateway: AdminGateway,
  ) {}

  async handleOAuthLogin(
    profile: OAuthProfile,
    provider: string,
    interfaceType: 'PARTNER' | 'ADVERTISER',
  ) {
    // 1. Check if OAuthAccount exists
    const existingOAuth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (existingOAuth) {
      // Existing user — login
      if (!existingOAuth.user.isActive) {
        throw new UnauthorizedException('Account is disabled');
      }
      await this.prisma.user.update({
        where: { id: existingOAuth.user.id },
        data: { lastLoginAt: new Date() },
      });
      const tokens = await this.generateTokens(existingOAuth.user);
      const isNew = false;
      return { tokens, user: existingOAuth.user, isNew };
    }

    // 2. Check if user with same email exists (link accounts)
    const existingUser = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (existingUser) {
      // Link OAuth account to existing user
      await this.prisma.oAuthAccount.create({
        data: {
          provider,
          providerAccountId: profile.providerAccountId,
          userId: existingUser.id,
          accessToken: profile.accessToken,
          refreshToken: profile.refreshToken,
        },
      });
      if (!existingUser.emailVerifiedAt) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { emailVerifiedAt: new Date(), lastLoginAt: new Date() },
        });
      }
      const tokens = await this.generateTokens(existingUser);
      return { tokens, user: existingUser, isNew: false };
    }

    // 3. Create new user + org + membership
    const slug = this.generateSlug(profile.firstName, profile.lastName);
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          oauthAccounts: {
            create: {
              provider,
              providerAccountId: profile.providerAccountId,
              accessToken: profile.accessToken,
              refreshToken: profile.refreshToken,
            },
          },
        },
      });

      const org = await tx.organization.create({
        data: {
          type: interfaceType,
          name: `${profile.firstName}'s Organization`,
          slug,
          contactEmail: profile.email,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: 'OWNER',
          acceptedAt: new Date(),
        },
      });

      return { user, org };
    });

    // Emit WebSocket events
    this.adminGateway.emitUsersChanged();
    if (interfaceType === 'PARTNER') this.adminGateway.emitPartnersChanged();
    if (interfaceType === 'ADVERTISER') this.adminGateway.emitAdvertisersChanged();
    this.adminGateway.emitDashboardUpdate();
    this.adminGateway.emitActivityNew({
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: result.user.id,
      details: `New ${interfaceType.toLowerCase()} registered via ${provider}: ${profile.email}`,
      timestamp: new Date().toISOString(),
    });

    await this.auditService.log({
      action: 'REGISTER_OAUTH',
      entity: 'User',
      entityId: result.user.id,
      userId: result.user.id,
    });

    this.logger.log(`New ${interfaceType} user registered via ${provider}: ${profile.email}`);
    const tokens = await this.generateTokens(result.user);
    return { tokens, user: result.user, isNew: true };
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      type: 'access',
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshExpDays = parseInt(this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d').replace('d', ''), 10) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshExpDays);

    await this.prisma.refreshToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private generateSlug(firstName: string, lastName: string): string {
    const base = `${firstName}-${lastName}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
  }
}
