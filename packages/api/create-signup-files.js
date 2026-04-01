/**
 * Atomic file creation script for signup/OAuth/email/onboarding backend files.
 * Creates all files AND updates importing files simultaneously to prevent
 * the external watcher from deleting files with broken imports.
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'src');

const files = {};

// ─── 1. Email Module ────────────────────────────────────────────────────────

files['modules/email/email.module.ts'] = `import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';

@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
`;

files['modules/email/email.service.ts'] = `import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'localhost'),
      port: this.configService.get<number>('SMTP_PORT', 1025),
      secure: false,
      ignoreTLS: true,
    });
  }

  async sendVerificationEmail(email: string, token: string, firstName: string) {
    const apiUrl = this.configService.get<string>('API_BASE_URL', 'http://localhost:3001');
    const verifyUrl = \`\${apiUrl}/api/v1/auth/email/verify?token=\${token}\`;

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM', 'noreply@neofilm.io'),
        to: email,
        subject: 'NeoFilm — Vérifiez votre adresse email',
        html: \`
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Bienvenue sur NeoFilm, \${firstName} !</h2>
            <p>Merci de vous être inscrit. Veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="\${verifyUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Vérifier mon email
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Ce lien expire dans 24 heures.</p>
            <p style="color: #666; font-size: 14px;">Si vous n'avez pas créé de compte, ignorez cet email.</p>
          </div>
        \`,
      });
      this.logger.log(\`Verification email sent to \${email}\`);
    } catch (err) {
      this.logger.error(\`Failed to send verification email to \${email}: \${err}\`);
    }
  }

  async sendWelcomeEmail(email: string, firstName: string) {
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM', 'noreply@neofilm.io'),
        to: email,
        subject: 'NeoFilm — Bienvenue !',
        html: \`
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Bienvenue, \${firstName} !</h2>
            <p>Votre adresse email a été vérifiée avec succès. Vous pouvez maintenant vous connecter à NeoFilm.</p>
          </div>
        \`,
      });
    } catch (err) {
      this.logger.error(\`Failed to send welcome email to \${email}: \${err}\`);
    }
  }
}
`;

// ─── 2. OAuth Service ───────────────────────────────────────────────────────

files['modules/auth/oauth.service.ts'] = `import {
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
          name: \`\${profile.firstName}'s Organization\`,
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
      details: \`New \${interfaceType.toLowerCase()} registered via \${provider}: \${profile.email}\`,
      timestamp: new Date().toISOString(),
    });

    await this.auditService.log({
      action: 'REGISTER_OAUTH',
      entity: 'User',
      entityId: result.user.id,
      userId: result.user.id,
    });

    this.logger.log(\`New \${interfaceType} user registered via \${provider}: \${profile.email}\`);
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
    const base = \`\${firstName}-\${lastName}\`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return \`\${base}-\${crypto.randomBytes(3).toString('hex')}\`;
  }
}
`;

// ─── 3. OAuth Controller ────────────────────────────────────────────────────

files['modules/auth/oauth.controller.ts'] = `import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { OAuthService } from './oauth.service';
import { Public } from '../../common/decorators';

@ApiTags('OAuth')
@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  googleAuth(@Query('interfaceType') interfaceType: string, @Res() res: Response) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      return res.status(503).json({ message: 'Google OAuth not configured' });
    }
    const callbackUrl = this.configService.get<string>('GOOGLE_CALLBACK_URL', 'http://localhost:3001/api/v1/auth/oauth/google/callback');
    const state = Buffer.from(JSON.stringify({ interfaceType: interfaceType || 'ADVERTISER' })).toString('base64');
    const url = \`https://accounts.google.com/o/oauth2/v2/auth?\` +
      \`client_id=\${clientId}&\` +
      \`redirect_uri=\${encodeURIComponent(callbackUrl)}&\` +
      \`response_type=code&\` +
      \`scope=\${encodeURIComponent('openid email profile')}&\` +
      \`state=\${state}&\` +
      \`access_type=offline&\` +
      \`prompt=consent\`;
    return res.redirect(url);
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const stateData = JSON.parse(Buffer.from(state || '', 'base64').toString());
      const interfaceType = stateData.interfaceType === 'PARTNER' ? 'PARTNER' : 'ADVERTISER';

      // Exchange code for tokens
      const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
      const callbackUrl = this.configService.get<string>('GOOGLE_CALLBACK_URL', 'http://localhost:3001/api/v1/auth/oauth/google/callback');

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenData.error_description || 'Token exchange failed');
      }

      // Get user info
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: \`Bearer \${tokenData.access_token}\` },
      });
      const userInfo = await userInfoRes.json();

      const result = await this.oauthService.handleOAuthLogin(
        {
          email: userInfo.email,
          firstName: userInfo.given_name || userInfo.name?.split(' ')[0] || 'User',
          lastName: userInfo.family_name || userInfo.name?.split(' ').slice(1).join(' ') || '',
          providerAccountId: userInfo.id,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        },
        'google',
        interfaceType as 'PARTNER' | 'ADVERTISER',
      );

      // Redirect to frontend
      const frontendUrl = interfaceType === 'PARTNER'
        ? this.configService.get<string>('PARTNER_APP_URL', 'http://localhost:3002')
        : this.configService.get<string>('ADVERTISER_APP_URL', 'http://localhost:3003');
      const redirectUrl = \`\${frontendUrl}/auth/callback?token=\${result.tokens.accessToken}&refresh=\${result.tokens.refreshToken}&isNew=\${result.isNew}\`;
      return res.redirect(redirectUrl);
    } catch (err: any) {
      this.logger.error(\`Google OAuth callback error: \${err.message}\`);
      const fallbackUrl = this.configService.get<string>('ADVERTISER_APP_URL', 'http://localhost:3003');
      return res.redirect(\`\${fallbackUrl}/login?error=oauth_failed\`);
    }
  }
}
`;

// ─── 4. Onboarding Controller ───────────────────────────────────────────────

files['modules/auth/onboarding.controller.ts'] = `import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get onboarding status' })
  async getStatus(@CurrentUser() user: any) {
    return this.onboardingService.getOnboardingStatus(user.id);
  }

  @Post('complete')
  @ApiOperation({ summary: 'Complete onboarding' })
  async complete(@CurrentUser() user: any, @Body() body: any) {
    return this.onboardingService.completeOnboarding(user.id, body);
  }
}
`;

// ─── 5. Onboarding Service ──────────────────────────────────────────────────

files['modules/auth/onboarding.service.ts'] = `import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminGateway } from '../admin/admin.gateway';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminGateway: AdminGateway,
  ) {}

  async getOnboardingStatus(userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      include: { organization: true },
    });
    if (!membership) {
      return { completed: false, orgType: null };
    }
    return {
      completed: !!membership.organization.onboardingCompletedAt,
      orgType: membership.organization.type,
      orgId: membership.organization.id,
      orgName: membership.organization.name,
    };
  }

  async completeOnboarding(userId: string, data: any) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      include: { organization: true },
    });
    if (!membership) throw new NotFoundException('No organization found');

    const org = await this.prisma.organization.update({
      where: { id: membership.organizationId },
      data: {
        name: data.name || membership.organization.name,
        contactEmail: data.contactEmail || membership.organization.contactEmail,
        contactPhone: data.contactPhone,
        city: data.city,
        address: data.address,
        postCode: data.postCode,
        onboardingCompletedAt: new Date(),
      },
    });

    // Emit WS events
    if (org.type === 'PARTNER') this.adminGateway.emitPartnersChanged();
    if (org.type === 'ADVERTISER') this.adminGateway.emitAdvertisersChanged();
    this.adminGateway.emitDashboardUpdate();

    this.logger.log(\`Onboarding completed for org \${org.name} (\${org.type})\`);
    return { completed: true, orgType: org.type, orgId: org.id, orgName: org.name };
  }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Now update existing files that import these
// ─────────────────────────────────────────────────────────────────────────────

// ─── Update auth.module.ts ──────────────────────────────────────────────────

const authModuleContent = `import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { DeviceAuthController } from './device-auth.controller';
import { DeviceAuthService } from './device-auth.service';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';
import { BruteForceService } from './brute-force.service';
import { AnomalyService } from './anomaly.service';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AdminModule } from '../admin/admin.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-this-in-production-minimum-32-chars'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRATION', '15m') as any },
      }),
    }),
    AuditModule,
    UsersModule,
    AdminModule,
    EmailModule,
  ],
  controllers: [AuthController, DeviceAuthController, MfaController, OAuthController, OnboardingController],
  providers: [AuthService, JwtStrategy, LocalStrategy, DeviceAuthService, MfaService, BruteForceService, AnomalyService, OAuthService, OnboardingService],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
`;

files['modules/auth/auth.module.ts'] = authModuleContent;

// ─── Update app.module.ts ───────────────────────────────────────────────────

const appModulePath = path.join(BASE, 'app.module.ts');
let appModuleContent = fs.readFileSync(appModulePath, 'utf-8');
if (!appModuleContent.includes('EmailModule')) {
  appModuleContent = appModuleContent.replace(
    "import { AdminModule } from './modules/admin/admin.module';",
    "import { AdminModule } from './modules/admin/admin.module';\nimport { EmailModule } from './modules/email/email.module';",
  );
  appModuleContent = appModuleContent.replace(
    'AdminModule,\n  ],',
    'AdminModule,\n    EmailModule,\n  ],',
  );
  files['app.module.ts'] = appModuleContent;
}

// ─── Write all files atomically ─────────────────────────────────────────────

console.log('Creating signup/OAuth/onboarding backend files...\n');

for (const [relPath, content] of Object.entries(files)) {
  const fullPath = path.join(BASE, relPath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, 'utf-8');
  console.log(`  ✅ ${relPath}`);
}

console.log('\n✅ All files created successfully.');
