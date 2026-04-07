import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BruteForceService } from './brute-force.service';
import { AnomalyService } from './anomaly.service';
import { EmailService } from '../email/email.service';
import { AdminGateway } from '../admin/admin.gateway';

export interface JwtPayload {
  sub: string;
  email: string;
  platformRole: string | null;
  type: 'access' | 'mfa_pending';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly bruteForceService: BruteForceService,
    private readonly anomalyService: AnomalyService,
    private readonly emailService: EmailService,
    private readonly adminGateway: AdminGateway,
  ) {}

  async register(
    data: { email: string; password: string; firstName: string; lastName: string; interfaceType?: string },
    ipAddress?: string,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('Email already registered');

    const interfaceType = (data.interfaceType === 'PARTNER' ? 'PARTNER' : 'ADVERTISER') as 'PARTNER' | 'ADVERTISER';
    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '12'), 10);
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);

    // Create user + org + membership in transaction
    const slug = `${data.firstName}-${data.lastName}-${crypto.randomBytes(3).toString('hex')}`
      .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
        },
      });

      const org = await tx.organization.create({
        data: {
          type: interfaceType,
          name: `${data.firstName}'s Organization`,
          slug,
          contactEmail: data.email,
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

    // Send verification email
    const verifyToken = this.jwtService.sign(
      { sub: result.user.id, email: result.user.email, type: 'email_verify' },
      { expiresIn: '24h' as any },
    );
    await this.emailService.sendVerificationEmail(data.email, verifyToken, data.firstName);

    // Emit WebSocket events for admin dashboard
    this.adminGateway.emitUsersChanged();
    if (interfaceType === 'PARTNER') this.adminGateway.emitPartnersChanged();
    if (interfaceType === 'ADVERTISER') this.adminGateway.emitAdvertisersChanged();
    this.adminGateway.emitDashboardUpdate();
    this.adminGateway.emitActivityNew({
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: result.user.id,
      details: `New ${interfaceType.toLowerCase()} registered: ${data.email}`,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`User registered: ${result.user.email} (${interfaceType})`);
    await this.auditService.log({ action: 'REGISTER', entity: 'User', entityId: result.user.id, userId: result.user.id, ipAddress });

    const tokens = await this.generateTokens(result.user, ipAddress);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer' as const,
      user: { id: result.user.id, email: result.user.email, firstName: result.user.firstName, lastName: result.user.lastName, platformRole: result.user.platformRole },
      emailVerificationRequired: true,
    };
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new ForbiddenException('Account is disabled');
    if (!user.passwordHash) throw new UnauthorizedException('This account uses social login. Please sign in with Google or Microsoft.');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');
    // Check email verification (skip for platform admins)
    if (!user.emailVerifiedAt && !user.platformRole) {
      throw new ForbiddenException('Please verify your email address before logging in.');
    }
    return user;
  }

  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    await this.bruteForceService.checkLockout(email);

    let user: any;
    try {
      user = await this.validateUser(email, password);
    } catch (error) {
      const lockUntil = await this.bruteForceService.recordFailedAttempt(email);
      if (lockUntil) {
        await this.prisma.user.updateMany({ where: { email }, data: { failedLoginAttempts: { increment: 1 }, lockedUntil: lockUntil } });
        await this.auditService.log({ action: 'ACCOUNT_LOCKED', entity: 'User', entityId: email, ipAddress, userAgent, severity: 'WARN' });
      } else {
        await this.prisma.user.updateMany({ where: { email }, data: { failedLoginAttempts: { increment: 1 } } });
      }
      await this.auditService.log({ action: 'LOGIN_FAILED', entity: 'User', entityId: email, ipAddress, userAgent });
      throw error;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Account is temporarily locked. Try again later.');
    }

    // MFA check
    if (user.mfaEnabled) {
      const mfaToken = this.jwtService.sign({ sub: user.id, email: user.email, type: 'mfa_pending' }, { expiresIn: '5m' as any });
      return { mfaRequired: true as const, mfaToken };
    }

    return this.completeLogin(user, ipAddress, userAgent);
  }

  async completeLogin(user: any, ipAddress?: string, userAgent?: string) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress || null, failedLoginAttempts: 0, lockedUntil: null },
    });
    const tokens = await this.generateTokens(user, ipAddress, userAgent);
    this.logger.log(`User logged in: ${user.email}`);
    await this.auditService.log({ action: 'LOGIN_SUCCESS', entity: 'User', entityId: user.id, userId: user.id, ipAddress, userAgent });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer' as const,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, platformRole: user.platformRole },
    };
  }

  async refreshTokens(refreshToken: string, ipAddress?: string, userAgent?: string) {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });

    if (!storedToken) throw new UnauthorizedException('Invalid refresh token');

    // Token reuse detection
    if (storedToken.revokedAt) {
      this.logger.warn(`Refresh token reuse detected for user ${storedToken.userId}`);
      await this.prisma.refreshToken.updateMany({ where: { userId: storedToken.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.auditService.log({ action: 'TOKEN_REUSE_DETECTED', entity: 'User', entityId: storedToken.userId, userId: storedToken.userId, ipAddress, severity: 'CRITICAL' });
      throw new UnauthorizedException('Token reuse detected. All sessions revoked.');
    }

    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.update({ where: { id: storedToken.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Refresh token expired');
    }
    if (!storedToken.user.isActive) throw new ForbiddenException('Account is disabled');

    // Revoke old, generate new
    await this.prisma.refreshToken.update({ where: { id: storedToken.id }, data: { revokedAt: new Date() } });
    const tokens = await this.generateTokens(storedToken.user, ipAddress, userAgent);
    await this.prisma.refreshToken.update({ where: { id: storedToken.id }, data: { replacedBy: tokens.refreshTokenId } });
    await this.auditService.log({ action: 'TOKEN_REFRESH', entity: 'User', entityId: storedToken.userId, userId: storedToken.userId, ipAddress });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer' as const,
      user: { id: storedToken.user.id, email: storedToken.user.email, firstName: storedToken.user.firstName, lastName: storedToken.user.lastName, platformRole: storedToken.user.platformRole },
    };
  }

  async logout(userId: string, refreshToken: string, ipAddress?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({ where: { tokenHash, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.auditService.log({ action: 'LOGOUT', entity: 'User', entityId: userId, userId, ipAddress });
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string, ipAddress?: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.auditService.log({ action: 'LOGOUT_ALL', entity: 'User', entityId: userId, userId, ipAddress });
    return { message: 'All sessions revoked' };
  }

  async verifyEmail(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      if (payload.type !== 'email_verify') throw new Error('Invalid token type');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('User not found');
      if (user.emailVerifiedAt) return { alreadyVerified: true, email: user.email };
      await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await this.emailService.sendWelcomeEmail(user.email, user.firstName);
      this.logger.log(`Email verified for: ${user.email}`);
      return { verified: true, email: user.email };
    } catch (err: any) {
      throw new UnauthorizedException('Invalid or expired verification link');
    }
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { message: 'If this email is registered, a verification link has been sent.' };
    if (user.emailVerifiedAt) return { message: 'Email already verified.' };
    const verifyToken = this.jwtService.sign(
      { sub: user.id, email: user.email, type: 'email_verify' },
      { expiresIn: '24h' as any },
    );
    await this.emailService.sendVerificationEmail(email, verifyToken, user.firstName);
    return { message: 'If this email is registered, a verification link has been sent.' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, platformRole: true, isActive: true, avatar: true, mfaEnabled: true, lastLoginAt: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  private async generateTokens(user: any, ipAddress?: string, deviceInfo?: string) {
    // Fetch org membership to include orgRole in token
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id },
      select: { role: true, organizationId: true },
      orderBy: { createdAt: 'asc' },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      orgRole: membership?.role ?? null,
      orgId: membership?.organizationId ?? null,
      type: 'access',
    };
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const refreshExpDays = parseInt(this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d').replace('d', ''), 10) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshExpDays);

    const stored = await this.prisma.refreshToken.create({ data: { tokenHash, userId: user.id, deviceInfo, ipAddress, expiresAt } });
    const accessExpMin = parseInt(this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m').replace('m', ''), 10) || 15;

    return { accessToken, refreshToken, refreshTokenId: stored.id, expiresIn: accessExpMin * 60, tokenType: 'Bearer' as const };
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
