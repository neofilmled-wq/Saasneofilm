import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DeviceAuthService {
  private readonly logger = new Logger(DeviceAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async authenticateDevice(provisioningToken: string, deviceFingerprint?: string) {
    const device = await this.prisma.device.findUnique({
      where: { provisioningToken },
      include: { screen: { select: { id: true, partnerOrgId: true } } },
    });
    if (!device) throw new UnauthorizedException('Invalid provisioning token');
    if (device.status === 'DECOMMISSIONED') throw new UnauthorizedException('Device decommissioned');
    await this.prisma.device.update({
      where: { id: device.id },
      data: { status: 'ONLINE', pairedAt: device.pairedAt || new Date(), ipAddress: deviceFingerprint || null, lastPingAt: new Date() },
    });
    const payload = { sub: device.id, screenId: device.screenId, orgId: device.screen?.partnerOrgId, type: 'device' };
    const ttl = this.configService.get<string>('DEVICE_TOKEN_TTL', '24h');
    const accessToken = this.jwtService.sign(payload, { expiresIn: ttl as any });
    this.logger.log(`Device authenticated: ${device.serialNumber}`);
    await this.auditService.log({ action: 'DEVICE_AUTH', entity: 'Device', entityId: device.id, ipAddress: deviceFingerprint });
    return { accessToken, expiresIn: 86400, tokenType: 'Bearer' as const, device: { id: device.id, serialNumber: device.serialNumber, screenId: device.screenId } };
  }

  async refreshDeviceToken(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId }, include: { screen: { select: { id: true, partnerOrgId: true } } } });
    if (!device || device.status === 'DECOMMISSIONED') throw new UnauthorizedException('Device not found or decommissioned');
    const payload = { sub: device.id, screenId: device.screenId, orgId: device.screen?.partnerOrgId, type: 'device' };
    const ttl = this.configService.get<string>('DEVICE_TOKEN_TTL', '24h');
    return { accessToken: this.jwtService.sign(payload, { expiresIn: ttl as any }), expiresIn: 86400, tokenType: 'Bearer' as const };
  }

  async heartbeat(deviceId: string, ipAddress?: string) {
    const device = await this.prisma.device.update({
      where: { id: deviceId },
      data: { lastPingAt: new Date(), ipAddress: ipAddress || undefined, status: 'ONLINE' },
      select: { screenId: true },
    });

    // Update ScreenLiveStatus so the partner dashboard shows "En ligne"
    if (device.screenId) {
      await this.prisma.screenLiveStatus.upsert({
        where: { screenId: device.screenId },
        update: { isOnline: true, lastHeartbeatAt: new Date(), currentDeviceId: deviceId },
        create: { screenId: device.screenId, isOnline: true, lastHeartbeatAt: new Date(), currentDeviceId: deviceId },
      });
    }

    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}