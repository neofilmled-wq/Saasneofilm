import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerGateway } from '../partner-gateway/partner.gateway';
import { randomBytes, randomInt } from 'crypto';

@Injectable()
export class TvAuthService {
  private readonly logger = new Logger(TvAuthService.name);

  /** In-memory PIN store: pin → { deviceId, expiresAt } */
  private readonly pinStore = new Map<string, { deviceId: string; expiresAt: Date }>();

  /** Map browser fingerprint → DB device id (survives re-registration) */
  private readonly fingerprintMap = new Map<string, string>();

  private readonly PIN_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly partnerGateway: PartnerGateway,
  ) {
    // Clean expired PINs every minute
    setInterval(() => this.cleanExpiredPins(), 60_000);
  }

  /**
   * Device self-registers: creates or reuses a Device record, generates a 6-digit PIN.
   */
  async registerDevice(deviceId: string, serialNumber?: string, androidId?: string) {
    const serial = serialNumber || deviceId;

    // 0. Try reconnect by androidId first — if device already paired, skip registration
    if (androidId) {
      const reconnected = await this.reconnectByAndroidId(androidId);
      if (reconnected) return { ...reconnected, alreadyPaired: true, pin: '', expiresAt: new Date(0).toISOString(), pairingUrl: '', qrPayload: '' };
    }

    // 1. Check if we already mapped this fingerprint
    const knownDbId = this.fingerprintMap.get(deviceId);

    // 2. Try to find existing device by known DB id OR by serial number
    let device = knownDbId
      ? await this.prisma.device.findUnique({ where: { id: knownDbId } })
      : await this.prisma.device.findUnique({ where: { serialNumber: serial } });

    if (!device) {
      // Create new device
      try {
        const provisioningToken = randomBytes(32).toString('hex');
        device = await this.prisma.device.create({
          data: {
            serialNumber: serial,
            provisioningToken,
            status: 'PROVISIONING',
          },
        });
        this.logger.log(`New TV device registered: ${device.serialNumber} (${device.id})`);
      } catch (err: any) {
        // Handle unique constraint violation (device already exists with this serial)
        if (err?.code === 'P2002') {
          device = await this.prisma.device.findUnique({ where: { serialNumber: serial } });
          if (!device) throw err;
          this.logger.log(`Reusing existing device: ${device.serialNumber} (${device.id})`);
        } else {
          throw err;
        }
      }
    }

    // Remember mapping
    this.fingerprintMap.set(deviceId, device.id);

    // Store androidId on the device if provided
    if (androidId && !device.androidId) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { androidId },
      }).catch(() => { /* unique constraint if another device has this androidId */ });
    }

    // If device is already paired (ONLINE + pairedAt), return its status directly.
    // Do NOT reset it — the TV app should use its stored token instead.
    if (device.status === 'ONLINE' && device.pairedAt) {
      this.logger.log(`Device ${device.serialNumber} already paired — skipping PIN generation`);
      const screen = device.screenId
        ? await this.prisma.screen.findUnique({ where: { id: device.screenId }, select: { name: true } })
        : null;
      return {
        deviceId: device.id,
        pin: '',
        expiresAt: new Date(0).toISOString(),
        pairingUrl: '',
        qrPayload: '',
        alreadyPaired: true,
        screenId: device.screenId,
        screenName: screen?.name || null,
      };
    }

    // Reuse existing valid PIN for this device, or generate a new one
    let pin: string | null = null;
    let expiresAt = new Date(Date.now() + this.PIN_TTL_MS);
    for (const [existingPin, entry] of this.pinStore) {
      if (entry.deviceId === device.id && entry.expiresAt > new Date()) {
        pin = existingPin;
        expiresAt = entry.expiresAt;
        break;
      }
    }
    if (!pin) {
      pin = this.generatePin();
      expiresAt = new Date(Date.now() + this.PIN_TTL_MS);
      this.pinStore.set(pin, { deviceId: device.id, expiresAt });
    }

    const pairingUrl = `http://localhost:3000/admin/devices/pair?pin=${pin}&deviceId=${device.id}`;

    this.logger.log(`PIN ${pin} generated for device ${device.serialNumber} (expires ${expiresAt.toISOString()})`);

    return {
      deviceId: device.id,
      pin,
      expiresAt: expiresAt.toISOString(),
      pairingUrl,
      qrPayload: JSON.stringify({
        pin,
        deviceId: device.id,
        url: pairingUrl,
        ts: Date.now(),
      }),
    };
  }

  /**
   * Pair device by PIN — validates PIN, marks device ONLINE, returns JWT.
   */
  async pairByPin(pin: string, screenId?: string) {
    const entry = this.pinStore.get(pin);
    if (!entry) throw new NotFoundException('Invalid or expired PIN');
    if (entry.expiresAt < new Date()) {
      this.pinStore.delete(pin);
      throw new BadRequestException('PIN has expired');
    }

    const device = await this.prisma.device.findUnique({
      where: { id: entry.deviceId },
      include: { screen: { select: { id: true, name: true, partnerOrgId: true } } },
    });
    if (!device) throw new NotFoundException('Device not found');

    // Assign to screen if provided — always update (partner may reassign)
    const effectiveScreenId = screenId || device.screenId || undefined;
    if (effectiveScreenId) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { screenId: effectiveScreenId },
      });
      // Also update the Screen.activeDeviceId so the partner portal can see it
      await this.prisma.screen.update({
        where: { id: effectiveScreenId },
        data: { activeDeviceId: device.id },
      }).catch(() => { /* screen may not exist yet */ });
    }

    // Mark paired
    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        status: 'ONLINE',
        pairedAt: new Date(),
        lastPingAt: new Date(),
      },
    });

    // Consume PIN
    this.pinStore.delete(pin);

    // Emit real-time event to the partner
    const partnerOrgId = device.screen?.partnerOrgId;
    if (partnerOrgId && effectiveScreenId) {
      this.partnerGateway.emitDevicePaired(partnerOrgId, effectiveScreenId, device.id);
      this.partnerGateway.emitScreensChanged(partnerOrgId);
    }

    // Generate JWT
    const payload = {
      sub: device.id,
      screenId: effectiveScreenId,
      orgId: device.screen?.partnerOrgId,
      type: 'device',
    };
    const ttl = this.configService.get<string>('DEVICE_TOKEN_TTL', '24h');
    const accessToken = this.jwtService.sign(payload, { expiresIn: ttl as any });

    this.logger.log(`Device ${device.serialNumber} paired via PIN ${pin}`);

    return {
      accessToken,
      expiresIn: 86400,
      tokenType: 'Bearer' as const,
      device: {
        id: device.id,
        serialNumber: device.serialNumber,
        screenId: effectiveScreenId,
        screenName: device.screen?.name || null,
      },
    };
  }

  /**
   * Reconnect a device by its Android hardware ID.
   * If the androidId matches a paired device, issue a new JWT without re-pairing.
   */
  async reconnectByAndroidId(androidId: string) {
    if (!androidId) return null;

    const device = await this.prisma.device.findUnique({
      where: { androidId },
      include: { screen: { select: { id: true, name: true, partnerOrgId: true } } },
    });

    if (!device || !device.pairedAt || !device.screenId) return null;

    // Issue fresh JWT
    const payload = {
      sub: device.id,
      screenId: device.screenId,
      orgId: device.screen?.partnerOrgId,
      type: 'device',
    };
    const ttl = this.configService.get<string>('DEVICE_TOKEN_TTL', '24h');
    const accessToken = this.jwtService.sign(payload, { expiresIn: ttl as any });

    // Update last ping
    await this.prisma.device.update({
      where: { id: device.id },
      data: { status: 'ONLINE', lastPingAt: new Date() },
    });

    this.logger.log(`Device ${device.serialNumber} reconnected by androidId ${androidId}`);

    return {
      accessToken,
      expiresIn: 86400,
      tokenType: 'Bearer' as const,
      device: {
        id: device.id,
        serialNumber: device.serialNumber,
        screenId: device.screenId,
        screenName: device.screen?.name || null,
      },
    };
  }

  /**
   * Check if a device is paired (TV polls this after showing PIN).
   */
  async getDeviceStatus(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        status: true,
        pairedAt: true,
        screenId: true,
        screen: { select: { name: true, partnerOrgId: true } },
      },
    });

    if (!device) throw new NotFoundException('Device not found');

    const isPaired = device.status === 'ONLINE' && device.pairedAt !== null;

    // If paired, generate a fresh JWT so the TV can start using it
    if (isPaired) {
      const payload = { sub: device.id, screenId: device.screenId, orgId: device.screen?.partnerOrgId, type: 'device' };
      const ttl = this.configService.get<string>('DEVICE_TOKEN_TTL', '24h');
      const accessToken = this.jwtService.sign(payload, { expiresIn: ttl as any });

      return {
        status: 'PAIRED',
        deviceId: device.id,
        screenId: device.screenId,
        screenName: device.screen?.name || null,
        accessToken,
        expiresIn: 86400,
      };
    }

    return {
      status: 'WAITING',
      deviceId: device.id,
    };
  }

  /**
   * Return device info for an authenticated device (GET /tv/me).
   */
  async getDeviceInfo(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        serialNumber: true,
        status: true,
        pairedAt: true,
        screenId: true,
        screen: { select: { name: true, partnerOrgId: true } },
      },
    });

    if (!device) throw new NotFoundException('Device not found');

    const isPaired = device.status === 'ONLINE' && device.pairedAt !== null;

    return {
      paired: isPaired,
      deviceId: device.id,
      serialNumber: device.serialNumber,
      screenId: device.screenId,
      screenName: device.screen?.name || null,
      partnerOrgId: device.screen?.partnerOrgId || null,
      status: device.status,
      pairedAt: device.pairedAt?.toISOString() || null,
    };
  }

  /**
   * Reset a device back to PROVISIONING so a new PIN is generated on the next register call.
   * Called when the TV user taps "Réinitialiser l'appairage" in settings.
   */
  async resetDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');

    // If the device was linked to a screen, clear screen.activeDeviceId too
    if (device.screenId) {
      await this.prisma.screen.update({
        where: { id: device.screenId },
        data: { activeDeviceId: null },
      }).catch(() => { /* screen may already be deleted */ });
    }

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'PROVISIONING',
        pairedAt: null,
        screenId: null,
        lastPingAt: null,
      },
    });

    // Clear any existing PIN for this device from the in-memory store
    for (const [pin, entry] of this.pinStore) {
      if (entry.deviceId === deviceId) {
        this.pinStore.delete(pin);
      }
    }

    this.logger.log(`Device ${device.serialNumber} reset to PROVISIONING`);
    return { reset: true };
  }

  /**
   * Check if an app update is available.
   * Compares device versionCode with the latest AppRelease.
   */
  async checkUpdate(currentVersionCode: number, variant: string) {
    const latest = await this.prisma.appRelease.findFirst({
      where: {
        targetVariant: { in: [variant, 'all'] },
      },
      orderBy: { versionCode: 'desc' },
    });

    if (!latest || latest.versionCode <= currentVersionCode) {
      return { updateAvailable: false };
    }

    return {
      updateAvailable: true,
      isRequired: latest.isRequired,
      versionName: latest.versionName,
      versionCode: latest.versionCode,
      apkUrl: latest.apkUrl,
      releaseNotes: latest.releaseNotes,
    };
  }

  private generatePin(): string {
    // Generate unique 6-digit PIN not already in use
    let pin: string;
    let attempts = 0;
    do {
      pin = String(randomInt(100000, 999999));
      attempts++;
    } while (this.pinStore.has(pin) && attempts < 100);
    return pin;
  }

  private cleanExpiredPins() {
    const now = new Date();
    let cleaned = 0;
    for (const [pin, entry] of this.pinStore) {
      if (entry.expiresAt < now) {
        this.pinStore.delete(pin);
        cleaned++;
      }
    }
    if (cleaned > 0) this.logger.debug(`Cleaned ${cleaned} expired PINs`);
  }
}
