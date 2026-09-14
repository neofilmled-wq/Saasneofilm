import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveJwtSecret } from '../jwt-secret.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService),
    });
  }

  async validate(payload: {
    sub: string;
    email?: string;
    platformRole?: string | null;
    orgRole?: string | null;
    orgId?: string;
    type?: string;
    screenId?: string;
  }) {
    // Whitelist, not blacklist. Only genuine session tokens may reach a
    // protected route: an access token (no `type`, or 'access') or a device
    // token ('device'). Anything else — mfa_pending, and notably the
    // email-verification token, which is otherwise a full-scope token — is
    // rejected here so it can never be replayed as a login.
    const t = payload.type ?? 'access';
    if (t !== 'access' && t !== 'device') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Device tokens: validate against Device table, not User
    if (payload.type === 'device') {
      const device = await this.prisma.device.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          status: true,
          pairedAt: true,
          screenId: true,
          screen: { select: { partnerOrgId: true } },
        },
      });

      if (!device || device.status === 'DECOMMISSIONED') {
        throw new UnauthorizedException();
      }

      return {
        id: device.id,
        type: 'device' as const,
        screenId: device.screenId,
        orgId: device.screen?.partnerOrgId ?? payload.orgId,
      };
    }

    // User tokens
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        platformRole: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      platformRole: user.platformRole,
      orgRole: payload.orgRole ?? null,
      orgId: payload.orgId ?? null,
    };
  }
}
