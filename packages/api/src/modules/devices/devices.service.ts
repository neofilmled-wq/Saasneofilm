import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { PartnerGateway } from '../partner-gateway/partner.gateway';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partnerGateway: PartnerGateway,
  ) {}

  async findAll(params: { page: number; limit: number; status?: string; screenId?: string }) {
    const { page, limit, status, screenId } = params;
    const where: any = {};
    if (status) where.status = status;
    if (screenId) where.screenId = screenId;

    const [devices, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { screen: { select: { name: true, partnerOrg: { select: { name: true } } } } },
        orderBy: { lastPingAt: { sort: 'desc', nulls: 'last' } },
      }),
      this.prisma.device.count({ where }),
    ]);
    return { data: devices, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const device = await this.prisma.device.findUnique({
      where: { id },
      include: { screen: { include: { partnerOrg: true } } },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async create(data: any) {
    const provisioningToken = randomBytes(32).toString('hex');
    return this.prisma.device.create({
      data: { ...data, provisioningToken, status: 'PROVISIONING' },
    });
  }

  async update(id: string, data: any) {
    await this.findById(id);
    return this.prisma.device.update({ where: { id }, data });
  }

  async heartbeat(id: string, data: any) {
    return this.prisma.device.update({
      where: { id },
      data: {
        lastPingAt: new Date(),
        status: 'ONLINE',
        ipAddress: data.ipAddress,
        osVersion: data.osVersion,
        appVersion: data.appVersion,
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.device.delete({ where: { id } });
    return { message: 'Device deleted successfully' };
  }

  // ─── Pairing flow ────────────────────────────────────────────────────────

  /** Device (TV) calls this at startup to get a PIN displayed on screen. */
  async requestPairing(data: {
    serialNumber: string;
    deviceType?: string;
  }) {
    // Generate a 6-digit PIN
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const pinExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    // Upsert: if the same serial already has a PENDING request, refresh it
    const existing = await this.prisma.devicePairingRequest.findFirst({
      where: { serialNumber: data.serialNumber, status: 'PENDING' },
    });

    if (existing) {
      return this.prisma.devicePairingRequest.update({
        where: { id: existing.id },
        data: { pin, pinExpiresAt },
      });
    }

    return this.prisma.devicePairingRequest.create({
      data: {
        serialNumber: data.serialNumber,
        deviceType: (data.deviceType as any) ?? 'OTHER',
        pin,
        pinExpiresAt,
        status: 'PENDING',
      },
    });
  }

  /** List unclaimed pairing requests (partner views these to batch-claim) */
  async getPairingRequests(params: { page: number; limit: number }) {
    const { page, limit } = params;
    // Cleanup expired first
    await this.prisma.devicePairingRequest.updateMany({
      where: { status: 'PENDING', pinExpiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });

    const [items, total] = await Promise.all([
      this.prisma.devicePairingRequest.findMany({
        where: { status: 'PENDING' },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { screen: { select: { id: true, name: true, city: true } } },
      }),
      this.prisma.devicePairingRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return { data: items, total, page, limit };
  }

  /**
   * Partner claims a single PIN.
   * Creates a Device record (or reuses serialNumber), associates it with the screen.
   */
  async claimByPin(data: {
    pin: string;
    screenId: string;
    partnerOrgId: string;
  }) {
    const { pin, screenId, partnerOrgId } = data;

    const request = await this.prisma.devicePairingRequest.findFirst({
      where: { pin, status: 'PENDING' },
    });

    if (!request) throw new NotFoundException(`No pending pairing request found for PIN ${pin}`);
    if (request.pinExpiresAt < new Date()) {
      await this.prisma.devicePairingRequest.update({
        where: { id: request.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException(`PIN ${pin} has expired`);
    }

    // Verify screen belongs to this partner
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
      select: { id: true, partnerOrgId: true, activeDeviceId: true },
    });
    if (!screen) throw new NotFoundException('Screen not found');
    if (screen.partnerOrgId !== partnerOrgId) {
      throw new BadRequestException('Screen does not belong to this partner');
    }

    // Create or upsert the device
    const provisioningToken = randomBytes(32).toString('hex');
    const device = await this.prisma.device.upsert({
      where: { serialNumber: request.serialNumber },
      create: {
        serialNumber: request.serialNumber,
        provisioningToken,
        status: 'PROVISIONING',
        screenId,
        pairedAt: new Date(),
      },
      update: {
        screenId,
        pairedAt: new Date(),
        status: 'PROVISIONING',
        unpairedAt: null,
      },
    });

    // Link screen's active device
    await this.prisma.screen.update({
      where: { id: screenId },
      data: { activeDeviceId: device.id },
    });

    // Mark pairing request as claimed
    await this.prisma.devicePairingRequest.update({
      where: { id: request.id },
      data: {
        status: 'CLAIMED',
        claimedAt: new Date(),
        claimedByOrgId: partnerOrgId,
        deviceId: device.id,
        screenId,
      },
    });

    // Emit WebSocket event
    this.partnerGateway.emitDevicePaired(partnerOrgId, screenId, device.id);

    return { success: true, device, screenId };
  }

  /**
   * Batch claim — partner submits list of { pin, screenId } pairs.
   * Returns per-PIN success/fail.
   */
  async claimBatch(claims: Array<{ pin: string; screenId: string }>, partnerOrgId: string) {
    const results: Array<{ pin: string; success: boolean; error?: string; deviceId?: string }> = [];

    for (const claim of claims) {
      try {
        const result = await this.claimByPin({ ...claim, partnerOrgId });
        results.push({ pin: claim.pin, success: true, deviceId: result.device.id });
      } catch (err: any) {
        results.push({ pin: claim.pin, success: false, error: err.message });
      }
    }

    return { results, total: claims.length, succeeded: results.filter((r) => r.success).length };
  }
}
