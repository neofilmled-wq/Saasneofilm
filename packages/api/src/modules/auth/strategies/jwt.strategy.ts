import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_SECRET',
        'change-this-in-production-minimum-32-chars',
      ),
    });
  }

  async validate(payload: {
    sub: string;
    email?: string;
    platformRole?: string | null;
    type?: string;
    screenId?: string;
    orgId?: string;
  }) {
    // Reject MFA pending tokens from accessing protected routes
    if (payload.type === 'mfa_pending') {
      throw new UnauthorizedException('MFA verification required');
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
    };
  }
}
