import { Injectable, BadRequestException, UnauthorizedException, Logger, forwardRef, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService,
  ) {}

  private async getOtplib(): Promise<any> {
    const mod = await (Function('return import("otplib")')() as Promise<any>);
    return mod;
  }

  async generateSetup(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, mfaEnabled: true } });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled');
    const { authenticator } = await this.getOtplib();
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });
    return { secret, otpAuthUrl: authenticator.keyuri(user.email, 'NeoFilm', secret) };
  }

  async enableMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { mfaSecret: true, mfaEnabled: true } });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled');
    if (!user.mfaSecret) throw new BadRequestException('Run MFA setup first');
    const { authenticator } = await this.getOtplib();
    if (!authenticator.verify({ token: code, secret: user.mfaSecret })) throw new BadRequestException('Invalid MFA code');
    const backupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex'));
    const hashedCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaBackupCodesHash: hashedCodes } });
    await this.auditService.log({ action: 'MFA_ENABLED', entity: 'User', entityId: userId, userId });
    return { message: 'MFA enabled successfully', backupCodes };
  }

  async verifyMfaLogin(mfaToken: string, code: string, ipAddress?: string, userAgent?: string) {
    let payload: any;
    try { payload = this.jwtService.verify(mfaToken); } catch { throw new UnauthorizedException('MFA token expired or invalid'); }
    if (payload.type !== 'mfa_pending') throw new UnauthorizedException('Invalid MFA token');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, firstName: true, lastName: true, platformRole: true, mfaSecret: true, mfaBackupCodesHash: true },
    });
    if (!user || !user.mfaSecret) throw new UnauthorizedException('User not found');
    const { authenticator } = await this.getOtplib();
    let isValid = authenticator.verify({ token: code, secret: user.mfaSecret });
    if (!isValid && user.mfaBackupCodesHash.length > 0) {
      for (let i = 0; i < user.mfaBackupCodesHash.length; i++) {
        if (await bcrypt.compare(code, user.mfaBackupCodesHash[i])) {
          isValid = true;
          const updated = [...user.mfaBackupCodesHash]; updated.splice(i, 1);
          await this.prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodesHash: updated } });
          this.logger.warn(`Backup code used by user ${user.id}`);
          break;
        }
      }
    }
    if (!isValid) throw new UnauthorizedException('Invalid MFA code');
    return this.authService.completeLogin(user, ipAddress, userAgent);
  }

  async disableMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true, mfaSecret: true } });
    if (!user || !user.mfaEnabled) throw new BadRequestException('MFA is not enabled');
    const { authenticator } = await this.getOtplib();
    if (!authenticator.verify({ token: code, secret: user.mfaSecret! })) throw new BadRequestException('Invalid MFA code');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodesHash: [] } });
    await this.auditService.log({ action: 'MFA_DISABLED', entity: 'User', entityId: userId, userId });
    return { message: 'MFA disabled successfully' };
  }

  async regenerateBackupCodes(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true, mfaSecret: true } });
    if (!user || !user.mfaEnabled) throw new BadRequestException('MFA is not enabled');
    const { authenticator } = await this.getOtplib();
    if (!authenticator.verify({ token: code, secret: user.mfaSecret! })) throw new BadRequestException('Invalid MFA code');
    const backupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex'));
    const hashedCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));
    await this.prisma.user.update({ where: { id: userId }, data: { mfaBackupCodesHash: hashedCodes } });
    return { backupCodes };
  }
}